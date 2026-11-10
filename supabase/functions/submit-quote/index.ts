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
// Two more actions share the pricing and the mail setup:
//   accion 'guardar'       "envíame el presupuesto": the breakdown by email,
//                          no files, row in presupuestos_guardados.
//   accion 'recordatorios' hourly (recordatorios-tasador.yml, header
//                          x-cron-secret = CRON_SECRET): 24 h reminder with
//                          the VUELVE5 code to whoever saved one and did not
//                          ask for it.
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
const TASADOR_VERSION = '8';

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
  envio_gratis_desde: 30,
  fraccion_pared: 0.35,
  plazo_horas_dia: 4,
  plazo_holgura_dias: 2,
  max_bed_mm: 220,
  tipos_precio_firme: [],
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
      : DEFAULT_SETTINGS.envio_tramos,
    tipos_precio_firme: Array.isArray(r.tipos_precio_firme) ? [...r.tipos_precio_firme] : []
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

// Plazo: same count as diasPlazo/sumarLaborables in lib/quote/pricing.ts and
// public.fecha_tope() in SQL. Keep the three in step.
function diasPlazo(horas: number, settings: any, colaH = 0, diasExtra = 0): number {
  return (
    Math.ceil(Math.max(0, colaH + horas) / Math.max(Number(settings.plazo_horas_dia) || 0, 1)) +
    Math.max(0, Math.round(diasExtra)) +
    Math.max(0, Math.round(Number(settings.plazo_holgura_dias) || 0))
  );
}

function sumarLaborables(desde: string, n: number): string {
  const d = new Date(`${desde}T00:00:00Z`);
  const laborable = () => d.getUTCDay() % 6 !== 0;
  while (!laborable()) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = Math.max(0, Math.round(n)); i > 0; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (laborable()) i--;
  }
  return d.toISOString().slice(0, 10);
}

function hoyMadrid(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

function fechaLarga(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
  });
}

// Precio firme: same rule as tipoPieza/esPrecioFirme in lib/quote/pricing.ts.
function tipoPieza(numColores: number, cantidad: number, conSoportes: boolean): string {
  if (numColores > 1) return 'multicolor';
  if (cantidad > 1) return 'lote';
  return conSoportes ? 'con soportes' : 'sin soportes';
}

