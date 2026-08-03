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

// Origins explicitly allowed in production. Comma-separated env var, e.g.
// "https://www.impresion3dcc.com,https://impresion3dcc.com"
const PROD_ALLOWED = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://www.impresion3dcc.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Common local-dev origins, always allowed so `npm run dev` works without
// fiddling with secrets.
const DEV_ALLOWED = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];

const ALLOWED_ORIGINS = [...PROD_ALLOWED, ...DEV_ALLOWED];

function pickOrigin(reqOrigin: string | null): string {
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  // Fall back to the first prod origin. The browser will still block the
  // mismatched origin but at least the header is present.
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

// denomailer 1.6.0 mis-encodes non-ASCII header values (it soft-wraps the
// RFC 2047 encoded-word with `=\r\n` and keeps literal spaces), which breaks
// header folding and makes clients render the whole message as raw MIME. Keep
// header values pure ASCII so denomailer passes them through untouched; the
// body still carries full UTF-8 via quoted-printable.
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

Deno.serve(async (req: Request) => {
  const allowedOrigin = pickOrigin(req.headers.get('origin'));

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
  } catch (err) {
    return json({ error: 'Invalid JSON: ' + String(err) }, 400, allowedOrigin);
  }

  const nombre   = String(body?.nombre   ?? '').trim();
  const email    = String(body?.email    ?? '').trim();
  const telefono = String(body?.telefono ?? '').trim();
  const tipo     = String(body?.tipo     ?? 'Consulta').trim();
  const mensaje  = String(body?.mensaje  ?? '').trim();
  const hp       = String(body?.website  ?? '').trim();   // honeypot

  // Attachments uploaded to the contact-uploads bucket BEFORE submit.
  // We only accept URLs whose host matches our Supabase project to prevent
  // someone using us as a relay for arbitrary links.
  const supabaseHost = (() => {
    const u = Deno.env.get('SUPABASE_URL') ?? '';
    try { return new URL(u).host; } catch { return ''; }
  })();
  const rawArchivos = Array.isArray(body?.archivos) ? body.archivos : [];
  const archivos: Array<{ nombre: string; url: string; tamano: number }> = rawArchivos
    .slice(0, 5)
    .map((a: any) => ({
      nombre: String(a?.nombre ?? 'archivo').slice(0, 200),
      url:    String(a?.url    ?? ''),
      tamano: Number(a?.tamano ?? 0) || 0
    }))
    .filter((a) => {
      try {
        const u = new URL(a.url);
        return supabaseHost && u.host === supabaseHost && u.pathname.includes('/contact-uploads/');
      } catch { return false; }
    });

  // ── Validate ──
  if (hp) {
    // Bot filled the honeypot field. Pretend it worked.
    return json({ ok: true }, 200, allowedOrigin);
  }
  if (!nombre || nombre.length < 2)         return json({ error: 'Nombre requerido (min 2). Value: ' + nombre },         400, allowedOrigin);
  if (!isValidEmail(email))                 return json({ error: 'Email inválido: ' + email },           400, allowedOrigin);
  if (!mensaje || mensaje.length < 10)      return json({ error: 'Mensaje demasiado corto (min 10). Length: ' + mensaje.length },  400, allowedOrigin);
  if (mensaje.length > 5000)                return json({ error: 'Mensaje demasiado largo (max 5000). Length: ' + mensaje.length },  400, allowedOrigin);

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
  const gmailUser = Deno.env.get('GMAIL_USER')?.trim();
  // Gmail's UI shows the app password with spaces — accept that gracefully.
  const gmailPass = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
  const recipient = Deno.env.get('CONTACT_RECIPIENT')?.trim() ?? gmailUser;
  if (!gmailUser || !gmailPass || !recipient) {
    return json(
      { error: 'Server not configured. Faltan secrets GMAIL_USER / GMAIL_APP_PASSWORD / CONTACT_RECIPIENT.' },
      500,
      allowedOrigin
    );
  }
  if (gmailPass.length !== 16) {
    return json(
      {
        error:
          'GMAIL_APP_PASSWORD inválido: deben ser 16 caracteres (los espacios se ignoran). Genera uno nuevo en https://myaccount.google.com/apppasswords'
      },
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

  const subject = asciiHeader(`[Web 3DCC] ${tipo} — ${nombre}`);

  const attachmentsText = archivos.length
    ? '\n\nArchivos adjuntos:\n' +
      archivos
        .map((a) => `  • ${a.nombre} (${(a.tamano / 1024).toFixed(0)} KB)\n    ${a.url}`)
        .join('\n')
    : '';

  const text = `
Nueva consulta desde impresion3dcc.com
──────────────────────────────────────

Nombre:    ${nombre}
Email:     ${email}
Teléfono:  ${telefono || '(no facilitado)'}
Tipo:      ${tipo}

Mensaje:
${mensaje}${attachmentsText}

──────────────────────────────────────
Origen IP: ${ip}
Fecha:     ${new Date().toISOString()}
`.trim();

  const attachmentsHtml = archivos.length
    ? `
  <h3 style="margin:24px 0 8px 0;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.1em;">Archivos adjuntos</h3>
  <ul style="list-style:none;padding:0;margin:0;">
    ${archivos
      .map(
        (a) => `
    <li style="padding:10px 14px;background:#f5f5f5;border-radius:6px;margin-bottom:6px;">
      <a href="${escapeHtml(a.url)}" style="color:#0EA5E9;font-weight:600;text-decoration:none;">${escapeHtml(a.nombre)}</a>
      <span style="color:#999;font-family:monospace;font-size:11px;margin-left:8px;">${(a.tamano / 1024).toFixed(0)} KB</span>
    </li>`
      )
      .join('')}
  </ul>`
    : '';

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
  ${attachmentsHtml}
  <p style="margin:24px 0 0 0;font-size:11px;color:#999;font-family:monospace;">
    IP ${ip} · ${new Date().toISOString()}
  </p>
</div>
`.trim();

  try {
    await client.send({
      from: `3DCC Web <${gmailUser}>`,
      to: recipient,
      replyTo: `${asciiHeader(nombre)} <${email}>`,   // reply directly to the user
      subject,
      content: text,
      html
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Console logs show up in Supabase Dashboard → Edge Functions → Logs.
    console.error('SMTP send failed:', msg, err);

    // Map common Gmail SMTP errors to actionable Spanish text.
    let userMessage = 'Fallo al enviar el email.';
    if (/535|Username and Password/i.test(msg)) {
      userMessage =
        'Gmail rechazó las credenciales SMTP. Genera una nueva App Password (https://myaccount.google.com/apppasswords) y actualízala con `supabase secrets set GMAIL_APP_PASSWORD=...`. Recuerda que la cuenta debe tener 2FA activado.';
    } else if (/550|Daily user sending quota/i.test(msg)) {
      userMessage = 'Has superado la cuota diaria de envío de Gmail.';
    } else if (/timeout|ECONNREFUSED|EAI_AGAIN|getaddrinfo/i.test(msg)) {
      userMessage = 'No se pudo conectar a smtp.gmail.com. Reintenta en unos segundos.';
    }

    return json(
      { error: userMessage, detail: msg },
      502,
      allowedOrigin
    );
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }

  return json({ ok: true, message: '¡Gracias! Te responderemos en breve.' }, 200, allowedOrigin);
});
