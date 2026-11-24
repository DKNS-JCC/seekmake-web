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

// En Windows el intérprete suele llamarse `python`: PYTHON=python node …
const PYTHON = process.env.PYTHON || 'python3';

const DATA_DIR = join(tmpdir(), 'pg-3dcc-test');

console.log('\n▸ Levantando PostgreSQL efímero…');
// cleanup_mode=None: el servidor sobrevive a la salida del proceso python,
// que si no se lleva la instancia por delante antes de que Node se conecte.
// PG_URI=postgres://… uses an existing throwaway Postgres (e.g. Docker) instead.
const uri = process.env.PG_URI || execFileSync(
  PYTHON,
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
  if (process.env.PG_URI) return;
  try {
    execFileSync(PYTHON, [
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
  create or replace function auth.role() returns text language sql stable as $fn$
    select auth.jwt() ->> 'role';
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

  -- Idempotente: el directorio de datos sobrevive entre ejecuciones.
  do $r$ begin create role anon; exception when duplicate_object then null; end $r$;
  do $r$ begin create role authenticated; exception when duplicate_object then null; end $r$;
  do $r$ begin create role service_role; exception when duplicate_object then null; end $r$;
  grant usage on schema public to anon, authenticated;
`);

async function cargarLegado() {
  await client.query(`
    insert into public.empresa_docs (empresa, doc, data) values ('3dcc', 'config', '{
      "printers": [{"name":"Creality K1SE Combo","price_eur":738,"depreciation_time_h":3000,
                    "service_costs_life_eur":100,"energy_consumption_kwh":0.15}],
      "filament_types": [{"name":"PLA","price_per_kg":20},{"name":"PETG","price_per_kg":18}],
      "global_config": {"energy_cost_kwh":0.24}
    }') on conflict (empresa, doc) do update set data = excluded.data;

    insert into public.orders (empresa, id, data) values
      ('3dcc', 'LEG00001', '{"id":"LEG00001","cliente":"Ana Legado","cliente_email":"ana@example.com",
        "descripcion":"Soporte","filamento":"PLA","cantidad":2,"estado":"Aceptado","precio_final":100,
        "importe_pagado":70,"payment_method":"Efectivo","last_status_update":"2026-01-09T10:00:00.000Z",
        "payment_history":[
          {"id":"P1","amount":30,"method":"Bizum","source":"manual-payment","created_at":"2026-01-10T10:00:00.000Z"},
          {"id":"R1","amount":0,"method":"Modificación","source":"recalculation","note":"Precio modificado","created_at":"2026-01-11T10:00:00.000Z"}]}'),
      ('3dcc', 'LEG00002', '{"id":"LEG00002","cliente":"Viejo","estado":"Entregado","archived":true,
        "precio_final":50,"importe_pagado":50,
        "payment_history":[{"id":"P2","amount":50,"method":"Efectivo","source":"manual-payment","created_at":"2025-05-01T10:00:00.000Z"}]}'),
      ('silab3d', 'SIL00001', '{"id":"SIL00001","cliente":"Socio","estado":"Aceptado","precio_final":20,
        "importe_pagado":20,"payment_history":[{"id":"P3","amount":20,"method":"Bizum","source":"manual-payment"}]}'),
      ('3dcc', 'LEG00004', '{"id":"LEG00004","cliente":"Descartada","estado":"Descartado","precio_final":9}');
  `);
  const { rows: qs } = await client.query(`
    insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total,
                               estado, importe_pagado, pago, archivos)
    values
      ('Web Viva', 'viva@example.com', '600', 'PLA', 1, 'recogida', 40, 'revisado', 25, 'adelanto',
       '[{"nombre":"pieza.stl","cantidad":2,"metricas":{"peso_g":50,"tiempo_h":2}}]'),
      ('Web Cerrada', 'cerrada@example.com', '600', 'PLA', 1, 'recogida', 30, 'entregado', 30, 'pagado', '[]'),
      ('Web Enlazada', 'enl@example.com', '600', 'PETG', 1, 'recogida', 60, 'aceptado', 30, 'adelanto', '[]')
    returning id, nombre`);
  const id = Object.fromEntries(qs.map((q) => [q.nombre, q.id]));
  await client.query(
    `insert into public.orders (empresa, id, quote_id, data) values
       ('3dcc', 'LEG00003', $1, '{"id":"LEG00003","cliente":"Web Enlazada","estado":"Aceptado","precio_final":60,
         "importe_pagado":30,"payment_history":[{"id":"P4","amount":30,"method":"Bizum","source":"manual-payment"}]}')`,
    [id['Web Enlazada']]
  );
  await client.query(
    `insert into public.recibos (quote_id, importe, metodo, fecha_pago) values
       ($1, 15, 'bizum', '2026-02-01'),
       ($2, 30, 'bizum', '2026-02-02'),
       ($2, 12, 'efectivo', '2026-02-03')`,
    [id['Web Viva'], id['Web Enlazada']]
  );
}

// ── Aplicar todas las migraciones en orden ─────────────────────────────────
const dir = 'supabase/migrations';
const ficheros = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

console.log(`\n▸ Aplicando ${ficheros.length} migraciones…`);
// Datos «de antes» de la sincronización web ↔ Calculadora (0026-0028): se
// cargan justo antes de esas migraciones para probar que el relleno inicial
// no pierde ningún pedido ni cobro.
let legadoCargado = false;
for (const f of ficheros) {
  if (!legadoCargado && f >= '0026') {
    legadoCargado = true;
    try {
      await cargarLegado();
      ok('datos previos a la sincronización cargados');
    } catch (e) {
      fail(`datos previos — ${e.message}`);
    }
  }
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

// ═══ tasador v4 (0024) ═════════════════════════════════════════════════════
console.log('\n▸ Tasador: precio como la Calculadora y calibración');

await check('quote_settings pasa a modo calculadora con mínimo 5,80 €', async () => {
  const { rows } = await client.query('select config from public.quote_settings where id = 1');
  const c = rows[0].config;
  assert(c.modo_precio === 'calculadora', `modo ${c.modo_precio}`);
  assert(Number(c.precio_minimo) === 5.8, `mínimo ${c.precio_minimo}`);
  assert(Number(c.tarifa_preparacion) === 0, 'sigue cobrando preparación');
  assert(Array.isArray(c.descuentos_cantidad) && c.descuentos_cantidad.length === 0, 'descuentos no vacíos');
  assert(Number(c.calculadora.markup) === 2.3 && Number(c.calculadora.precio_kg.PLA) === 20, 'costes raros');
  assert(Array.isArray(c.resistencia) && c.resistencia.length === 4, 'perdió las resistencias');
});

await check('re-aplicar 0024 no pisa unos costes ya ajustados', async () => {
  await comoAdmin();
  await client.query(
    `update public.quote_settings set config = jsonb_set(config, '{calculadora,markup}', '3') where id = 1`
  );
  await client.query(readFileSync(join(dir, '0024_tasador_calculadora.sql'), 'utf8'));
  const { rows } = await client.query('select config from public.quote_settings where id = 1');
  assert(Number(rows[0].config.calculadora.markup) === 3, 'reseteó el markup');
});

await check('guardar la config en la Calculadora actualiza los costes de la web', async () => {
  await comoAdmin();
  await client.query(
    `insert into public.empresa_docs (empresa, doc, data) values ('3dcc', 'config', $1)
     on conflict (empresa, doc) do update set data = excluded.data`,
    [JSON.stringify({
      printers: [
        { name: 'Kobra X', price_eur: 400, depreciation_time_h: 2000, service_costs_life_eur: 50, energy_consumption_kwh: 0.2 },
        { name: 'Creality K1SE Combo', price_eur: 699, depreciation_time_h: '3500', service_costs_life_eur: 120, energy_consumption_kwh: '0,16' }
      ],
      filament_types: [
        { name: 'PLA', price_per_kg: 17.5 },
        { name: 'PETG CF', price_per_kg: '32' },
        { name: 'Raro', price_per_kg: 'n/a' }
      ],
      global_config: { energy_cost_kwh: 0.21 }
    })]
  );
  const { rows } = await client.query('select config from public.quote_settings where id = 1');
  const c = rows[0].config.calculadora;
  assert(Number(c.impresora_eur) === 699 && Number(c.vida_h) === 3500, `impresora ${c.impresora_eur}/${c.vida_h}`);
  assert(Number(c.consumo_kw) === 0.16, `consumo ${c.consumo_kw} (coma decimal)`);
  assert(Number(c.precio_kwh) === 0.21, `kWh ${c.precio_kwh}`);
  assert(Number(c.precio_kg.PLA) === 17.5 && Number(c.precio_kg['PETG CF']) === 32, 'no copia los €/kg');
  assert(Number(c.precio_kg.ASA) === 24, 'borró materiales que la Calculadora no trae');
  assert(!('Raro' in c.precio_kg), 'copió un precio no numérico');
  assert(Number(c.markup) === 3, 'tocó el markup de la web');
  assert(c.impresora === 'Creality K1SE Combo' && c.sincronizado, 'sin marca de sincronización');
});

await check('el mínimo de la Calculadora es el del tasador (y no se pisa)', async () => {
  await comoAdmin();
  const previo = (await client.query(`select data from public.empresa_docs where empresa = '3dcc' and doc = 'config'`)).rows[0].data;
  await client.query(
    `update public.empresa_docs set data = jsonb_set(data, '{global_config,precio_minimo}', '"6,5"') where empresa = '3dcc' and doc = 'config'`
  );
  let c = (await client.query('select config from public.quote_settings where id = 1')).rows[0].config;
  assert(Number(c.precio_minimo) === 6.5, `no copió el mínimo: ${c.precio_minimo}`);
  // Guardar las tarifas con una copia vieja no lo cambia.
  await client.query(`update public.quote_settings set config = jsonb_set(config, '{precio_minimo}', '7') where id = 1`);
  c = (await client.query('select config from public.quote_settings where id = 1')).rows[0].config;
  assert(Number(c.precio_minimo) === 6.5, `las tarifas pisaron el mínimo: ${c.precio_minimo}`);
  await client.query(`update public.empresa_docs set data = $1 where empresa = '3dcc' and doc = 'config'`, [previo]);
});

await check('la config de SILAB3D no toca la web', async () => {
  await client.query(
    `insert into public.empresa_docs (empresa, doc, data) values ('silab3d', 'config', $1)
     on conflict (empresa, doc) do update set data = excluded.data`,
    [JSON.stringify({ printers: [{ name: 'K1 Max', price_eur: 1 }], filament_types: [{ name: 'PLA', price_per_kg: 1 }] })]
  );
  const { rows } = await client.query('select config from public.quote_settings where id = 1');
  assert(Number(rows[0].config.calculadora.precio_kg.PLA) === 17.5, 'SILAB3D pisó los precios');
});

await check('tasador_calibracion cruza la estimación web con el pedido real', async () => {
  await comoAdmin();
  const { rows: q } = await client.query(`
    insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total, archivos)
    values ('Cal', 'cal@example.com', '600000000', 'PLA', 3, 'recogida', 12.5,
      '[{"nombre":"a.stl","cantidad":2,"metricas":{"peso_g":10.5,"tiempo_h":0.5,"estimador":"capas-v1"}},
        {"nombre":"b.stl","cantidad":1,"metricas":{"peso_g":"","tiempo_h":1}}]')
    returning id, codigo`);
  // La solicitud ya trae su pedido (0027): se le ponen las cifras reales.
  await client.query(
    `update public.orders
        set data = data || '{"peso_g":"23","horas":"2.1","precio_final":14.4,"impresora":"Creality K1SE Combo","filamento":"PLA"}'
      where quote_id = $1`,
    [q[0].id]
  );
  const { rows } = await client.query('select * from public.tasador_calibracion() where codigo = $1', [q[0].codigo]);
  assert(rows.length === 1, `filas ${rows.length}`);
  const r = rows[0];
  assert(Number(r.web_peso_g) === 21, `peso web ${r.web_peso_g} (2 × 10.5, vacío ignorado)`);
  assert(Number(r.web_tiempo_h) === 2, `tiempo web ${r.web_tiempo_h}`);
  assert(Number(r.real_peso_g) === 23 && Number(r.real_horas) === 2.1, 'no lee el pedido');
  assert(r.estimador.includes('capas-v1'), `estimador ${r.estimador}`);
});

await check('tasador_calibracion no enseña nada sin ser admin', async () => {
  await comoAnon();
  const { rows } = await client.query('select * from public.tasador_calibracion()');
  assert(rows.length === 0, `anon ve ${rows.length} filas`);
  await comoAdmin();
});

// ═══ sincronización web ↔ Calculadora (0026-0028) ═════════════════════════
const orden = async (empresa, id) =>
  (await client.query('select * from public.orders where empresa = $1 and id = $2', [empresa, id])).rows[0];
const quoteDe = async (quoteId) =>
  (await client.query('select * from public.quotes where id = $1', [quoteId])).rows[0];
const quotePorNombre = async (nombre) =>
  (await client.query('select * from public.quotes where nombre = $1 order by created_at limit 1', [nombre])).rows[0];
const ordenDeQuote = async (quoteId) =>
  (await client.query('select * from public.orders where quote_id = $1', [quoteId])).rows[0];
// Guardado de la Calculadora: upsert del pedido entero, igual que saveOrder.
const guardarPedido = (empresa, id, data) =>
  client.query(
    `insert into public.orders (empresa, id, data) values ($1, $2, $3)
     on conflict (empresa, id) do update set data = excluded.data`,
    [empresa, id, JSON.stringify(data)]
  );
const ahoraISO = (msExtra = 0) => new Date(Date.now() + msExtra).toISOString();
const falla = async (sql, params = []) => {
  try {
    await client.query(sql, params);
    return false;
  } catch {
    return true;
  }
};

// Usuarios de la Calculadora (empresa_users) para las RPC.
const USER_3DCC = '00000000-0000-0000-0000-00000000000a';
const USER_SILAB = '00000000-0000-0000-0000-00000000000b';
await client.query('insert into auth.users (id) values ($1), ($2) on conflict do nothing', [USER_3DCC, USER_SILAB]);
await client.query(
  `insert into public.empresa_users (user_id, empresa) values ($1, '3dcc'), ($2, 'silab3d') on conflict do nothing`,
  [USER_3DCC, USER_SILAB]
);
const como = (uid) =>
  client.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uid })]);