function esPrecioFirme(piezas: Array<{ tipo: string; metodo: string; cabe: boolean }>, settings: any): boolean {
  const validos: string[] = settings.tipos_precio_firme ?? [];
  return (
    validos.length > 0 &&
    piezas.length > 0 &&
    piezas.every((p) => p.metodo === 'capas' && p.cabe && p.tipo !== 'multicolor' && validos.includes(p.tipo))
  );
}

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
    const bb = am.bbox_mm;
    piezas.push({
      peso_g: pesoG,
      soporte_g: soporteG,
      tiempo_h: tiempoH,
      relleno_pct: res.relleno_pct,
      metodo,
      tipo: tipoPieza(numColores, cantidad, conSoportes),
      cabe: !!bb && Math.max(Number(bb.x) || 0, Number(bb.y) || 0, Number(bb.z) || 0) <= Number(settings.max_bed_mm)
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

  const subtotal = base;
  let descuentoPct = 0;
  for (const tier of settings.descuentos_cantidad) {
    if (unidades >= tier.min) descuentoPct = tier.pct;
  }
  const paso = settings.redondeo > 0 ? settings.redondeo : 0.01;
  const aPaso = (n: number) => r2(Math.floor(r2(n) / paso + 1e-9) * paso);
  const dtoCantidad = descuentoPct > 0 ? aPaso(subtotal * (descuentoPct / 100)) : 0;
  const prep = settings.tarifa_preparacion > 0 ? r2(settings.tarifa_preparacion) : 0;
  const minimo = settings.precio_minimo;

  // Discount code: same rules as the web — after the minimum (it can go below
  // it), never stacked with the quantity discount (less to pay wins).
  const sinCupon = Math.max(minimo, subtotal + prep);
  let dtoCupon = 0;
  if (cupon && subtotal >= Number(cupon.pedido_minimo)) {
    const valor = Number(cupon.valor);
    dtoCupon = aPaso(Math.min(sinCupon, cupon.tipo === 'pct' ? sinCupon * (valor / 100) : valor));
  }
  const conCantidad = Math.max(minimo, subtotal - dtoCantidad + prep);
  if (dtoCupon > 0 && sinCupon - dtoCupon <= conCantidad) descuentoPct = 0;
  else dtoCupon = 0;
  const dtoAntes = dtoCupon > 0 ? 0 : dtoCantidad;

  // Minimum order spread over the piece lines (never shown as such).
  const previo = r2(subtotal - dtoAntes + prep);
  const nPiezas = piezas.length;
  const minimoAplicado = previo < minimo && nPiezas > 0;
  if (minimoAplicado) {
    const falta = r2(minimo - previo);
    let repartido = 0;
    for (let i = 0; i < nPiezas; i++) {
      const actual = lineas[i].importe;
      const extra =
        i === nPiezas - 1
          ? r2(falta - repartido)
          : aPaso(subtotal > 0 ? falta * (actual / subtotal) : 0);
      repartido = r2(repartido + extra);
      lineas[i].importe = r2(actual + extra);
    }
  }

  if (dtoAntes > 0) {
    lineas.push({ concepto: `Descuento por cantidad (-${descuentoPct}%)`, importe: -dtoAntes });
  }
  if (prep > 0) lineas.push({ concepto: 'Preparación y laminado', importe: prep });
  let total = Math.max(minimo, previo);
  if (dtoCupon > 0) {
    const valor = Number(cupon.valor);
    lineas.push({
      concepto:
        `Código ${cupon.codigo} (` +
        (cupon.tipo === 'pct' ? `-${valor}%` : `-${valor.toFixed(2)} €`) +
        ')',
      importe: -dtoCupon
    });
    total -= dtoCupon;
  }

  let envio = 0;
  if (entrega === 'envio') {
    const tramo =
      settings.envio_tramos.find((t: any) => pesoTotal <= t.max_g) ??
      settings.envio_tramos[settings.envio_tramos.length - 1];
    envio = tramo?.precio ?? 0;
    const gratisDesde = Number(settings.envio_gratis_desde) || 0;
    const gratis = gratisDesde > 0 && r2(total) >= gratisDesde;
    if (gratis) envio = 0;
    if (envio > 0 || gratis) {
      lineas.push({
        concepto: `Envío nacional (≈${Math.round(pesoTotal)} g)${gratis ? ' — gratis' : ''}`,
        importe: r2(envio)
      });
      total += envio;
    }
  }

  const diasEstimados = diasPlazo(tiempoTotal, settings);

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
    precioFirme: esPrecioFirme(piezas, settings),
    piezas
  };
}

const SITIO = 'https://www.impresion3dcc.com';
const CUPON_RECORDATORIO = 'VUELVE5';

function gmail() {
  const user = Deno.env.get('GMAIL_USER')?.trim();
  const pass = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
  const admin = Deno.env.get('CONTACT_RECIPIENT')?.trim() ?? user;
  return user && pass && admin ? { user, pass, admin } : null;
}

/** One email to the customer; false when it could not be sent. */
async function correoCliente(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const g = gmail();
  if (!g) return false;
  const client = new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: g.user, password: g.pass } }
  });
  try {
    await client.send({
      from: `3DCC Salamanca <${g.user}>`, to, replyTo: g.admin,
      subject: asciiHeader(subject), content: text, html
    });
    return true;
  } catch (err) {
    console.error('SMTP send failed to customer', err);
    return false;
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}

