// Post-migration sanity check for 0012 (tasador).
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

const tables = await client.query(
  `select table_name from information_schema.tables
   where table_schema = 'public' and table_name in ('quotes', 'quote_settings')`
);
const fn = await client.query(
  `select proname from pg_proc where proname in ('get_quote_status', 'next_quote_codigo')`
);
const bucket = await client.query(
  `select id, public, file_size_limit from storage.buckets where id = 'quote-uploads'`
);
const seed = await client.query(
  `select config->'materiales'->'PLA' as pla, config->'precio_minimo' as minimo,
          config->'plazo_horas_dia' as plazo
   from public.quote_settings where id = 1`
);
const codigo = await client.query(`select public.next_quote_codigo() as c`);

console.log('Tablas:   ', tables.rows.map((r) => r.table_name).join(', '));
console.log('Funciones:', fn.rows.map((r) => r.proname).join(', '));
console.log('Bucket:   ', JSON.stringify(bucket.rows[0]));
console.log('Seed:     ', JSON.stringify(seed.rows[0]));
console.log('Código de prueba generado:', codigo.rows[0].c);

await client.end();
