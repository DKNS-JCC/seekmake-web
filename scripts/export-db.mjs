/**
 * Exporta todas las tablas de Supabase a D:\3DCC\export-db\
 * Un .json y un .csv por tabla + un _resumen.txt con el recuento de filas.
 * Solo lectura. Útil como copia antes de aplicar migraciones que tocan datos.
 *
 * Uso (desde D:\3DCC\Web):
 *   node scripts/export-db.mjs
 *
 * ⚠ La carpeta de salida lleva datos personales de clientes: no la subas.
 *
 * Lee las claves de .env / .env.local. Usa la SERVICE_ROLE, asi que
 * se salta RLS y ve TODAS las filas.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

/* ── 1. Cargar .env sin dependencias ─────────────────────────────── */
const env = {}
for (const f of ['.env', '.env.local']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!URL || !KEY) {
  console.error('✗ No encuentro NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}
console.log('→ Proyecto:', URL)
console.log('→ Clave:', env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role (ve todo)' : 'ANON (ojo: RLS puede ocultarte filas)')

const db = createClient(URL, KEY, { auth: { persistSession: false } })

const TABLAS = [
  'recibos', 'cobros', 'quotes', 'quote_events', 'quote_settings', 'orders', 'pedido_estados',
  'envios', 'productos', 'filamentos', 'colores',
  'empresas', 'empresa_users', 'empresa_docs',
  'trabajos', 'trabajos_votos', 'blog_posts',
]

const OUT = path.resolve('..', 'export-db')
fs.mkdirSync(OUT, { recursive: true })

/* ── 2. CSV con jsonb aplanado a texto ───────────────────────────── */
function toCsv(rows) {
  if (!rows.length) return ''
  const cols = [...new Set(rows.flatMap(Object.keys))]
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
}

/* ── 3. Descarga paginada (1000 filas por tanda) ─────────────────── */
const resumen = []

for (const t of TABLAS) {
  let all = [], from = 0, error = null
  for (;;) {
    const { data, error: e } = await db.from(t).select('*').range(from, from + 999)
    if (e) { error = e; break }
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  if (error) {
    console.log(`✗ ${t.padEnd(16)} ${error.message}`)
    resumen.push(`${t.padEnd(16)} ERROR: ${error.message}`)
    continue
  }

  fs.writeFileSync(path.join(OUT, `${t}.json`), JSON.stringify(all, null, 2), 'utf8')
  if (all.length) fs.writeFileSync(path.join(OUT, `${t}.csv`), '\uFEFF' + toCsv(all), 'utf8')

  console.log(`✓ ${t.padEnd(16)} ${String(all.length).padStart(5)} filas`)
  resumen.push(`${t.padEnd(16)} ${String(all.length).padStart(5)} filas`)
}

fs.writeFileSync(path.join(OUT, '_resumen.txt'), resumen.join('\n'), 'utf8')
console.log('\n→ Exportado a', OUT)