console.log('\n▸ Sincronización: relleno inicial (0027-0028)');
await comoAdmin();

await check('un pedido vivo de 3DCC recibe su quote de la Calculadora', async () => {
  const o = await orden('3dcc', 'LEG00001');
  assert(o.quote_id, 'sin quote');
  const q = await quoteDe(o.quote_id);
  assert(q.origen === 'calculadora' && q.nombre === 'Ana Legado' && q.email === 'ana@example.com', 'datos del cliente');
  assert(q.estado === 'aceptado' && q.descripcion === 'Soporte' && /^Q-\d{4}-\d{4}$/.test(q.codigo), `quote ${q.estado} ${q.codigo}`);
});

await check('archivados, descartados y SILAB3D no reciben quote', async () => {
  for (const [e, id] of [['3dcc', 'LEG00002'], ['3dcc', 'LEG00004'], ['silab3d', 'SIL00001']]) {
    const o = await orden(e, id);
    assert(o.quote_id === null, `${id} tiene quote`);
  }
});

await check('una solicitud web viva sin pedido recibe su pedido; una cerrada no', async () => {
  const viva = await quotePorNombre('Web Viva');
  const o = await ordenDeQuote(viva.id);
  assert(o && o.empresa === '3dcc' && /^[0-9A-F]{8}$/.test(o.id), 'sin pedido');
  assert(o.data.estado === 'Presupuesto enviado', `estado ${o.data.estado}`);
  assert(Number(o.data.peso_g) === 100 && Number(o.data.horas) === 4 && o.data.cantidad === 2, 'métricas × cantidad');
  const cerrada = await quotePorNombre('Web Cerrada');
  assert(!(await ordenDeQuote(cerrada.id)), 'la cerrada tiene pedido');
});

await check('payment_history pasa al libro sin cambiar ningún importe', async () => {
  const { rows } = await client.query(
    `select legacy_id, importe, metodo, tipo from public.cobros
      where empresa = '3dcc' and order_id = 'LEG00001' order by importe`
  );
  assert(rows.length === 2, `apuntes ${rows.length}`);
  assert(rows[0].legacy_id === 'P1' && Number(rows[0].importe) === 30 && rows[0].metodo === 'Bizum', 'P1');
  assert(rows[1].legacy_id === 'saldo-inicial' && Number(rows[1].importe) === 40, 'saldo anterior');
  const { rows: s } = await client.query(
    `select coalesce(sum(importe), 0) as t from public.cobros where empresa = 'silab3d' and order_id = 'SIL00001'`
  );
  assert(Number(s[0].t) === 20, 'SILAB3D sin libro');
  const { rows: arch } = await client.query(`select count(*)::int as n from public.cobros where order_id = 'LEG00002'`);
  assert(arch[0].n === 1, 'los archivados también pasan al libro');
});

await check('una quote sin pedido conserva su importe como cobro', async () => {
  const cerrada = await quotePorNombre('Web Cerrada');
  const { rows } = await client.query('select importe from public.cobros where quote_id = $1', [cerrada.id]);
  assert(rows.length === 1 && Number(rows[0].importe) === 30, 'saldo de la cerrada');
  await client.query(`update public.quotes set notas_admin = 'x' where id = $1`, [cerrada.id]);
  const q = await quoteDe(cerrada.id);
  assert(Number(q.importe_pagado) === 30 && q.pago === 'pagado', `quote ${q.importe_pagado} ${q.pago}`);
});

await check('recibos de quotes con pedido se casan por importe; el resto queda para revisar', async () => {
  const enl = await quotePorNombre('Web Enlazada');
  const { rows } = await client.query(
    'select r.importe, r.cobro_id from public.recibos r where r.quote_id = $1 order by r.importe', [enl.id]);
  assert(rows[0].cobro_id === null && Number(rows[0].importe) === 12, 'el de 12 no debería casar');
  assert(rows[1].cobro_id !== null, 'el de 30 debería casar con P4');
  const { rows: rev } = await client.query('select * from public.cobros_revisar where pedido = $1', [enl.codigo]);
  assert(rev.length === 1 && Number(rev[0].importe) === 12, 'cobros_revisar');
});