/** The breakdown as email rows (piece names come from the customer: escaped). */
function desgloseHtml(lineas: Array<{ concepto: string; importe: number }>, total: number): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;background:#f5f5f5;border-radius:6px;">
    ${lineas.map((l) => `<tr><td style="padding:6px 14px;color:#444;">${escapeHtml(l.concepto)}</td><td style="padding:6px 14px;text-align:right;font-family:monospace;">${Number(l.importe).toFixed(2)} €</td></tr>`).join('')}
    <tr><td style="padding:10px 14px;font-weight:700;border-top:1px solid #ddd;">Total</td><td style="padding:10px 14px;text-align:right;font-family:monospace;font-weight:700;border-top:1px solid #ddd;color:#0EA5E9;">${total.toFixed(2)} €</td></tr>
  </table>`;
}

const boton = (href: string, txt: string) =>
  `<a href="${href}" style="display:inline-block;margin:4px;padding:12px 24px;background:#0EA5E9;color:#fff;border-radius:6px;font-weight:600;text-decoration:none;">${txt}</a>`;

/** 24 h after "envíame el presupuesto", one reminder unless they already asked. */
async function enviarRecordatorios(supabase: any): Promise<{ enviados: number; omitidos: number }> {
  const ahora = Date.now();
  const { data: filas, error } = await supabase
    .from('presupuestos_guardados')
    .select('id, email, total, lineas, created_at')
    .is('recordado_at', null)
    .lte('created_at', new Date(ahora - 24 * 3600e3).toISOString())
    .gte('created_at', new Date(ahora - 72 * 3600e3).toISOString())
    .limit(50);
  if (error) throw error;
  const { data: cup } = await supabase.rpc('validar_cupon', { p_codigo: CUPON_RECORDATORIO });
  const cupon = cup?.[0] ?? null;
  let enviados = 0, omitidos = 0;
  for (const f of filas ?? []) {
    const { count } = await supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('email', f.email)
      .gte('created_at', f.created_at);
    if ((count ?? 0) === 0) {
      const total = Number(f.total);
      const enlace = `${SITIO}/instant-quote/${cupon ? `?cupon=${cupon.codigo}` : ''}`;
      const oferta = cupon
        ? `Si lo pides ahora, con el código ${cupon.codigo} tienes un ${Number(cupon.valor)} % menos.`
        : '';
      const text = `Hola,

Ayer calculaste el precio de tu pieza en nuestra web: ${total.toFixed(2)} €.
${oferta}

Para pedirlo, responde a este correo con tu archivo 3D o vuelve al tasador:
${enlace}

Si tienes alguna duda (material, color, plazo), contesta a este correo y te
ayudamos. No te escribiremos más por este presupuesto.

— 3DCC Salamanca · impresion3dcc.com`;
      const html = `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 8px 0;color:#0EA5E9;font-family:Arial,sans-serif;">¿Seguimos con tu pieza?</h2>
  <p style="margin:0 0 16px 0;color:#444;line-height:1.6;">Ayer calculaste el precio en nuestra web. Te lo dejamos aquí.</p>
  ${desgloseHtml(f.lineas ?? [], total)}
  ${cupon ? `<p style="margin:20px 0 0 0;color:#111;line-height:1.6;">Si lo pides ahora, con el código <strong style="font-family:monospace;color:#0EA5E9;">${escapeHtml(cupon.codigo)}</strong> tienes un ${Number(cupon.valor)} % menos.</p>` : ''}
  <div style="text-align:center;margin:20px 0;">${boton(enlace, 'Volver al tasador')}</div>
  <p style="margin:0;color:#444;font-size:13px;line-height:1.6;">También puedes responder a este correo con tu archivo 3D y lo preparamos. No te escribiremos más por este presupuesto.</p>
  <p style="margin:24px 0 0 0;font-size:11px;color:#999;">— 3DCC Salamanca · <a href="${SITIO}" style="color:#999;">impresion3dcc.com</a></p>
