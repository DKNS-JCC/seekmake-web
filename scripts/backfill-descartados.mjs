/**
 * Backfill único: marca como 'Descartado' los presupuestos históricos que
 * siguen en estado inicial, sin cobro, y con más de 15 días de antigüedad.
 *
 * El barrido automático de la Calculadora NO los coge porque ya están
 * archivados (y archivar significa "ya me ocupé de esto"). Esto es la
 * limpieza de una sola vez del histórico.
 *
 * Mismo criterio que isStaleQuote() de la Calculadora: solo presupuestos
 * sin respuesta ('Presupuesto enviado' / legado 'Enviado'). Un pedido
 * 'Aceptado' sin cobrar NO se descarta: el cliente dijo que sí, y desde la
 * migración 0026 descartarlo lo marcaría como rechazado en su página de
 * seguimiento.
 *
 * Tras 0026-0028 el guardado pasa por los triggers: la quote enlazada (si la
 * hay) pasa a 'rechazado' y el dinero se sigue calculando del libro.
 *
 * Uso (desde D:\3DCC\Web):
 *   node scripts/backfill-descartados.mjs          → simulacro, no escribe nada
 *   node scripts/backfill-descartados.mjs --apply  → aplica los cambios
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const APPLY = process.argv.includes('--apply')
const EMPRESA = '3dcc'
const DIAS = 15

const env = {}
for (const f of ['.env', '.env.local']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const lastTs = (d) => {
  for (const c of [d.last_status_update, d.created_at]) {
    if (!c) continue
    const t = new Date(c).getTime()
    if (!Number.isNaN(t)) return t
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') ? new Date(d.fecha + 'T00:00:00').getTime() : 0
}

const { data: rows, error } = await db.from('orders').select('*').eq('empresa', EMPRESA)
if (error) { console.error('✗', error.message); process.exit(1) }

const now = Date.now()
const hits = rows.filter(r => {
  const d = r.data || {}
  if (!['Presupuesto enviado', 'Enviado'].includes(d.estado)) return false
  if (Number(d.importe_pagado || 0) > 0) return false
  const ts = lastTs(d)
  return ts > 0 && (now - ts) > DIAS * 86400000
})

console.log(`${APPLY ? 'APLICANDO' : 'SIMULACRO (usa --apply para escribir)'} · ${hits.length} pedidos\n`)
let total = 0
for (const r of hits) {
  const d = r.data
  const dias = Math.floor((now - lastTs(d)) / 86400000)
  total += Number(d.precio_final || 0)
  console.log(`  #${d.id}  ${d.fecha}  ${String(d.cliente || '-').padEnd(22)} ${String(d.descripcion || '').slice(0, 28).padEnd(30)} ${String(dias).padStart(4)}d  ${Number(d.precio_final || 0).toFixed(2)} €`)

  if (!APPLY) continue
  const nuevo = {
    ...d,
    estado: 'Descartado',
    archived: true,
    last_status_update: new Date().toISOString(),
    auto_discarded_at: new Date().toISOString(),
    notes: (d.notes ? d.notes + '\n' : '') + `[AUTO-DESCARTADO (backfill) · ${dias} días sin respuesta]`,
  }
  const { error: e } = await db.from('orders').update({ data: nuevo }).eq('id', r.id).eq('empresa', EMPRESA)
  if (e) console.log(`     ✗ ${e.message}`)
}
console.log(`\n  ${total.toFixed(2)} € que dejan de figurar como pendiente.`)
if (!APPLY) console.log('\n  Nada escrito. Repite con --apply si estás conforme.')