await check('tras el relleno, quote y pedido cuadran con el libro', async () => {
  const o = await orden('3dcc', 'LEG00001');
  await guardarPedido('3dcc', 'LEG00001', { ...o.data, notes: 'tocado' });
  const o2 = await orden('3dcc', 'LEG00001');
  assert(Number(o2.data.importe_pagado) === 70, `pagado ${o2.data.importe_pagado}`);
  assert(o2.data.payment_status === 'Parcial' && Number(o2.data.importe_pendiente) === 30, 'estado de pago');
  const ids = o2.data.payment_history.map((p) => p.id);
  assert(ids.includes('P1') && ids.includes('R1') && ids.includes('saldo-inicial'), `historial ${ids}`);
  const q = await quoteDe(o2.quote_id);
  assert(Number(q.importe_pagado) === 70 && q.pago === 'adelanto', `quote ${q.importe_pagado} ${q.pago}`);
});

console.log('\n▸ Sincronización: estados en los dos sentidos (0026)');

await check('el vocabulario común es público y tiene los 8 estados', async () => {
  await comoAnon();
  const { rows } = await client.query('select etiqueta from public.pedido_estados order by orden');
  const lista = rows.map((r) => r.etiqueta).join('|');
  assert(
    lista === 'Nuevo|Presupuesto enviado|Aceptado|En producción|Post-procesado|Listo para entregar|Entregado|Descartado',
    lista
  );
  await comoAdmin();
});

await check('cambiar el estado en la web cambia el pedido', async () => {
  const o = await orden('3dcc', 'LEG00001');
  await client.query(`update public.quotes set estado = 'imprimiendo' where id = $1`, [o.quote_id]);
  const o2 = await orden('3dcc', 'LEG00001');
  assert(o2.data.estado === 'En producción', `pedido ${o2.data.estado}`);
  assert(o2.data.last_status_update > o.data.last_status_update, 'sin marca de tiempo nueva');
  assert(o2.data.notes === 'tocado', 'se comió el resto del pedido');
});

await check('Post-procesado en el pedido no se deshace al volver de la web', async () => {
  const o = await orden('3dcc', 'LEG00001');
  await guardarPedido('3dcc', 'LEG00001', { ...o.data, estado: 'Post-procesado', last_status_update: ahoraISO(1000) });
  const q = await quoteDe(o.quote_id);
  assert(q.estado === 'imprimiendo', `quote ${q.estado}`);
  await client.query(`update public.quotes set estado = 'imprimiendo', notas_admin = 'x' where id = $1`, [o.quote_id]);
  assert((await orden('3dcc', 'LEG00001')).data.estado === 'Post-procesado', 'volvió a producción');
});

await check('un guardado con una copia vieja del pedido no pisa el estado nuevo', async () => {
  const vieja = (await orden('3dcc', 'LEG00001')).data;
  await new Promise((r) => setTimeout(r, 1100));
  await client.query(
    `update public.quotes set estado = 'listo' where id = (select quote_id from public.orders where id = 'LEG00001')`
  );
  await guardarPedido('3dcc', 'LEG00001', { ...vieja, notes: 'desde una copia vieja' });
  const o = await orden('3dcc', 'LEG00001');
  assert(o.data.estado === 'Listo para entregar', `estado ${o.data.estado}`);
  assert(o.data.notes === 'desde una copia vieja', 'no guardó el resto');
  assert((await quoteDe(o.quote_id)).estado === 'listo', 'la quote volvió atrás');
});

await check('un cambio de estado nuevo desde la Calculadora sí gana', async () => {
  const o = await orden('3dcc', 'LEG00001');
  await guardarPedido('3dcc', 'LEG00001', { ...o.data, estado: 'Entregado', last_status_update: ahoraISO(5000) });
  assert((await quoteDe(o.quote_id)).estado === 'entregado', 'la web no se enteró');
});

await check('aceptar en la web acepta el pedido y da el material por gastado', async () => {
  const viva = await quotePorNombre('Web Viva');
  const { rows } = await client.query('select * from public.accept_quote($1, $2)', [viva.codigo, viva.acepta_token]);
  assert(rows[0].ok, 'accept_quote falló');
  const o = await ordenDeQuote(viva.id);
  assert(
    o.data.estado === 'Aceptado' && o.data.accepted_at && o.data.material_contabilizado === true,
    `pedido ${o.data.estado} ${o.data.accepted_at} ${o.data.material_contabilizado}`
  );
});

await check('Descartado en la Calculadora → rechazado en la web, y al revés', async () => {
  const { rows: q } = await client.query(`
    insert into public.quotes (nombre, email, material, cantidad, precio_total)
    values ('Ida y vuelta', 'iv@example.com', 'PLA', 1, 10) returning id`);
  const o = await ordenDeQuote(q[0].id);
  await guardarPedido('3dcc', o.id, { ...o.data, estado: 'Descartado', last_status_update: ahoraISO(1000) });
  assert((await quoteDe(q[0].id)).estado === 'rechazado', 'no llegó a la web');
  await guardarPedido('3dcc', o.id, { ...o.data, estado: 'Presupuesto enviado', last_status_update: ahoraISO(2000) });
  assert((await quoteDe(q[0].id)).estado === 'revisado', 'no volvió a revisado');
  await como(USER_3DCC);
  const { rows } = await client.query('select * from public.calc_reject_quote($1)', [q[0].id]);
  assert(rows[0].ok, 'calc_reject_quote');
  await comoAdmin();
  assert((await ordenDeQuote(q[0].id)).data.estado === 'Descartado', 'no bajó al pedido');
});

console.log('\n▸ Sincronización: un pedido = una quote (0027)');

let webQuote;
await check('una solicitud del tasador crea su pedido en «Nuevo» con coste', async () => {
  const { rows } = await client.query(`
    insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total, archivos, colores, mensaje)
    values ('Cliente Web', 'cw@example.com', '611', 'PETG', 1, 'envio', 18.5,
      '[{"nombre":"llavero.stl","cantidad":3,"metricas":{"peso_g":10,"tiempo_h":0.5}}]',
      '[{"nombre":"Rojo"},{"nombre":"Negro"}]', 'Lo quiero para el viernes')
    returning *`);
  webQuote = rows[0];
  const o = await ordenDeQuote(webQuote.id);
  assert(o, 'sin pedido');
  const d = o.data;
  assert(d.estado === 'Nuevo' && d.origen === 'web' && d.empresa === '3DCC', `estado ${d.estado}`);
  assert(d.descripcion.startsWith(webQuote.codigo) && d.descripcion.includes('llavero.stl'), d.descripcion);
  assert(Number(d.peso_g) === 30 && Number(d.horas) === 1.5 && d.cantidad === 3, `${d.peso_g} g ${d.horas} h ${d.cantidad}`);
  assert(d.filamento === 'PETG' && d.filamento_color === 'Rojo' && d.impresora === 'Creality K1SE Combo', 'material/impresora');
  assert(Number(d.coste_bruto) > 0 && Number(d.precio_final) === 18.5, `coste ${d.coste_bruto}`);
  assert(d.notes.includes('Lo quiero para el viernes') && d.notes.includes('Colores: Rojo, Negro'), d.notes);
  const q = await quoteDe(webQuote.id);
  assert(q.estado === 'nuevo' && q.precio_final === null, 'la quote cambió al crear el pedido');
});

await check('guardar ese pedido desde la Calculadora no crea otra quote', async () => {
  const antes = (await client.query('select count(*)::int n from public.quotes')).rows[0].n;
  const o = await ordenDeQuote(webQuote.id);
  await guardarPedido('3dcc', o.id, { ...o.data, cliente: 'Otro Nombre' });
  const despues = (await client.query('select count(*)::int n from public.quotes')).rows[0].n;
  assert(antes === despues, `${antes} → ${despues}`);
  assert((await quoteDe(webQuote.id)).nombre === 'Cliente Web', 'pisó el nombre que escribió el cliente');
});

let manual;
await check('un pedido nuevo de la Calculadora crea su quote enlazada', async () => {
  await guardarPedido('3dcc', 'MAN00001', {
    id: 'MAN00001', cliente: 'Luis Mano', cliente_email: 'luis@example.com', descripcion: 'Maceta',
    filamento: 'PLA', cantidad: 4, precio_final: 22, estado: 'Presupuesto enviado',
    last_status_update: ahoraISO(), payment_history: []
  });
  manual = await orden('3dcc', 'MAN00001');
  assert(manual.quote_id, 'sin quote');
  const q = await quoteDe(manual.quote_id);
  assert(q.origen === 'calculadora' && q.estado === 'revisado' && q.cantidad === 4, `${q.origen} ${q.estado}`);
  assert(Number(q.precio_total) === 22 && Number(q.precio_final) === 22 && q.email === 'luis@example.com', 'importes/email');
  const { rows } = await client.query('select * from public.get_quote_detalle($1)', [q.codigo.toLowerCase()]);
  assert(rows[0]?.descripcion === 'Maceta' && rows[0].origen === 'calculadora', 'get_quote_detalle');
});

await check('los datos del cliente del pedido manual viajan a su quote', async () => {
  await guardarPedido('3dcc', 'MAN00001', { ...manual.data, cliente: 'Luis Manos', descripcion: 'Maceta XL', precio_final: 25 });
  const q = await quoteDe(manual.quote_id);
  assert(q.nombre === 'Luis Manos' && q.descripcion === 'Maceta XL' && Number(q.precio_total) === 25, `${q.nombre} ${q.precio_total}`);
  manual = await orden('3dcc', 'MAN00001');
});

