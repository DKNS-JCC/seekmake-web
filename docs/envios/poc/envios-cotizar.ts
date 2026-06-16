// ============================================================================
// PoC — Supabase Edge Function: envios-cotizar
// Proxy a Sendcloud para cotizar opciones de envío SIN exponer el secret.
//
// Deploy:
//   supabase functions deploy envios-cotizar --no-verify-jwt
//   supabase secrets set SENDCLOUD_PUBLIC_KEY=... SENDCLOUD_SECRET_KEY=...
//
// Llamada (desde la web):
//   POST https://<project-ref>.supabase.co/functions/v1/envios-cotizar
//   body: { "peso_g": 250, "cp_destino": "37001", "pais": "ES" }
//
// NOTA del caveat: el endpoint de PRECIO exacto de Sendcloud no soporta
// carriers españoles que tarifan por zona de CP. Aquí usamos /shipping_methods
// (lista + precio por país) que sí responde; si un método no trae precio,
// se marca para resolverlo con tabla propia/contrato (ver PLAN sección 5).
// ============================================================================

import type {
  CotizarRequest,
  CotizarResponse,
  OpcionEnvio,
  SendcloudMethodsResponse,
} from "../sendcloud.types.ts";

const SENDCLOUD_BASE = "https://panel.sendcloud.sc/api/v2";
const FROM_COUNTRY = "ES"; // origen: Salamanca

const cors = {
  "Access-Control-Allow-Origin": "*", // en prod: restringir al dominio del sitio
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

function authHeader(): string {
  const pub = Deno.env.get("SENDCLOUD_PUBLIC_KEY") ?? "";
  const sec = Deno.env.get("SENDCLOUD_SECRET_KEY") ?? "";
  // Sendcloud: HTTP Basic con public:secret
  return "Basic " + btoa(`${pub}:${sec}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let body: CotizarRequest;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const pesoG = Number(body.peso_g);
  const pais = (body.pais ?? "ES").toUpperCase();
  if (!Number.isFinite(pesoG) || pesoG <= 0) {
    return json({ ok: false, error: "peso_g invalido" }, 400);
  }
  const pesoKg = pesoG / 1000;

  // Listar métodos disponibles para el corredor ES -> pais
  const url =
    `${SENDCLOUD_BASE}/shipping_methods?from_country=${FROM_COUNTRY}&to_country=${pais}`;

  let data: SendcloudMethodsResponse;
  try {
    const res = await fetch(url, { headers: { Authorization: authHeader() } });
    if (!res.ok) {
      return json({ ok: false, error: `sendcloud ${res.status}` }, 502);
    }
    data = await res.json();
  } catch (_e) {
    return json({ ok: false, error: "sendcloud_unreachable" }, 502);
  }

  let avisoZona = false;

  const opciones: OpcionEnvio[] = (data.shipping_methods ?? [])
    .filter((m) => {
      const min = parseFloat(m.min_weight);
      const max = parseFloat(m.max_weight);
      return pesoKg >= min && pesoKg <= max;
    })
    .map((m) => {
      const c = m.countries?.find((c) => c.iso_2 === pais);
      const precio = c?.price ? parseFloat(c.price) : null;
      if (precio === null) avisoZona = true;
      return {
        metodo_id: m.id,
        nombre: m.name,
        carrier: m.carrier,
        precio,
        fuente_precio: precio !== null ? "sendcloud" : "tabla_propia",
        min_peso_g: Math.round(parseFloat(m.min_weight) * 1000),
        max_peso_g: Math.round(parseFloat(m.max_weight) * 1000),
      } satisfies OpcionEnvio;
    })
    .sort((a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity));

  const out: CotizarResponse = {
    ok: true,
    opciones,
    aviso: avisoZona
      ? "Algunos métodos no devuelven precio (carrier por zona de CP). Usar tabla propia/contrato."
      : undefined,
  };
  return json(out);
});
