// Supabase Edge Function: envios-etiqueta
//
// Llamada desde /admin/presupuestos (componente EnvioPanel). Verifica admin
// (JWT) y según `action`:
//   - 'methods' → tarifas reales por zona (Sendcloud API v3 fetch-shipping-
//                 options) + cruce con el id v2 necesario para crear la etiqueta.
//   - 'label'   → crea el envío (v2 /parcels), genera la etiqueta (PDF) y la
//                 guarda en `envios`. Devuelve tracking + PDF base64.
//
// El secreto de Sendcloud vive SOLO aquí (secrets de Supabase).
//
// ── Secrets ──
//   supabase secrets set SENDCLOUD_PUBLIC_KEY=... SENDCLOUD_SECRET_KEY=...
// ── Deploy ──
//   supabase functions deploy envios-etiqueta

// @ts-nocheck — Deno target.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SC_V2 = 'https://panel.sendcloud.sc/api/v2';
const SC_V3 = 'https://panel.sendcloud.sc/api/v3';

const PROD_ALLOWED = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://www.impresion3dcc.com')
  .split(',').map((s) => s.trim()).filter(Boolean);
const DEV_ALLOWED = [
  'http://localhost:3000', 'http://localhost:3001',
  'http://127.0.0.1:3000', 'http://127.0.0.1:3001'
];
const ALLOWED_ORIGINS = [...PROD_ALLOWED, ...DEV_ALLOWED];

function pickOrigin(reqOrigin: string | null): string {
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  return PROD_ALLOWED[0] ?? 'https://www.impresion3dcc.com';
}
function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
  });
}

function scAuth(): string {
  const pub = Deno.env.get('SENDCLOUD_PUBLIC_KEY') ?? '';
  const sec = Deno.env.get('SENDCLOUD_SECRET_KEY') ?? '';
  return 'Basic ' + btoa(`${pub}:${sec}`);
}
async function scFetch(base: string, path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: scAuth(), 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = body?.errors?.[0]?.detail ?? body?.error?.message ?? body?.error ?? text ?? res.statusText;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return body;
}
const sc = (p: string, i?: RequestInit) => scFetch(SC_V2, p, i);
const scv3 = (p: string, i?: RequestInit) => scFetch(SC_V3, p, i);

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