await check('los pedidos de SILAB3D no crean quote', async () => {
  await guardarPedido('silab3d', 'SIL00002', { id: 'SIL00002', cliente: 'X', estado: 'Presupuesto enviado' });
  assert((await orden('silab3d', 'SIL00002')).quote_id === null, 'tiene quote');
});

await check('borrar un pedido manual archiva su quote', async () => {
  await guardarPedido('3dcc', 'MAN00009', { id: 'MAN00009', cliente: 'Borrar', estado: 'Presupuesto enviado' });
  const o = await orden('3dcc', 'MAN00009');
  await client.query(`delete from public.orders where empresa = '3dcc' and id = 'MAN00009'`);
  assert((await quoteDe(o.quote_id)).archivado === true, 'quote sin archivar');
});

console.log('\n▸ Sincronización: libro de cobros (0028)');

await check('la Calculadora registra un cobro con la RPC y cuadra en los dos lados', async () => {
  await como(USER_3DCC);
  const { rows } = await client.query(
    `select * from public.registrar_cobro(p_importe => 10, p_metodo => 'Bizum', p_empresa => '3dcc', p_order_id => 'MAN00001')`
  );
  assert(rows[0].origen === 'calculadora' && rows[0].quote_id === manual.quote_id, 'enlace del cobro');
  await comoAdmin();
  const o = await orden('3dcc', 'MAN00001');
  assert(Number(o.data.importe_pagado) === 10 && o.data.payment_status === 'Parcial', `pedido ${o.data.importe_pagado}`);
  assert(o.data.payment_history.some((p) => p.cobro_id === rows[0].id && p.method === 'Bizum'), 'historial');
  const q = await quoteDe(manual.quote_id);
  assert(Number(q.importe_pagado) === 10 && q.pago === 'adelanto', `quote ${q.importe_pagado} ${q.pago}`);
});

await check('la web registra por quote y la Calculadora lo ve en el pedido', async () => {
  await comoAdmin();
  const { rows } = await client.query(
    `select * from public.registrar_cobro(p_importe => 15, p_metodo => 'Efectivo', p_quote_id => $1)`,
    [manual.quote_id]
  );
  assert(rows[0].origen === 'web' && rows[0].order_id === 'MAN00001', `${rows[0].origen} ${rows[0].order_id}`);
  const o = await orden('3dcc', 'MAN00001');
  assert(Number(o.data.importe_pagado) === 25 && o.data.payment_status === 'Pagado', `pedido ${o.data.importe_pagado}`);
  assert((await quoteDe(manual.quote_id)).pago === 'pagado', 'quote sin pagar');
});

await check('una copia vieja del pedido no deshace un cobro de la web', async () => {
  await guardarPedido('3dcc', 'MAN00001', { ...manual.data, importe_pagado: 0, payment_history: [], notes: 'viejo' });
  const o = await orden('3dcc', 'MAN00001');
  assert(Number(o.data.importe_pagado) === 25 && o.data.payment_history.length === 2, `pagado ${o.data.importe_pagado}`);
});

await check('una Calculadora antigua que añade el cobro en el JSON también entra al libro', async () => {
  const o = await orden('3dcc', 'LEG00001');
  const hist = [
    ...o.data.payment_history,
    { id: 'VIEJA1', amount: 5, method: 'Efectivo', source: 'manual-payment', created_at: ahoraISO() }
  ];
  await guardarPedido('3dcc', 'LEG00001', { ...o.data, payment_history: hist, importe_pagado: 75 });
  // …y se guarda dos veces (reintento): no se duplica.
  await guardarPedido('3dcc', 'LEG00001', { ...o.data, payment_history: hist, importe_pagado: 75 });
  const { rows } = await client.query(`select count(*)::int n from public.cobros where legacy_id = 'VIEJA1'`);
  assert(rows[0].n === 1, `apuntes ${rows[0].n}`);
  assert(Number((await orden('3dcc', 'LEG00001')).data.importe_pagado) === 75, 'importe');
});

await check('un ajuste manual de importe_pagado (apunte negativo) entra como ajuste', async () => {
  const o = await orden('3dcc', 'LEG00001');
  const hist = [
    ...o.data.payment_history,
    { id: 'AJ1', amount: -5, method: 'Ajuste manual', source: 'manual-adjustment', created_at: ahoraISO() }
  ];
  await guardarPedido('3dcc', 'LEG00001', { ...o.data, payment_history: hist });
  const { rows } = await client.query(`select tipo from public.cobros where legacy_id = 'AJ1'`);
  assert(rows[0]?.tipo === 'ajuste', 'tipo');
  assert(Number((await orden('3dcc', 'LEG00001')).data.importe_pagado) === 70, 'importe');
});

await check('quitar un apunte del JSON no lo anula; anular_cobro sí', async () => {
  const o = await orden('3dcc', 'LEG00001');
  await guardarPedido('3dcc', 'LEG00001', {
    ...o.data,
    payment_history: o.data.payment_history.filter((p) => p.id !== 'P1')
  });
  assert(Number((await orden('3dcc', 'LEG00001')).data.importe_pagado) === 70, 'se anuló por el JSON');
  await como(USER_3DCC);
  const { rows } = await client.query(
    `select public.anular_cobro(p_empresa => '3dcc', p_order_id => 'LEG00001', p_payment_id => 'P1', p_motivo => 'error') as ok`
  );
  assert(rows[0].ok === true, 'anular_cobro');
  await comoAdmin();
  const o2 = await orden('3dcc', 'LEG00001');
  assert(
    Number(o2.data.importe_pagado) === 40 && !o2.data.payment_history.some((p) => p.id === 'P1'),
    `pagado ${o2.data.importe_pagado}`
  );
  // Una copia vieja que aún lo trae no lo resucita.
  await guardarPedido('3dcc', 'LEG00001', o.data);
  assert(Number((await orden('3dcc', 'LEG00001')).data.importe_pagado) === 40, 'resucitó');
});

await check('editar quotes.importe_pagado a mano no cambia nada', async () => {
  const qid = (await orden('3dcc', 'LEG00001')).quote_id;
  await client.query(`update public.quotes set importe_pagado = 999, pago = 'pagado' where id = $1`, [qid]);
  const q = await quoteDe(qid);
  assert(Number(q.importe_pagado) === 40 && q.pago === 'adelanto', `${q.importe_pagado} ${q.pago}`);
});

await check('SILAB3D y anon no pueden registrar cobros de 3DCC', async () => {
  const sql = `select public.registrar_cobro(p_importe => 1, p_metodo => 'Bizum', p_empresa => '3dcc', p_order_id => 'MAN00001')`;
  await como(USER_SILAB);
  assert(await falla(sql), 'SILAB3D registró un cobro');
  await comoAnon();
  assert(await falla(sql), 'anon registró un cobro');
  await como(USER_SILAB);
  assert(
    await falla(`select public.anular_cobro(p_empresa => '3dcc', p_order_id => 'MAN00001', p_payment_id => 'x')`),
    'SILAB3D anuló'
  );
  await comoAdmin();
});

await check('un cobro negativo o sin método se rechaza', async () => {
  assert(
    await falla(`select public.registrar_cobro(p_importe => -3, p_metodo => 'Bizum', p_empresa => '3dcc', p_order_id => 'MAN00001')`),
    'negativo'
  );
  assert(
    await falla(`select public.registrar_cobro(p_importe => 3, p_metodo => ' ', p_empresa => '3dcc', p_order_id => 'MAN00001')`),
    'sin método'
  );
});

await check('RLS: cada empresa ve solo sus cobros; sin sesión, ninguno', async () => {
  const ver = async (claims) => {
    await client.query('begin');
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await client.query('set local role authenticated');
      return (await client.query('select empresa from public.cobros')).rows.map((r) => r.empresa);
    } finally {
      await client.query('rollback');
    }
  };
  const silab = await ver({ sub: USER_SILAB });
  assert(silab.length > 0 && silab.every((e) => e === 'silab3d'), `silab ve ${[...new Set(silab)]}`);
  const nadie = await ver({});
  assert(nadie.length === 0, `sin sesión ve ${nadie.length}`);
});

// ── Reseñas (20261102200000) ───────────────────────────────────────────────
console.log('\n▸ Reseñas y clic en WhatsApp');
await check('anon solo lee reseñas publicadas y no puede escribir', async () => {
  await comoAdmin();
  await client.query(`insert into public.resenas (autor_visible, texto, publicada)
                      values ('Ana G.', 'Rapidísimos', true), ('Borrador B.', 'Oculta', false)`);
  await client.query('begin');
  try {
    await client.query('set local role anon');
    await comoAnon();
    const { rows } = await client.query('select autor_visible from public.resenas');
    assert(rows.length === 1 && rows[0].autor_visible === 'Ana G.', `anon ve ${rows.length}`);
    let lanzo = false;
    await client.query('savepoint s');
    try {
      await client.query(`insert into public.resenas (autor_visible, texto) values ('X', 'spam')`);
    } catch { lanzo = true; await client.query('rollback to savepoint s'); }
    assert(lanzo, 'anon pudo insertar una reseña');
    await client.query(`insert into public.quote_events (evento, payload) values ('whatsapp_clic', '{"pagina":"/"}')`);
  } finally {
    await client.query('rollback');
  }
});

