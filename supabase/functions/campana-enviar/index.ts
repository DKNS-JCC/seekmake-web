// Supabase Edge Function: campana-enviar (solo admin, desde /admin/campanas)
//
//   { campana_id, prueba: true }  → la manda solo a CONTACT_RECIPIENT.
//   { campana_id }                → la manda a la audiencia, de una en una.
//
// Cada llamada envía lo que cabe en ~100 s y devuelve cuántos quedan; el admin
// vuelve a llamar hasta que no quede nadie. campana_envios evita los dobles
// envíos: quien ya la recibió no se repite aunque se llame dos veces.
//
// Contra el spam: un correo por persona (nunca CCO), texto + HTML, sin
// imágenes, List-Unsubscribe de un clic, Reply-To real y un ritmo lento.
// shortcut: Gmail SMTP con contraseña de aplicación permite ~500 correos/día;
// con una lista de miles, pasar a un proveedor (Brevo, Resend) con el dominio
// verificado (SPF/DKIM/DMARC de impresion3dcc.com).
//
// Secrets: los de notify-quote (GMAIL_USER, GMAIL_APP_PASSWORD,
// CONTACT_RECIPIENT, ALLOWED_ORIGIN).

// @ts-nocheck — Deno target.
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeAsunto, escapeHtml, sustituir, tokenBaja } from '../_shared/campana.ts';

const SITIO = 'https://www.impresion3dcc.com';
const PRESUPUESTO_S = 100; // margen bajo el límite de tiempo de la función
const PAUSA_MS = 1500;

const PROD_ALLOWED = (Deno.env.get('ALLOWED_ORIGIN') ?? SITIO).split(',').map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...PROD_ALLOWED, 'http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'];
const pickOrigin = (o: string | null) => (o && ALLOWED_ORIGINS.includes(o) ? o : PROD_ALLOWED[0] ?? SITIO);
const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
});
const json = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });

function plantilla(cuerpoHtml: string, urlBaja: string): string {
  return `
<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.6;font-size:15px;">
${cuerpoHtml}
<p style="margin:24px 0 0 0;font-size:13px;color:#444;">¿Dudas? Responde a este email o escríbenos por <a href="https://wa.me/34923793123" style="color:#0EA5E9;">WhatsApp</a>.</p>
<p style="margin:24px 0 0 0;font-size:11px;color:#999;">3DCC Salamanca · Plza. Barrio Vidal, 37006 Salamanca · <a href="${SITIO}" style="color:#999;">impresion3dcc.com</a><br>
Recibes este correo porque nos pediste un presupuesto o un encargo. <a href="${urlBaja}" style="color:#999;">Darme de baja</a></p>
</div>`.trim();
}

Deno.serve(async (req: Request) => {
  const origin = pickOrigin(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const gmailUser = Deno.env.get('GMAIL_USER')?.trim();
  const gmailPass = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
  const replyTo = Deno.env.get('CONTACT_RECIPIENT')?.trim() || gmailUser;
  if (!gmailUser || !gmailPass) return json({ error: 'Faltan GMAIL_USER / GMAIL_APP_PASSWORD.' }, 500, origin);

  // Solo el admin de la web (no los usuarios de la Calculadora).
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = jwt ? await createClient(supabaseUrl, anonKey).auth.getUser(jwt) : { data: null };
  if (u?.user?.app_metadata?.is_admin !== true) return json({ error: 'Solo administradores.' }, 403, origin);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400, origin); }
  const prueba = body?.prueba === true;
  const db = createClient(supabaseUrl, serviceKey);

  const { data: c, error: cErr } = await db.from('campanas').select('*').eq('id', String(body?.campana_id ?? '')).maybeSingle();
  if (cErr || !c) return json({ error: 'Campaña no encontrada.' }, 404, origin);

  let destinatarios: { email: string; nombre: string | null }[];
  if (prueba) {
    destinatarios = [{ email: replyTo!, nombre: 'Jorge' }];
  } else {
    const [{ data: aud, error: aErr }, { data: hechos }] = await Promise.all([
      db.rpc('campana_audiencia'),
      db.from('campana_envios').select('email').eq('campana_id', c.id).eq('ok', true)
    ]);
    if (aErr) return json({ error: 'No se pudo leer la audiencia.' }, 500, origin);
    const ya = new Set((hechos ?? []).map((h) => h.email));
    destinatarios = (aud ?? []).filter((a) => !ya.has(a.email));
    if (destinatarios.length) await db.from('campanas').update({ estado: 'enviando' }).eq('id', c.id);
  }

  const vars = {
    cupon: c.cupon ?? '',
    enlace_cupon: c.cupon ? `${SITIO}/instant-quote/?cupon=${encodeURIComponent(c.cupon)}` : `${SITIO}/instant-quote/`
  };
  const smtp = new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: gmailUser, password: gmailPass } }
  });

  const inicio = Date.now();
  let enviados = 0, fallidos = 0, i = 0;
  try {
    for (; i < destinatarios.length && (Date.now() - inicio) / 1000 < PRESUPUESTO_S; i++) {
      const d = destinatarios[i];
      const nombre = (d.nombre ?? '').trim().split(/\s+/)[0] || 'hola';
      const t = await tokenBaja(d.email, serviceKey);
      const q = `e=${encodeURIComponent(d.email)}&t=${t}`;
      const urlBaja = `${SITIO}/baja/?${q}`;
      const v = { ...vars, nombre };
      let error: string | null = null;
      try {
        await smtp.send({
          from: `3DCC Salamanca <${gmailUser}>`,
          to: d.email,
          replyTo,
          subject: encodeAsunto(sustituir(c.asunto, v)),
          content: `${sustituir(c.cuerpo, v)}\n\n—\n3DCC Salamanca · ${SITIO}\nDarte de baja: ${urlBaja}`,
          html: plantilla(sustituir(c.html, v, escapeHtml), urlBaja),
          headers: {
            'List-Unsubscribe': `<${supabaseUrl}/functions/v1/campana-baja?${q}>, <mailto:${replyTo}?subject=baja>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
          }
        });
        enviados++;
      } catch (err) {
        error = String(err?.message ?? err).slice(0, 300);
        fallidos++;
        console.error('campana-enviar', d.email, error);
      }
      if (!prueba) {
        await db.from('campana_envios').upsert({ campana_id: c.id, email: d.email, ok: !error, error });
      }
      if (i < destinatarios.length - 1) await new Promise((r) => setTimeout(r, PAUSA_MS));
    }
  } finally {
    try { await smtp.close(); } catch { /* ignore */ }
  }

  const pendientes = destinatarios.length - i + (prueba ? 0 : fallidos);
  if (!prueba && destinatarios.length - i === 0 && fallidos === 0) {
    await db.from('campanas').update({ estado: 'enviada', enviada_at: new Date().toISOString() }).eq('id', c.id);
  }
  return json({ ok: true, enviados, fallidos, pendientes }, 200, origin);
});
