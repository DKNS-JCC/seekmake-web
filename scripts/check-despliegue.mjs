// Comprueba si los justificantes y el seguimiento están operativos EN
// PRODUCCIÓN. Solo lectura: no escribe, no crea, no borra.
//
//   node scripts/check-despliegue.mjs
//
// Revisa las tres patas por separado, porque un commit no despliega nada:
//   1. Base de datos — tabla, RPC, bucket privado (vía pooler + db.key), y
//      la sincronización con la Calculadora (0026-0028)
//   2. Edge Function  — que `recibo-emitir` responde
//   3. Front          — que /recibo/ está publicado

import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.local', quiet: true });

let fallos = 0;
let avisos = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m  ${m}`);
const no = (m) => {
  fallos++;
  console.log(`  \x1b[31m✗\x1b[0m  ${m}`);
};
const warn = (m) => {
  avisos++;
  console.log(`  \x1b[33m!\x1b[0m  ${m}`);
};

// ── 1. Base de datos ───────────────────────────────────────────────────────
console.log('\n▸ Base de datos\n');

let client = null;
try {
  const poolerUrl = readFileSync('supabase/.temp/pooler-url', 'utf8').trim();
  const password = readFileSync('db.key', 'utf8').trim();
  const url = new URL(poolerUrl);
  url.password = encodeURIComponent(password);
  client = new pg.Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 15000
  });
  await client.connect();
  ok('conectado al proyecto de producción');
} catch (e) {
  no(`no se pudo conectar: ${e.message}`);
  client = null;
}

if (client) {
  const q = async (sql, params = []) => (await client.query(sql, params)).rows;

  // Tabla recibos
  const tabla = await q(`select to_regclass('public.recibos') as t`);
  if (tabla[0].t) {
    ok('tabla public.recibos');
    const cols = await q(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='recibos'`
    );
    const nombres = cols.map((c) => c.column_name);
    const faltan = ['codigo', 'importe', 'metodo', 'fecha_pago', 'datos', 'pdf_path',
      'verif_token', 'anulado_at'].filter((c) => !nombres.includes(c));
    if (faltan.length) no(`faltan columnas en recibos: ${faltan.join(', ')}`);
    else ok('columnas de recibos completas');

    const n = await q(`select count(*)::int as n from public.recibos`);
    console.log(`     (${n[0].n} justificante${n[0].n === 1 ? '' : 's'} emitido${n[0].n === 1 ? '' : 's'} hasta ahora)`);
  } else {
    no('NO existe public.recibos — falta aplicar 0022_recibos.sql');
  }

  // RLS
  if (tabla[0].t) {
    const rls = await q(
      `select relrowsecurity from pg_class where oid = 'public.recibos'::regclass`
    );
    if (rls[0]?.relrowsecurity) ok('RLS activa en recibos');
    else no('RLS DESACTIVADA en recibos — datos de clientes expuestos');
  }

  // Funciones
  for (const fn of ['verificar_recibo', 'get_recibos_cliente', 'get_envio_status', 'next_recibo_codigo']) {
    const r = await q(
      `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1 limit 1`,
      [fn]
    );
    if (r.length) ok(`función ${fn}()`);
    else no(`falta la función ${fn}() — ¿migración sin aplicar?`);
  }

  // Permisos de las RPC públicas
  for (const fn of ['verificar_recibo', 'get_recibos_cliente', 'get_envio_status']) {
    const r = await q(
      `select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname=$1
          and has_function_privilege('anon', p.oid, 'execute') limit 1`,
      [fn]
    );
    if (r.length) ok(`anon puede ejecutar ${fn}()`);
    else no(`anon NO puede ejecutar ${fn}() — el cliente no verá nada`);
  }

  // Columnas nuevas de envios
  const env = await q(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='envios'`
  );
  const nEnv = env.map((c) => c.column_name);
  const faltanEnv = ['carrier_nombre', 'punto_recogida', 'etiqueta_at', 'transito_at',
    'disponible_at', 'entregado_at', 'fecha_estimada', 'nota_cliente', 'origen']
    .filter((c) => !nEnv.includes(c));
  if (faltanEnv.length) no(`faltan columnas en envios: ${faltanEnv.join(', ')} — falta 0023`);
  else ok('columnas nuevas de envios');

  // Estado 'disponible' admitido
  const chk = await q(
    `select pg_get_constraintdef(oid) as d from pg_constraint
      where conrelid = 'public.envios'::regclass and conname = 'envios_estado_check'`
  );
  if (chk[0]?.d?.includes('disponible')) ok("estado 'disponible' admitido en envios");
  else no("el check de envios.estado no admite 'disponible' — falta 0023");

  // Bucket
  const b = await q(`select public, allowed_mime_types from storage.buckets where id = 'recibos'`);
  if (!b.length) {
    no('no existe el bucket `recibos`');
  } else if (b[0].public) {
    no('EL BUCKET `recibos` ES PÚBLICO — cualquiera puede leer los justificantes');
  } else {
    ok('bucket `recibos` existe y es privado');
  }

  // ── Sincronización web ↔ Calculadora (0026-0028) ──
  const est = await q(`select to_regclass('public.pedido_estados') as t`);
  if (est[0].t) {
    const n = await q(`select count(*)::int as n from public.pedido_estados`);
    if (n[0].n === 8) ok('pedido_estados con los 8 estados (0026)');
    else no(`pedido_estados tiene ${n[0].n} filas, se esperaban 8`);
  } else {
    no('NO existe public.pedido_estados — falta 0026_estados_pedido.sql');
  }

  const cob = await q(`select to_regclass('public.cobros') as t`);
  if (cob[0].t) {
    ok('tabla public.cobros (0028)');
    const rls = await q(`select relrowsecurity from pg_class where oid = 'public.cobros'::regclass`);
    if (rls[0]?.relrowsecurity) ok('RLS activa en cobros');
    else no('RLS DESACTIVADA en cobros');
    const r = await q(`select count(*)::int as n, coalesce(sum(importe) filter (where anulado_at is null), 0) as t from public.cobros`);
    console.log(`     (${r[0].n} apuntes, ${Number(r[0].t).toFixed(2)} € vivos)`);
    // Pedidos cuyo importe_pagado no cuadra con el libro: no debería haber.
    const desc = await q(`
      select count(*)::int as n from public.orders o
       where round(coalesce(public.jsonb_num(o.data -> 'importe_pagado'), 0), 2)
          <> round(coalesce((select sum(c.importe) from public.cobros c
                               where c.anulado_at is null
                                 and ((c.empresa = o.empresa and c.order_id = o.id)
                                      or (o.quote_id is not null and c.quote_id = o.quote_id))), 0), 2)`);
    if (desc[0].n === 0) ok('importe_pagado de todos los pedidos cuadra con el libro');
    else warn(`${desc[0].n} pedido(s) con importe_pagado distinto del libro (se corrige en su próximo guardado)`);
    const rev = await q(`select count(*)::int as n from public.cobros_revisar`);
    if (rev[0].n === 0) ok('ningún justificante antiguo sin casar');
    else warn(`${rev[0].n} justificante(s) antiguo(s) sin cobro: revísalos en /admin/presupuestos`);
  } else {
    no('NO existe public.cobros — falta 0028_cobros.sql');
  }

  for (const [tabla, trig] of [
    ['quotes', 'project_quote_to_order'], ['orders', 'proteger_estado_order'],
    ['quotes', 'crear_order_desde_quote'], ['orders', 'crear_quote_desde_order'],
    ['orders', 'sincronizar_cobros_order'], ['quotes', 'pagos_quote_desde_cobros']
  ]) {
    const r = await q(
      `select 1 from pg_trigger where tgrelid = $1::regclass and tgname = $2 and not tgisinternal`,
      [`public.${tabla}`, trig]
    );
    if (r.length) ok(`trigger ${trig} en ${tabla}`);
    else no(`falta el trigger ${trig} en ${tabla}`);
  }

  for (const fn of ['registrar_cobro', 'anular_cobro', 'quotes_con_pedido', 'get_quote_detalle']) {
    const r = await q(
      `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname=$1
          and has_function_privilege('authenticated', p.oid, 'execute') limit 1`,
      [fn]
    );
    if (r.length) ok(`authenticated puede ejecutar ${fn}()`);
    else no(`falta ${fn}() o authenticated no puede ejecutarla`);
  }

  const huer = await q(`
    select count(*)::int as n from public.quotes q
     where q.origen = 'web' and not q.archivado
       and q.estado in ('nuevo','revisado','aceptado','imprimiendo','listo')
       and not exists (select 1 from public.orders o where o.quote_id = q.id)`);
  if (huer[0].n === 0) ok('toda solicitud web viva tiene su pedido (0027)');
  else no(`${huer[0].n} solicitud(es) web vivas sin pedido`);

  // Objetos archivados
  try {
    const o = await q(`select count(*)::int as n from storage.objects where bucket_id='recibos'`);
    console.log(`     (${o[0].n} PDF${o[0].n === 1 ? '' : 's'} archivado${o[0].n === 1 ? '' : 's'})`);
  } catch { /* sin permiso, da igual */ }

  await client.end();
}

// ── 2. Edge Function ───────────────────────────────────────────────────────
console.log('\n▸ Edge Function\n');

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPA_URL || !ANON) {
  warn('sin NEXT_PUBLIC_SUPABASE_* en .env.local: no se puede comprobar');
} else {
  try {
    // Se llama con una acción inválida: si la función está desplegada
    // responde 400 con su propio mensaje de error; si no lo está, 404.
    const res = await fetch(`${SUPA_URL}/functions/v1/recibo-emitir`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        origin: 'https://www.impresion3dcc.com'
      },
      body: JSON.stringify({ action: '__comprobacion__' }),
      signal: AbortSignal.timeout(20000)
    });
    const texto = await res.text();

    if (res.status === 404) {
      no('recibo-emitir NO está desplegada → `supabase functions deploy recibo-emitir`');
    } else if (res.status === 403 && texto.includes('administradores')) {
      // Llegó al control de admin: la función corre y rechaza al anónimo.
      ok('recibo-emitir desplegada y rechazando llamadas anónimas');
    } else if (res.status === 400 && texto.includes('action desconocida')) {
      no('recibo-emitir responde, pero deja pasar a un anónimo hasta el enrutado');
    } else if (res.status === 401) {
      warn('recibo-emitir responde 401 (¿verify_jwt?): revisa la config de la función');
    } else if (res.status === 500 && texto.includes('configured')) {
      no('recibo-emitir desplegada pero SIN secrets de Supabase configurados');
    } else {
      warn(`recibo-emitir responde ${res.status}: ${texto.slice(0, 160)}`);
    }

    const cors = res.headers.get('access-control-allow-origin');
    if (cors) ok(`CORS devuelve "${cors}"`);
  } catch (e) {
    no(`no se pudo llamar a la función: ${e.message}`);
  }
}

// ── 3. Front publicado ─────────────────────────────────────────────────────
console.log('\n▸ Web publicada\n');

for (const ruta of ['/recibo/', '/presupuesto/']) {
  try {
    const res = await fetch(`https://www.impresion3dcc.com${ruta}`, {
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) {
      no(`${ruta} devuelve ${res.status} — ¿falta publicar el build?`);
      continue;
    }
    const html = await res.text();
    if (ruta === '/recibo/') {
      if (html.includes('Verificaci')) ok('/recibo/ publicada (página de verificación del QR)');
      else warn('/recibo/ responde 200 pero no parece la página nueva');
    } else {
      if (html.includes('pr-envio') || html.includes('presupuesto')) ok('/presupuesto/ publicada');
      else warn('/presupuesto/ responde 200 con contenido inesperado');
    }
  } catch (e) {
    no(`${ruta}: ${e.message}`);
  }
}

// ── Veredicto ──────────────────────────────────────────────────────────────
console.log('');
if (fallos === 0 && avisos === 0) {
  console.log('\x1b[32mOPERATIVO — las tres patas están en su sitio.\x1b[0m\n');
} else if (fallos === 0) {
  console.log(`\x1b[33mOPERATIVO con ${avisos} aviso(s) que conviene mirar.\x1b[0m\n`);
} else {
  console.log(`\x1b[31mNO operativo todavía: ${fallos} cosa(s) pendientes.\x1b[0m\n`);
}
process.exit(fallos === 0 ? 0 : 1);
