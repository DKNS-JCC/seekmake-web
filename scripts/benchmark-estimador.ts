// Banco de pruebas del estimador contra laminados REALES de OrcaSlicer.
//
// Carpeta con, por cada pieza:
//   nombre.stl                      el modelo
//   nombre.gcode  o  nombre.gcode.3mf   el laminado exportado ("Exportar archivo
//                                   laminado de la bandeja"); el .3mf de proyecto no sirve
// y, opcional, `piezas.csv` (separador ; o ,) para lotes y piezas pesadas:
//   archivo;copias;peso_g;minutos
//   soporte;1;;
//   llavero;8;52.3;190        ← 8 copias en la bandeja; peso y tiempo medidos
//                                (si se rellenan, mandan sobre los del gcode)
//
//   npx tsx scripts/benchmark-estimador.ts <carpeta> [tarifas.json]
//
// Capa, relleno, material y soportes salen del propio gcode. `tarifas.json`
// es opcional: el config de quote_settings (scripts/show-settings.mjs) para
// usar el perfil y la calibración actuales. Salida por TIPO de pieza
// (sin soportes, con soportes, multicolor, lote): mediana y percentil 90 de
// real ÷ estimado en gramos, horas y precio. Nunca una media global.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, parse } from 'node:path';
import { analizarPieza } from '../lib/quote/estimador/analizar';
import { evaluar } from '../lib/quote/estimador/evaluar';
import { elegirOrientacion } from '../lib/quote/estimador/orientar';
import { configAnalisis, costeOrientacion, copiasPorCama, materialDe, perfilDe, SOPORTE_ARBOL } from '../lib/quote/estimador';
import { percentil } from '../lib/quote/estadistica';
import { leerLaminado } from '../lib/quote/gcode';
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

type Tipo = 'sin soportes' | 'con soportes' | 'multicolor' | 'lote';
const TIPOS: Tipo[] = ['sin soportes', 'con soportes', 'multicolor', 'lote'];
// Una pieza cae en un solo tipo; manda el más "caro de acertar".
const tipoDe = (colores: number, copias: number, soportes: boolean): Tipo =>
  colores > 1 ? 'multicolor' : copias > 1 ? 'lote' : soportes ? 'con soportes' : 'sin soportes';

