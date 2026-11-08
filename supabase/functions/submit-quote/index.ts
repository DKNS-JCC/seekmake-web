// Supabase Edge Function: submit-quote
//
// Receives a quote request from the tasador (/instant-quote), validates it,
// stores it in public.quotes (service role — RLS keeps the table admin-only)
// and forwards a summary to the admin's inbox via Gmail SMTP.
//
// Reuses the same secrets as send-contact-email:
//   GMAIL_USER, GMAIL_APP_PASSWORD, CONTACT_RECIPIENT, ALLOWED_ORIGIN
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// ── Deploy ──
//   supabase functions deploy submit-quote

// @ts-nocheck — Deno target.
// deno-lint-ignore-file no-explicit-any
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PROD_ALLOWED = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://www.impresion3dcc.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const DEV_ALLOWED = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];

const ALLOWED_ORIGINS = [...PROD_ALLOWED, ...DEV_ALLOWED];

function pickOrigin(reqOrigin: string | null): string {
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  return PROD_ALLOWED[0] ?? 'https://www.impresion3dcc.com';
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

// Pricing version of this function. The Pages build refuses to publish a
// web whose tasador expects a newer server (see deploy-pages.yml): otherwise
// the customer would see one price and get another one by email.
const TASADOR_VERSION = '5';

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json',
      'x-tasador-version': TASADOR_VERSION
    }
  });
}

// Naive in-memory rate limit (same approach as send-contact-email).
const recent = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const WINDOW_MS = 60 * 60 * 1000;
  const MAX_PER_WINDOW = 5;
  const list = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) return true;
  list.push(now);
  recent.set(ip, list);
  return false;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// denomailer 1.6.0 mis-encodes non-ASCII header values: quotedPrintableEncode
