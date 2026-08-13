// Prueba las migraciones contra un PostgreSQL efímero, sin tocar producción.
//
//   node scripts/test-migraciones.mjs
//
// Levanta un Postgres local (pgserver), emula lo mínimo de Supabase que las
// migraciones necesitan (esquemas auth/storage, auth.jwt(), auth.uid()),
// aplica TODAS las migraciones en orden y luego ejercita la lógica nueva:
//   * verificar_recibo / get_recibos_cliente / get_envio_status
//   * el token como autorización real (sin token no se ve nada)
//   * que las RPC públicas no filtran datos personales
//   * RLS de `recibos` (anon y usuario normal no leen nada)
//   * la secuencia de códigos R-AAAA-NNNN
//
// Requisitos: python3 con `pgserver` (pip install pgserver).

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const DATA_DIR = join(tmpdir(), 'pg-3dcc-test');

console.log('\n▸ Levantando PostgreSQL efímero…');
// cleanup_mode=None: el servidor sobrevive a la salida del proceso python,
// que si no se lleva la instancia por delante antes de que Node se conecte.
const uri = execFileSync(
  'python3',
  [
    '-c',
    `import pgserver, os
d = ${JSON.stringify(DATA_DIR)}
os.makedirs(d, exist_ok=True)
print(pgserver.get_server(d, cleanup_mode=None).get_uri())`
  ],
  { encoding: 'utf8' }
)
  .trim()
  .split('\n')
  .pop();

function pararServidor() {
  try {
    execFileSync('python3', [
      '-c',
      `import pgserver
pgserver.get_server(${JSON.stringify(DATA_DIR)}, cleanup_mode='stop').cleanup()`
    ]);
  } catch {
    /* si no para, es un Postgres de usar y tirar en /tmp */
  }
}

const client = new pg.Client({ connectionString: uri });
await client.connect();

let fallos = 0;
const ok = (m) => console.log(`  \x1b[32mok\x1b[0m   ${m}`);
const fail = (m) => {
  fallos++;
  console.log(`  \x1b[31mFALLO\x1b[0m ${m}`);
};

