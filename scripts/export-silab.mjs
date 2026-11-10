/**
 * Fase 0 del plan Calculadora→web: vuelca empresa_docs y orders de SILAB3D
 * a un JSON FUERA del repo (por defecto D:\3DCC\export-silab\). Solo lectura.
 *
 * Uso (desde la raíz del repo, con SUPABASE_SERVICE_ROLE_KEY en .env.local):
 *   node scripts/export-silab.mjs [carpeta-de-salida]
 *
 * ⚠ Lleva datos personales: no la subas ni la dejes dentro del repo.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const env = {}
for (const f of ['.env', '.env.local']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✗ Falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (RLS ocultaría filas con la anon)')
  process.exit(1)
}
const db = createClient(URL, KEY, { auth: { persistSession: false } })
const OUT = path.resolve(process.argv[2] || path.join('..', 'export-silab'))
if (path.relative(process.cwd(), OUT).split(path.sep)[0] !== '..' && !path.isAbsolute(path.relative(process.cwd(), OUT))) {
  console.error('✗ La salida debe quedar fuera del repo:', OUT)
  process.exit(1)
}
fs.mkdirSync(OUT, { recursive: true })

for (const t of ['empresa_docs', 'orders']) {
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(t).select('*').eq('empresa', 'silab3d').range(from, from + 999)
    if (error) { console.error(`✗ ${t}: ${error.message}`); process.exit(1) }
    all.push(...data)
    if (data.length < 1000) break
  }
  fs.writeFileSync(path.join(OUT, `${t}.json`), JSON.stringify(all, null, 2), 'utf8')
  console.log(`✓ ${t.padEnd(13)} ${all.length} filas`)
}
console.log('→ Exportado a', OUT)
