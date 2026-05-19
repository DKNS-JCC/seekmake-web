// Supabase Edge Function: send-contact-email
//
// Receives a contact-form submission from the public website, validates it,
// and forwards it to the admin's inbox via Gmail SMTP using an app password.
// Nothing is persisted — the data only lives in the recipient mailbox.
//
// ── Required Supabase secrets (`supabase secrets set ...`) ──
//   GMAIL_USER             your Gmail address, e.g. impresion3dslmc@gmail.com
//   GMAIL_APP_PASSWORD     16-char app password from
//                          https://myaccount.google.com/apppasswords
//   CONTACT_RECIPIENT      where to send the form (usually same as GMAIL_USER)
//   ALLOWED_ORIGIN         CORS origin, e.g. https://impresion3dcc.com
//                          (use https://www.impresion3dcc.com if you serve from www)
//
// ── Deploy ──
//   supabase functions deploy send-contact-email
//   supabase secrets set GMAIL_USER=... GMAIL_APP_PASSWORD=... \
//                       CONTACT_RECIPIENT=... ALLOWED_ORIGIN=https://www.impresion3dcc.com

// @ts-nocheck — Deno target.
// deno-lint-ignore-file no-explicit-any
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const ALLOWED_ORIGIN_FALLBACK = 'https://www.impresion3dcc.com';

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
  });
}

// Naive in-memory rate limit. Edge Function instances are warm for a few
// minutes; this caps obvious abuse without infrastructure. For real
// flooding you'd add a Cloudflare/Supabase upstream limit.
const recent = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const WINDOW_MS = 60 * 60 * 1000;            // 1 hour
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
  const allowedOrigin =
    Deno.env.get('ALLOWED_ORIGIN') ?? ALLOWED_ORIGIN_FALLBACK;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(allowedOrigin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, allowedOrigin);
  }

  // ── Parse ──
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, allowedOrigin);
  }

  const nombre   = String(body?.nombre   ?? '').trim();
  const email    = String(body?.email    ?? '').trim();
  const telefono = String(body?.telefono ?? '').trim();
  const tipo     = String(body?.tipo     ?? 'Consulta').trim();
  const mensaje  = String(body?.mensaje  ?? '').trim();
  const hp       = String(body?.website  ?? '').trim();   // honeypot

  // ── Validate ──
  if (hp) {
    // Bot filled the honeypot field. Pretend it worked.
    return json({ ok: true }, 200, allowedOrigin);
  }
  if (!nombre || nombre.length < 2)         return json({ error: 'Nombre requerido' },         400, allowedOrigin);
  if (!isValidEmail(email))                 return json({ error: 'Email inválido' },           400, allowedOrigin);
  if (!mensaje || mensaje.length < 10)      return json({ error: 'Mensaje demasiado corto' },  400, allowedOrigin);
  if (mensaje.length > 5000)                return json({ error: 'Mensaje demasiado largo' },  400, allowedOrigin);

  // ── Rate limit ──
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

  // ── Config ──
  const gmailUser  = Deno.env.get('GMAIL_USER');
  const gmailPass  = Deno.env.get('GMAIL_APP_PASSWORD');
  const recipient  = Deno.env.get('CONTACT_RECIPIENT') ?? gmailUser;
  if (!gmailUser || !gmailPass || !recipient) {
    return json(
      { error: 'Server not configured. Faltan secrets GMAIL_USER / GMAIL_APP_PASSWORD.' },
      500,
      allowedOrigin
    );
  }

  // ── Send ──
  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailPass }
    }
  });

  const subject = `[Web 3DCC] ${tipo} — ${nombre}`;

  const text = `
Nueva consulta desde impresion3dcc.com
──────────────────────────────────────

Nombre:    ${nombre}
Email:     ${email}
Teléfono:  ${telefono || '(no facilitado)'}
Tipo:      ${tipo}

Mensaje:
${mensaje}

──────────────────────────────────────
Origen IP: ${ip}
Fecha:     ${new Date().toISOString()}
`.trim();

  const html = `
<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 16px 0;color:#0EA5E9;font-family:Arial,sans-serif;">Nueva consulta desde impresion3dcc.com</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 12px 6px 0;color:#666;width:90px;">Nombre</td><td><strong>${escapeHtml(nombre)}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Teléfono</td><td>${telefono ? `<a href="tel:${escapeHtml(telefono)}">${escapeHtml(telefono)}</a>` : '<em style="color:#999">no facilitado</em>'}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Tipo</td><td>${escapeHtml(tipo)}</td></tr>
  </table>
  <h3 style="margin:24px 0 8px 0;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.1em;">Mensaje</h3>
  <div style="background:#f5f5f5;padding:16px 20px;border-radius:6px;white-space:pre-wrap;line-height:1.6;">${escapeHtml(mensaje)}</div>
  <p style="margin:24px 0 0 0;font-size:11px;color:#999;font-family:monospace;">
    IP ${ip} · ${new Date().toISOString()}
  </p>
</div>
`.trim();

  try {
    await client.send({
      from: `3DCC Web <${gmailUser}>`,
      to: recipient,
      replyTo: `${nombre} <${email}>`,   // reply directly to the user
      subject,
      content: text,
      html
    });
    await client.close();
  } catch (err) {
    return json(
      { error: 'Fallo al enviar el email', detail: String(err) },
      502,
      allowedOrigin
    );
  }

  return json({ ok: true, message: '¡Gracias! Te responderemos en breve.' }, 200, allowedOrigin);
});
