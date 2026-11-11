// ¿La tarifa del tasador está centrada con lo que se cobró en los pedidos?
//
//   npx tsx scripts/banco-pruebas/tarifa-vs-pedidos.ts <orders.json> <tarifas.json> [salida.csv]
//
// orders.json: filas de la tabla `orders`. Solo se miran los pedidos de 3DCC
// que fueron impresión pura (sin diseño, postprocesado, urgencia, gastos ni
// multimaterial) y se les pasa por el motor con SUS gramos y horas: aquí no
// interviene el estimador, solo la tarifa.

import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeSettings } from '../../lib/quote/pricing';
import { percentil } from '../../lib/quote/estadistica';
import * as motor from '../../supabase/functions/_shared/precios';

const [ordersPath, tarifas, salida] = process.argv.slice(2);
const s = normalizeSettings(JSON.parse(readFileSync(tarifas, 'utf8')));
const pedidos = (JSON.parse(readFileSync(ordersPath, 'utf8')) as { empresa: string; data: Record<string, any> }[])
  .filter((o) => o.empresa === '3dcc').map((o) => o.data);

const pura = (d: Record<string, any>) =>
  d.diseno_modelado === 'No necesario' && d.postprocesado_label === 'No' &&
  (d.urgencia_nivel ?? 'Normal') === 'Normal' && !Number(d.recargo_urgencia) && !Number(d.gasto_misc) &&
  !d.is_multimaterial && (d.busqueda_modelos ?? 'No') === 'No' && (d.eliminacion_soportes ?? 'No') === 'No' &&
  d.markup_label === 'Normal (230%)' && s.materiales[String(d.filamento).trim()] && Number(d.peso_g) > 0 && Number(d.horas) > 0;

const filas: string[] = ['pedido;descripcion;uds;material;gramos;horas;riesgo;cobrado;web;web_entre_cobrado;minimo_web'];
const ratios: number[] = [];
const porRiesgo: Record<string, number[]> = {};
for (const d of pedidos.filter(pura)) {
  const n = Math.max(1, Math.floor(Number(d.cantidad) || 1));
  const q = motor.cotizar([{
    nombre: 'p', material: String(d.filamento).trim(), cantidad: n,
    colores: [{ nombre: 'x', hex: '#000000', acabado: null }], resistenciaId: 'estandar', detalleId: 'estandar',
    pesoG: Number(d.peso_g) / n, soporteG: 0, tiempoH: Number(d.horas) / n,
    metodo: 'capas', porCama: n, camas: 1, conSoportes: false
  }], s as never, 'recogida');
  const cobrado = Number(d.precio_final);
  const r = q.total / cobrado;
  const riesgo = String(d.probabilidad_error_label).replace(/ \(.*/, '');
  if (!q.minimoAplicado && cobrado > 5.01) { ratios.push(r); (porRiesgo[riesgo] ??= []).push(r); }
  const f = (x: number) => x.toFixed(2).replace('.', ',');
  filas.push([String(d.id).slice(0, 8).toUpperCase(), String(d.descripcion).replace(/[;\n]/g, ' ').slice(0, 40), n, d.filamento, f(Number(d.peso_g)), f(Number(d.horas)), riesgo, f(cobrado), f(q.total), f(r), q.minimoAplicado ? 'sí' : ''].join(';'));
}
if (salida) writeFileSync(salida, '\ufeff' + filas.join('\n') + '\n');
console.log(filas.map((l) => l.replace(/;/g, ' | ')).join('\n'));
const res = (xs: number[]) => `n=${xs.length}  mediana ${percentil(xs, 0.5).toFixed(2)}  p10 ${percentil(xs, 0.1).toFixed(2)}  p90 ${percentil(xs, 0.9).toFixed(2)}`;
console.log(`\nweb ÷ cobrado (sin los que caen en el mínimo de cualquiera de los dos)\ntodos: ${res(ratios)}`);
for (const [k, v] of Object.entries(porRiesgo)) console.log(`riesgo ${k}: ${res(v)}`);