// injects a soft line break (`=\r\n`) *inside* the RFC 2047 encoded-word and
// leaves spaces literal, which breaks header folding and makes clients render
// the whole message as raw MIME. Keeping header values pure ASCII (and not
// starting with "=?") makes denomailer pass them through untouched — the body
// still carries full UTF-8 via quoted-printable.
function asciiHeader(s: string): string {
  return (s ?? '')
    .replace(/€/g, 'EUR')
    .replace(/[·•∙]/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop combining accent marks
    .replace(/[^\x20-\x7E]/g, '')    // strip anything still non-ASCII
    .replace(/\s+/g, ' ')
    .trim();
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────────────────────
// Server-side pricing — compact port of lib/quote/pricing.ts. The client
// total is NEVER trusted: we recompute the money from the per-piece figures
// and the quote_settings row. Grams and hours come from the browser's layer
// analysis (the server cannot slice within its CPU budget) and are only
// accepted when they are plausible for the part's volume; otherwise the old
// volume heuristic is used. Keep the math in sync with the web version.
// ─────────────────────────────────────────────────────────────────────────

const COSTES_CALCULADORA: any = {
  impresora_eur: 738,
  mantenimiento_eur: 100,
  vida_h: 3000,
  consumo_kw: 0.15,
  precio_kwh: 0.24,
  precio_kg: { PLA: 20, PETG: 18, 'PLA SILK/MARBLE': 23, ASA: 24, TPU: 21 },
  markup: 2.3,
  error: 0.25,
  postpro_soportes_eur: 0
};

const DEFAULT_SETTINGS: any = {
  modo_precio: 'calculadora',
  calculadora: COSTES_CALCULADORA,
  materiales: {
    PLA: { precio_g: 0.05, densidad: 1.24, factor_velocidad: 1 },
    PETG: { precio_g: 0.06, densidad: 1.27, factor_velocidad: 0.9 },
    ASA: { precio_g: 0.07, densidad: 1.07, factor_velocidad: 0.85 },
    TPU: { precio_g: 0.08, densidad: 1.21, factor_velocidad: 0.4 }
  },
  precio_hora: 0.3,
  tarifa_preparacion: 0,
  precio_minimo: 7,
  redondeo: 0.05,
  soporte_min_g: 1,
  caudal_g_h: 18,
  tiempo_capa_s: 6,
  soporte_relleno: 0.15,
  validez_dias: 15,
  envio_tramos: [
    { max_g: 500, precio: 4.5 },
    { max_g: 2000, precio: 6.9 },
    { max_g: 999999, precio: 9.9 }
  ],
  fraccion_pared: 0.35,
  plazo_horas_dia: 8,
  plazo_dias_margen: 1,
  recargo_acabado_pct: {
    'Metálico': 10, 'Fluorescente': 10, 'Translucido': 5, 'Textura': 10,
    'Brillante': 5, 'Purpurina': 10, 'Mate': 0, 'Flexible': 15
  },
  recargo_multicolor: { base_pct: 15, por_color_extra: 1 },
  resistencia: [
    { id: 'decorativa', relleno_pct: 10 },
    { id: 'estandar', relleno_pct: 15 },
    { id: 'resistente', relleno_pct: 40 },
    { id: 'maciza', relleno_pct: 100 }
  ],
  detalle: [
    { id: 'rapido', altura_capa_mm: 0.24, factor_tiempo: 0.8 },
    { id: 'estandar', altura_capa_mm: 0.2, factor_tiempo: 1 },
    { id: 'fino', altura_capa_mm: 0.12, factor_tiempo: 1.7 }
  ],
  descuentos_cantidad: []
};

function precioKgDe(c: any, material: string): number | undefined {
  const tabla = c?.precio_kg ?? {};
  const key = String(material).trim().toUpperCase();
  for (const [k, v] of Object.entries(tabla)) if (k.toUpperCase() === key) return Number(v);
  const fam = ['PETG', 'ASA', 'ABS', 'TPU', 'NYLON', 'PLA'].find((f) => key.includes(f));
  if (fam) for (const [k, v] of Object.entries(tabla)) if (k.toUpperCase() === fam) return Number(v);
  return undefined;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

function normalizeServerSettings(raw: any): any {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s: any = {
    ...DEFAULT_SETTINGS,
    ...r,
    calculadora: {
      ...DEFAULT_SETTINGS.calculadora,
      ...(r.calculadora ?? {}),
      precio_kg: { ...DEFAULT_SETTINGS.calculadora.precio_kg, ...(r.calculadora?.precio_kg ?? {}) }
    },
    materiales: Object.fromEntries(
      Object.entries({ ...DEFAULT_SETTINGS.materiales, ...(r.materiales ?? {}) })
        .map(([k, v]: [string, any]) => [k, { ...v }])
    ),
    recargo_acabado_pct: {
      ...DEFAULT_SETTINGS.recargo_acabado_pct,
      ...(r.recargo_acabado_pct ?? {})
    },
    recargo_multicolor: {
      ...DEFAULT_SETTINGS.recargo_multicolor,
      ...(r.recargo_multicolor ?? {})
    },
    resistencia: r.resistencia?.length ? r.resistencia : DEFAULT_SETTINGS.resistencia,
    detalle: r.detalle?.length ? r.detalle : DEFAULT_SETTINGS.detalle,
    descuentos_cantidad: Array.isArray(r.descuentos_cantidad)
      ? [...r.descuentos_cantidad].sort((a: any, b: any) => a.min - b.min)
      : DEFAULT_SETTINGS.descuentos_cantidad,
    envio_tramos: r.envio_tramos?.length
      ? [...r.envio_tramos].sort((a: any, b: any) => a.max_g - b.max_g)
      : DEFAULT_SETTINGS.envio_tramos
  };
  if (s.modo_precio !== 'tarifa') s.modo_precio = 'calculadora';
  if (s.modo_precio === 'calculadora') {
    const c = s.calculadora;
    const f = Math.max(0, Number(c.markup) || 0) + Math.max(0, Number(c.error) || 0);
    const vida = Number(c.vida_h) > 0 ? Number(c.vida_h) : 1;
    const hora = Number(c.consumo_kw) * Number(c.precio_kwh) +
      (Number(c.impresora_eur) + Number(c.mantenimiento_eur)) / vida;
    s.precio_hora = r4(hora * f);
    for (const [k, m] of Object.entries(s.materiales) as [string, any][]) {
      const kg = precioKgDe(c, k);
      if (kg !== undefined) m.precio_g = r4((kg / 1000) * f);
    }
  }
  return s;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function redondear(n: number, paso: number): number {
  if (!(paso > 0)) return r2(n);
  return r2(Math.ceil(r2(n) / paso - 1e-9) * paso);
}

/**
 * Grams/hours per unit from the browser's layer analysis, if plausible for
 * the part's volume (supports can outweigh a part, a hollow shell can be
 * light, but not by orders of magnitude).
 */
function figurasCliente(am: any, densidad: number): { pesoG: number; soporteG: number; tiempoH: number } | null {
  if (am?.estimador !== 'capas-v1') return null;
  const pesoG = Number(am.peso_g), tiempoH = Number(am.tiempo_h);
  const soporteG = Math.max(0, Number(am.soporte_g) || 0);
  const solido = Math.max(0, Number(am.volumen_cm3) || 0) * densidad;
  if (!Number.isFinite(pesoG) || !Number.isFinite(tiempoH)) return null;
  if (pesoG <= 0 || tiempoH <= 0 || tiempoH > 2000) return null;
  if (pesoG > solido * 3 + 5 || pesoG < solido * 0.05) return null;
  return { pesoG, soporteG: Math.min(soporteG, pesoG), tiempoH };
}

/** Recompute the quote from sanitized `archivos` + settings (+ a valid code). */
function computeServerQuote(archivos: any[], entrega: string, settings: any, cupon: any = null) {
  const lineas: Array<{ concepto: string; importe: number }> = [];
  const piezas: any[] = [];
  let base = 0;
  let pesoTotal = 0;
  let tiempoTotal = 0;
  let unidades = 0;
  const calculadora = settings.modo_precio === 'calculadora';

  for (const a of archivos) {
    const am = a.metricas ?? {};
    const mat = settings.materiales[a.material] ?? settings.materiales['PLA'];
    const res =
      settings.resistencia.find((x: any) => x.id === a.resistencia) ?? settings.resistencia[0];
    const det =
      settings.detalle.find((x: any) => x.id === a.detalle) ?? settings.detalle[0];
    const cantidad = Math.max(1, Math.floor(a.cantidad));

    let pesoG: number, soporteG: number, tiempoH: number, metodo: string;
    let conSoportes: boolean;
    const cli = figurasCliente(am, mat.densidad);
    if (cli) {
      ({ pesoG, soporteG, tiempoH } = cli);
      metodo = 'capas';
      conSoportes = Boolean(am.con_soportes);
    } else {
      // Fallback: the old volume heuristic.
      const volumen = Math.max(0, Number(am.volumen_cm3) || 0);
      const soporteVol = Math.max(0, Number(am.soporte_cm3) || 0);
      const alturaMm = Math.max(0, Number(am.bbox_mm?.y) || 0);
      const fraccion =
        settings.fraccion_pared + (1 - settings.fraccion_pared) * (res.relleno_pct / 100);
      soporteG = soporteVol * settings.soporte_relleno * mat.densidad;
      pesoG = volumen * mat.densidad * fraccion + soporteG;
      const caudal =
        Math.max(settings.caudal_g_h, 1) * Math.max(mat.factor_velocidad ?? 1, 0.05);
      const capas = det.altura_capa_mm > 0 ? alturaMm / det.altura_capa_mm : 0;
      tiempoH =
        (pesoG / caudal) * det.factor_tiempo + (capas * settings.tiempo_capa_s) / 3600;
      metodo = 'aproximado';
      conSoportes = soporteG >= Math.max(1, Number(settings.soporte_min_g) || 0);
    }

    pesoG = Math.round(pesoG * 1000) / 1000;
    soporteG = Math.round(soporteG * 1000) / 1000;
    tiempoH = Math.round(tiempoH * 10000) / 10000;
    let unidad = pesoG * mat.precio_g + tiempoH * settings.precio_hora;

    const extras: string[] = [];
    if (soporteG >= 1) extras.push(`soportes ~${Math.round(soporteG)} g`);
    const postpro = Number(settings.calculadora?.postpro_soportes_eur) || 0;
    if (calculadora && conSoportes && postpro > 0) {
      unidad += postpro;
      extras.push('retirada de soportes');
    }

    const acabadoPct = Math.max(
      0,
      ...a.colores.map((c: any) =>
        c.acabado ? settings.recargo_acabado_pct[c.acabado] ?? 0 : 0
      )
    );
    if (acabadoPct > 0) {
      unidad *= 1 + acabadoPct / 100;
      extras.push(`acabado +${acabadoPct}%`);
    }

    // Multi-part 3MFs send one entry per part; count distinct colors like the client does.
    const numColores = new Set(a.colores.map((c: any) => `${c.nombre}|${c.hex}`)).size;
    if (numColores > 1) {
      unidad =
        unidad * (1 + settings.recargo_multicolor.base_pct / 100) +
        settings.recargo_multicolor.por_color_extra * (numColores - 1);
      extras.push(`${numColores} colores`);
    }
    const porCama = Math.max(1, Math.floor(Number(am.por_cama) || 1));
    if (metodo === 'capas' && cantidad > 1 && porCama > 1) {
      extras.push(`${porCama} por cama`);
    }

    const subtotal = redondear(unidad * cantidad, settings.redondeo);
    piezas.push({
      peso_g: pesoG,
      soporte_g: soporteG,
      tiempo_h: tiempoH,
      relleno_pct: res.relleno_pct,
      metodo
    });
    lineas.push({
      concepto:
        `${a.nombre}${cantidad > 1 ? ` × ${cantidad}` : ''} — ${a.material} ` +
        `(~${Math.round(pesoG)} g, ~${tiempoH.toFixed(1)} h${cantidad > 1 ? ' c/u' : ''}` +
        (extras.length ? `, ${extras.join(', ')}` : '') +
        ')',
      importe: subtotal
    });

    base += subtotal;
    pesoTotal += pesoG * cantidad;
    tiempoTotal += tiempoH * cantidad;
    unidades += cantidad;
  }

  let subtotal = base;
  let descuentoPct = 0;
  for (const tier of settings.descuentos_cantidad) {
    if (unidades >= tier.min) descuentoPct = tier.pct;
  }
  const paso = settings.redondeo > 0 ? settings.redondeo : 0.01;
  const aPaso = (n: number) => r2(Math.floor(r2(n) / paso + 1e-9) * paso);
  const dtoCantidad = descuentoPct > 0 ? aPaso(subtotal * (descuentoPct / 100)) : 0;

  // Discount code: same rules as the web (bigger discount wins, before the minimum).
  let dtoCupon = 0;
  if (cupon && subtotal >= Number(cupon.pedido_minimo)) {
    const valor = Number(cupon.valor);
    dtoCupon = aPaso(Math.min(subtotal, cupon.tipo === 'pct' ? subtotal * (valor / 100) : valor));
  }
  if (dtoCupon > 0 && dtoCupon >= dtoCantidad) {
    descuentoPct = 0;
    const valor = Number(cupon.valor);
    lineas.push({
      concepto:
        `Código ${cupon.codigo} (` +
        (cupon.tipo === 'pct' ? `-${valor}%` : `-${valor.toFixed(2)} €`) +
        ')',
      importe: -dtoCupon
    });
    subtotal -= dtoCupon;
  } else {
    dtoCupon = 0;
    if (dtoCantidad > 0) {
      lineas.push({
        concepto: `Descuento por cantidad (-${descuentoPct}%)`,
        importe: -dtoCantidad
      });
      subtotal -= dtoCantidad;
    }
  }

  let total = subtotal;
  if (settings.tarifa_preparacion > 0) {
    lineas.push({ concepto: 'Preparación y laminado', importe: r2(settings.tarifa_preparacion) });
    total += settings.tarifa_preparacion;
  }

  const minimoAplicado = total < settings.precio_minimo;
  if (minimoAplicado) total = settings.precio_minimo;

  let envio = 0;
  if (entrega === 'envio') {
    const tramo =
      settings.envio_tramos.find((t: any) => pesoTotal <= t.max_g) ??
      settings.envio_tramos[settings.envio_tramos.length - 1];
    envio = tramo?.precio ?? 0;
    if (envio > 0) {
      lineas.push({
        concepto: `Envío nacional (≈${Math.round(pesoTotal)} g)`,
        importe: r2(envio)
      });
      total += envio;
    }
  }

  const diasEstimados =
    Math.ceil(tiempoTotal / Math.max(settings.plazo_horas_dia, 1)) +
    Math.max(0, Math.round(settings.plazo_dias_margen));

  return {
    total: r2(total),
    lineas,
    descuentoPct,
    cupon: dtoCupon > 0 ? cupon.codigo : null,
    cuponDescuento: dtoCupon,
    minimoAplicado,
    envio: r2(envio),
    pesoG: r2(pesoTotal),
    tiempoH: r2(tiempoTotal),
    unidades,
    diasEstimados,
    piezas
  };
}

Deno.serve(async (req: Request) => {
  const allowedOrigin = pickOrigin(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(allowedOrigin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, allowedOrigin);
  }

  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    return json({ error: 'Invalid JSON: ' + String(err) }, 400, allowedOrigin);
  }

  // ── Extract & sanitize ──
  const nombre   = String(body?.nombre   ?? '').trim().slice(0, 200);
  const email    = String(body?.email    ?? '').trim().slice(0, 200);
  const telefono = String(body?.telefono ?? '').trim().slice(0, 50);
  const mensaje  = String(body?.mensaje  ?? '').trim().slice(0, 5000);
  const hp       = String(body?.website  ?? '').trim(); // honeypot

  const material    = String(body?.material    ?? '').trim().slice(0, 50);
  const resistencia = String(body?.resistencia ?? 'estandar').slice(0, 50);
  const detalle     = String(body?.detalle     ?? 'estandar').slice(0, 50);
  const cantidad    = Math.max(1, Math.min(999, Number(body?.cantidad) || 1));
  const entrega     = body?.entrega === 'envio' ? 'envio' : 'recogida';
  const direccion   = entrega === 'envio'
    ? {
        calle:     String(body?.direccion?.calle     ?? '').trim().slice(0, 200),
        ciudad:    String(body?.direccion?.ciudad    ?? '').trim().slice(0, 100),
        cp:        String(body?.direccion?.cp        ?? '').trim().slice(0, 10),
        provincia: String(body?.direccion?.provincia ?? '').trim().slice(0, 100)
      }
    : {};
  const precioTotal = Math.max(0, Math.min(99999, Number(body?.precio_total) || 0));
  const cuponPedido = String(body?.cupon ?? '').trim().toUpperCase().slice(0, 30);

  const colores = (Array.isArray(body?.colores) ? body.colores : [])
    .slice(0, 8)
    .map((c: any) => ({
      nombre:  String(c?.nombre  ?? '').slice(0, 100),
      hex:     String(c?.hex     ?? '').slice(0, 9),
      acabado: c?.acabado ? String(c.acabado).slice(0, 50) : null,
      parte:   String(c?.parte   ?? '').slice(0, 100)
    }));

  const metricas = typeof body?.metricas === 'object' && body.metricas ? body.metricas : {};
  const desglose = typeof body?.desglose === 'object' && body.desglose ? body.desglose : {};

  // The model files were uploaded to the quote-uploads bucket before submit;
  // only accept URLs pointing at our own project.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseHost = (() => {
    try { return new URL(supabaseUrl).host; } catch { return ''; }
  })();
  const archivos = (Array.isArray(body?.archivos) ? body.archivos : [])
    .slice(0, 5)
    .map((a: any) => ({
      nombre:          String(a?.nombre ?? 'modelo').slice(0, 200),
      url:             String(a?.url ?? ''),
      path:            String(a?.path ?? '').slice(0, 300),
      tamano:          Number(a?.tamano ?? 0) || 0,
      tamano_original: Number(a?.tamano_original ?? 0) || 0,
      comprimido:      Boolean(a?.comprimido),
      cantidad:        Math.max(1, Math.min(999, Number(a?.cantidad) || 1)),
      // per-piece configuration
      material:        String(a?.material ?? 'PLA').slice(0, 50),
      resistencia:     String(a?.resistencia ?? 'estandar').slice(0, 50),
      detalle:         String(a?.detalle ?? 'estandar').slice(0, 50),
      colores:         (Array.isArray(a?.colores) ? a.colores : [])
        .slice(0, 8)
        .map((c: any) => ({
          nombre:  String(c?.nombre  ?? '').slice(0, 100),
          hex:     String(c?.hex     ?? '').slice(0, 9),
          acabado: c?.acabado ? String(c.acabado).slice(0, 50) : null,
          parte:   String(c?.parte   ?? '').slice(0, 100)
        })),
      metricas:        typeof a?.metricas === 'object' && a.metricas ? a.metricas : {}
    }))
    .filter((a: any) => {
      try {
        const u = new URL(a.url);
        return supabaseHost && u.host === supabaseHost && u.pathname.includes('/quote-uploads/');
      } catch { return false; }
    });

  // ── Validate ──
  if (hp) return json({ ok: true, codigo: 'Q-0000-0000' }, 200, allowedOrigin); // bot
  if (!nombre || nombre.length < 2) return json({ error: 'Nombre requerido.' }, 400, allowedOrigin);
  if (!isValidEmail(email))         return json({ error: 'Email inválido.' }, 400, allowedOrigin);
  if (telefono.replace(/[^\d]/g, '').length < 9) {
    return json({ error: 'Teléfono requerido (mínimo 9 dígitos).' }, 400, allowedOrigin);
  }
  if (!material)                    return json({ error: 'Material requerido.' }, 400, allowedOrigin);
  if (!archivos.length)             return json({ error: 'Ningún archivo de modelo válido.' }, 400, allowedOrigin);
  if (archivos.some((a: any) => !a.colores.length)) {
    return json({ error: 'Cada pieza necesita al menos un color.' }, 400, allowedOrigin);
  }
  if (entrega === 'envio' && (!direccion.calle || !direccion.ciudad || !direccion.cp)) {
    return json({ error: 'Para envío necesitamos la dirección completa.' }, 400, allowedOrigin);
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown';
  if (rateLimited(ip)) {
    return json(
      { error: 'Demasiadas solicitudes. Inténtalo de nuevo en una hora.' },
      429,
      allowedOrigin
    );
  }

  // ── Persist (service role bypasses RLS; the table is admin-only) ──
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server not configured (Supabase).' }, 500, allowedOrigin);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // DB-backed rate limit (the in-memory map resets on cold starts).
  const ipHash = await sha256Hex(ip);
  const { count: recentCount } = await supabase
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((recentCount ?? 0) >= 5) {
    return json(
      { error: 'Demasiadas solicitudes. Inténtalo de nuevo en una hora.' },
      429,
      allowedOrigin
    );
  }

  // ── Recompute the price server-side — never trust the client's total ──
  const { data: settingsRow } = await supabase
    .from('quote_settings')
    .select('config')
    .eq('id', 1)
    .maybeSingle();
  const settings = normalizeServerSettings(settingsRow?.config ?? null);

  // The code is checked again here: it may have expired or run out since the
  // customer saw the price. Refuse rather than email them a different total.
  let cupon: any = null;
  if (cuponPedido) {
    const { data: filas, error: cupErr } = await supabase.rpc('validar_cupon', { p_codigo: cuponPedido });
    if (cupErr) {
      console.error('validar_cupon failed:', cupErr);
      return json({ error: 'No se pudo comprobar el código de descuento.' }, 500, allowedOrigin);
    }
    cupon = filas?.[0] ?? null;
    if (!cupon) {
      return json(
        { error: `El código ${cuponPedido} ya no es válido.`, cupon_invalido: true },
        409,
        allowedOrigin
      );
    }
  }

  const sq = computeServerQuote(archivos, entrega, settings, cupon);
  const clienteTotal = precioTotal;
  const precioServidor = sq.total;
  const desvio = Math.abs(precioServidor - clienteTotal) > 0.01;
  if (desvio) {
    console.warn(
      `quote price mismatch: cliente=${clienteTotal.toFixed(2)} servidor=${precioServidor.toFixed(2)}`
    );
  }

  // Overwrite the client-supplied figures with the authoritative ones.
  for (let i = 0; i < archivos.length; i++) {
    archivos[i].metricas = {
      ...archivos[i].metricas,
      peso_g: sq.piezas[i]?.peso_g ?? null,
      soporte_g: sq.piezas[i]?.soporte_g ?? null,
      tiempo_h: sq.piezas[i]?.tiempo_h ?? null,
      relleno_pct: sq.piezas[i]?.relleno_pct ?? null,
      estimador: sq.piezas[i]?.metodo === 'capas' ? 'capas-v1' : 'aproximado'
    };
  }
  const metricasServidor = {
    ...metricas,
    peso_g: sq.pesoG,
    tiempo_h: sq.tiempoH,
    dias_estimados: sq.diasEstimados,
    piezas: archivos.length
  };
  const desgloseServidor = {
    lineas: sq.lineas,
    descuento_pct: sq.descuentoPct,
    ...(sq.cupon ? { cupon_descuento: sq.cuponDescuento } : {}),
    minimo_aplicado: sq.minimoAplicado,
    envio: sq.envio,
    ...(desvio ? { cliente_total: clienteTotal } : {})
  };

  const validezDias = Math.max(1, Math.round(settings.validez_dias ?? 15));
  const validoHasta = new Date(Date.now() + validezDias * 24 * 60 * 60 * 1000);

  const { data: inserted, error: insErr } = await supabase
    .from('quotes')
    .insert({
      nombre,
      email,
      telefono,
      mensaje,
      archivos,
      material,
      colores,
      resistencia,
      detalle,
      cantidad: sq.unidades,
      entrega,
      direccion,
      metricas: metricasServidor,
      desglose: desgloseServidor,
      precio_total: precioServidor,
      cupon: sq.cupon,
      valido_hasta: validoHasta.toISOString(),
      ip_hash: ipHash
    })
    .select('codigo, acepta_token, valido_hasta')
    .single();

  if (insErr || !inserted) {
    console.error('quotes insert failed:', insErr);
    return json({ error: 'No se pudo registrar la solicitud.' }, 500, allowedOrigin);
  }
  const codigo: string = inserted.codigo;
  const aceptaToken: string = inserted.acepta_token;

  // ── Email the admin (best effort — the quote is already saved) ──
  const gmailUser = Deno.env.get('GMAIL_USER')?.trim();
  const gmailPass = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
  const recipient = Deno.env.get('CONTACT_RECIPIENT')?.trim() ?? gmailUser;

  let emailSent = false;
  if (gmailUser && gmailPass && recipient) {
    const lineas = sq.lineas;
    const m: any = metricasServidor;
    const statusUrl = `https://www.impresion3dcc.com/presupuesto?codigo=${encodeURIComponent(codigo)}`;
    const acceptUrl = `${statusUrl}&token=${encodeURIComponent(aceptaToken)}`;
    const validezTxt = validoHasta.toLocaleDateString('es-ES', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
    const coloresDe = (a: any) =>
      (a.colores ?? [])
        .map((c: any) => c.nombre + (c.parte ? ` (${c.parte})` : ''))
        .join(', ');
    const piezasTxt = archivos
      .map((a: any) => {
        const am = a.metricas ?? {};
        const dims = am.bbox_mm
          ? `${am.bbox_mm.x} × ${am.bbox_mm.z} × ${am.bbox_mm.y} mm · `
          : '';
        return (
          `  • ${a.nombre}${a.cantidad > 1 ? ` × ${a.cantidad}` : ''}` +
          ` (${(a.tamano / 1024 / 1024).toFixed(1)} MB${a.comprimido ? ' gz' : ''})\n` +
          `    ${a.material} — ${coloresDe(a)}\n` +
          `    ${a.resistencia}${am.relleno_pct != null ? ` (${am.relleno_pct}%)` : ''} · ${a.detalle}\n` +
          `    ${dims}${am.volumen_cm3 ?? '—'} cm³ · ~${am.peso_g ?? '—'} g\n` +
          `    ${a.url}`
        );
      })
      .join('\n');
    const piezasHtml = archivos
      .map((a: any) => {
        const am = a.metricas ?? {};
        const dims = am.bbox_mm
          ? `${am.bbox_mm.x} × ${am.bbox_mm.z} × ${am.bbox_mm.y} mm · `
          : '';
        return `
    <li style="padding:10px 14px;background:#f5f5f5;border-radius:6px;margin-bottom:6px;">
      <a href="${escapeHtml(a.url)}" style="color:#0EA5E9;font-weight:600;text-decoration:none;">${escapeHtml(a.nombre)}</a>
      ${a.cantidad > 1 ? `<strong>× ${a.cantidad}</strong>` : ''}
      <span style="color:#999;font-family:monospace;font-size:11px;margin-left:8px;">${(a.tamano / 1024 / 1024).toFixed(1)} MB${a.comprimido ? ' (gzip)' : ''}</span>
      <div style="color:#444;font-size:12px;margin-top:2px;"><strong>${escapeHtml(a.material)}</strong> — ${escapeHtml(coloresDe(a))} · ${escapeHtml(a.resistencia)}${am.relleno_pct != null ? ` (${am.relleno_pct}%)` : ''} · ${escapeHtml(a.detalle)}</div>
      <div style="color:#666;font-size:12px;margin-top:2px;">${dims}${am.volumen_cm3 ?? '—'} cm³ · ~${am.peso_g ?? '—'} g</div>
    </li>`;
      })
      .join('');
    const entregaTxt =
      entrega === 'envio'
        ? `Envío a: ${direccion.calle}, ${direccion.cp} ${direccion.ciudad} (${direccion.provincia})`
        : 'Recogida en Salamanca';
    const text = `
Nuevo presupuesto ${codigo} — impresion3dcc.com
──────────────────────────────────────

Cliente:    ${nombre}
Email:      ${email}
Teléfono:   ${telefono || '(no facilitado)'}

Piezas (${archivos.length}):
${piezasTxt}

Total:      ~${m?.peso_g ?? '—'} g · ~${m?.tiempo_h ?? '—'} h de impresión

Unidades:   ${cantidad}
Entrega:    ${entregaTxt}
Plazo est.: ~${m?.dias_estimados ?? '—'} días laborables

Desglose:
${lineas.map((l) => `  ${l.concepto}: ${Number(l.importe).toFixed(2)} €`).join('\n')}

TOTAL ESTIMADO: ${precioServidor.toFixed(2)} €${desvio ? ` (cliente vio ${clienteTotal.toFixed(2)} € — revisar)` : ''}
Válido hasta: ${validezTxt}

Mensaje del cliente:
${mensaje || '(sin mensaje)'}

──────────────────────────────────────
Gestiona este presupuesto en /admin/presupuestos
IP ${ip} · ${new Date().toISOString()}
`.trim();

    const html = `
<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 4px 0;color:#0EA5E9;font-family:Arial,sans-serif;">Presupuesto ${escapeHtml(codigo)}</h2>
  <p style="margin:0 0 16px 0;color:#666;font-size:13px;">Nueva solicitud desde el tasador de impresion3dcc.com</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 12px 6px 0;color:#666;width:110px;">Cliente</td><td><strong>${escapeHtml(nombre)}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Teléfono</td><td>${telefono ? escapeHtml(telefono) : '<em style="color:#999">no facilitado</em>'}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Total</td><td>~${m?.peso_g ?? '—'} g · ~${m?.tiempo_h ?? '—'} h de impresión</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Unidades</td><td>× ${cantidad}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Entrega</td><td>${escapeHtml(entregaTxt)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Plazo est.</td><td>~${m?.dias_estimados ?? '—'} días laborables</td></tr>
  </table>
  <h3 style="margin:24px 0 8px 0;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.1em;">Piezas (${archivos.length})</h3>
  <ul style="list-style:none;padding:0;margin:0;">${piezasHtml}</ul>
  <h3 style="margin:24px 0 8px 0;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.1em;">Desglose</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;background:#f5f5f5;border-radius:6px;">
    ${lineas.map((l) => `<tr><td style="padding:6px 14px;color:#444;">${escapeHtml(l.concepto)}</td><td style="padding:6px 14px;text-align:right;font-family:monospace;">${Number(l.importe).toFixed(2)} €</td></tr>`).join('')}
    <tr><td style="padding:10px 14px;font-weight:700;border-top:1px solid #ddd;">TOTAL ESTIMADO</td><td style="padding:10px 14px;text-align:right;font-family:monospace;font-weight:700;border-top:1px solid #ddd;color:#0EA5E9;">${precioServidor.toFixed(2)} €</td></tr>
    ${desvio ? `<tr><td colspan="2" style="padding:8px 14px;color:#b45309;font-size:12px;">⚠ El cliente vio ${clienteTotal.toFixed(2)} € — revisar (posible manipulación o tarifas desactualizadas).</td></tr>` : ''}
  </table>
  ${mensaje ? `<h3 style="margin:24px 0 8px 0;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.1em;">Mensaje</h3><div style="background:#f5f5f5;padding:16px 20px;border-radius:6px;white-space:pre-wrap;line-height:1.6;">${escapeHtml(mensaje)}</div>` : ''}
  <p style="margin:24px 0 0 0;font-size:11px;color:#999;font-family:monospace;">IP ${ip} · ${new Date().toISOString()}</p>
</div>
`.trim();

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: gmailUser, password: gmailPass }
      }
    });

    // Confirmation email for the customer.
    const clienteText = `
Hola ${nombre},

Hemos recibido tu solicitud de presupuesto. Tu código de referencia es:

    ${codigo}

Resumen:
${archivos.map((a: any) => `  Pieza:        ${a.nombre}${a.cantidad > 1 ? ` × ${a.cantidad}` : ''} — ${a.material} (${coloresDe(a)})`).join('\n')}
  Entrega:      ${entrega === 'envio' ? 'Envío nacional (coste a confirmar)' : 'Recogida en Salamanca (gratis)'}
  Plazo est.:   ~${m?.dias_estimados ?? '—'} días laborables${entrega === 'envio' ? ' + envío' : ''}${sq.cupon ? `\n  Código:       ${sq.cupon} (-${sq.cuponDescuento.toFixed(2)} €)` : ''}

  TOTAL ESTIMADO: ${precioServidor.toFixed(2)} €${entrega === 'envio' && sq.envio > 0 ? ' (envío incluido)' : ''}

Es una estimación orientativa, válida hasta el ${validezTxt}: revisaremos tu
pieza y te confirmaremos el precio final en breve.

Consulta el estado de tu presupuesto:
${statusUrl}

Cuando lo hayamos revisado, podrás aceptarlo directamente desde este enlace
(personal, no lo compartas):
${acceptUrl}

¿Dudas? Responde a este email o escríbenos por WhatsApp: +34 923 793 123.

— 3DCC Salamanca · impresion3dcc.com
`.trim();

    const clienteHtml = `
<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 4px 0;color:#0EA5E9;font-family:Arial,sans-serif;">¡Solicitud recibida!</h2>
  <p style="margin:0 0 20px 0;color:#444;">Hola ${escapeHtml(nombre)}, hemos recibido tu solicitud de presupuesto. Tu código de referencia:</p>
  <div style="text-align:center;margin:0 0 24px 0;">
    <span style="display:inline-block;padding:10px 28px;background:#f0f9ff;border:1px solid #0EA5E9;border-radius:6px;font-family:monospace;font-size:22px;font-weight:700;color:#0EA5E9;letter-spacing:0.06em;">${escapeHtml(codigo)}</span>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 12px 6px 0;color:#666;width:110px;">Piezas</td><td>${archivos.map((a: any) => `${escapeHtml(a.nombre)}${a.cantidad > 1 ? ` × ${a.cantidad}` : ''} — ${escapeHtml(a.material)} (${escapeHtml(coloresDe(a))})`).join('<br/>')}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Entrega</td><td>${entrega === 'envio' ? 'Envío nacional (coste a confirmar)' : 'Recogida en Salamanca (gratis)'}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Plazo est.</td><td>~${m?.dias_estimados ?? '—'} días laborables${entrega === 'envio' ? ' + envío' : ''}</td></tr>
    ${sq.cupon ? `<tr><td style="padding:6px 12px 6px 0;color:#666;">Código</td><td>${escapeHtml(sq.cupon)} (−${sq.cuponDescuento.toFixed(2)} €)</td></tr>` : ''}
    <tr><td style="padding:10px 12px 10px 0;color:#666;border-top:1px solid #eee;font-weight:700;">Total estimado</td><td style="border-top:1px solid #eee;font-weight:700;color:#0EA5E9;font-size:18px;">${precioServidor.toFixed(2)} €${entrega === 'envio' && sq.envio > 0 ? ' <span style="font-size:11px;color:#999;font-weight:400;">(envío incluido)</span>' : ''}</td></tr>
  </table>
  <p style="margin:20px 0;color:#444;line-height:1.6;font-size:13px;">
    Es una estimación orientativa, <strong>válida hasta el ${validezTxt}</strong>:
    revisaremos tu pieza y te confirmaremos el precio final en breve.
  </p>
  <div style="text-align:center;margin:0 0 20px 0;">
    <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;background:#0EA5E9;color:#fff;border-radius:6px;font-weight:600;text-decoration:none;">Ver estado y aceptar presupuesto</a>
  </div>
  <p style="margin:0 0 20px 0;color:#999;font-size:11px;text-align:center;">
    Este enlace es personal — no lo compartas.
  </p>
  <p style="margin:0;color:#444;font-size:13px;">
    ¿Dudas? Responde a este email o escríbenos por
    <a href="https://wa.me/34923793123" style="color:#0EA5E9;">WhatsApp</a>.
  </p>
  <p style="margin:24px 0 0 0;font-size:11px;color:#999;">— 3DCC Salamanca · <a href="https://www.impresion3dcc.com" style="color:#999;">impresion3dcc.com</a></p>
</div>
`.trim();

    try {
      await client.send({
        from: `3DCC Tasador <${gmailUser}>`,
        to: recipient,
        replyTo: `${asciiHeader(nombre)} <${email}>`,
        subject: asciiHeader(`[Presupuesto ${codigo}] ${material} · ${precioServidor.toFixed(2)} €${sq.cupon ? ` (${sq.cupon})` : ''} — ${nombre}`),
        content: text,
        html
      });
      emailSent = true;
    } catch (err) {
      // Quote is already stored; log and carry on.
      console.error('SMTP send failed for', codigo, err);
    }

    try {
      await client.send({
        from: `3DCC Salamanca <${gmailUser}>`,
        to: email,
        replyTo: recipient,
        subject: asciiHeader(`Tu presupuesto ${codigo} — 3DCC Salamanca`),
        content: clienteText,
        html: clienteHtml
      });
    } catch (err) {
      console.error('SMTP customer send failed for', codigo, err);
    } finally {
      try { await client.close(); } catch { /* ignore */ }
    }
  }

  return json(
    {
      ok: true,
      codigo,
      emailSent,
      precio_total: precioServidor,
      valido_hasta: validoHasta.toISOString(),
      message: `Solicitud ${codigo} registrada. Te responderemos en breve.`
    },
    200,
    allowedOrigin
  );
});
