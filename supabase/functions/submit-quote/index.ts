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

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
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
  const precioTotal = Math.max(0, Math.min(99999, Number(body?.precio_total) || 0));

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

  // The model file was uploaded to the quote-uploads bucket before submit;
  // only accept URLs pointing at our own project.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseHost = (() => {
    try { return new URL(supabaseUrl).host; } catch { return ''; }
  })();
  const archivoNombre = String(body?.archivo?.nombre ?? 'modelo').slice(0, 200);
  const archivoUrl    = String(body?.archivo?.url ?? '');
  const archivoTamano = Number(body?.archivo?.tamano ?? 0) || 0;
  const archivoOk = (() => {
    try {
      const u = new URL(archivoUrl);
      return supabaseHost && u.host === supabaseHost && u.pathname.includes('/quote-uploads/');
    } catch { return false; }
  })();

  // ── Validate ──
  if (hp) return json({ ok: true, codigo: 'Q-0000-0000' }, 200, allowedOrigin); // bot
  if (!nombre || nombre.length < 2) return json({ error: 'Nombre requerido.' }, 400, allowedOrigin);
  if (!isValidEmail(email))         return json({ error: 'Email inválido.' }, 400, allowedOrigin);
  if (!material)                    return json({ error: 'Material requerido.' }, 400, allowedOrigin);
  if (!archivoOk)                   return json({ error: 'Archivo de modelo inválido.' }, 400, allowedOrigin);
  if (!colores.length)              return json({ error: 'Elige al menos un color.' }, 400, allowedOrigin);

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

  const { data: inserted, error: insErr } = await supabase
    .from('quotes')
    .insert({
      nombre,
      email,
      telefono,
      mensaje,
      archivo_nombre: archivoNombre,
      archivo_url: archivoUrl,
      archivo_tamano: archivoTamano,
      material,
      colores,
      resistencia,
      detalle,
      cantidad,
      metricas,
      desglose,
      precio_total: precioTotal
    })
    .select('codigo')
    .single();

  if (insErr || !inserted) {
    console.error('quotes insert failed:', insErr);
    return json({ error: 'No se pudo registrar la solicitud.' }, 500, allowedOrigin);
  }
  const codigo: string = inserted.codigo;

  // ── Email the admin (best effort — the quote is already saved) ──
  const gmailUser = Deno.env.get('GMAIL_USER')?.trim();
  const gmailPass = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
  const recipient = Deno.env.get('CONTACT_RECIPIENT')?.trim() ?? gmailUser;

  let emailSent = false;
  if (gmailUser && gmailPass && recipient) {
    const lineas: Array<{ concepto: string; importe: number }> =
      Array.isArray(desglose?.lineas) ? desglose.lineas : [];

    const coloresTxt = colores
      .map((c) => c.nombre + (c.parte ? ` (${c.parte})` : ''))
      .join(', ');

    const m: any = metricas;
    const text = `
Nuevo presupuesto ${codigo} — impresion3dcc.com
──────────────────────────────────────

Cliente:    ${nombre}
Email:      ${email}
Teléfono:   ${telefono || '(no facilitado)'}

Pieza:      ${archivoNombre} (${(archivoTamano / 1024 / 1024).toFixed(1)} MB)
            ${archivoUrl}
Tamaño:     ${m?.bbox_mm ? `${m.bbox_mm.x} × ${m.bbox_mm.z} × ${m.bbox_mm.y} mm` : '—'}
Volumen:    ${m?.volumen_cm3 ?? '—'} cm³ · ~${m?.peso_g ?? '—'} g · ~${m?.tiempo_h ?? '—'} h

Material:   ${material} — ${coloresTxt}
Resistencia: ${resistencia} (relleno ${m?.relleno_pct ?? '—'}%)
Detalle:    ${detalle}
Cantidad:   ${cantidad}

Desglose:
${lineas.map((l) => `  ${l.concepto}: ${Number(l.importe).toFixed(2)} €`).join('\n')}

TOTAL ESTIMADO: ${precioTotal.toFixed(2)} €

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
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Pieza</td><td><a href="${escapeHtml(archivoUrl)}" style="color:#0EA5E9;font-weight:600;">${escapeHtml(archivoNombre)}</a> <span style="color:#999;font-size:11px;">${(archivoTamano / 1024 / 1024).toFixed(1)} MB</span></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Medidas</td><td>${m?.bbox_mm ? `${m.bbox_mm.x} × ${m.bbox_mm.z} × ${m.bbox_mm.y} mm` : '—'} · ${m?.volumen_cm3 ?? '—'} cm³ · ~${m?.peso_g ?? '—'} g</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Material</td><td>${escapeHtml(material)} — ${escapeHtml(coloresTxt)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Ajustes</td><td>${escapeHtml(resistencia)} · ${escapeHtml(detalle)} · × ${cantidad}</td></tr>
  </table>
  <h3 style="margin:24px 0 8px 0;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.1em;">Desglose</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;background:#f5f5f5;border-radius:6px;">
    ${lineas.map((l) => `<tr><td style="padding:6px 14px;color:#444;">${escapeHtml(l.concepto)}</td><td style="padding:6px 14px;text-align:right;font-family:monospace;">${Number(l.importe).toFixed(2)} €</td></tr>`).join('')}
    <tr><td style="padding:10px 14px;font-weight:700;border-top:1px solid #ddd;">TOTAL ESTIMADO</td><td style="padding:10px 14px;text-align:right;font-family:monospace;font-weight:700;border-top:1px solid #ddd;color:#0EA5E9;">${precioTotal.toFixed(2)} €</td></tr>
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

    try {
      await client.send({
        from: `3DCC Tasador <${gmailUser}>`,
        to: recipient,
        replyTo: `${nombre} <${email}>`,
        subject: `[Presupuesto ${codigo}] ${material} · ${precioTotal.toFixed(2)} € — ${nombre}`,
        content: text,
        html
      });
      emailSent = true;
    } catch (err) {
      // Quote is already stored; log and carry on.
      console.error('SMTP send failed for', codigo, err);
    } finally {
      try { await client.close(); } catch { /* ignore */ }
    }
  }

  return json(
    {
      ok: true,
      codigo,
      emailSent,
      message: `Solicitud ${codigo} registrada. Te responderemos en breve.`
    },
    200,
    allowedOrigin
  );
});
