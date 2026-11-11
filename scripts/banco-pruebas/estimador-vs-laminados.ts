// Gramos y horas del estimador frente al laminado real de cada proyecto.
//
//   npx tsx scripts/banco-pruebas/estimador-vs-laminados.ts <carpeta> <tarifas.json> [salida.csv]
//
// <carpeta>: una subcarpeta por proyecto con sus piezas en STL (extraer_piezas.py)
// y `laminado.txt` (las líneas "; clave = valor" de sus gcode, todas las bandejas).
// Las piezas se evalúan tal como están colocadas en el proyecto, con su altura
// de capa, relleno y soportes, en tres configuraciones:
//   A  la de tarifas.json
//   B  A + perfil del taller (migración 20261110130000)
//   C  B + paredes y capas superiores/inferiores del propio proyecto

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analizarPieza } from '../../lib/quote/estimador/analizar';
import { evaluar } from '../../lib/quote/estimador/evaluar';
import { configAnalisis, copiasPorCama, materialDe, perfilDe, SOPORTE_ARBOL } from '../../lib/quote/estimador';
import { percentil } from '../../lib/quote/estadistica';
import { normalizeSettings } from '../../lib/quote/pricing';

const [dir, tarifas, salida] = process.argv.slice(2);
const cruda = JSON.parse(readFileSync(tarifas, 'utf8'));

function leerSTL(path: string): Float32Array {
  const buf = readFileSync(path);
  const n = buf.readUInt32LE(80);
  const out = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) out[t * 9 + k] = buf.readFloatLE(84 + t * 50 + 12 + k * 4);
  return out;
}
const UNIDAD: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };
const seg = (t: string) => [...t.matchAll(/(\d+)([dhms])/g)].reduce((a, m) => a + Number(m[1]) * UNIDAD[m[2]], 0);

function ajustes(variante: 'A' | 'B' | 'C', lam: { paredes: number; arriba: number; abajo: number }) {
  const c = structuredClone(cruda);
  if (variante !== 'A') {
    c.soporte_tipo = 'arbol';
    c.perfil = { ...(c.perfil ?? {}), vParedInt: 250, vSuperior: 200, aParedExt: 3000 };
    c.materiales.PLA = { ...c.materiales.PLA, densidad: 1.23, flujo: 0.987, vol_max: 12, tiempo_min_capa: 4 };
  }
  if (variante === 'C') c.perfil = { ...c.perfil, paredes: lam.paredes, capasSuperiores: lam.arriba, capasInferiores: lam.abajo };
  return normalizeSettings(c);
}

const filas = ['proyecto;impresora;tipo;piezas;laminado_g;laminado_h;A_g;A_h;B_g;B_h;C_g;C_h;lam_entre_C_g;lam_entre_C_h'];
const ratios: Record<string, { g: number[]; h: number[] }> = {};
for (const p of readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory())) {
  const txt = readFileSync(join(dir, p, 'laminado.txt'), 'utf8');
  const todos = (k: string) => [...txt.matchAll(new RegExp('^; ' + k + ' = (.*)$', 'gm'))].map((m) => m[1].trim());
  const lamG = todos('total filament used \\[g\\]').reduce((a, x) => a + Number(x), 0);
  const lamH = todos('estimated printing time \\(normal mode\\)').reduce((a, x) => a + seg(x), 0) / 3600;
  const colores = Math.max(...todos('filament used \\[g\\]').map((l) => l.split(',').filter((x) => Number(x) > 0).length));
  const h = Number(todos('layer_height')[0]) || 0.2;
  const relleno = (parseFloat(todos('sparse_infill_density')[0]) || 15) / 100;
  const soportes = todos('enable_support').some((x) => x === '1');
  const lam = { paredes: Number(todos('wall_loops')[0]) || 2, arriba: Number(todos('top_shell_layers')[0]) || 5, abajo: Number(todos('bottom_shell_layers')[0]) || 3 };
  const material = (todos('filament_type')[0] ?? 'PLA').split(';')[0].toUpperCase();
  const impresora = (todos('printer_model')[0] ?? '').replace(/Creality |Anycubic /, '');

  const grupos = new Map<string, { tri: Float32Array; n: number }>();
  for (const f of readdirSync(join(dir, p)).filter((x) => /\.stl$/i.test(x))) {
    const tri = leerSTL(join(dir, p, f));
    // Piezas iguales colocadas en sitios distintos: misma malla salvo traslación.
    let sx = 0;
    for (let i = 0; i + 5 < tri.length; i += 97) sx += Math.abs(tri[i + 2] - tri[i + 5]);
    const clave = tri.length + '|' + sx.toFixed(1);
    const ya = grupos.get(clave);
    if (ya) ya.n++; else grupos.set(clave, { tri, n: 1 });
  }
  const res: number[] = [];
  for (const v of ['A', 'B', 'C'] as const) {
    const s = ajustes(v, lam);
    const cfg = { ...configAnalisis(s), presets: [{ alturaCapa: h }] };
    let g = 0, t = 0;
    for (const { tri, n } of grupos.values()) {
      const an = analizarPieza(tri, cfg);
      const base = { perfil: perfilDe(s), material: materialDe(s, s.materiales[material] ? material : 'PLA'), preset: 0, relleno, calibracion: { ...(s.soporte_tipo === 'arbol' ? SOPORTE_ARBOL : {}), ...s.calibracion } };
      const porCama = Math.min(n, copiasPorCama(an.bboxMm, base.perfil.cama));
      const llenas = Math.floor(n / porCama), resto = n - llenas * porCama;
      const lote = (k: number) => evaluar(an, { ...base, soportes, copias: k });
      const a = lote(porCama), b = resto ? lote(resto) : null;
      g += a.pesoG * llenas + (b?.pesoG ?? 0);
      t += (a.tiempoS * llenas + (b?.tiempoS ?? 0)) / 3600;
    }
    res.push(g, t);
  }
  const tipo = colores > 1 ? 'multicolor' : soportes ? 'con soportes' : 'sin soportes';
  const clave = (impresora.includes('Kobra') ? 'Kobra X' : 'K1') + ' · ' + tipo;
  (ratios[clave] ??= { g: [], h: [] }).g.push(lamG / res[4]);
  ratios[clave].h.push(lamH / res[5]);
  const f = (x: number) => x.toFixed(2).replace('.', ',');
  filas.push([p, impresora, tipo, [...grupos.values()].reduce((a, x) => a + x.n, 0), f(lamG), f(lamH), ...res.map(f), f(lamG / res[4]), f(lamH / res[5])].join(';'));
  console.log(filas[filas.length - 1].replace(/;/g, ' | '));
}
if (salida) writeFileSync(salida, '﻿' + filas.join('\n') + '\n');
console.log('\nlaminado ÷ estimador (config. C). 1,00 = acierta; <1 = el estimador se pasa');
for (const [k, v] of Object.entries(ratios))
  console.log(k.padEnd(24), 'n=' + v.g.length, '| gramos med', percentil(v.g, 0.5).toFixed(2), 'p90', percentil(v.g, 0.9).toFixed(2), '| horas med', percentil(v.h, 0.5).toFixed(2), 'p90', percentil(v.h, 0.9).toFixed(2));
