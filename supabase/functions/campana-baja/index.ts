// Supabase Edge Function: campana-baja (pública, --no-verify-jwt)
//
// Da de baja un email de las campañas. Lo llaman:
//   * la página /baja/ del sitio (botón), con { e, t } en el cuerpo;
//   * Gmail/Yahoo/Outlook con el botón nativo "Cancelar suscripción"
//     (List-Unsubscribe-Post de un clic: POST con e y t en la URL).
// El token (HMAC del email) impide dar de baja a otros adivinando su email.
// No hay GET: los escáneres de enlaces del correo no deben dar de baja a nadie.

// @ts-nocheck — Deno target.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { tokenBaja } from '../_shared/campana.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* one-click: form body, datos en la URL */ }
  const email = String(body?.e ?? url.searchParams.get('e') ?? '').trim().toLowerCase();
  const t = String(body?.t ?? url.searchParams.get('t') ?? '');

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!email || t !== (await tokenBaja(email, serviceKey))) return json({ error: 'Enlace no válido.' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
  const { error } = await db.from('email_bajas').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) return json({ error: 'No se pudo completar la baja.' }, 500);
  return json({ ok: true }, 200);
});
