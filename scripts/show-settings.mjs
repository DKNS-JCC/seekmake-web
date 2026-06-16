// Print the live quote_settings config.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = new URL(readFileSync('supabase/.temp/pooler-url', 'utf8').trim());
url.password = encodeURIComponent(readFileSync('db.key', 'utf8').trim());
const client = new pg.Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false }
});
await client.connect();
const r = await client.query('select config from quote_settings where id = 1');
console.log(JSON.stringify(r.rows[0]?.config, null, 1));
await client.end();