await check('campana_navidad: una fila, anon lee y no escribe, ocupadas <= semana', async () => {
  await comoAdmin();
  let lanzo = false;
  try { await client.query('update public.campana_navidad set plazas_ocupadas = 99'); } catch { lanzo = true; }
  assert(lanzo, 'aceptó más ocupadas que plazas');
  await client.query('begin');
  try {
    await client.query('set local role anon');
    await comoAnon();
    const { rows } = await client.query('select plazas_semana from public.campana_navidad');
    assert(rows.length === 1 && rows[0].plazas_semana === 15, `anon ve ${JSON.stringify(rows)}`);
    const r = await client.query('update public.campana_navidad set plazas_ocupadas = 1');
    assert(r.rowCount === 0, 'anon pudo cambiar las plazas');
  } finally {
    await client.query('rollback');
  }
});

await check('campana_audiencia: solo la casilla marcada o clientes, y gana la última respuesta', async () => {
  await comoAdmin();
  await client.query('begin');
  try {
    await client.query(`insert into public.quotes (nombre, email, material, cantidad, precio_total, acepta_ofertas, created_at) values
      ('Si',      'si@ofertas.test',      'PLA', 1, 10, true,  now()),
      ('No',      'no@ofertas.test',      'PLA', 1, 10, false, now()),
      ('Antigua', 'antigua@ofertas.test', 'PLA', 1, 10, null,  now()),
      ('Cambia',  'cambia@ofertas.test',  'PLA', 1, 10, true,  now() - interval '2 days'),
      ('Cambia',  'cambia@ofertas.test',  'PLA', 1, 10, false, now()),
      ('Cliente', 'cliente@ofertas.test', 'PLA', 1, 10, false, now() - interval '1 day')`);
    await client.query(`insert into public.orders (empresa, id, data) values
      ('3dcc', 'OFE00001', '{"cliente":"Comprador","cliente_email":"comprador@ofertas.test","estado":"Entregado"}'),
      ('3dcc', 'OFE00002', '{"cliente":"Cliente","cliente_email":"cliente@ofertas.test","estado":"Aceptado"}'),
      ('3dcc', 'OFE00003', '{"cliente":"Curioso","cliente_email":"curioso@ofertas.test","estado":"Presupuesto enviado"}')`);
    const { rows } = await client.query(
      `select email from public.campana_audiencia() where email like '%@ofertas.test' order by email`
    );
    const lista = rows.map((r) => r.email).join(',');
    assert(lista === 'comprador@ofertas.test,si@ofertas.test', `audiencia: ${lista}`);
  } finally {
    await client.query('rollback');
  }
});

console.log('\n▸ Códigos de descuento');

const cuponComoAnon = async (sql, params = []) => {
  await client.query('begin');
  try {
    await client.query('set local role anon');
    await comoAnon();
    return (await client.query(sql, params)).rows;
  } finally {
    await client.query('rollback');
    await comoAdmin();
  }
};

await check('cupones: anon no lee la tabla; validar_cupon solo da los vivos', async () => {
  await comoAdmin();
  await client.query(`
    insert into public.cupones (codigo, tipo, valor, pedido_minimo, max_usos, valido_hasta, activo) values
      ('VIVO10', 'pct', 10, 0, null, null, true),
      ('APAGADO', 'pct', 10, 0, null, null, false),
      ('CADUCADO', 'fijo', 5, 0, null, '2020-01-01', true),
      ('HOYSI', 'fijo', 5, 15, null, public.en_madrid(now())::date, true),
      ('UNO', 'pct', 50, 0, 1, null, true)`);
  const tabla = await cuponComoAnon('select * from public.cupones');
  assert(tabla.length === 0, `anon ve ${tabla.length} cupones`);
  const v = async (c) => (await cuponComoAnon('select * from public.validar_cupon($1)', [c]))[0];
  assert((await v(' vivo10 '))?.codigo === 'VIVO10', 'no normaliza mayúsculas/espacios');
  assert(!(await v('APAGADO')), 'acepta uno desactivado');
  assert(!(await v('CADUCADO')), 'acepta uno caducado');
  const hoy = await v('HOYSI');
  assert(hoy && Number(hoy.pedido_minimo) === 15 && hoy.tipo === 'fijo', 'el último día no vale');
  assert(!(await v('NOEXISTE')), 'acepta uno inexistente');
});

await check('cupones: un uso por solicitud no rechazada, y vuelve si se rechaza', async () => {
  const v = async (c) => (await cuponComoAnon('select * from public.validar_cupon($1)', [c])).length;
  assert((await v('UNO')) === 1, 'UNO no vale antes de usarlo');
  const { rows } = await client.query(`
    insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total, archivos, cupon, desglose)
    values ('Con Cupón', 'cc@example.com', '611', 'PLA', 1, 'recogida', 10,
      '[{"nombre":"pieza.stl","cantidad":1,"metricas":{"peso_g":10,"tiempo_h":1}}]', 'UNO',
      '{"cupon_descuento": 10}')
    returning id`);
  assert((await v('UNO')) === 0, 'UNO sigue valiendo tras su único uso');
  const o = await ordenDeQuote(rows[0].id);
  assert(o?.data.cupon === 'UNO' && o.data.notes.includes('Cupón UNO: -10 €'), `notas: ${o?.data.notes}`);
  assert(o.data.notes.includes('Solicitud web'), 'se perdieron las notas de siempre');
  await client.query(`update public.quotes set estado = 'rechazado' where id = $1`, [rows[0].id]);
  assert((await v('UNO')) === 1, 'el uso no vuelve al rechazar');
  let lanzo = false;
  try { await client.query(`delete from public.cupones where codigo = 'UNO'`); } catch { lanzo = true; }
  assert(lanzo, 'se pudo borrar un cupón usado');
});

await check('cupones: una solicitud sin cupón no lleva nada en el pedido', async () => {
  const o = await ordenDeQuote(webQuote.id);
  assert(!('cupon' in o.data) && !o.data.notes.includes('Cupón'), 'cupón fantasma');
});

// ── Detalle por pieza en el pedido (20261112100000) ─────────────────────────
await check('pedido web: conserva cada pieza (material, colores, gramos y horas) y los totales', async () => {
  const archivos = [
    { nombre: 'tapa.stl', cantidad: 3, material: 'PLA', resistencia: 'estandar', detalle: 'estandar',
      colores: [{ nombre: 'Negro', hex: '#000000', parte: '' }],
      metricas: { peso_g: 12.5, tiempo_h: 0.75, estimador: 'capas-v1' } },
    { nombre: 'qr.3mf', cantidad: 1, material: 'PETG', resistencia: 'resistente', detalle: 'fino',
      colores: [{ nombre: 'Blanco', hex: '#ffffff', parte: 'Base' }, { nombre: 'Negro', hex: '#000000', parte: 'Código' }],
      metricas: { peso_g: 30, tiempo_h: 2, estimador: 'aproximado' } }
  ];
  const { rows } = await client.query(`
    insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total, archivos, colores)
    values ('Dos Piezas', 'dos@example.com', '612', 'PLA, PETG', 4, 'recogida', 25, $1,
            '[{"nombre":"Negro"},{"nombre":"Blanco"}]')
    returning id`, [JSON.stringify(archivos)]);
  const o = await ordenDeQuote(rows[0].id);
  const p = o?.data.piezas;
  assert(Array.isArray(p) && p.length === 2, `piezas: ${JSON.stringify(p)}`);
  assert(p[0].nombre === 'tapa.stl' && p[0].cantidad === 3 && p[0].material === 'PLA' && Number(p[0].peso_g) === 12.5 &&
    Number(p[0].horas) === 0.75 && p[0].metodo === 'capas-v1', `primera: ${JSON.stringify(p[0])}`);
  assert(p[1].material === 'PETG' && p[1].colores.length === 2 && p[1].colores[1].parte === 'Código' &&
    p[1].colores[0].hex === '#ffffff', `segunda: ${JSON.stringify(p[1])}`);
  // Los totales aplanados que lee la 7.2 siguen igual: 3 × 12,5 + 30 g y 3 × 0,75 + 2 h.
  assert(o.data.peso_g === '68' && o.data.horas === '4.25' && o.data.cantidad === 4, `totales: ${o.data.peso_g} g, ${o.data.horas} h, ${o.data.cantidad}`);
  assert(o.data.notes.includes('Solicitud web') && o.data.filamento === 'PLA, PETG', 'se perdió lo de siempre');
  // Sin archivos: lista vacía, no null.
  const v = await ordenDeQuote(webQuote.id);
  assert(Array.isArray(v.data.piezas), 'sin lista de piezas');
});

console.log('\n▸ Miniaturas del tasador');

