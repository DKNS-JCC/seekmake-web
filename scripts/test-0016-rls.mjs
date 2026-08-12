import { readFileSync } from 'fs';
import pg from 'pg';

const MIGRATION = new URL('../supabase/migrations/0016_calculadora.sql', import.meta.url);
const A = '11111111-1111-1111-1111-111111111111'; // usuario 3dcc
const B = '22222222-2222-2222-2222-222222222222'; // usuario silab3d

const client = new pg.Client({ host: process.env.PGHOST ?? '127.0.0.1', port: Number(process.env.PGPORT ?? 5544), user: 'postgres', database: 'postgres' });
await client.connect();

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

/* ── Stubs del entorno Supabase ─────────────────────────────────────────── */
await client.query(`
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.test_uid', true), '')::uuid $$;
  create or replace function auth.jwt() returns jsonb language sql stable as
    $$ select '{}'::jsonb $$;
  create or replace function public.is_admin() returns boolean
    language sql stable security definer set search_path = public as
    $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false) $$;
  create or replace function public.touch_updated_at() returns trigger language plpgsql as
    $f$ begin new.updated_at = now(); return new; end; $f$;
  create table if not exists public.quotes (id uuid primary key default gen_random_uuid());
  do $r$ begin create role authenticated nologin; exception when duplicate_object then null; end $r$;
  grant usage on schema public to authenticated;
`);

/* ── Migración ──────────────────────────────────────────────────────────── */
try {
  await client.query(readFileSync(MIGRATION, 'utf8'));
  check('migración 0016 se aplica sin errores', true);
} catch (e) {
  check('migración 0016 se aplica sin errores', false, `→ ${e.message}`);
  process.exit(1);
}
// Idempotencia: segunda pasada no debe fallar.
try {
  await client.query(readFileSync(MIGRATION, 'utf8'));
  check('migración es idempotente (2ª pasada)', true);
} catch (e) {
  check('migración es idempotente (2ª pasada)', false, `→ ${e.message}`);
}
await client.query('grant select, insert, update, delete on all tables in schema public to authenticated');

/* ── Seed (superusuario, sin RLS) ───────────────────────────────────────── */
await client.query(`
  insert into auth.users (id) values ('${A}'), ('${B}');
  insert into public.empresa_users (user_id, empresa) values ('${A}', '3dcc'), ('${B}', 'silab3d');
  insert into public.empresa_docs (empresa, doc, data) values
    ('3dcc',    'config',     '{"printers": []}'),
    ('3dcc',    'inventory',  '{"filament_stock": [{"material":"PLA","color":"Negro","remaining_g":500}]}'),
    ('3dcc',    'clients',    '{"clients": []}'),
    ('3dcc',    'calc_state', '{}'),
    ('silab3d', 'config',     '{"printers": []}'),
    ('silab3d', 'inventory',  '{"filament_stock": [{"material":"PLA","color":"Rojo","remaining_g":300}]}'),
    ('silab3d', 'clients',    '{"clients": []}'),
    ('silab3d', 'calc_state', '{}');
  insert into public.orders (id, empresa, data) values
    ('AAA11111', '3dcc',    '{"estado":"Aceptado","is_shared":false,"archived":false}'),
    ('BBB11111', 'silab3d', '{"estado":"En producción","is_shared":false,"archived":false}'),
    ('BBB22222', 'silab3d', '{"estado":"Aceptado","is_shared":true,"archived":false}'),
    ('BBB33333', 'silab3d', '{"estado":"Entregado","is_shared":true,"archived":true}');
`);

/* ── Sesión de prueba ───────────────────────────────────────────────────── */
async function asUser(uid, fn) {
  await client.query('begin');
  await client.query('set local role authenticated');
  await client.query(`select set_config('request.test_uid', '${uid}', true)`);
  try { await fn(); } finally { await client.query('rollback'); }
}
const one = async (sql) => (await client.query(sql)).rows[0];
const count = async (sql) => Number((await one(sql)).n);