</div>`;
      if (!(await correoCliente(f.email, `¿Seguimos con tu pieza? ${total.toFixed(2)} € - 3DCC`, text, html))) continue;
      enviados++;
    } else {
      omitidos++;
    }
    await supabase.from('presupuestos_guardados').update({ recordado_at: new Date().toISOString() }).eq('id', f.id);
  }
  return { enviados, omitidos };
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

  if (body?.accion === 'recordatorios') {
    const secreto = Deno.env.get('CRON_SECRET') ?? '';
    if (!secreto || req.headers.get('x-cron-secret') !== secreto) {
      return json({ error: 'No autorizado.' }, 401, allowedOrigin);
    }
    const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    try {
      return json({ ok: true, ...(await enviarRecordatorios(sb)) }, 200, allowedOrigin);
    } catch (err) {
      console.error('recordatorios failed:', err);
      return json({ error: 'No se pudieron enviar los recordatorios.' }, 500, allowedOrigin);
    }
  }
  // "Envíame el presupuesto": priced and emailed like a request, without files.
  const guardar = body?.accion === 'guardar';

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
      if (guardar) return true;
      try {
        const u = new URL(a.url);
        return supabaseHost && u.host === supabaseHost && u.pathname.includes('/quote-uploads/');
      } catch { return false; }
    });

  // ── Validate ──
  // Only a way to reach the customer is required: name, address and colours
  // are asked afterwards (the form was where people gave up).
  if (hp) return json({ ok: true, codigo: 'Q-0000-0000' }, 200, allowedOrigin); // bot
  const tieneEmail = isValidEmail(email);
  const tieneTelefono = telefono.replace(/[^\d]/g, '').length >= 9;
  if (email && !tieneEmail)         return json({ error: 'Revisa el email: parece que le falta algo.' }, 400, allowedOrigin);
  if (guardar && !tieneEmail)       return json({ error: 'Necesitamos un email para enviártelo.' }, 400, allowedOrigin);
  if (!tieneEmail && !tieneTelefono) {
    return json({ error: 'Déjanos un email o un WhatsApp para enviarte el presupuesto.' }, 400, allowedOrigin);
  }
  if (!material)                    return json({ error: 'Material requerido.' }, 400, allowedOrigin);
  if (!archivos.length)             return json({ error: 'Ningún archivo de modelo válido.' }, 400, allowedOrigin);

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
    .from(guardar ? 'presupuestos_guardados' : 'quotes')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  // Saving emails a third party's inbox on request: tighter than requests.
  if ((recentCount ?? 0) >= (guardar ? 3 : 5)) {
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
  // Deadline with the current queue (orientative until accepted, when the
  // database fixes fecha_prometida with fecha_tope()).
  const { data: colaH } = await supabase.rpc('plazo_cola_horas');
  const fechaOrientativa = sumarLaborables(hoyMadrid(), diasPlazo(sq.tiempoH, settings, Number(colaH) || 0));
  const listoAntes = `listo antes del ${fechaLarga(fechaOrientativa)}`;
  // With validated types, a non-firm request shows no closed figure.
  const sinCifraCerrada = (settings.tipos_precio_firme ?? []).length > 0 && !sq.precioFirme;
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
    fecha_orientativa: fechaOrientativa,
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
  const validezTxt = validoHasta.toLocaleDateString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  if (guardar) {
    const { error: gErr } = await supabase.from('presupuestos_guardados').insert({
      email, total: precioServidor, lineas: sq.lineas, entrega, ip_hash: ipHash
    });
    if (gErr) {
      console.error('presupuestos_guardados insert failed:', gErr);
      return json({ error: 'No hemos podido guardarlo. Inténtalo de nuevo.' }, 500, allowedOrigin);
    }
    const wa = `https://wa.me/34923793123?text=${encodeURIComponent(
      `Hola, quiero pedir este presupuesto de la web (${precioServidor.toFixed(2)} €). Os mando el archivo por aquí.`
    )}`;
    const text = `Hola,

Este es el presupuesto que has calculado en impresion3dcc.com:

${sq.lineas.map((l) => `  ${l.concepto}: ${Number(l.importe).toFixed(2)} €`).join('\n')}

  TOTAL: ${precioServidor.toFixed(2)} € · ${listoAntes}
  Válido hasta el ${validezTxt}.

Para pedirlo, responde a este correo con tu archivo 3D o escríbenos por
WhatsApp: ${wa}

Mañana te mandaremos un único recordatorio; si no lo quieres, ignóralo.

— 3DCC Salamanca · impresion3dcc.com`;
    const html = `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 8px 0;color:#0EA5E9;font-family:Arial,sans-serif;">Tu presupuesto</h2>
  <p style="margin:0 0 16px 0;color:#444;line-height:1.6;">Esto es lo que has calculado en nuestra web. ${listoAntes[0].toUpperCase() + listoAntes.slice(1)}; precio válido hasta el ${validezTxt}.</p>
  ${desgloseHtml(sq.lineas, precioServidor)}
  <div style="text-align:center;margin:20px 0;">${boton(wa, 'Pedirlo por WhatsApp')}</div>
  <p style="margin:0;color:#444;font-size:13px;line-height:1.6;">O responde a este correo con tu archivo 3D y lo preparamos. Mañana te mandaremos un único recordatorio.</p>
  <p style="margin:24px 0 0 0;font-size:11px;color:#999;">— 3DCC Salamanca · <a href="${SITIO}" style="color:#999;">impresion3dcc.com</a></p>