async function check(nombre, fn) {
  try {
    await fn();
    ok(nombre);
  } catch (e) {
    fail(`${nombre} — ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── Base limpia + emulación mínima de Supabase ─────────────────────────────
await client.query(`
  drop schema if exists public cascade;  create schema public;
  drop schema if exists auth cascade;    create schema auth;
  drop schema if exists storage cascade; create schema storage;
  -- gen_random_uuid() es nativo desde PostgreSQL 13, así que pgcrypto no
  -- hace falta; esta build de pgserver ni siquiera lo trae.

  create table auth.users (id uuid primary key default gen_random_uuid());

  -- El JWT del "usuario actual" se simula con una GUC de sesión, que es justo
  -- lo que hace Supabase por debajo (request.jwt.claims).
  create or replace function auth.jwt() returns jsonb language sql stable as $fn$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  $fn$;
  create or replace function auth.uid() returns uuid language sql stable as $fn$
    select nullif(auth.jwt() ->> 'sub', '')::uuid;
  $fn$;

  create table storage.buckets (
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text, name text, created_at timestamptz default now()
  );
  alter table storage.objects enable row level security;

  create role anon;
  create role authenticated;
  grant usage on schema public to anon, authenticated;
`);

// ── Aplicar todas las migraciones en orden ─────────────────────────────────
const dir = 'supabase/migrations';
const ficheros = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

console.log(`\n▸ Aplicando ${ficheros.length} migraciones…`);
for (const f of ficheros) {
  try {
    await client.query(readFileSync(join(dir, f), 'utf8'));
    ok(f);
  } catch (e) {
    // pg_cron y las políticas de storage no existen fuera de Supabase: esos
    // fallos son esperables y no invalidan la migración.
    const esperado = /pg_cron|cron\.|extension "pg_cron"/i.test(e.message);
    if (esperado) ok(`${f} (pg_cron omitido)`);
    else fail(`${f} — ${e.message}`);
  }
}

// ── Utilidades de sesión ───────────────────────────────────────────────────
const comoAdmin = () =>
  client.query(`select set_config('request.jwt.claims', '{"app_metadata":{"is_admin":true}}', false)`);
const comoAnon = () =>
  client.query(`select set_config('request.jwt.claims', '{}', false)`);

console.log('\n▸ Datos de prueba…');
await comoAdmin();

const { rows: qrows } = await client.query(`
  insert into public.quotes
    (nombre, email, telefono, material, cantidad, entrega, direccion,
     precio_total, precio_final, pago, importe_pagado)
  values
    ('María Fernández Núñez', 'maria@example.com', '600111222', 'PETG', 3,
     'envio', '{"calle":"C/ Mayor 1","ciudad":"Salamanca","cp":"37001","provincia":"Salamanca"}',
     90, 90, 'adelanto', 45)
  returning id, codigo, acepta_token
`);
const quote = qrows[0];
ok(`quote ${quote.codigo}`);

// ═══ recibos ═══════════════════════════════════════════════════════════════
console.log('\n▸ Justificantes de pago');

let recibo1, recibo2;

await check('se emite un recibo y recibe código R-AAAA-NNNN', async () => {
  const { rows } = await client.query(
    `insert into public.recibos (quote_id, importe, metodo, fecha_pago, concepto, es_adelanto)
     values ($1, 45.00, 'bizum', '2026-08-12', 'Adelanto del pedido', true)
     returning *`,
    [quote.id]
  );
  recibo1 = rows[0];
  assert(/^R-\d{4}-\d{4}$/.test(recibo1.codigo), `código raro: ${recibo1.codigo}`);
  assert(recibo1.verif_token, 'sin verif_token');
});

await check('el segundo recibo incrementa la secuencia', async () => {
  const { rows } = await client.query(
    `insert into public.recibos (quote_id, importe, metodo, fecha_pago, concepto)
     values ($1, 45.00, 'efectivo', '2026-08-20', 'Resto del pedido') returning *`,
    [quote.id]
  );
  recibo2 = rows[0];
  const n1 = Number(recibo1.codigo.slice(-4));
  const n2 = Number(recibo2.codigo.slice(-4));
  assert(n2 === n1 + 1, `${recibo1.codigo} → ${recibo2.codigo} no es correlativo`);
});

await check('un importe de cero o negativo se rechaza', async () => {
  for (const mal of [0, -10]) {
    let lanzo = false;
    try {
      await client.query(
        `insert into public.recibos (quote_id, importe, fecha_pago) values ($1, $2, '2026-01-01')`,
        [quote.id, mal]
      );
    } catch {
      lanzo = true;
    }
    assert(lanzo, `aceptó un importe de ${mal}`);
  }
});

await check('un método de pago inventado se rechaza', async () => {
  let lanzo = false;
  try {
    await client.query(
      `insert into public.recibos (quote_id, importe, metodo, fecha_pago)
       values ($1, 10, 'criptomoneda', '2026-01-01')`,
      [quote.id]
    );
  } catch {
    lanzo = true;
  }
  assert(lanzo, 'aceptó un método fuera del check');
});

await check('verificar_recibo valida con el token correcto', async () => {
  await comoAnon();
  const { rows } = await client.query('select * from public.verificar_recibo($1, $2)', [
    recibo1.codigo,
    recibo1.verif_token
  ]);
  assert(rows.length === 1, 'no devolvió el recibo');
  assert(Number(rows[0].importe) === 45, `importe ${rows[0].importe}`);
  assert(rows[0].pedido === quote.codigo, 'no enlaza con el pedido');
  assert(rows[0].anulado === false, 'lo da por anulado');
});

await check('verificar_recibo no devuelve nada sin el token', async () => {
  const { rows } = await client.query('select * from public.verificar_recibo($1, $2)', [
    recibo1.codigo,
    '00000000-0000-0000-0000-000000000000'
  ]);
  assert(rows.length === 0, 'devolvió datos con un token falso — los recibos serían enumerables');
});

await check('verificar_recibo no expone datos personales', async () => {
  const { rows } = await client.query('select * from public.verificar_recibo($1, $2)', [
    recibo1.codigo,
    recibo1.verif_token
  ]);
  const cols = Object.keys(rows[0]);
  for (const prohibida of ['nombre', 'email', 'telefono', 'direccion']) {
    assert(!cols.includes(prohibida), `expone "${prohibida}"`);
  }
});

await check('get_recibos_cliente lista los recibos con el token del pedido', async () => {
  const { rows } = await client.query('select * from public.get_recibos_cliente($1, $2)', [
    quote.codigo,
    quote.acepta_token
  ]);
  assert(rows.length === 2, `esperaba 2 recibos, hay ${rows.length}`);
  assert(new Date(rows[0].emitido_at) <= new Date(rows[1].emitido_at), 'no vienen en orden cronológico');
});

await check('get_recibos_cliente no devuelve nada con un token falso', async () => {
  const { rows } = await client.query('select * from public.get_recibos_cliente($1, $2)', [
    quote.codigo,
    '00000000-0000-0000-0000-000000000000'
  ]);
  assert(rows.length === 0, 'filtró recibos sin token válido');
});

await check('un recibo anulado desaparece del listado del cliente', async () => {
  await comoAdmin();
  await client.query(`update public.recibos set anulado_at = now() where id = $1`, [recibo2.id]);
  await comoAnon();
  const { rows } = await client.query('select * from public.get_recibos_cliente($1, $2)', [
    quote.codigo,
    quote.acepta_token
  ]);
  assert(rows.length === 1, `esperaba 1 recibo vivo, hay ${rows.length}`);
});

await check('un recibo anulado sí se puede verificar, marcado como anulado', async () => {
  const { rows } = await client.query('select * from public.verificar_recibo($1, $2)', [
    recibo2.codigo,
    recibo2.verif_token
  ]);
  assert(rows.length === 1, 'el QR de un recibo anulado no devuelve nada');
  assert(rows[0].anulado === true, 'no lo marca como anulado');
});

await check('anon y authenticated no pueden leer la tabla recibos', async () => {
  // Supabase concede privilegios de tabla a anon/authenticated por defecto:
  // lo único que separa los datos de clientes del mundo es la RLS. Aquí se
  // replica ese escenario para que la prueba valga de algo.
  await comoAdmin();
  await client.query(`
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant usage on all sequences in schema public to anon, authenticated;
  `);
  for (const rol of ['anon', 'authenticated']) {
    let visto = null;
    // Transacción explícita: fuera de ella "set local role" se descarta al
    // instante y la consulta acabaría corriendo como superusuario, que se
    // salta la RLS y hace que la prueba pase sin comprobar nada.
    await client.query('begin');
    try {
      // Sin claim de admin: is_admin() es lo que decide, no el rol de Postgres.
      await client.query(`select set_config('request.jwt.claims', '{}', true)`);
      await client.query(`set local role ${rol}`);
      const { rows } = await client.query('select count(*)::int as n from public.recibos');
      visto = rows[0].n;
    } catch {
      visto = 'denegado';
    } finally {
      await client.query('rollback');
    }
    assert(visto === 0 || visto === 'denegado', `el rol ${rol} ve ${visto} recibos`);
  }
});

await check('anon tampoco puede insertar ni modificar recibos', async () => {
  for (const sql of [
    `insert into public.recibos (quote_id, importe, fecha_pago)
       values ('${quote.id}', 1, '2026-01-01')`,
    `update public.recibos set importe = 1`,
    `delete from public.recibos`
  ]) {
    let bloqueado = false;
    await client.query('begin');
    try {
      await client.query(`select set_config('request.jwt.claims', '{}', true)`);
      await client.query('set local role anon');
      const res = await client.query(sql);
      // Un UPDATE/DELETE que no toca filas también es "bloqueado" por RLS.
      bloqueado = res.rowCount === 0;
    } catch {
      bloqueado = true;
    } finally {
      await client.query('rollback');
    }
    assert(bloqueado, `anon pudo ejecutar: ${sql.split('\n')[0].trim()}`);
  }
});

await check('los recibos se borran en cascada al borrar el presupuesto', async () => {
  await comoAdmin();
  const { rows: q2 } = await client.query(
    `insert into public.quotes (nombre, email, material, cantidad, precio_total)
     values ('Temporal', 't@e.com', 'PLA', 1, 10) returning id`
  );
  await client.query(
    `insert into public.recibos (quote_id, importe, fecha_pago) values ($1, 10, '2026-01-01')`,
    [q2[0].id]
  );
  await client.query('delete from public.quotes where id = $1', [q2[0].id]);
  const { rows } = await client.query('select count(*)::int as n from public.recibos where quote_id = $1', [
    q2[0].id
  ]);
  assert(rows[0].n === 0, 'quedaron recibos huérfanos');
});

await check('el bucket de recibos es privado y solo admite PDF', async () => {
  const { rows } = await client.query(`select * from storage.buckets where id = 'recibos'`);
  assert(rows.length === 1, 'no se creó el bucket');
  assert(rows[0].public === false, 'EL BUCKET ES PÚBLICO — fuga de datos de clientes');
  assert(rows[0].allowed_mime_types?.includes('application/pdf'), 'no restringe a PDF');
});

// ═══ envíos ════════════════════════════════════════════════════════════════
console.log('\n▸ Seguimiento de envíos');

await comoAdmin();
const { rows: erows } = await client.query(
  `insert into public.envios
     (quote_id, proveedor, origen, carrier, carrier_nombre, metodo, cp_destino,
      peso_g, coste, coste_carrier, tracking_number, tracking_url, estado,
      punto_recogida, fecha_estimada, nota_cliente, etiqueta_at, transito_at)
   values ($1, 'manual', 'manual', 'inpost', 'InPost', 'InPost Parcels 48h', '37001',
      450, 4.5, 3.1, '620012345678', 'https://inpost.es/x', 'en_transito',
      '{"nombre":"Locker Carrefour","direccion":"C/ Vaguada de la Palma","ciudad":"Salamanca"}',
      '2026-08-18', 'Te lo dejo en el locker', now(), now())
   returning id`,
  [quote.id]
);
ok(`envío ${erows[0].id.slice(0, 8)}…`);

await check('get_envio_status devuelve el seguimiento por código de pedido', async () => {
  await comoAnon();
  const { rows } = await client.query('select * from public.get_envio_status($1)', [quote.codigo]);
  assert(rows.length === 1, 'no devolvió el envío');
  assert(rows[0].tracking_number === '620012345678', 'sin número de seguimiento');
  assert(rows[0].carrier_nombre === 'InPost', 'sin nombre de transportista');
  assert(rows[0].punto_recogida?.nombre === 'Locker Carrefour', 'sin punto de recogida');
  assert(rows[0].estado === 'en_transito', `estado ${rows[0].estado}`);
});

await check('get_envio_status NO expone dirección, coste ni margen', async () => {
  const { rows } = await client.query('select * from public.get_envio_status($1)', [quote.codigo]);
  const cols = Object.keys(rows[0]);
  for (const prohibida of ['cp_destino', 'coste', 'coste_carrier', 'sendcloud_id', 'quote_id']) {
    assert(!cols.includes(prohibida), `EXPONE "${prohibida}" al público`);
  }
});

await check('el código en minúsculas y con espacios también funciona', async () => {
  const { rows } = await client.query('select * from public.get_envio_status($1)', [
    `  ${quote.codigo.toLowerCase()}  `
  ]);
  assert(rows.length === 1, 'no normaliza el código');
});

await check('un código inexistente devuelve vacío, no error', async () => {
  const { rows } = await client.query('select * from public.get_envio_status($1)', ['Q-1999-9999']);
  assert(rows.length === 0, 'devolvió algo');
});

await check('un presupuesto archivado oculta su envío', async () => {
  await comoAdmin();
  await client.query('update public.quotes set archivado = true where id = $1', [quote.id]);
  await comoAnon();
  const { rows } = await client.query('select * from public.get_envio_status($1)', [quote.codigo]);
  assert(rows.length === 0, 'un pedido archivado sigue mostrando el envío');
  await comoAdmin();
  await client.query('update public.quotes set archivado = false where id = $1', [quote.id]);
});

await check('un envío cancelado no se muestra al cliente', async () => {
  await comoAdmin();
  await client.query(`update public.envios set estado = 'cancelado' where quote_id = $1`, [quote.id]);
  await comoAnon();
  const { rows } = await client.query('select * from public.get_envio_status($1)', [quote.codigo]);
  assert(rows.length === 0, 'muestra un envío cancelado');
  await comoAdmin();
  await client.query(`update public.envios set estado = 'disponible' where quote_id = $1`, [quote.id]);
});

await check('el estado "disponible" (en el punto InPost) es válido', async () => {
  const { rows } = await client.query(
    `select estado from public.envios where quote_id = $1`,
    [quote.id]
  );
  assert(rows[0].estado === 'disponible', 'no aceptó el estado nuevo');
});

await check('un estado inventado se rechaza', async () => {
  let lanzo = false;
  try {
    await client.query(`update public.envios set estado = 'perdido_en_correos' where quote_id = $1`, [
      quote.id
    ]);
  } catch {
    lanzo = true;
  }
  assert(lanzo, 'aceptó un estado fuera del check');
});

await check('origen solo admite sendcloud o manual', async () => {
  let lanzo = false;
  try {
    await client.query(`update public.envios set origen = 'paloma_mensajera' where quote_id = $1`, [
      quote.id
    ]);
  } catch {
    lanzo = true;
  }
  assert(lanzo, 'aceptó un origen fuera del check');
});

await check('con varios envíos se devuelve el más reciente', async () => {
  await client.query(
    `insert into public.envios (quote_id, origen, carrier_nombre, tracking_number, estado, created_at)
     values ($1, 'manual', 'Correos Express', '999999', 'etiqueta', now() + interval '1 hour')`,
    [quote.id]
  );
  await comoAnon();
  const { rows } = await client.query('select * from public.get_envio_status($1)', [quote.codigo]);
  assert(rows[0].tracking_number === '999999', `devolvió ${rows[0].tracking_number}`);
});

await check('get_quote_status sigue funcionando igual que antes', async () => {
  const { rows } = await client.query('select * from public.get_quote_status($1)', [quote.codigo]);
  assert(rows.length === 1, 'se rompió la RPC de estado del presupuesto');
  assert(rows[0].entrega === 'envio', 'no devuelve entrega');
  const cols = Object.keys(rows[0]);
  assert(!cols.includes('nombre') && !cols.includes('email'), 'ahora filtra datos personales');
});

// ── Cierre ─────────────────────────────────────────────────────────────────
await client.end();
pararServidor();
console.log(
  fallos === 0
    ? '\n\x1b[32mTodas las comprobaciones de base de datos OK\x1b[0m\n'
    : `\n\x1b[31m${fallos} fallo(s)\x1b[0m\n`
);
process.exit(fallos === 0 ? 0 : 1);
