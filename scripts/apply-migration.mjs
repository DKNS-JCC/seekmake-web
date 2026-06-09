// One-shot migration runner for environments without the Supabase CLI token.
// Usage: node scripts/apply-migration.mjs supabase/migrations/0012_quotes.sql
// Connects with the pooler URL from supabase/.temp/pooler-url and the
// password stored in db.key.

import { readFileSync } from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('Uso: node scripts/apply-migration.mjs <ruta.sql>');
  process.exit(1);
}

const poolerUrl = readFileSync('supabase/.temp/pooler-url', 'utf8').trim();
const password = readFileSync('db.key', 'utf8').trim();
const url = new URL(poolerUrl);
url.password = encodeURIComponent(password);

const sql = readFileSync(file, 'utf8');

const client = new pg.Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  await client.query(sql);
  console.log('OK — migración aplicada:', file);
} catch (err) {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
