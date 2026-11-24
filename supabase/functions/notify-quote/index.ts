// Supabase Edge Function: notify-quote
//
// Called from /admin/presupuestos when the admin saves a quote with
// "avisar al cliente" enabled. Verifies the caller is an admin (JWT),
// loads the quote with the service role and emails the customer a status
// update. Uses the same Gmail secrets as the other functions.
//
// Es también el ÚNICO canal de correo de la Calculadora para 3DCC (fase E de
// docs/plan-sincronizacion-web-calculadora.md): el escritorio y el móvil
// llaman aquí con { empresa, order_id } —cada pedido de 3DCC tiene su quote
// (0027)— y, opcionalmente, el PDF del presupuesto en `adjunto`. Así las dos
// apps mandan las mismas plantillas, desde el mismo remitente, y la
// contraseña de Gmail no sale del servidor.
//
//   body: { quote_id } | { empresa, order_id }
//         [adjunto: { filename, base64 }]   PDF, máx. 5 MB
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

// La Calculadora (Electron / Capacitor / Vite dev) también llama a esta
// función para avisar al cliente de pedidos enlazados a una quote. Sus
// orígenes: file:// en Electron empaquetado manda "null"; el WebView de
// Capacitor usa https://localhost; Vite dev usa el 5173.
const CALC_ALLOWED = [
  'null',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const ALLOWED_ORIGINS = [...PROD_ALLOWED, ...DEV_ALLOWED, ...CALC_ALLOWED];

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

// «viernes 14 de noviembre» for a YYYY-MM-DD date (as in lib/quote/pricing).
function fechaLarga(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
  });
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
      (q.origen === 'calculadora'
        ? `Te enviamos el presupuesto${q.descripcion ? ` de «${q.descripcion}»` : ''}: ${precio.toFixed(2)} €.`
        : `Hemos comprobado tus piezas y el precio queda confirmado en ${precio.toFixed(2)} €` +
          (q.entrega === 'envio' ? ' (más envío, que te detallamos aparte).' : '.')) +
      ' Si quieres seguir adelante, pulsa el botón de abajo y acéptalo en un clic — sin escribir nada.'
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
        : 'Tus piezas están terminadas. Elige el día y la hora de recogida en Salamanca con el botón de abajo y te confirmamos la cita.'
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