</div>`;
    const enviado = await correoCliente(email, `Tu presupuesto de impresion 3D: ${precioServidor.toFixed(2)} EUR`, text, html);
    if (!enviado) return json({ error: 'No hemos podido enviar el email. Inténtalo de nuevo.' }, 502, allowedOrigin);
    return json({ ok: true, precio_total: precioServidor }, 200, allowedOrigin);
  }

  // Same contact, same pieces, same price within a day: a double click, a
  // reload or a second device. Hand back the first code instead of a copy.
  const firma = (xs: any[]) =>
    xs.map((a) => `${a.nombre}×${a.cantidad}|${a.material}|${(a.colores ?? []).map((c: any) => c.nombre).join('+')}`)
      .sort().join(';');
  const { data: previas } = await supabase
    .from('quotes')
    .select('codigo, archivos, valido_hasta')
    .eq(tieneEmail ? 'email' : 'telefono', tieneEmail ? email : telefono)
    .eq('precio_total', precioServidor)
    .neq('estado', 'rechazado')
    .gte('created_at', new Date(Date.now() - 24 * 3600e3).toISOString())
    .limit(10);
  const repetida = (previas ?? []).find((q: any) => firma(q.archivos ?? []) === firma(archivos));
  if (repetida) {
    return json(
      { ok: true, codigo: repetida.codigo, duplicado: true, precio_total: precioServidor, valido_hasta: repetida.valido_hasta },
      200,
      allowedOrigin
    );
  }

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
      precio_firme: sq.precioFirme,
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
    const coloresDe = (a: any) =>
      (a.colores ?? [])
        .map((c: any) => c.nombre + (c.parte ? ` (${c.parte})` : ''))
        .join(', ') || 'color por elegir';
    const quien = nombre || email || telefono;
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
      entrega !== 'envio'
        ? 'Recogida en Salamanca'
        : direccion.calle
          ? `Envío a: ${direccion.calle}, ${direccion.cp} ${direccion.ciudad} (${direccion.provincia})`
          : `Envío nacional (dirección por pedir${direccion.cp ? `, CP ${direccion.cp}` : ''})`;
    const waCliente = tieneTelefono
      ? `https://wa.me/${telefono.replace(/[^\d]/g, '').replace(/^(?=[67]\d{8}$)/, '34')}`
      : '';
    const text = `
Nuevo presupuesto ${codigo} — impresion3dcc.com
──────────────────────────────────────

Cliente:    ${nombre || '(sin nombre)'}
Email:      ${email || '(no facilitado)'}
Teléfono:   ${telefono || '(no facilitado)'}${waCliente ? ` · ${waCliente}` : ''}

Piezas (${archivos.length}):
${piezasTxt}

Total:      ~${m?.peso_g ?? '—'} g · ~${m?.tiempo_h ?? '—'} h de impresión

Unidades:   ${cantidad}
Entrega:    ${entregaTxt}
Plazo est.: ${listoAntes}${sq.precioFirme ? '\nPrecio:     FIRME (no se puede cambiar sin rehacer el presupuesto)' : ''}

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
    <tr><td style="padding:6px 12px 6px 0;color:#666;width:110px;">Cliente</td><td><strong>${nombre ? escapeHtml(nombre) : '<em style="color:#999">sin nombre</em>'}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Email</td><td>${email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : '<em style="color:#999">no facilitado</em>'}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Teléfono</td><td>${telefono ? escapeHtml(telefono) : '<em style="color:#999">no facilitado</em>'}${waCliente ? ` · <a href="${waCliente}">WhatsApp</a>` : ''}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Total</td><td>~${m?.peso_g ?? '—'} g · ~${m?.tiempo_h ?? '—'} h de impresión</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Unidades</td><td>× ${cantidad}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Entrega</td><td>${escapeHtml(entregaTxt)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Plazo est.</td><td>${listoAntes}</td></tr>
    ${sq.precioFirme ? '<tr><td style="padding:6px 12px 6px 0;color:#666;">Precio</td><td><strong>Firme</strong></td></tr>' : ''}
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
${nombre ? `Hola ${nombre},` : 'Hola,'}

Hemos recibido tu solicitud de presupuesto. Tu código de referencia es:

    ${codigo}

Resumen:
${archivos.map((a: any) => `  Pieza:        ${a.nombre}${a.cantidad > 1 ? ` × ${a.cantidad}` : ''} — ${a.material} (${coloresDe(a)})`).join('\n')}
  Entrega:      ${entrega === 'envio' ? `Envío nacional (${sq.envio > 0 ? 'incluido' : 'gratis'})` : 'Recogida en Salamanca (gratis)'}
  Plazo:        ${listoAntes}${entrega === 'envio' ? ' + envío' : ''}${sq.cupon ? `\n  Código:       ${sq.cupon} (-${sq.cuponDescuento.toFixed(2)} €)` : ''}

  TOTAL ESTIMADO: ${precioServidor.toFixed(2)} €${entrega === 'envio' && sq.envio > 0 ? ' (envío incluido)' : ''}

${sinCifraCerrada
  ? 'Te confirmamos el precio en menos de 24 h, después de revisar tu pieza.'
  : `Es el precio final, válido hasta el ${validezTxt}. Si al revisar tu pieza
