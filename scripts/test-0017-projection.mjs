import { readFileSync } from 'fs';
import pg from 'pg';

const M16 = new URL('../supabase/migrations/0016_calculadora.sql', import.meta.url);
const M17 = new URL('../supabase/migrations/0017_calculadora_quotes_link.sql', import.meta.url);
const M18 = new URL('../supabase/migrations/0018_calc_reject_quote.sql', import.meta.url);
const A = '11111111-1111-1111-1111-111111111111'; // usuario 3dcc
const B = '22222222-2222-2222-2222-222222222222'; // usuario silab3d
const Q1 = '99999999-9999-4999-8999-999999999999';

const client = new pg.Client({ host: process.env.PGHOST ?? '127.0.0.1', port: Number(process.env.PGPORT ?? 5544), user: 'postgres', database: 'postgres' });
await client.connect();

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
}

/* ── Stubs Supabase + quotes con la forma real (0012-0014) ──────────────── */
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
  create table if not exists public.quotes (
    id             uuid primary key default gen_random_uuid(),
    codigo         text not null unique,
    estado         text not null default 'nuevo' check (estado in
                     ('nuevo','revisado','aceptado','imprimiendo','listo','entregado','rechazado')),
    pago           text not null default 'pendiente' check (pago in ('pendiente','adelanto','pagado')),
    precio_total   numeric(10,2) not null default 0,
    precio_final   numeric(10,2),
    importe_pagado numeric(10,2) not null default 0,
    archivado      boolean not null default false,
    updated_at     timestamptz not null default now()
  );
  alter table public.quotes enable row level security;
  do $r$ begin create role authenticated nologin; exception when duplicate_object then null; end $r$;
  grant usage on schema public to authenticated;
`);

for (const [name, url] of [['0016', M16], ['0017', M17], ['0018', M18]]) {
  try {
    await client.query(readFileSync(url, 'utf8'));
    check(`migración ${name} se aplica sin errores`, true);
  } catch (e) {
    check(`migración ${name} se aplica sin errores`, false, `→ ${e.message}`);
    process.exit(1);
  }
}
await client.query('grant select, insert, update, delete on all tables in schema public to authenticated');

/* ── Seed ───────────────────────────────────────────────────────────────── */
await client.query(`
  insert into auth.users (id) values ('${A}'), ('${B}');
  insert into public.empresa_users (user_id, empresa) values ('${A}', '3dcc'), ('${B}', 'silab3d');
  insert into public.quotes (id, codigo, precio_total) values ('${Q1}', 'Q-2026-0001', 30.00);
`);

async function asUser(uid, fn, keep = false) {
  await client.query('begin');
  await client.query('set local role authenticated');
  await client.query(`select set_config('request.test_uid', '${uid}', true)`);
  try { await fn(); await client.query(keep ? 'commit' : 'rollback'); }
  catch (e) { await client.query('rollback'); throw e; }
}
const one = async (sql) => (await client.query(sql)).rows[0];
const quote = async () => one(`select estado, pago, precio_final, importe_pagado from public.quotes where id='${Q1}'`);

/* ── Lectura de quotes por empresa ──────────────────────────────────────── */
await asUser(A, async () => {
  const n = Number((await one('select count(*) as n from quotes')).n);
  check('usuario 3DCC ve las quotes (bandeja web)', n === 1);
});
await asUser(B, async () => {
  const n = Number((await one('select count(*) as n from quotes')).n);
  check('usuario SILAB3D NO ve quotes', n === 0);
});
await asUser(A, async () => {
  const r = await client.query(`update quotes set estado='entregado' where id='${Q1}'`);
  check('usuario 3DCC NO puede escribir quotes directamente', r.rowCount === 0);
});

/* ── Proyección al crear pedido enlazado ────────────────────────────────── */
await asUser(A, async () => {
  await client.query(`insert into public.orders (id, empresa, quote_id, data) values
    ('WEBORD01', '3dcc', '${Q1}',
     '{"estado":"Presupuesto enviado","payment_status":"Pendiente","precio_final":42.4,"importe_pagado":0,"is_shared":false,"archived":false}')`);
}, true);
let q = await quote();
check('insert enlazado proyecta estado → revisado', q.estado === 'revisado', `→ ${q.estado}`);
check('insert enlazado proyecta precio_final → 42.40', Number(q.precio_final) === 42.4);

/* ── Proyección al avanzar estado y cobrar ──────────────────────────────── */
await asUser(A, async () => {
  await client.query(`update public.orders set data = data || '{"estado":"En producción","payment_status":"Parcial","importe_pagado":20}' where id='WEBORD01'`);
}, true);
q = await quote();
check('En producción → imprimiendo', q.estado === 'imprimiendo', `→ ${q.estado}`);
check('Parcial → adelanto', q.pago === 'adelanto', `→ ${q.pago}`);
check('importe_pagado proyectado → 20', Number(q.importe_pagado) === 20);

await asUser(A, async () => {
  await client.query(`update public.orders set data = data || '{"estado":"Entregado","payment_status":"Pagado","importe_pagado":42.4}' where id='WEBORD01'`);
}, true);
q = await quote();
check('Entregado/Pagado → entregado/pagado', q.estado === 'entregado' && q.pago === 'pagado');

/* ── Estado desconocido no toca la quote ────────────────────────────────── */
await asUser(A, async () => {
  await client.query(`update public.orders set data = data || '{"estado":"Estado rarísimo legado"}' where id='WEBORD01'`);
}, true);
q = await quote();
check('estado desconocido no altera la quote', q.estado === 'entregado');

/* ── Pedido sin quote_id no dispara nada ────────────────────────────────── */
await asUser(A, async () => {
  await client.query(`insert into public.orders (id, empresa, data) values ('NOLINK01', '3dcc', '{"estado":"Aceptado","payment_status":"Pendiente"}')`);
}, true);
q = await quote();
check('pedido sin enlace no afecta a quotes', q.estado === 'entregado' && q.pago === 'pagado');

/* ── calc_reject_quote (0018) ───────────────────────────────────────────── */
const Q2 = '88888888-8888-4888-8888-888888888888';
await client.query(`insert into public.quotes (id, codigo) values ('${Q2}', 'Q-2026-0002')`);

await asUser(A, async () => {
  const r = await one(`select * from public.calc_reject_quote('${Q2}')`);
  check('3DCC puede rechazar una solicitud activa', r.ok === true && r.estado === 'rechazado');
}, true);
const q2 = await one(`select estado from public.quotes where id='${Q2}'`);
check('la quote queda rechazada', q2.estado === 'rechazado');

await asUser(A, async () => {
  const r = await one(`select * from public.calc_reject_quote('${Q1}')`);
  check('no se puede rechazar una quote terminal (entregado)', r.ok === false);
});

let bRejected = false;
try {
  await asUser(B, async () => { await one(`select * from public.calc_reject_quote('${Q2}')`); });
} catch (e) {
  bRejected = /3DCC/.test(e.message);
}
check('SILAB3D no puede rechazar solicitudes web', bRejected);

console.log(`\n${pass} PASS / ${fail} FAIL`);
await client.end();
process.exit(fail ? 1 : 0);