await check('tasador-miniaturas: privado, solo JPEG pequeño; anon sube con ruta válida y no lee', async () => {
  const { rows: [b] } = await client.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'tasador-miniaturas'`);
  assert(b && b.public === false && Number(b.file_size_limit) <= 153600 && b.allowed_mime_types.join() === 'image/jpeg', JSON.stringify(b));
  // Supabase grants these to anon; RLS is what limits it.
  await client.query('grant usage on schema storage to anon; grant select, insert on storage.objects to anon');
  await client.query('begin');
  try {
    await client.query('set local role anon');
    await comoAnon();
    await client.query(`insert into storage.objects (bucket_id, name) values ('tasador-miniaturas', 'abc123sesion/1x9z.jpg')`);
    let lanzo = false;
    try {
      await client.query('savepoint s');
      await client.query(`insert into storage.objects (bucket_id, name) values ('tasador-miniaturas', '../otra/cosa.php')`);
    } catch { lanzo = true; await client.query('rollback to savepoint s'); }
    assert(lanzo, 'anon subió una ruta que no es <sesión>/<huella>.jpg');
    const { rows } = await client.query(`select name from storage.objects where bucket_id = 'tasador-miniaturas'`);
    assert(rows.length === 0, `anon ve ${rows.length} miniaturas`);
  } finally {
    await client.query('rollback');
    await comoAdmin();
  }
});

// ── Acceso del admin a orders y empresa_docs (20261110150000) ──────────────
console.log('\n▸ Admin sobre orders y empresa_docs');
await check('admin lee y escribe orders de 3DCC; anon y usuario sin claim no ven nada', async () => {
  await comoAdmin();
  const { rows: [{ n: total }] } = await client.query(`select count(*)::int as n from public.orders where empresa = '3dcc'`);
  assert(total > 0, 'sin pedidos de 3DCC en el banco de pruebas');
  const sesion = async (claims, sql, params = []) => {
    await client.query('begin');
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await client.query('set local role authenticated');
      return (await client.query(sql, params)).rows;
    } finally {
      await client.query('rollback');
    }
  };
  const SIN_CLAIM = '00000000-0000-0000-0000-0000000000ff'; // autenticado, sin empresa ni is_admin
  for (const t of ['orders', 'empresa_docs']) {
    const q = `select count(*)::int as n from public.${t} where empresa = '3dcc'`;
    const admin = (await sesion({ app_metadata: { is_admin: true } }, q))[0].n;
    assert(admin > 0, `admin ve ${admin} filas de ${t}`);
    for (const [quien, claims] of [['anon', {}], ['usuario sin claim', { sub: SIN_CLAIM }]]) {
      const n = (await sesion(claims, q))[0].n;
      assert(n === 0, `${quien} ve ${n} filas de ${t}`);
    }
  }
  // Escritura del admin (y solo del admin) en orders.
  const admin = { app_metadata: { is_admin: true } };
  const ins = `insert into public.orders (empresa, id, data) values ('3dcc', 'ADM00001', '{}')`;
  assert((await sesion(admin, ins + ' returning id')).length === 1, 'admin no inserta');
  assert((await sesion(admin, `update public.orders set data = '{"x":1}' where empresa = '3dcc' returning id`)).length === total, 'admin no actualiza todos');
  let bloqueado = false;
  try { await sesion({ sub: SIN_CLAIM }, ins); } catch { bloqueado = true; }
  assert(bloqueado, 'un usuario sin claim inserta en orders');
  assert((await sesion({ sub: SIN_CLAIM }, `update public.orders set data = '{}' returning id`)).length === 0, 'un usuario sin claim actualiza orders');
});

// ── Pedido estándar: fecha prometida y precio firme (20261110170000) ───────
console.log('\n▸ Pedido estándar (fase 2)');
await comoAdmin();
const val1 = async (sql, params = []) => Object.values((await client.query(sql, params)).rows[0])[0];
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
// pg convierte date a Date en hora local: se pide como texto.
const fechaSql = async (sql, params = []) => iso(await val1(`select (${sql})::text`, params));

await check('ajustes: 4 h/día, 2 días de holgura, lista de tipos firmes vacía', async () => {
  const c = await val1('select config from public.quote_settings where id = 1');
  assert(Number(c.plazo_horas_dia) === 4, `plazo_horas_dia ${c.plazo_horas_dia}`);
  assert(Number(c.plazo_holgura_dias) === 2, `holgura ${c.plazo_holgura_dias}`);
  assert(Array.isArray(c.tipos_precio_firme) && c.tipos_precio_firme.length === 0, JSON.stringify(c.tipos_precio_firme));
  assert(!('plazo_dias_margen' in c), 'sigue plazo_dias_margen');
});

await check('sumar_laborables: salta fines de semana (mismos casos que test-pricing)', async () => {
  // Mismos casos que scripts/test-pricing.ts (sumarLaborables).
  for (const [desde, n, esperado] of [
    ['2026-11-10', 2, '2026-11-12'], // martes + 2 → jueves
    ['2026-11-13', 1, '2026-11-16'], // viernes + 1 → lunes
    ['2026-11-12', 3, '2026-11-17'], // jueves + 3 → martes
    ['2026-11-14', 0, '2026-11-16'], // sábado + 0 → lunes
    ['2026-11-15', 2, '2026-11-18']  // domingo + 2 → miércoles
  ]) {
    const r = await fechaSql('public.sumar_laborables($1::date, $2)', [desde, n]);
    assert(r === esperado, `${desde} + ${n} = ${r}, esperaba ${esperado}`);
  }
});

await check('fecha_tope: cola + horas entre 4 h/día + extra + holgura; urgente ignora la cola', async () => {
  const cola = Number(await val1('select public.plazo_cola_horas()'));
  const esperada = (dias) => fechaSql('public.sumar_laborables(public.en_madrid(now())::date, $1)', [dias]);
  const caso = async (args, dias) => {
    const r = await fechaSql(`public.fecha_tope(${args})`);
    const e = await esperada(dias);
    assert(r === e, `fecha_tope(${args}) = ${r}, esperaba ${e} (${dias} días, cola ${cola} h)`);
  };
  await caso('6', Math.ceil((cola + 6) / 4) + 2);
  await caso('6, 3', Math.ceil((cola + 6) / 4) + 3 + 2);
  await caso('6, 0, true', Math.ceil(6 / 4) + 2);
  await caso('0, 0, true', 2);
  // Un pedido aceptado más alarga la cola de los siguientes.
  const { rows: [q] } = await client.query(`
    insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total, estado, metricas, archivos)
    values ('Cola', 'cola@example.com', '6', 'PLA', 1, 'recogida', 10, 'aceptado', '{"tiempo_h": 40}', '[]')
    returning id`);
  const cola2 = Number(await val1('select public.plazo_cola_horas()'));
  assert(Math.abs(cola2 - cola - 40) < 0.01, `cola ${cola} → ${cola2}`);
  assert(Math.abs(Number(await val1('select public.plazo_cola_horas($1)', [q.id])) - cola) < 0.01, 'p_excluir no excluye');
  await client.query('delete from public.quotes where id = $1', [q.id]);
});

let plazoQuote;
await check('al aceptar se fija la fecha prometida; el pedido de la Calculadora sigue a la par', async () => {
  const { rows: [q] } = await client.query(`
    insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total, estado, archivos, metricas)
    values ('Plazo', 'plazo@example.com', '6', 'PLA', 1, 'recogida', 12, 'revisado',
      '[{"nombre":"pieza.stl","cantidad":2,"metricas":{"peso_g":20,"tiempo_h":3}}]', '{"tiempo_h": 6}')
    returning *`);
  plazoQuote = q;
  assert(q.fecha_prometida === null, 'fecha antes de aceptar');
  const o = await ordenDeQuote(q.id);
  assert(Number(o.data.horas) === 6, `horas del pedido ${o.data.horas}`);
  const cola = Number(await val1('select public.plazo_cola_horas($1)', [q.id]));
  const e = await fechaSql('public.sumar_laborables(public.en_madrid(now())::date, $1)', [Math.ceil((cola + 6) / 4) + 2]);
  await client.query(`update public.quotes set estado = 'aceptado', aceptado_at = now() where id = $1`, [q.id]);
  const f = await fechaSql('select fecha_prometida from public.quotes where id = $1', [q.id]);
  assert(f === e, `fecha_prometida ${f}, esperaba ${e}`);
  const o2 = await ordenDeQuote(q.id);
  assert(o2.data.estado === 'Aceptado' && o2.data.accepted_at, `pedido en ${o2.data.estado}`);
  // La fecha no se mueve al imprimir y el admin puede corregirla a mano.
  await client.query(`update public.quotes set estado = 'imprimiendo' where id = $1`, [q.id]);
  assert(await fechaSql('select fecha_prometida from public.quotes where id = $1', [q.id]) === f, 'la fecha cambió al imprimir');
  await client.query(`update public.quotes set fecha_prometida = '2030-01-15' where id = $1`, [q.id]);
  assert(await fechaSql('select fecha_prometida from public.quotes where id = $1', [q.id]) === '2030-01-15', 'no se pudo corregir a mano');
  // Urgente en marcha: recalcula sin cola.
  await client.query(`update public.quotes set urgente = true where id = $1`, [q.id]);
  const u = await fechaSql('select fecha_prometida from public.quotes where id = $1', [q.id]);
  const eu = await fechaSql('public.sumar_laborables(public.en_madrid(now())::date, $1)', [Math.ceil(6 / 4) + 2]);
  assert(u === eu, `urgente ${u}, esperaba ${eu}`);
});

await check('listo_at al pasar a listo; get_quote_plazo para anon', async () => {
  await client.query(`update public.quotes set estado = 'listo' where id = $1`, [plazoQuote.id]);
  const { rows: [r] } = await client.query('select listo_at from public.quotes where id = $1', [plazoQuote.id]);
  assert(r.listo_at, 'sin listo_at');
  const plazo = await cuponComoAnon('select fecha_prometida::text as f, fecha_orientativa::text as o, listo_at from public.get_quote_plazo($1)', [plazoQuote.codigo]);
  assert(plazo[0]?.f && !plazo[0].o && plazo[0].listo_at, JSON.stringify(plazo));
  // Sin aceptar: fecha orientativa, sin fecha prometida.
  const { rows: [n] } = await client.query(`
    insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total, metricas, archivos)
    values ('Orientativa', 'or@example.com', '6', 'PLA', 1, 'recogida', 9, '{"tiempo_h": 2}', '[]') returning codigo`);
  const p2 = await cuponComoAnon('select fecha_prometida, fecha_orientativa::text as o from public.get_quote_plazo($1)', [n.codigo]);
  assert(!p2[0].fecha_prometida && /^\d{4}-\d{2}-\d{2}$/.test(p2[0].o), JSON.stringify(p2));
  const cola = await cuponComoAnon('select public.plazo_cola_horas() as h');
  assert(Number(cola[0].h) >= 0, 'anon no lee la cola');
});

await check('precio firme: el admin no cambia el precio; la Calculadora no lo pisa; rehacer pide motivo', async () => {
  const { rows: [q] } = await client.query(`
    insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total, precio_firme, archivos)
    values ('Firme', 'firme@example.com', '6', 'PLA', 1, 'recogida', 20, true,
      '[{"nombre":"f.stl","cantidad":1,"metricas":{"peso_g":30,"tiempo_h":2}}]')
    returning *`);
  let lanzo = false;
  try { await client.query('update public.quotes set precio_final = 25 where id = $1', [q.id]); } catch { lanzo = true; }
  assert(lanzo, 'el admin subió un precio firme');
  await client.query('update public.quotes set precio_final = 20 where id = $1', [q.id]);
  // Guardado de la Calculadora con otro precio: se guarda el pedido, no el precio.
  const o = await ordenDeQuote(q.id);
  await guardarPedido('3dcc', o.id, { ...o.data, precio_final: 30, last_status_update: new Date().toISOString() });
  const { rows: [tras] } = await client.query('select precio_final from public.quotes where id = $1', [q.id]);
  assert(Number(tras.precio_final) === 20, `precio tras guardar en la Calculadora: ${tras.precio_final}`);
  assert(Number((await ordenDeQuote(q.id)).data.precio_final) === 30, 'el guardado del pedido se perdió');
  // Quitar el precio firme a mano sin motivo: no.
  lanzo = false;
  try { await client.query('update public.quotes set precio_firme = false where id = $1', [q.id]); } catch { lanzo = true; }
  assert(lanzo, 'se quitó el precio firme sin motivo');
  lanzo = false;
  try { await client.query(`select public.rehacer_presupuesto($1, '  ')`, [q.id]); } catch { lanzo = true; }
  assert(lanzo, 'rehacer sin motivo');
  await client.query(`update public.quotes set estado = 'aceptado' where id = $1`, [q.id]);
  const token = (await client.query('select acepta_token from public.quotes where id = $1', [q.id])).rows[0].acepta_token;
  await client.query(`select public.rehacer_presupuesto($1, 'Pide 2 unidades')`, [q.id]);
  const { rows: [r] } = await client.query('select * from public.quotes where id = $1', [q.id]);
  assert(!r.precio_firme && r.rehecho_motivo === 'Pide 2 unidades' && r.rehecho_at, 'no quedó rehecho');
  assert(r.estado === 'revisado' && !r.aceptado_at && !r.fecha_prometida && r.acepta_token !== token, 'no reinició la aceptación');
  await client.query('update public.quotes set precio_final = 35 where id = $1', [q.id]);
  // Un anónimo no puede rehacer.
  lanzo = false;
  await client.query('begin');
  try {
    await client.query('set local role anon');
    await comoAnon();
    await client.query(`select public.rehacer_presupuesto($1, 'x')`, [q.id]);
  } catch { lanzo = true; } finally { await client.query('rollback'); await comoAdmin(); }
  assert(lanzo, 'anon rehízo un presupuesto');
});

await check('desvío: coste real − coste estimado del pedido del tasador', async () => {
  const { rows: [q] } = await client.query(`
    insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total, archivos)
    values ('Desvío', 'desvio@example.com', '6', 'PLA', 1, 'recogida', 15,
      '[{"nombre":"d.stl","cantidad":1,"metricas":{"peso_g":50,"tiempo_h":2}}]')
    returning id`);
  const o = await ordenDeQuote(q.id);
  const est = Number(o.data.coste_bruto);
  let { rows: [r] } = await client.query('select coste_estimado, coste_real, desvio_coste from public.quotes where id = $1', [q.id]);
  assert(Number(r.coste_estimado) === est && Number(r.desvio_coste) === 0, JSON.stringify(r));
  await guardarPedido('3dcc', o.id, { ...o.data, coste_bruto: est + 1.5 });
  ({ rows: [r] } = await client.query('select coste_estimado, coste_real, desvio_coste from public.quotes where id = $1', [q.id]));
  assert(Number(r.coste_estimado) === est && Math.abs(Number(r.desvio_coste) - 1.5) < 0.001, JSON.stringify(r));
});

// ── Limpieza automática de pedidos (20261111100000) ────────────────────────
console.log('\n▸ Limpieza de pedidos');

await check('limpieza_pedidos: descarta a los 15 días, archiva entregados cobrados, respeta lo demás', async () => {
  // El pago sale del libro de cobros: para estar «pagado» hay que cobrar de verdad.
  const nueva = async (nombre, estado, cobrado = false) => {
    const { rows: [q] } = await client.query(
      `insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total, precio_final, estado)
       values ($1, 'l@example.com', '6', 'PLA', 1, 'recogida', 20, 20, $2) returning id`,
      [nombre, estado]
    );
    if (cobrado) {
      await client.query(`select public.registrar_cobro(p_importe => 20, p_metodo => 'Bizum', p_quote_id => $1)`, [q.id]);
    }
    return q.id;
  };
  const viejo = async (id, dias) => {
    await client.query('alter table public.quotes disable trigger touch_quotes');
    await client.query(`update public.quotes set updated_at = now() - ($2 || ' days')::interval where id = $1`, [id, String(dias)]);
    await client.query('alter table public.quotes enable trigger touch_quotes');
  };
  const sinRespuesta = await nueva('Limp sin respuesta', 'revisado');
  const conAdelanto = await nueva('Limp con adelanto', 'revisado');
  await client.query(`select public.registrar_cobro(p_importe => 5, p_metodo => 'Bizum', p_quote_id => $1)`, [conAdelanto]);
  const reciente = await nueva('Limp reciente', 'revisado');
  const aceptado = await nueva('Limp aceptado viejo', 'aceptado');
  const cobrado = await nueva('Limp entregado cobrado', 'entregado', true);
  const debe = await nueva('Limp entregado sin cobrar', 'entregado');
  const entregadoReciente = await nueva('Limp entregado reciente', 'entregado', true);
  await viejo(sinRespuesta, 16); await viejo(conAdelanto, 20); await viejo(reciente, 10); await viejo(aceptado, 40);
  await viejo(cobrado, 8); await viejo(debe, 30); await viejo(entregadoReciente, 2);

  const { rows: [r] } = await client.query('select * from public.limpieza_pedidos()');
  assert(r.descartados >= 1 && r.archivados >= 1, JSON.stringify(r));
  const q = async (id) => quoteDe(id);
  assert((await q(sinRespuesta)).estado === 'rechazado', 'no descartó el presupuesto sin respuesta');
  assert((await q(reciente)).estado === 'revisado', 'descartó uno reciente');
  assert((await q(conAdelanto)).estado === 'revisado', 'descartó uno con adelanto');
  assert((await q(aceptado)).estado === 'aceptado', 'tocó un aceptado');
  const c = await q(cobrado);
  assert(c.archivado, 'no archivó el entregado y cobrado');
  assert((await ordenDeQuote(cobrado)).data.archived === true, 'no archivó el pedido de taller');
  assert(!(await q(debe)).archivado, 'archivó uno sin cobrar');
  assert(!(await q(entregadoReciente)).archivado, 'archivó uno reciente');
  // El descarte baja al pedido de taller (0026).
  assert((await ordenDeQuote(sinRespuesta)).data.estado === 'Descartado', 'el pedido no quedó «Descartado»');
  // Idempotente.
  const { rows: [r2] } = await client.query('select * from public.limpieza_pedidos()');
  assert(r2.descartados === 0 && r2.archivados === 0, 'la segunda pasada volvió a tocar cosas ' + JSON.stringify(r2));
});

await check('limpieza_pedidos: ni anon ni un usuario normal pueden ejecutarla', async () => {
  for (const rol of ['anon', 'authenticated']) {
    let lanzo = false;
    await client.query('begin');
    try {
      await client.query(`set local role ${rol}`);
      await client.query('select * from public.limpieza_pedidos()');
    } catch { lanzo = true; } finally { await client.query('rollback'); }
    assert(lanzo, `${rol} ejecutó la limpieza`);
  }
});

// ── Gasto de filamento (20261111110000) ─────────────────────────────────────
console.log('\n▸ Gasto de filamento');

await check('gasto_filamento: igual que filamentUsageByColor/filamentSpendG/Eur de la 7.2', async () => {
  const { filamentUsageByColor, filamentSpendG, filamentSpendEur } = await import('./calculadora-7.2/backend.mjs');
  await comoAdmin();
  const previoCfg = (await client.query(`select data from public.empresa_docs where empresa = '3dcc' and doc = 'config'`)).rows[0]?.data;
  const previoInv = (await client.query(`select data from public.empresa_docs where empresa = '3dcc' and doc = 'inventory'`)).rows[0]?.data;
  const tipos = [{ name: 'PLA', price_per_kg: 20 }, { name: 'PETG', price_per_kg: 25 }];
  const upsert = (doc, data) =>
    client.query(
      `insert into public.empresa_docs (empresa, doc, data) values ('3dcc', $1, $2)
       on conflict (empresa, doc) do update set data = excluded.data`,
      [doc, JSON.stringify(data)]
    );
  await upsert('config', { ...(previoCfg ?? {}), filament_types: tipos });
  const stock = [
    { material: 'PLA', color: 'Negro', ajuste_g: 40 },
    { material: 'PETG', color: 'Verde', ajuste_g: 15.5 }, // solo ajuste, sin pedidos
    { material: 'PLA', color: 'Rojo', ajuste_g: 0 }
  ];
  await upsert('inventory', { filament_stock: stock });
  await client.query(`insert into public.filamentos (material, nombre, orden) values ('PLA', 'PLA', 1) on conflict (material) do nothing`);
  await client.query(`insert into public.colores (filamento_id, nombre, hex) select id, 'Azul', '#0000ff' from public.filamentos where material = 'PLA' on conflict do nothing`);

  // Es el último test: se parte de cero para que los pedidos de los anteriores no cuenten.
  await client.query("delete from public.orders where empresa in ('3dcc', 'silab3d')");
  const base = { estado: 'Aceptado', precio_final: 10, horas: '1', cantidad: 1, notes: '', payment_history: [], notif_history: [], importe_pagado: 0 };
  const pedidos = [
    { id: 'GF000001', filamento: 'PLA', filamento_color: 'Negro', peso_g: '100.5', material_contabilizado: true },
    { id: 'GF000002', filamento: 'PLA', filamento_color: ' negro ', peso_g: '20', material_contabilizado: true },
    { id: 'GF000003', filamento: 'PLA', filamento_color: 'Negro', peso_g: '999', material_contabilizado: false },
    { id: 'GF000004', filamento: 'PLA + PETG', filamento_color: 'Multicolor', peso_g: '60', is_multimaterial: true, material_contabilizado: true,
      material_breakdown: [{ material: 'PLA', color: 'Azul', grams: 35 }, { material: 'PETG', color: 'Verde', grams: 25 }] },
    { id: 'GF000005', filamento: 'PETG', filamento_color: '', peso_g: '12.25', material_contabilizado: true, estado: 'Descartado' },
    { id: 'GF000006', filamento: 'PLA', filamento_color: 'Blanco', peso_g: '0', material_contabilizado: true }
  ].map((p) => ({ ...base, cliente: 'GF', fecha: '2026-11-01', empresa: '3DCC', ...p }));
  for (const p of pedidos) await guardarPedido('3dcc', p.id, p);
  // Otra empresa: no cuenta.
  await guardarPedido('silab3d', 'GF000009', { ...base, id: 'GF000009', filamento: 'PLA', filamento_color: 'Negro', peso_g: '5000', material_contabilizado: true });

  const { rows } = await client.query(`select * from public.gasto_filamento order by material, color`);
  const usage = filamentUsageByColor({ orders: pedidos });
  const esp = (material, color) => {
    const item = stock.find((s) => s.material === material && s.color.toLowerCase() === color.toLowerCase()) ?? { material, color, ajuste_g: 0 };
    return { g: filamentSpendG(item, usage), eur: filamentSpendEur(item, tipos, usage) };
  };
  const fila = (m, c) => rows.find((r) => r.material === m && r.color.toLowerCase() === c.toLowerCase());
  for (const [m, c] of [['PLA', 'Negro'], ['PLA', 'Azul'], ['PETG', 'Verde'], ['PETG', 'Negro'], ['PLA', 'Rojo']]) {
    const r = fila(m, c);
    const e = esp(m, c);
    assert(r, `falta la fila ${m} ${c}`);
    assert(Math.abs(Number(r.total_g) - e.g) < 0.01 && Math.abs(Number(r.equivale_eur) - e.eur) < 0.01,
      `${m} ${c}: vista ${r.total_g} g / ${r.equivale_eur} €, 7.2 ${e.g} g / ${e.eur} €`);
  }
  // Valores concretos: 100,5 + 20 + ajuste 40 = 160,5 g de PLA negro; el no contabilizado y el de SILAB no cuentan.
  assert(Number(fila('PLA', 'Negro').total_g) === 160.5 && fila('PLA', 'Negro').pedidos === 2, JSON.stringify(fila('PLA', 'Negro')));
  assert(Number(fila('PETG', 'Verde').total_g) === 40.5, 'PETG verde: multimaterial 25 + ajuste 15,5');
  assert(fila('PLA', 'Azul'), 'el color del catálogo sin gasto debe salir con 0 g');
  // Anónimo y usuario sin claim: nada (ni siquiera la vista).
  for (const rol of ['anon', 'authenticated']) {
    await client.query('begin');
    let n = -1;
    try {
      await client.query(`set local role ${rol}`);
      await comoAnon();
      n = (await client.query(`select * from public.gasto_filamento where en_pedidos_g > 0`)).rows.length;
    } catch { n = 0; } finally { await client.query('rollback'); await comoAdmin(); }
    assert(n === 0, `${rol} lee el gasto de filamento (${n} filas)`);
  }
  // Limpieza: se restaura lo que había.
  await client.query(`delete from public.orders where id like 'GF0000%'`);
  if (previoCfg) await upsert('config', previoCfg);
  if (previoInv) await upsert('inventory', previoInv); else await client.query(`delete from public.empresa_docs where empresa = '3dcc' and doc = 'inventory'`);
});

// ═══ citas de recogida ═════════════════════════════════════════════════════
console.log('\n▸ Citas de recogida');

await check('huecos de recogida: token, estado, doble reserva y RLS', async () => {
  await comoAdmin();
  const mk = async (nombre) => (await client.query(
    `insert into public.quotes (nombre, email, telefono, material, cantidad, entrega, precio_total, estado)
     values ($1, 'r@example.com', '600000000', 'PLA', 1, 'recogida', 10, 'listo') returning id, codigo, acepta_token`, [nombre])).rows[0];
  const a = await mk('Recoge A');
  const b = await mk('Recoge B');
  const { rows: hs } = await client.query(
    `insert into public.huecos_recogida (inicio) values (now() + interval '1 day'), (now() + interval '2 days'), (now() + interval '1 hour'), (now() + interval '10 years') returning id`);
  const [h1, h2, hPronto, hLejos] = hs.map((r) => r.id);
  await comoAnon();
  const ver = async (q, t) => (await client.query('select * from public.get_huecos_recogida($1, $2)', [q.codigo, t])).rows;
  const pedir = async (q, t, h) => (await client.query('select public.pedir_hueco_recogida($1, $2, $3) as ok', [q.codigo, t, h])).rows[0].ok;
  const otro = '00000000-0000-0000-0000-000000000000';
  assert((await ver(a, otro)).length === 0, 'sin token correcto ve huecos');
  assert(!(await pedir(a, otro, h1)), 'reserva sin token');
  const libres = await ver(a, a.acepta_token);
  assert(libres.length === 2 && !libres.some((h) => h.id === hPronto || h.id === hLejos), 'solo de 2 h a 60 días vista');
  assert(!(await pedir(a, a.acepta_token, hPronto)), 'reserva a menos de 2 h');
  assert(!(await pedir(a, a.acepta_token, hLejos)), 'reserva a 10 años vista');
  assert(await pedir(a, a.acepta_token, h1), 'A no pudo pedir h1');
  assert(!(await pedir(b, b.acepta_token, h1)), 'B pisó el hueco de A');
  assert(!(await ver(b, b.acepta_token)).some((h) => h.id === h1), 'B ve el hueco ocupado de A');
  assert(await pedir(a, a.acepta_token, h2), 'A no pudo cambiar a h2');
  assert(await pedir(b, b.acepta_token, h1), 'h1 no quedó libre al cambiar A');
  await comoAdmin();
  await client.query('update public.huecos_recogida set confirmada = true where id = $1', [h2]);
  await comoAnon();
  assert(!(await pedir(a, a.acepta_token, h1)), 'A movió una cita confirmada');
  const mia = (await ver(a, a.acepta_token)).find((h) => h.mio);
  assert(mia?.id === h2 && mia.confirmada, 'A no ve su cita confirmada');
  for (const rol of ['anon', 'authenticated']) {
    await client.query('begin');
    let n = -1;
    try {
      await client.query(`set local role ${rol}`);
      n = (await client.query('select * from public.huecos_recogida')).rows.length;
    } catch { n = 0; } finally { await client.query('rollback'); }
    assert(n === 0, `${rol} lee huecos_recogida (${n} filas)`);
  }
  await comoAdmin();
  await client.query(`update public.quotes set estado = 'entregado' where id = $1`, [a.id]);
  await comoAnon();
  assert((await ver(a, a.acepta_token)).length === 0, 'tras entregar sigue viendo huecos');
  await comoAdmin();
  await client.query('delete from public.huecos_recogida where id = any($1)', [hs.map((r) => r.id)]);
  await client.query('delete from public.quotes where id = any($1)', [[a.id, b.id]]);
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