viésemos algo que lo cambie, te avisamos antes de imprimir.`}

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
  <p style="margin:0 0 20px 0;color:#444;">${nombre ? `Hola ${escapeHtml(nombre)}, h` : 'H'}emos recibido tu solicitud de presupuesto. Tu código de referencia:</p>
  <div style="text-align:center;margin:0 0 24px 0;">
    <span style="display:inline-block;padding:10px 28px;background:#f0f9ff;border:1px solid #0EA5E9;border-radius:6px;font-family:monospace;font-size:22px;font-weight:700;color:#0EA5E9;letter-spacing:0.06em;">${escapeHtml(codigo)}</span>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 12px 6px 0;color:#666;width:110px;">Piezas</td><td>${archivos.map((a: any) => `${escapeHtml(a.nombre)}${a.cantidad > 1 ? ` × ${a.cantidad}` : ''} — ${escapeHtml(a.material)} (${escapeHtml(coloresDe(a))})`).join('<br/>')}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Entrega</td><td>${entrega === 'envio' ? `Envío nacional (${sq.envio > 0 ? 'incluido' : 'gratis'})` : 'Recogida en Salamanca (gratis)'}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Plazo</td><td>${listoAntes}${entrega === 'envio' ? ' + envío' : ''}</td></tr>
    ${sq.cupon ? `<tr><td style="padding:6px 12px 6px 0;color:#666;">Código</td><td>${escapeHtml(sq.cupon)} (−${sq.cuponDescuento.toFixed(2)} €)</td></tr>` : ''}
    <tr><td style="padding:10px 12px 10px 0;color:#666;border-top:1px solid #eee;font-weight:700;">Total estimado</td><td style="border-top:1px solid #eee;font-weight:700;color:#0EA5E9;font-size:18px;">${precioServidor.toFixed(2)} €${entrega === 'envio' && sq.envio > 0 ? ' <span style="font-size:11px;color:#999;font-weight:400;">(envío incluido)</span>' : ''}</td></tr>
  </table>
  <p style="margin:20px 0;color:#444;line-height:1.6;font-size:13px;">
    ${sinCifraCerrada
      ? 'Te confirmamos el precio en <strong>menos de 24 h</strong>, después de revisar tu pieza.'
      : `Es el precio final, <strong>válido hasta el ${validezTxt}</strong>. Si al revisar
    tu pieza viésemos algo que lo cambie, te avisamos antes de imprimir.`}
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
        ...(tieneEmail ? { replyTo: `${asciiHeader(nombre || email)} <${email}>` } : {}),
        subject: asciiHeader(`[Presupuesto ${codigo}] ${material} · ${precioServidor.toFixed(2)} €${sq.cupon ? ` (${sq.cupon})` : ''} — ${quien}`),
        content: text,
        html
      });
      emailSent = true;
    } catch (err) {
      // Quote is already stored; log and carry on.
      console.error('SMTP send failed for', codigo, err);
    }

    try {
      // WhatsApp-only customers get no email: we answer them there.
      if (tieneEmail) {
        await client.send({
          from: `3DCC Salamanca <${gmailUser}>`,
          to: email,
          replyTo: recipient,
          subject: asciiHeader(`Tu presupuesto ${codigo} — 3DCC Salamanca`),
          content: clienteText,
          html: clienteHtml
        });
      }
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