function main(dir: string, tarifas?: string) {
  const s = normalizeSettings(tarifas ? JSON.parse(readFileSync(tarifas, 'utf8')) : null);
  const archivos = readdirSync(dir);
  const extra = new Map<string, { copias: number; peso?: number; min?: number }>();
  const csv = archivos.find((f) => f.toLowerCase() === 'piezas.csv');
  if (csv) {
    for (const l of readFileSync(join(dir, csv), 'utf8').split(/\r?\n/).slice(1)) {
      const [a, c, g, m] = l.split(/[;,\t]/).map((x) => x.trim());
      if (a) extra.set(parse(a).name.toLowerCase(), { copias: Number(c) || 1, peso: Number(g) || undefined, min: Number(m) || undefined });
    }
  }

  const grupos: Record<Tipo, { g: number[]; h: number[]; p: number[] }> = {
    'sin soportes': { g: [], h: [], p: [] },
    'con soportes': { g: [], h: [], p: [] },
    multicolor: { g: [], h: [], p: [] },
    lote: { g: [], h: [], p: [] }
  };
  console.log('pieza'.padEnd(24), 'tipo'.padEnd(13), 'real g', 'est. g', ' real h', ' est. h', ' real €', ' est. €');
  for (const stl of archivos.filter((f) => /\.stl$/i.test(f))) {
    const nombre = parse(stl).name;
    const lam = archivos.find((f) => f.toLowerCase() === `${nombre.toLowerCase()}.gcode` || f.toLowerCase() === `${nombre.toLowerCase()}.gcode.3mf`);
    if (!lam) {
      console.log(nombre.slice(0, 24).padEnd(24), 'sin laminado (.gcode / .gcode.3mf): se salta');
      continue;
    }
    let l;
    try {
      l = leerLaminado(readFileSync(join(dir, lam)));
    } catch (e) {
      console.log(nombre.slice(0, 24).padEnd(24), `${lam}: ${(e as Error).message}`);
      continue;
    }
    const ex = extra.get(nombre.toLowerCase());
    const copias = ex?.copias ?? 1;
    const material = l.material ?? 'PLA';
    const h = l.alturaCapa ?? 0.2;
    const tri = leerSTL(join(dir, stl));
    const cfg = { ...configAnalisis(s), presets: [{ alturaCapa: h }] };
    const res = elegirOrientacion(tri, cfg, costeOrientacion({ ...s, detalle: [{ id: 'estandar', altura_capa_mm: h }] }, { material, resistenciaId: 'estandar', detalleId: 'estandar' }), {
      auto: s.orientacion_auto,
      tolerancia: s.orientacion_tolerancia_pct / 100
    });
    const an = res.analisis ?? analizarPieza(tri, cfg);
    // Mismo recorrido que la web (estimarPieza): con soportes y, si son
    // mínimos, sin ellos; las copias de una bandeja se laminan juntas.
    const base = {
      perfil: perfilDe(s),
      material: materialDe(s, material),
      preset: 0,
      relleno: l.relleno ?? 0.15,
      calibracion: { ...(s.soporte_tipo === 'arbol' ? SOPORTE_ARBOL : {}), ...s.calibracion }
    };
    const n = Math.min(copias, copiasPorCama(an.bboxMm, base.perfil.cama));
    let e = evaluar(an, { ...base, soportes: true, copias: n });
    if (e.soporteG / n < Math.max(0, s.soporte_min_g ?? 1)) e = evaluar(an, { ...base, soportes: false, copias: n });
    // Real: lo medido si se apuntó; si no, lo del laminado (de toda la bandeja).
    const realG = ex?.peso ?? l.pesoG, realH = ex?.min != null ? ex.min / 60 : l.tiempoH;
    const precio = (g: number, hh: number) => g * (s.materiales[material]?.precio_g ?? s.materiales.PLA.precio_g) + hh * s.precio_hora;
    const estG = e.pesoG, estH = e.tiempoS / 3600;
    const t = tipoDe(l.colores, copias, l.conSoportes);
    grupos[t].g.push(realG / estG);
    grupos[t].h.push(realH / estH);
    grupos[t].p.push(precio(realG, realH) / precio(estG, estH));
    console.log(
      nombre.slice(0, 24).padEnd(24), t.padEnd(13),
      realG.toFixed(1).padStart(6), estG.toFixed(1).padStart(6),
      realH.toFixed(2).padStart(7), estH.toFixed(2).padStart(7),
      precio(realG, realH).toFixed(2).padStart(7), precio(estG, estH).toFixed(2).padStart(7)
    );
  }

  console.log('\nreal ÷ estimado por tipo de pieza (1,00 = acierta; >1 = el estimador se queda corto)');
  console.log('tipo'.padEnd(13), '  n', '| gramos med · p90', '| horas med · p90', '| precio med · p90');
  const f = (xs: number[]) => (xs.length ? `${percentil(xs, 0.5).toFixed(2)} · ${percentil(xs, 0.9).toFixed(2)}`.padStart(11) : '—'.padStart(11));
  for (const t of TIPOS) {
    const x = grupos[t];
    console.log(t.padEnd(13), String(x.g.length).padStart(3), '|', f(x.g).padStart(16), '|', f(x.h).padStart(15), '|', f(x.p).padStart(16), x.g.length > 0 && x.g.length < 5 ? ' (pocas piezas: no fiarse)' : '');
  }
}

const [dir, tarifas] = process.argv.slice(2);
if (!dir || !existsSync(dir)) {
  console.error('Uso: npx tsx scripts/benchmark-estimador.ts <carpeta con .stl + .gcode> [tarifas.json]');
  process.exit(1);
}
main(dir, tarifas);
