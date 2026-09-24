// Supabase Edge Function: recibo-emitir
//
// Justificantes de pago (recibos no fiscales). Un recibo = un cobro.
//
//   emitir     → admin o usuario de 3DCC en la Calculadora. Documenta un
//                cobro del libro `cobros` (0028): el de `cobro_id`, o uno
//                nuevo que registra aquí con importe/método/fecha. Genera el
//                PDF, lo archiva en el bucket privado `recibos`, inserta la
//                fila y (opcional) se lo manda al cliente con el PDF adjunto.
//   descargar  → admin (JWT) o cliente (código de pedido + acepta_token).
//                Devuelve una URL firmada de caducidad corta.
//   anular     → admin o 3DCC. Marca el recibo como anulado; el PDF NO se
//                borra y el cobro sigue contando (se anula aparte).
//
// POR QUÉ EL PDF SE GENERA AQUÍ Y NO EN EL NAVEGADOR: hay cuatro vías de
// entrega (descarga del cliente, descarga del admin, email automático y
// archivado). Generándolo una sola vez en el servidor, las cuatro sirven el
// MISMO fichero y el archivado es una prueba real. Si cada vía generase el
// suyo, el "justificante" archivado no probaría lo que el cliente recibió.
//
// ── Secrets ──
//   Ya configurados por otras funciones: GMAIL_USER, GMAIL_APP_PASSWORD,
//   CONTACT_RECIPIENT, ALLOWED_ORIGIN.
// ── Deploy ──
//   supabase functions deploy recibo-emitir

// @ts-nocheck — Deno target.
// deno-lint-ignore-file no-explicit-any
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildReciboPdf, euros, fechaCorta } from '../_shared/recibo/template.ts';
import { METODO_LABEL } from '../_shared/recibo/types.ts';
import type { ReciboDatos, ReciboMetodo } from '../_shared/recibo/types.ts';

const SITIO = 'https://www.impresion3dcc.com';
const BUCKET = 'recibos';
/** Caducidad de las URLs firmadas: suficiente para descargar, no para compartir. */
const URL_TTL_S = 900;

const EMISOR = {
  nombre: '3DCC Salamanca',
  dominio: 'impresion3dcc.com',
  email: 'info@impresion3dcc.com',
  telefono: '+34 923 793 123'
};

const METODOS: ReciboMetodo[] = ['efectivo', 'bizum', 'transferencia', 'tarjeta', 'otro'];

// ── CORS (mismo criterio que el resto de funciones) ────────────────────────
const PROD_ALLOWED = (Deno.env.get('ALLOWED_ORIGIN') ?? SITIO)
  .split(',').map((s) => s.trim()).filter(Boolean);
const DEV_ALLOWED = [
  'http://localhost:3000', 'http://localhost:3001',
  'http://127.0.0.1:3000', 'http://127.0.0.1:3001'
];
// La Calculadora (Electron empaquetado manda "null"; Capacitor, localhost).
const CALC_ALLOWED = [
  'null', 'https://localhost', 'capacitor://localhost',
  'http://localhost:5173', 'http://127.0.0.1:5173'
];
const ALLOWED_ORIGINS = [...PROD_ALLOWED, ...DEV_ALLOWED, ...CALC_ALLOWED];