// Pickup appointment emails (huecos_recogida), sent with body.cita.
function citaTxt(h: any): string {
  const f = new Date(h.inicio);
  const dia = f.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${dia} a las ${hora}`;
}

// .ics so the customer can add it to their phone's calendar (15 min slot).
function ics(h: any, codigo: string): string {
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ini = new Date(h.inicio);
  const esc = (t: string) => t.replace(/[\\;,]/g, (m) => '\\' + m);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//3DCC//Recogida//ES', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:recogida-${h.id}@impresion3dcc.com`,
    `DTSTAMP:${z(new Date())}`,
    `DTSTART:${z(ini)}`,
    `DTEND:${z(new Date(ini.getTime() + 15 * 60000))}`,
    `SUMMARY:${esc(`Recoger pedido 3DCC ${codigo}`)}`,
    `LOCATION:${esc(h.lugar)}`,
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

// Nombre para el cliente (pedido_estados, 0026).
const ESTADO_LABEL: Record<string, string> = {
  nuevo: 'Recibido',
  revisado: 'Presupuestado',
  aceptado: 'Aceptado',
  imprimiendo: 'En producción',
  listo: 'Listo',
  entregado: 'Entregado',
  rechazado: 'Cerrado'
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

  // ── Caller must be an admin OR a 3DCC Calculadora user (empresa_users) ──
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado.' }, 401, allowedOrigin);

  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: 'No autenticado.' }, 401, allowedOrigin);
  }
  let authorized = userData.user.app_metadata?.is_admin === true;
  if (!authorized) {
    const svc = createClient(supabaseUrl, serviceKey);
    const { data: eu } = await svc
      .from('empresa_users')
      .select('empresa')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    authorized = eu?.empresa === '3dcc';
  }
  if (!authorized) {
    return json({ error: 'Solo administradores o usuarios de 3DCC.' }, 403, allowedOrigin);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, allowedOrigin);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // Pedido de la Calculadora → su quote.
  let quoteId = String(body?.quote_id ?? '');
  if (!quoteId && body?.order_id) {
    const { data: o } = await supabase
      .from('orders')
      .select('quote_id')
      .eq('empresa', String(body?.empresa ?? '3dcc'))
      .eq('id', String(body.order_id))
      .maybeSingle();
    quoteId = o?.quote_id ?? '';
    if (!quoteId) {
      return json({ error: 'Este pedido no tiene presupuesto web enlazado.' }, 404, allowedOrigin);
    }
  }
  if (!quoteId) return json({ error: 'quote_id requerido.' }, 400, allowedOrigin);

  // PDF opcional (la Calculadora de escritorio adjunta el presupuesto).
  let adjunto: { filename: string; content: string } | null = null;
  if (body?.adjunto?.base64) {
    const b64 = String(body.adjunto.base64).replace(/\s+/g, '');
    if (b64.length > 7_000_000) {
      return json({ error: 'El adjunto supera los 5 MB.' }, 413, allowedOrigin);
    }
    const nombre = String(body.adjunto.filename ?? 'presupuesto.pdf')
      .replace(/[^\w.\- ]+/g, '_')
      .slice(0, 120);
    adjunto = { filename: nombre.toLowerCase().endsWith('.pdf') ? nombre : `${nombre}.pdf`, content: b64 };
  }

  // ── Load quote ──
  const { data: q, error: qErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .single();
  if (qErr || !q) return json({ error: 'Presupuesto no encontrado.' }, 404, allowedOrigin);

  // Since tasador v7 a request may come with only a WhatsApp number.
  if (!q.email) {
    return json({ error: 'Este cliente no dejó email: avísale por WhatsApp.' }, 400, allowedOrigin);
  }

  // Pickup appointment: confirm the slot the customer asked for, or ask for another.
  const cita = body?.cita === 'confirmada' || body?.cita === 'otra' ? body.cita : null;
  let hueco: any = null;
  if (cita === 'confirmada') {
    const { data: h } = await supabase
      .from('huecos_recogida').select('*').eq('quote_id', q.id).eq('confirmada', true).maybeSingle();
    if (!h) return json({ error: 'Este pedido no tiene cita confirmada.' }, 400, allowedOrigin);
    hueco = h;
    adjunto = { filename: 'recogida-3dcc.ics', content: btoa(unescape(encodeURIComponent(ics(h, q.codigo)))), tipo: 'text/calendar' } as any;
  }
  const mapa = hueco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hueco.lugar)}` : '';
  const plantilla = cita === 'confirmada'
    ? {
        asunto: 'Cita de recogida confirmada',
        titulo: 'Tu cita de recogida',
        cuerpo: () => `Te esperamos el ${citaTxt(hueco)} en ${hueco.lugar}. Trae el código de tu pedido. Si te surge algo, avísanos por WhatsApp.`
      }
    : cita === 'otra'
      ? {
          asunto: 'Elige otra hora de recogida',
          titulo: 'Esa hora no nos viene bien',
          cuerpo: () => 'Lo sentimos, no podemos en la hora que elegiste. Pulsa el botón de abajo y elige otra; te la confirmamos enseguida.'
        }
      : PLANTILLAS[q.estado];
  if (cita && (q.estado !== 'listo' || q.entrega !== 'recogida')) {
    return json({ error: 'La cita solo vale para pedidos listos para recoger.' }, 400, allowedOrigin);
  }
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
  // Fecha tope (fase 2): la prometida al aceptar; antes, la orientativa.
  let plazoTxt = '';
  const envioTxt = q.entrega === 'envio' ? ' (más los días del envío)' : '';
  if ((q.estado === 'aceptado' || q.estado === 'imprimiendo') && q.fecha_prometida) {
    plazoTxt = `Lo tendrás listo antes del ${fechaLarga(q.fecha_prometida)}${envioTxt}.`;
  } else if (q.estado === 'revisado') {
    const { data: pl } = await supabase.rpc('get_quote_plazo', { p_codigo: q.codigo });
    if (pl?.[0]?.fecha_orientativa) {
      plazoTxt = `Si lo aceptas hoy, estará listo antes del ${fechaLarga(pl[0].fecha_orientativa)}${envioTxt}.`;
    }
  }
  const cuerpo = plantilla.cuerpo(q, precio) + (plazoTxt ? ` ${plazoTxt}` : '');

  // Deep link to the status page; for "revisado" include the personal accept
  // token so the customer can confirm the order in one click.
  const statusUrl = `https://www.impresion3dcc.com/presupuesto?codigo=${encodeURIComponent(q.codigo)}`;
  // Same for «listo» pickups: the token lets them choose the pickup slot.
  const eligeCita = q.estado === 'listo' && q.entrega === 'recogida' && cita !== 'confirmada';
  const linkUrl =
    (q.estado === 'revisado' || eligeCita) && q.acepta_token
      ? `${statusUrl}&token=${encodeURIComponent(q.acepta_token)}`
      : statusUrl;
  const linkLabel = cita === 'confirmada'
    ? 'Ver cómo llegar'
    : q.estado === 'revisado' ? 'Ver y aceptar mi presupuesto' : eligeCita ? 'Elegir día de recogida' : 'Seguir mi pedido';
  const botonUrl = cita === 'confirmada' ? mapa : linkUrl;

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
Estado:  ${ESTADO_LABEL[q.estado] ?? q.estado}
${linkLabel}: ${botonUrl}

¿Dudas? Responde a este email o WhatsApp: +34 923 793 123.

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
  <div style="text-align:center;margin:0 0 20px 0;">
    <a href="${botonUrl}" style="display:inline-block;padding:12px 28px;background:#0EA5E9;color:#fff;border-radius:6px;font-weight:600;text-decoration:none;">${escapeHtml(linkLabel)}</a>
  </div>
  <p style="margin:0;color:#444;font-size:13px;">
    ¿Dudas? Responde a este email o <a href="https://wa.me/34923793123" style="color:#0EA5E9;">WhatsApp</a>.
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
      subject: asciiHeader(`${plantilla.asunto} · ${q.codigo} — 3DCC Salamanca`),
      content: text,
      html,
      ...(adjunto
        ? {
            attachments: [
              { filename: adjunto.filename, contentType: (adjunto as any).tipo ?? 'application/pdf', encoding: 'base64', content: adjunto.content }
            ]
          }
        : {})
    });
  } catch (err) {
    console.error('notify-quote SMTP failed for', q.codigo, err);
    return json({ error: 'No se pudo enviar el email al cliente.' }, 502, allowedOrigin);
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }

  return json(
    { ok: true, estado: q.estado, codigo: q.codigo, adjunto: !!adjunto, message: `Cliente avisado (${ESTADO_LABEL[q.estado] ?? q.estado}).` },
    200,
    allowedOrigin
  );
});
