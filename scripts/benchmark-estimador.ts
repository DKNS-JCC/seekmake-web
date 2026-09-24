// Kit de calibración del estimador contra TUS laminados de OrcaSlicer.
//
// 1. Mete en una carpeta los STL (tal cual te los mandan los clientes).
// 2. Lamínalos en Orca con tu perfil habitual y apunta en `orca.csv`:
//
//      archivo;gramos;minutos;capa;relleno;material;soportes
//      soporte.stl;23.4;71;0.2;15;PLA;no
//      figura.stl;41.0;188;0.2;15;PLA;si
//
//    (gramos y minutos = "Total" de la vista previa de Orca; relleno en %;
//    soportes si/no según lo activaste.)
// 3. npx tsx scripts/benchmark-estimador.ts <carpeta> [tarifas.json]
//
// Imprime el error pieza a pieza y la corrección de peso/tiempo que
// igualaría la mediana — el mismo número que "Corrección peso/tiempo (%)"
// en /admin/tarifas. `tarifas.json` es opcional: el config de
// quote_settings (scripts/show-settings.mjs > tarifas.json) para usar tu
// perfil y correcciones actuales.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analizarPieza } from '../lib/quote/estimador/analizar';
import { evaluar } from '../lib/quote/estimador/evaluar';
import { elegirOrientacion } from '../lib/quote/estimador/orientar';
import { configAnalisis, costeOrientacion, materialDe, perfilDe, SOPORTE_ARBOL } from '../lib/quote/estimador';
import { normalizeSettings } from '../lib/quote/pricing';

function leerSTL(path: string): Float32Array {
  const buf = readFileSync(path);
  const n = buf.length >= 84 ? buf.readUInt32LE(80) : 0;
  if (84 + n * 50 === buf.length) {
    const out = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) {
      const o = 84 + t * 50 + 12;
      for (let k = 0; k < 9; k++) out[t * 9 + k] = buf.readFloatLE(o + k * 4);
    }
    return out;
  }
  const v: number[] = [];
  const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
  let m;
  const txt = buf.toString('utf8');
  while ((m = re.exec(txt))) v.push(+m[1], +m[2], +m[3]);
  return new Float32Array(v);
}

const [dir, tarifas] = process.argv.slice(2);
if (!dir || !existsSync(join(dir, 'orca.csv'))) {
  console.error('Uso: npx tsx scripts/benchmark-estimador.ts <carpeta con STL + orca.csv> [tarifas.json]');
  process.exit(1);
}
const s = normalizeSettings(tarifas ? JSON.parse(readFileSync(tarifas, 'utf8')) : null);
const filas = readFileSync(join(dir, 'orca.csv'), 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.toLowerCase().startsWith('archivo'))
  .map((l) => l.split(/[;,\t]/).map((x) => x.trim()));

const ratiosG: number[] = [], ratiosT: number[] = [];
console.log('archivo'.padEnd(28), 'Orca g', 'web g', '  err', ' Orca min', 'web min', '  err', ' orient.');
for (const [archivo, g, min, capa = '0.2', relleno = '15', material = 'PLA', sop = 'no'] of filas) {
  const ruta = join(dir, archivo);
  if (!existsSync(ruta)) {
    console.log(archivo.padEnd(28), 'no encontrado');
    continue;
  }
  const tri = leerSTL(ruta);
  const h = Number(capa);
  const cfg = { ...configAnalisis(s), presets: [{ alturaCapa: h }] };
  const pieza = { material, resistenciaId: 'estandar', detalleId: 'estandar' };
  // Same orientation logic as the web, priced at this layer height.
  const res = elegirOrientacion(tri, cfg, costeOrientacion({ ...s, detalle: [{ id: 'estandar', altura_capa_mm: h }] }, pieza), {
    auto: s.orientacion_auto,
    tolerancia: s.orientacion_tolerancia_pct / 100
  });
  const soportes = /^s/i.test(sop);
  const e = evaluar(res.analisis ?? analizarPieza(tri, cfg), {
    perfil: perfilDe(s),
    material: materialDe(s, material),
    preset: 0,
    relleno: Number(relleno) / 100,
    soportes,
    calibracion: { ...(s.soporte_tipo === 'arbol' ? SOPORTE_ARBOL : {}), ...s.calibracion }
  });
  const rg = Number(g) / e.pesoG, rt = (Number(min) * 60) / e.tiempoS;
  ratiosG.push(rg);
  ratiosT.push(rt);
  // Web error relative to Orca (+ = the web quotes more).
  const pct = (r: number) => {
    const e = (1 / r - 1) * 100;
    return `${e > 0 ? '+' : ''}${e.toFixed(0)}%`.padStart(5);
  };
  console.log(
    archivo.slice(0, 28).padEnd(28),
    Number(g).toFixed(1).padStart(6), e.pesoG.toFixed(1).padStart(6), pct(rg),
    String(min).padStart(9), (e.tiempoS / 60).toFixed(0).padStart(7), pct(rt),
    res.original ? ' original' : ' girada'
  );
}
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
if (ratiosG.length) {
  const mae = (xs: number[]) => (xs.reduce((a, r) => a + Math.abs(1 / r - 1), 0) / xs.length) * 100;
  const cg = mediana(ratiosG) * (s.calibracion.peso ?? 1);
  const ct = mediana(ratiosT) * (s.calibracion.tiempo ?? 1);
  console.log(`\n${ratiosG.length} piezas · error medio web vs Orca: peso ${mae(ratiosG).toFixed(1)} %, tiempo ${mae(ratiosT).toFixed(1)} %`);
  console.log(`Corrección sugerida en /admin/tarifas → peso ${((cg - 1) * 100).toFixed(1)} %, tiempo ${((ct - 1) * 100).toFixed(1)} %`);
  console.log('(la orientación la elige el estimador: si en Orca la pusiste de otra forma, anótalo)');
}
