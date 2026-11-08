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
const uri = execFileSync(
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

await check('quote_settings pasa a modo calculadora con mínimo 7 €', async () => {
  const { rows } = await client.query('select config from public.quote_settings where id = 1');
  const c = rows[0].config;
  assert(c.modo_precio === 'calculadora', `modo ${c.modo_precio}`);
  assert(Number(c.precio_minimo) === 7, `mínimo ${c.precio_minimo}`);
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

// ── Cierre ─────────────────────────────────────────────────────────────────
await client.end();
pararServidor();
console.log(
  fallos === 0
    ? '\n\x1b[32mTodas las comprobaciones de base de datos OK\x1b[0m\n'
    : `\n\x1b[31m${fallos} fallo(s)\x1b[0m\n`
);
process.exit(fallos === 0 ? 0 : 1);