function pickOrigin(reqOrigin: string | null): string {
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  return PROD_ALLOWED[0] ?? SITIO;
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

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// denomailer 1.6.0 rompe las cabeceras con caracteres no ASCII (ver la nota
// larga en notify-quote). Los asuntos van saneados; el cuerpo sí lleva UTF-8.
function asciiHeader(s: string): string {
  return (s ?? '')
    .replace(/€/g, 'EUR')
    .replace(/[·•∙]/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// ── Email al cliente con el PDF adjunto ────────────────────────────────────
async function enviarEmail(
  quote: any,
  recibo: { codigo: string; importe: number; metodo: ReciboMetodo; fecha_pago: string },
  pendiente: number | null,
  pdf: Uint8Array
): Promise<string | null> {
  const gmailUser = Deno.env.get('GMAIL_USER')?.trim();
  const gmailPass = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
  const replyTo = Deno.env.get('CONTACT_RECIPIENT')?.trim() ?? gmailUser;
  if (!gmailUser || !gmailPass) return 'Faltan secrets de Gmail: el recibo se emitió pero no se envió.';

  const statusUrl =
    `${SITIO}/presupuesto?codigo=${encodeURIComponent(quote.codigo)}` +
    (quote.acepta_token ? `&token=${encodeURIComponent(quote.acepta_token)}` : '');

  const restoTxt =
    pendiente == null
      ? ''
      : pendiente > 0.004
        ? `Queda pendiente ${euros(pendiente)} del total del pedido.`
        : 'Con este pago el pedido queda saldado por completo. ¡Gracias!';

  const text = `
Hola ${quote.nombre},

Adjuntamos el justificante de pago ${recibo.codigo} por ${euros(recibo.importe)},
recibido el ${fechaCorta(recibo.fecha_pago)} por ${METODO_LABEL[recibo.metodo] ?? recibo.metodo}.

Pedido: ${quote.codigo}
${restoTxt}

El PDF lleva un código QR con el que puedes comprobar en cualquier momento que
el documento es auténtico.

Seguir mi pedido: ${statusUrl}

¿Dudas? Responde a este email o WhatsApp: ${EMISOR.telefono}.

— ${EMISOR.nombre} · ${EMISOR.dominio}
`.trim();

  const html = `
<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 16px 0;color:#0EA5E9;font-family:Arial,sans-serif;">Justificante de pago</h2>
  <p style="margin:0 0 16px 0;color:#444;line-height:1.6;">Hola ${escapeHtml(quote.nombre)},</p>
  <p style="margin:0 0 16px 0;color:#444;line-height:1.6;">
    Adjuntamos el justificante <strong>${escapeHtml(recibo.codigo)}</strong> por
    <strong>${escapeHtml(euros(recibo.importe))}</strong>, recibido el
    ${escapeHtml(fechaCorta(recibo.fecha_pago))} por
    ${escapeHtml(METODO_LABEL[recibo.metodo] ?? recibo.metodo)}.
  </p>
  ${restoTxt ? `<p style="margin:0 0 16px 0;padding:10px 14px;background:#f0fdf4;border:1px solid #10b981;border-radius:6px;color:#166534;font-size:13px;">${escapeHtml(restoTxt)}</p>` : ''}
  <div style="text-align:center;margin:24px 0;">
    <span style="display:inline-block;padding:8px 22px;background:#f0f9ff;border:1px solid #0EA5E9;border-radius:6px;font-family:monospace;font-size:18px;font-weight:700;color:#0EA5E9;letter-spacing:0.06em;">${escapeHtml(quote.codigo)}</span>
  </div>
  <div style="text-align:center;margin:0 0 20px 0;">
    <a href="${statusUrl}" style="display:inline-block;padding:12px 28px;background:#0EA5E9;color:#fff;border-radius:6px;font-weight:600;text-decoration:none;">Seguir mi pedido</a>
  </div>
  <p style="margin:0;color:#444;font-size:13px;">
    El PDF lleva un código QR con el que puedes comprobar que el documento es auténtico.
  </p>
  <p style="margin:24px 0 0 0;font-size:11px;color:#999;">— ${escapeHtml(EMISOR.nombre)} · <a href="${SITIO}" style="color:#999;">${escapeHtml(EMISOR.dominio)}</a></p>
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
      from: `${EMISOR.nombre} <${gmailUser}>`,
      to: quote.email,
      replyTo,
      subject: asciiHeader(`Justificante de pago ${recibo.codigo} · ${quote.codigo} — ${EMISOR.nombre}`),
      content: text,
      html,
      attachments: [
        {
          filename: `justificante-${recibo.codigo}.pdf`,
          contentType: 'application/pdf',
          encoding: 'base64',
          content: toBase64(pdf)
        }
      ]
    });
    return null;
  } catch (err) {
    console.error('recibo-emitir SMTP failed for', recibo.codigo, err);
    return 'El justificante se emitió y archivó, pero el email no salió. Puedes descargarlo y enviarlo a mano.';
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}

// ───────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = pickOrigin(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Server not configured (Supabase).' }, 500, origin);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400, origin); }
  const action = String(body?.action ?? '');

  const db = createClient(supabaseUrl, serviceKey);

  // ── ¿Quién llama? Admin por JWT, o cliente con código + token. ───────────
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  // esAdmin = puede gestionar justificantes: admin de la web o usuario de
  // 3DCC en la Calculadora (misma regla que notify-quote).
  let esAdmin = false;
  let userId: string | null = null;
  if (jwt) {
    const { data: userData } = await createClient(supabaseUrl, anonKey).auth.getUser(jwt);
    userId = userData?.user?.id ?? null;
    esAdmin = userData?.user?.app_metadata?.is_admin === true;
    if (!esAdmin && userId) {
      const { data: eu } = await db.from('empresa_users').select('empresa').eq('user_id', userId).maybeSingle();
      esAdmin = eu?.empresa === '3dcc';
    }
  }

  try {
    // ═══ descargar ═══════════════════════════════════════════════════════
    // La única acción abierta al cliente. Requiere el token personal del
    // presupuesto (el del enlace de su email), no solo el código.
    if (action === 'descargar') {
      const reciboCodigo = String(body?.recibo_codigo ?? '').trim().toUpperCase();
      if (!reciboCodigo) return json({ error: 'Falta recibo_codigo.' }, 400, origin);

      const { data: recibo } = await db
        .from('recibos')
        .select('id, codigo, pdf_path, anulado_at, quote_id, quotes!inner(codigo, acepta_token)')
        .eq('codigo', reciboCodigo)
        .maybeSingle();

      if (!recibo) return json({ error: 'Justificante no encontrado.' }, 404, origin);

      if (!esAdmin) {
        const token = String(body?.token ?? '').trim();
        const quoteCodigo = String(body?.quote_codigo ?? '').trim().toUpperCase();
        const q: any = recibo.quotes;
        // Se comprueban las tres cosas: que el token es válido, que va con el
        // pedido que dice, y que el recibo pertenece a ese pedido.
        if (!UUID_RE.test(token) || q?.acepta_token !== token || q?.codigo !== quoteCodigo) {
          return json({ error: 'No autorizado.' }, 403, origin);
        }
        if (recibo.anulado_at) {
          return json({ error: 'Este justificante fue anulado. Escríbenos y te emitimos el correcto.' }, 410, origin);
        }
      }

      if (!recibo.pdf_path) return json({ error: 'El justificante no tiene PDF archivado.' }, 404, origin);

      const { data: signed, error: sErr } = await db.storage
        .from(BUCKET)
        .createSignedUrl(recibo.pdf_path, URL_TTL_S, {
          download: `justificante-${recibo.codigo}.pdf`
        });
      if (sErr || !signed?.signedUrl) {
        return json({ error: 'No se pudo preparar la descarga.' }, 502, origin);
      }
      return json({ ok: true, url: signed.signedUrl, codigo: recibo.codigo }, 200, origin);
    }

    // ═══ A partir de aquí, solo admin ════════════════════════════════════
    if (!esAdmin) return json({ error: 'Solo administradores o usuarios de 3DCC.' }, 403, origin);

    // ═══ anular ══════════════════════════════════════════════════════════
    // Un recibo nunca se edita ni se borra: se anula y se emite otro. El PDF
    // archivado se conserva, y la verificación por QR pasa a decir "anulado".
    if (action === 'anular') {
      const id = String(body?.recibo_id ?? '');
      if (!id) return json({ error: 'Falta recibo_id.' }, 400, origin);
      const { error } = await db
        .from('recibos')
        .update({
          anulado_at: new Date().toISOString(),
          anulado_motivo: String(body?.motivo ?? '').slice(0, 500)
        })
        .eq('id', id)
        .is('anulado_at', null);
      if (error) return json({ error: 'No se pudo anular: ' + error.message }, 502, origin);
      return json({ ok: true }, 200, origin);
    }

    // ═══ emitir ══════════════════════════════════════════════════════════
    if (action === 'emitir') {
      // ── ¿Qué cobro documenta? Uno del libro, o uno nuevo que se registra aquí ──
      let cobro: any = null;
      let cobroNuevo = false;
      if (body?.cobro_id) {
        const { data: c } = await db.from('cobros').select('*').eq('id', String(body.cobro_id)).maybeSingle();
        if (!c || c.anulado_at) return json({ error: 'Cobro no encontrado o anulado.' }, 404, origin);
        if (Number(c.importe) <= 0) return json({ error: 'Un ajuste negativo no lleva justificante.' }, 400, origin);
        const { data: yaTiene } = await db
          .from('recibos').select('codigo').eq('cobro_id', c.id).is('anulado_at', null).maybeSingle();
        if (yaTiene) {
          return json({ error: `Ese cobro ya tiene el justificante ${yaTiene.codigo}.` }, 409, origin);
        }
        cobro = c;
      }

      let quoteId = String(body?.quote_id ?? cobro?.quote_id ?? '');
      if (!quoteId && body?.order_id) {
        const { data: o } = await db
          .from('orders').select('quote_id')
          .eq('empresa', String(body?.empresa ?? '3dcc')).eq('id', String(body.order_id)).maybeSingle();
        quoteId = o?.quote_id ?? '';
      }
      if (!quoteId) return json({ error: 'Falta quote_id (o el pedido no tiene presupuesto).' }, 400, origin);

      const importe = round2(cobro ? cobro.importe : body?.importe);
      if (!Number.isFinite(importe) || importe <= 0) {
        return json({ error: 'El importe debe ser mayor que cero.' }, 400, origin);
      }
      if (importe > 100000) {
        return json({ error: 'Importe fuera de rango — revísalo.' }, 400, origin);
      }

      // El libro guarda el método como lo escribe la Calculadora ("Bizum");
      // el justificante usa los códigos de METODOS.
      const metodoLibre = String(cobro ? cobro.metodo : body?.metodo ?? 'transferencia').trim().toLowerCase();
      if (!cobro && !METODOS.includes(metodoLibre as ReciboMetodo)) {
        return json({ error: 'Método de pago no válido.' }, 400, origin);
      }
      const metodo = (METODOS.includes(metodoLibre as ReciboMetodo) ? metodoLibre : 'otro') as ReciboMetodo;

      const fechaPago = String(cobro ? cobro.fecha : body?.fecha_pago ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
        return json({ error: 'Fecha de pago no válida (YYYY-MM-DD).' }, 400, origin);
      }

      const esAdelanto = body?.es_adelanto === true;
      const concepto = String(body?.concepto ?? '').trim().slice(0, 600);

      const { data: quote, error: qErr } = await db
        .from('quotes')
        .select('id, codigo, nombre, email, acepta_token, precio_total, precio_final')
        .eq('id', quoteId)
        .single();
      if (qErr || !quote) return json({ error: 'Presupuesto no encontrado.' }, 404, origin);

      if (!cobro) {
        // ── Guardia anti-duplicado ──
        // El fallo más probable de todo esto es emitir dos veces el mismo
        // recibo (doble clic, reintento tras un timeout). Un justificante
        // duplicado ya enviado al cliente no se puede deshacer, solo anular.
        const hace2min = new Date(Date.now() - 120_000).toISOString();
        const { data: reciente } = await db
          .from('recibos')
          .select('codigo')
          .eq('quote_id', quoteId)
          .eq('importe', importe)
          .eq('fecha_pago', fechaPago)
          .is('anulado_at', null)
          .gte('created_at', hace2min)
          .maybeSingle();
        if (reciente) {
          return json({
            error: `Ya se emitió el justificante ${reciente.codigo} con ese importe y fecha hace menos de dos minutos. ` +
                   'Si de verdad son dos cobros distintos, espera un momento y repítelo.'
          }, 409, origin);
        }

        // ── 0. Cobro nuevo en el libro (el trigger enlaza el pedido y recalcula) ──
        const { data: c, error: cErr } = await db
          .from('cobros')
          .insert({
            empresa: '3dcc',
            quote_id: quoteId,
            importe,
            metodo: METODO_LABEL[metodo] ?? 'Otro',
            fecha: fechaPago,
            cobrado_at: new Date(`${fechaPago}T12:00:00Z`).toISOString(),
            nota: concepto,
            origen: 'web',
            created_by: userId
          })
          .select('*')
          .single();
        if (cErr || !c) {
          return json({ error: 'No se pudo registrar el cobro: ' + (cErr?.message ?? '') }, 502, origin);
        }
        cobro = c;
        cobroNuevo = true;
      }

      // Si algo falla a partir de aquí, el cobro recién creado se anula para
      // no dejar dinero apuntado de una operación que no terminó.
      const deshacerCobro = async () => {
        if (!cobroNuevo) return;
        await db.from('cobros')
          .update({ anulado_at: new Date().toISOString(), anulado_motivo: 'Emisión del justificante fallida' })
          .eq('id', cobro.id);
      };

      const total =
        quote.precio_final != null ? Number(quote.precio_final)
        : quote.precio_total != null ? Number(quote.precio_total)
        : null;

      // Lo cobrado sale del libro (ya incluye este cobro).
      const { data: vivos } = await db
        .from('cobros')
        .select('importe')
        .eq('quote_id', quoteId)
        .is('anulado_at', null);
      const pagado = round2((vivos ?? []).reduce((s: number, r: any) => s + Number(r.importe || 0), 0));
      const pendiente = total == null ? null : Math.max(0, round2(total - pagado));

      // ── 1. Fila primero: necesitamos `codigo` y `verif_token` DENTRO del PDF ──
      const { data: fila, error: iErr } = await db
        .from('recibos')
        .insert({
          quote_id: quoteId,
          cobro_id: cobro.id,
          importe,
          metodo,
          fecha_pago: fechaPago,
          concepto,
          es_adelanto: esAdelanto
        })
        .select('id, codigo, verif_token, created_at')
        .single();
      if (iErr || !fila) {
        await deshacerCobro();
        return json({ error: 'No se pudo registrar el justificante: ' + (iErr?.message ?? '') }, 502, origin);
      }

      const datos: ReciboDatos = {
        codigo: fila.codigo,
        emitido_at: fila.created_at,
        emisor: EMISOR,
        cliente: { nombre: quote.nombre ?? '' },
        pedido: { codigo: quote.codigo, total },
        cobro: {
          importe,
          metodo,
          fecha_pago: fechaPago,
          concepto: concepto || `Impresión 3D — pedido ${quote.codigo}`,
          es_adelanto: esAdelanto
        },
        acumulado: { pagado, pendiente },
        verificacion_url:
          `${SITIO}/recibo/?c=${encodeURIComponent(fila.codigo)}&t=${fila.verif_token}`
      };

      // ── 2. PDF ──
      let pdf: Uint8Array;
      try {
        pdf = await buildReciboPdf(datos);
      } catch (e) {
        // Sin PDF no hay justificante: se retira la fila para no dejar un
        // código de recibo "quemado" apuntando a nada.
        await db.from('recibos').delete().eq('id', fila.id);
        await deshacerCobro();
        return json({
          error: 'No se pudo generar el PDF: ' + (e instanceof Error ? e.message : String(e))
        }, 500, origin);
      }

      // ── 3. Archivado ──
      const path = `${quote.codigo}/${fila.codigo}.pdf`;
      const { error: upErr } = await db.storage.from(BUCKET).upload(path, pdf, {
        contentType: 'application/pdf',
        upsert: false
      });
      if (upErr) {
        await db.from('recibos').delete().eq('id', fila.id);
        await deshacerCobro();
        return json({ error: 'No se pudo archivar el PDF: ' + upErr.message }, 502, origin);
      }

      await db.from('recibos').update({ pdf_path: path, datos }).eq('id', fila.id);

      // ── 4. Email (opcional; su fallo no invalida la emisión) ──
      let aviso: string | null = null;
      if (body?.enviar_email === true) {
        if (!quote.email) {
          aviso = 'El presupuesto no tiene email: el justificante se archivó pero no se envió.';
        } else {
          aviso = await enviarEmail(quote, { ...fila, importe, metodo, fecha_pago: fechaPago }, pendiente, pdf);
        }
      }

      const { data: signed } = await db.storage
        .from(BUCKET)
        .createSignedUrl(path, URL_TTL_S, { download: `justificante-${fila.codigo}.pdf` });

      return json({
        ok: true,
        recibo_id: fila.id,
        cobro_id: cobro.id,
        codigo: fila.codigo,
        url: signed?.signedUrl ?? null,
        pagado,
        pendiente,
        enviado: body?.enviar_email === true && !aviso,
        aviso
      }, 200, origin);
    }

    return json({ error: 'action desconocida (emitir|descargar|anular).' }, 400, origin);
  } catch (e) {
    console.error('recibo-emitir error', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, origin);
  }
});
