// Supabase Edge Function: notify-quote
//
// Called from /admin/presupuestos when the admin saves a quote with
// "avisar al cliente" enabled. Verifies the caller is an admin (JWT),
// loads the quote with the service role and emails the customer a status
// update. Uses the same Gmail secrets as the other functions.
//
// ── Deploy ──
//   supabase functions deploy notify-quote

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Subject + message per estado. `precio` is precio_final ?? precio_total.
const PLANTILLAS: Record<
  string,
  { asunto: string; titulo: string; cuerpo: (q: any, precio: number) => string }
> = {
  revisado: {
    asunto: 'Presupuesto revisado',
    titulo: 'Hemos revisado tu presupuesto',
    cuerpo: (q, precio) =>
      `Hemos comprobado tus piezas y el precio queda confirmado en ${precio.toFixed(2)} €` +
      (q.entrega === 'envio' ? ' (más envío, que te detallamos aparte).' : '.') +
      ' Si quieres seguir adelante, responde a este email o escríbenos por WhatsApp y lo ponemos en cola.'
  },
  aceptado: {
    asunto: 'Pedido confirmado',
    titulo: '¡Tu pedido está confirmado!',
    cuerpo: (q, precio) =>
      `Tu pedido está aceptado y en cola de impresión por ${precio.toFixed(2)} €. Te avisaremos cuando empecemos a imprimir.`
  },
  imprimiendo: {
    asunto: 'Tu pieza se está imprimiendo',
    titulo: '¡Manos a la obra!',
    cuerpo: () =>
      'Tus piezas están ahora mismo en la impresora. Te avisaremos en cuanto estén listas.'
  },
  listo: {
    asunto: 'Tu pedido está listo',
    titulo: '¡Tu pedido está listo!',
    cuerpo: (q) =>
      q.entrega === 'envio'
        ? 'Tus piezas están terminadas y preparadas para el envío. Te confirmamos el seguimiento en cuanto salga.'
        : 'Tus piezas están terminadas. Puedes pasar a recogerlas por Plza. Barrio Vidal (Salamanca) — escríbenos para cuadrar la hora.'
  },
  entregado: {
    asunto: 'Pedido entregado',
    titulo: '¡Gracias por confiar en 3DCC!',
    cuerpo: () =>
      'Damos tu pedido por entregado. Si todo está perfecto, nos ayudaría muchísimo una reseña en Google. ¡Y aquí nos tienes para la próxima!'
  },
  rechazado: {
    asunto: 'Sobre tu presupuesto',
    titulo: 'No hemos podido aceptar tu pieza',
    cuerpo: () =>
      'Lo sentimos — esta pieza no es viable tal cual (tamaño, geometría o material). Respóndenos y buscamos una alternativa juntos.'
  }
};

Deno.serve(async (req: Request) => {
  const allowedOrigin = pickOrigin(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(allowedOrigin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, allowedOrigin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Server not configured (Supabase).' }, 500, allowedOrigin);
  }

  // ── Caller must be an admin ──
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado.' }, 401, allowedOrigin);

  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  const isAdmin = userData?.user?.app_metadata?.is_admin === true;
  if (userErr || !isAdmin) {
    return json({ error: 'Solo administradores.' }, 403, allowedOrigin);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, allowedOrigin);
  }
  const quoteId = String(body?.quote_id ?? '');
  if (!quoteId) return json({ error: 'quote_id requerido.' }, 400, allowedOrigin);

  // ── Load quote ──
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: q, error: qErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .single();
  if (qErr || !q) return json({ error: 'Presupuesto no encontrado.' }, 404, allowedOrigin);

  const plantilla = PLANTILLAS[q.estado];
  if (!plantilla) {
    return json(
      { error: `Sin plantilla de aviso para el estado "${q.estado}".` },
      400,
      allowedOrigin
    );
  }

  const gmailUser = Deno.env.get('GMAIL_USER')?.trim();
  const gmailPass = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
  const recipient = Deno.env.get('CONTACT_RECIPIENT')?.trim() ?? gmailUser;
  if (!gmailUser || !gmailPass) {
    return json({ error: 'Faltan secrets de Gmail.' }, 500, allowedOrigin);
  }

  const precio = Number(q.precio_final ?? q.precio_total) || 0;
  const cuerpo = plantilla.cuerpo(q, precio);

  const pagoTxt =
    q.pago === 'pagado'
      ? 'Pago recibido — gracias.'
      : q.pago === 'adelanto'
        ? `Adelanto recibido (${Number(q.importe_pagado).toFixed(2)} €). Resto pendiente: ${Math.max(0, precio - Number(q.importe_pagado)).toFixed(2)} €.`
        : '';

  const text = `
Hola ${q.nombre},

${plantilla.titulo}

${cuerpo}
${pagoTxt ? '\n' + pagoTxt + '\n' : ''}
Código:  ${q.codigo}
Estado:  ${q.estado}
Sigue tu pedido en https://www.impresion3dcc.com/presupuesto

¿Dudas? Responde a este email o WhatsApp: +34 665 14 89 56.

— 3DCC Salamanca · impresion3dcc.com
`.trim();

  const html = `
<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 16px 0;color:#0EA5E9;font-family:Arial,sans-serif;">${escapeHtml(plantilla.titulo)}</h2>
  <p style="margin:0 0 16px 0;color:#444;line-height:1.6;">Hola ${escapeHtml(q.nombre)},</p>
  <p style="margin:0 0 16px 0;color:#444;line-height:1.6;">${escapeHtml(cuerpo)}</p>
  ${pagoTxt ? `<p style="margin:0 0 16px 0;padding:10px 14px;background:#f0fdf4;border:1px solid #10b981;border-radius:6px;color:#166534;font-size:13px;">${escapeHtml(pagoTxt)}</p>` : ''}
  <div style="text-align:center;margin:24px 0;">
    <span style="display:inline-block;padding:8px 22px;background:#f0f9ff;border:1px solid #0EA5E9;border-radius:6px;font-family:monospace;font-size:18px;font-weight:700;color:#0EA5E9;letter-spacing:0.06em;">${escapeHtml(q.codigo)}</span>
  </div>
  <p style="margin:0;color:#444;font-size:13px;">
    Sigue tu pedido en <a href="https://www.impresion3dcc.com/presupuesto" style="color:#0EA5E9;">impresion3dcc.com/presupuesto</a>
    · ¿Dudas? Responde a este email o <a href="https://wa.me/34665148956" style="color:#0EA5E9;">WhatsApp</a>.
  </p>
  <p style="margin:24px 0 0 0;font-size:11px;color:#999;">— 3DCC Salamanca · <a href="https://www.impresion3dcc.com" style="color:#999;">impresion3dcc.com</a></p>
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
      from: `3DCC Salamanca <${gmailUser}>`,
      to: q.email,
      replyTo: recipient,
      subject: `${plantilla.asunto} · ${q.codigo} — 3DCC Salamanca`,
      content: text,
      html
    });
  } catch (err) {
    console.error('notify-quote SMTP failed for', q.codigo, err);
    return json({ error: 'No se pudo enviar el email al cliente.' }, 502, allowedOrigin);
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }

  return json({ ok: true, message: `Cliente avisado (${q.estado}).` }, 200, allowedOrigin);
});