/* ── Usuario A (3dcc): lecturas ─────────────────────────────────────────── */
await asUser(A, async () => {
  const ue = await one('select public.user_empresa() as e');
  check('user_empresa() devuelve 3dcc', ue.e === '3dcc', `→ ${ue.e}`);

  check('A ve todos los docs de ambas empresas (8, ghost mode)',
    await count('select count(*) as n from empresa_docs') === 8);
  check('A ve clients del socio (ghost mode)',
    await count("select count(*) as n from empresa_docs where empresa='silab3d' and doc='clients'") === 1);

  check('A ve sus pedidos + todos los del socio (4, ghost mode)',
    await count('select count(*) as n from orders') === 4);
  check('filtro loadPartnerSharedOrders (socio, is_shared, no archivado) = 1',
    await count("select count(*) as n from orders where empresa='silab3d' and is_shared and not archived") === 1);

  const gen = await one("select estado, is_shared from orders where id='BBB22222'");
  check('columnas generadas (estado/is_shared) correctas',
    gen.estado === 'Aceptado' && gen.is_shared === true);
});

/* ── Usuario A (3dcc): escrituras ───────────────────────────────────────── */
await asUser(A, async () => {
  let r = await client.query(`update empresa_docs set data = '{"filament_stock":[]}' where empresa='silab3d' and doc='inventory'`);
  check('A puede escribir inventory del socio (pool compartido)', r.rowCount === 1);

  r = await client.query(`update empresa_docs set data = '{}' where empresa='silab3d' and doc='config'`);
  check('A NO puede escribir config del socio', r.rowCount === 0);

  r = await client.query(`update empresa_docs set data = '{}' where empresa='silab3d' and doc='clients'`);
  check('A NO puede escribir clients del socio', r.rowCount === 0);

  r = await client.query(`insert into orders (id, empresa, data) values ('AAA22222', '3dcc', '{"estado":"Presupuesto enviado","is_shared":false,"archived":false}')`);
  check('A puede crear pedidos propios', r.rowCount === 1);

  r = await client.query(`update orders set data = jsonb_set(data, '{estado}', '"Entregado"') where id='AAA11111'`);
  check('A puede actualizar pedidos propios', r.rowCount === 1);
  const est = await one("select estado from orders where id='AAA11111'");
  check('columna generada estado se actualiza con data', est.estado === 'Entregado');

  r = await client.query(`update orders set data = jsonb_set(data, '{estado}', '"Entregado"') where id='BBB22222'`);
  check('A NO puede modificar pedidos del socio (solo lectura)', r.rowCount === 0);

  r = await client.query(`delete from orders where id='AAA11111'`);
  check('A puede borrar pedidos propios', r.rowCount === 1);
});

/* ── Usuario A: insert para el socio debe fallar ────────────────────────── */
await asUser(A, async () => {
  try {
    await client.query(`insert into orders (id, empresa, data) values ('HACK0001', 'silab3d', '{}')`);
    check('A NO puede crear pedidos a nombre del socio', false);
  } catch (e) {
    check('A NO puede crear pedidos a nombre del socio', e.code === '42501', `→ ${e.code} ${e.message}`);
  }
});

/* ── Usuario B (silab3d): simetría ──────────────────────────────────────── */
await asUser(B, async () => {
  const ue = await one('select public.user_empresa() as e');
  check('user_empresa() devuelve silab3d', ue.e === 'silab3d');
  check('B ve sus 3 pedidos + el de A (4)',
    await count('select count(*) as n from orders') === 4
    && await count("select count(*) as n from orders where id='AAA11111'") === 1);
  const r = await client.query(`update empresa_docs set data = '{"filament_stock":[]}' where empresa='3dcc' and doc='inventory'`);
  check('B puede escribir inventory de 3DCC (pool en ambos sentidos)', r.rowCount === 1);
  check('B NO ve las filas de empresa_users de otros',
    await count('select count(*) as n from empresa_users') === 1);
});

/* ── Sin sesión (uid vacío) ─────────────────────────────────────────────── */
await asUser('', async () => {
  check('sin uid: no ve docs', await count('select count(*) as n from empresa_docs') === 0);
  check('sin uid: no ve pedidos', await count('select count(*) as n from orders') === 0);
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
await client.end();
process.exit(fail ? 1 : 0);
