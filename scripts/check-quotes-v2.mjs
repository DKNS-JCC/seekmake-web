// Sanity check for migration 0013 (estados v2, pagos, archivos, pg_cron).
import { readFileSync } from 'node:fs';
import pg from 'pg';

const poolerUrl = readFileSync('supabase/.temp/pooler-url', 'utf8').trim();
const password = readFileSync('db.key', 'utf8').trim();
const url = new URL(poolerUrl);
url.password = encodeURIComponent(password);

const client = new pg.Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false }
});
await client.connect();

const cols = await client.query(
  `select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'quotes'
     and column_name in ('pago','importe_pagado','precio_final','archivado','archivos',
                         'archivo_nombre','archivo_url','archivo_tamano')`
);
console.log('Columnas quotes:', cols.rows.map((r) => r.column_name).join(', '));

const estado = await client.query(
  `select pg_get_constraintdef(oid) as def from pg_constraint
   where conname = 'quotes_estado_check'`
);
console.log('Check estado:', estado.rows[0]?.def?.slice(0, 140));

try {
  const jobs = await client.query(`select jobname, schedule from cron.job`);
  console.log('Jobs pg_cron:', JSON.stringify(jobs.rows));
} catch (e) {
  console.log('pg_cron NO disponible:', e.message);
}

await client.end();
