// Qué habría dado el tasador de la web para proyectos ya cobrados.
//
//   npx tsx scripts/banco-pruebas/comparar-cobrado.ts <carpeta> <tarifas.json> [factores.json]
//
// <carpeta> tiene una subcarpeta por proyecto con un STL por pieza colocada
// (extraer_piezas.py, en esta carpeta, los saca del .3mf del proyecto). Las piezas
// iguales se agrupan en una con cantidad N, como las subiría un cliente.
// factores.json: { "proyecto": 4 } multiplica las cantidades (el proyecto
// guarda una unidad y el pedido fue de cuatro).
// Todo en PLA, calidad y resistencia estándar, un color, recogida.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { configAnalisis, costeOrientacion } from '../../lib/quote/estimador';
import { elegirOrientacion } from '../../lib/quote/estimador/orientar';
import { computeQuote, normalizeSettings, type PiezaInput } from '../../lib/quote/pricing';

function leerSTL(path: string): Float32Array {
  const buf = readFileSync(path);
  const n = buf.readUInt32LE(80);
  const out = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) out[t * 9 + k] = buf.readFloatLE(84 + t * 50 + 12 + k * 4);
  return out;
}

function medidas(tri: Float32Array) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let vol = 0;
  for (let i = 0; i < tri.length; i += 9) {
    for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) {
      const x = tri[i + v * 3 + k];
      if (x < min[k]) min[k] = x;
      if (x > max[k]) max[k] = x;
    }
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tri.subarray(i, i + 9);
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return { d: max.map((m, k) => m - min[k]), vol: Math.abs(vol) };
}

const [dir, tarifas, factoresPath] = process.argv.slice(2);
const s = normalizeSettings(JSON.parse(readFileSync(tarifas, 'utf8')));
const factores: Record<string, number> = factoresPath ? JSON.parse(readFileSync(factoresPath, 'utf8')) : {};
const cfg = configAnalisis(s);
const coste = costeOrientacion(s, { material: 'PLA', resistenciaId: 'estandar', detalleId: 'estandar' });

console.log(['proyecto', 'piezas', 'unidades', 'est_g', 'est_h', 'tasador_eur', 'minimo'].join('\t'));
for (const p of readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory())) {
  const grupos = new Map<string, PiezaInput>();
  for (const f of readdirSync(join(dir, p)).filter((x) => /\.stl$/i.test(x))) {
    const tri = leerSTL(join(dir, p, f));
    const m = medidas(tri);
    const clave = `${tri.length}|${m.d.map((x) => x.toFixed(1)).sort().join('|')}|${m.vol.toFixed(0)}`;
    const ya = grupos.get(clave);
    if (ya) { ya.cantidad++; continue; }
    const r = elegirOrientacion(tri, cfg, coste, { auto: s.orientacion_auto, tolerancia: s.orientacion_tolerancia_pct / 100 });
    grupos.set(clave, {
      nombre: f,
      // El visor de la web trabaja con Y hacia arriba: la altura va en y.
      metrics: { volumenCm3: m.vol / 1000, areaCm2: 0, bboxMm: { x: m.d[0], y: m.d[2], z: m.d[1] }, triangulos: tri.length / 9, mallas: 1, overhangCm2: 0 } as PiezaInput['metrics'],
      analisis: r.analisis,
      cantidad: 1,
      material: 'PLA',
      colores: [{ nombre: 'Negro', hex: '#000000', acabado: null }],
      resistenciaId: 'estandar',
      detalleId: 'estandar'
    });
  }
  const k = factores[p] ?? 1;
  const piezas = [...grupos.values()].map((x) => ({ ...x, cantidad: Math.max(1, Math.round(x.cantidad * k)) }));
  const q = computeQuote(piezas, s, 'recogida');
  console.log([p, piezas.length, q.unidades, q.pesoG.toFixed(1), q.tiempoH.toFixed(2), q.total.toFixed(2), q.minimoAplicado ? 'sí' : ''].join('\t'));
}