// Quita el sufijo de peso del nombre v2 ("... 0-1kg") para casarlo con el v3.
function stripWeight(n: string): string {
  return String(n).replace(/\s*\d+(\.\d+)?\s*-\s*\d+(\.\d+)?\s*kg.*$/i, '').trim();
}
// Precio total (suma del breakdown) del tramo de peso que contiene `kg`.
function priceForWeight(opt: any, kg: number): number | null {
  for (const q of opt.quotes ?? []) {
    const mn = parseFloat(q.weight?.min?.value);
    const mx = parseFloat(q.weight?.max?.value);
    if (kg >= mn && kg <= mx) {
      const sum = (q.price?.breakdown ?? []).reduce((s: number, b: any) => s + parseFloat(b.price?.value ?? '0'), 0);
      return Math.round(sum * 100) / 100;
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const origin = pickOrigin(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Server not configured (Supabase).' }, 500, origin);
  if (!Deno.env.get('SENDCLOUD_PUBLIC_KEY') || !Deno.env.get('SENDCLOUD_SECRET_KEY')) {
    return json({ error: 'Faltan secrets de Sendcloud.' }, 500, origin);
  }

  // ── Caller must be an admin ──
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado.' }, 401, origin);
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || userData?.user?.app_metadata?.is_admin !== true) {
    return json({ error: 'Solo administradores.' }, 403, origin);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400, origin); }

  const action = String(body?.action ?? '');
  const country = String(body?.country ?? 'ES').toUpperCase();
  const weightG = Number(body?.weight_g);
  if (!Number.isFinite(weightG) || weightG <= 0) return json({ error: 'weight_g inválido.' }, 400, origin);
  const weightKg = weightG / 1000;

  try {
    // ── Acción: tarifas (v3) + id v2 para crear etiqueta ──
    if (action === 'methods') {
      const toPostal = String(body?.postal_code ?? '').trim();
      if (!toPostal) return json({ error: 'Falta el código postal de destino.' }, 400, origin);

      // Remitente (origen) desde la cuenta Sendcloud
      const sa = await sc('/user/addresses/sender');
      const sender = (sa.sender_addresses ?? [])[0] ?? {};
      const fromPostal = String(sender.postal_code ?? '');
      const fromCountry = String(sender.country ?? 'ES').toUpperCase();

      // Tarifas reales (v3)
      const v3 = await scv3('/fetch-shipping-options', {
        method: 'POST',
        body: JSON.stringify({
          from_country_code: fromCountry,
          to_country_code: country,
          from_postal_code: fromPostal,
          to_postal_code: toPostal,
          weight: { value: weightKg.toFixed(3), unit: 'kg' }
        })
      });

      // Catálogo v2 (ids numéricos para /parcels)
      const v2 = await sc(`/shipping_methods/?from_country=${fromCountry}`);
      const methods2 = v2.shipping_methods ?? [];

      const opciones = (v3.data ?? [])
        .filter((o: any) => o.carrier?.code !== 'sendcloud') // oculta "Unstamped letter"
        .map((o: any) => {
          const carrier = o.carrier?.code;
          const name = o.name;
          const cand = methods2.find((m: any) =>
            m.carrier === carrier &&
            weightKg >= parseFloat(m.min_weight) && weightKg <= parseFloat(m.max_weight) &&
            stripWeight(m.name).toLowerCase() === String(name).toLowerCase());
          return {
            id: cand?.id ?? null,           // id v2 para crear etiqueta (null = solo estimación)
            code: o.code,
            name,
            carrier,
            price: priceForWeight(o, weightKg),
            service_point: String(o.code).includes('service_point')
          };
        })
        .sort((a: any, b: any) => (a.price ?? Infinity) - (b.price ?? Infinity));

      return json({ ok: true, opciones }, 200, origin);
    }

    // ── Acción: crear etiqueta (v2 /parcels) ──
    if (action === 'label') {
      const r = body?.recipient ?? {};
      const missing = ['name', 'address', 'city', 'postal_code'].filter((k) => !r[k]);
      if (missing.length) return json({ error: 'Faltan datos: ' + missing.join(', ') }, 400, origin);
      const methodId = Number(body?.method_id);
      if (!Number.isFinite(methodId)) return json({ error: 'Método sin etiqueta (solo estimación). Elige otro.' }, 400, origin);

      const parcel: any = {
        name: r.name, address: r.address, house_number: r.house_number ?? '',
        city: r.city, postal_code: r.postal_code,
        country: (r.country ?? country ?? 'ES').toUpperCase(),
        telephone: r.telephone ?? '', email: r.email ?? '',
        weight: weightKg.toFixed(3),
        order_number: r.order_number ?? `3dcc-${Date.now()}`,
        request_label: true,
        shipment: { id: methodId }
      };

      const created = await sc('/parcels', { method: 'POST', body: JSON.stringify({ parcel }) });
      const p = created.parcel ?? {};

      let labelB64: string | null = null;
      const labelUrl: string | undefined = p.label?.normal_printer?.[0] ?? p.label?.label_printer;
      if (labelUrl) {
        const lr = await fetch(labelUrl, { headers: { Authorization: scAuth() } });
        if (lr.ok) labelB64 = toBase64(await lr.arrayBuffer());
      }

      const db = createClient(supabaseUrl, serviceKey);
      const { data: envio } = await db.from('envios').insert({
        quote_id: body?.quote_id ?? null,
        proveedor: 'sendcloud',
        sendcloud_id: p.id ?? null,
        metodo: p.shipment?.name ?? null,
        carrier: p.carrier?.code ?? null,
        cp_destino: r.postal_code ?? null,
        pais: parcel.country,
        peso_g: Math.round(weightG),
        coste: body?.coste ?? null,
        tracking_number: p.tracking_number ?? null,
        tracking_url: p.tracking_url ?? null,
        estado: labelB64 ? 'etiqueta' : 'pendiente',
        estado_carrier: p.status?.message ?? null
      }).select('id').single();

      return json({
        ok: true,
        envio_id: envio?.id ?? null,
        sendcloud_id: p.id ?? null,
        tracking_number: p.tracking_number ?? null,
        tracking_url: p.tracking_url ?? null,
        metodo: p.shipment?.name ?? null,
        label_pdf_base64: labelB64,
        aviso: labelB64 ? null : 'Envío creado pero sin PDF (¿método sin contrato/saldo?).'
      }, 200, origin);
    }

    return json({ error: 'action desconocida (methods|label).' }, 400, origin);
  } catch (e) {
    return json({ error: 'Sendcloud: ' + (e instanceof Error ? e.message : String(e)) }, 502, origin);
  }
});
