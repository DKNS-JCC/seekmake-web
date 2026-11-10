// Lee de un laminado de OrcaSlicer (`.gcode` o `.gcode.3mf`) lo que hace falta
// para comparar con el estimador: gramos, horas y cómo se laminó. Se reutiliza
// en el benchmark (scripts/benchmark-estimador.ts) y en "Nuevo encargo".
//
// Orca escribe las cifras como comentarios (cabecera y pie del gcode):
//   ; filament used [g] = 12.80, 1.61        (uno por filamento)
//   ; total filament weight [g] : 14.41
//   ; estimated printing time (normal mode) = 1h 31m 20s
//   ; layer_height = 0.2 · ; sparse_infill_density = 15% · ; filament_type = PLA;PLA
// El gcode de la K1 NO cuenta el filamento purgado en multicolor (ver
// docs/plan-calculadora/01-banco-de-pruebas.md, parte D).

import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';

export interface Laminado {
  /** Gramos totales del laminado (suma de todos los filamentos). */
  pesoG: number;
  /** Tiempo de impresión estimado por Orca, horas. */
  tiempoH: number;
  /** Gramos por filamento usado (los que gastan > 0). */
  gramosPorFilamento: number[];
  /** Filamentos distintos usados: más de uno = multicolor. */
  colores: number;
  /** El gcode contiene extrusión de soportes (no solo la opción activada). */
  conSoportes: boolean;
  alturaCapa: number | null;
  /** Relleno en fracción 0-1. */
  relleno: number | null;
  /** Primer filamento_type ("PLA", "PETG"…). */
  material: string | null;
}

/** "1d 2h 3m 4s", "1h 31m", "45s" → horas. */
export function duracionH(txt: string): number {
  let s = 0;
  for (const [, n, u] of txt.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/g)) {
    s += Number(n) * ({ d: 86400, h: 3600, m: 60, s: 1 } as Record<string, number>)[u];
  }
  return s / 3600;
}

const valor = (txt: string, clave: RegExp): string | null =>
  new RegExp(`^;\\s*${clave.source}\\s*[=:]\\s*(.+?)\\s*$`, 'mi').exec(txt)?.[1] ?? null;

const lista = (s: string | null): number[] =>
  (s ?? '').split(/[,;]/).map(Number).filter((n) => Number.isFinite(n));

/** Texto de un `.gcode`, o de la primera bandeja de un `.gcode.3mf`. */
export function gcodeDe(buf: Uint8Array): string {
  // Un 3MF es un zip ("PK"); un gcode es texto.
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return new TextDecoder().decode(buf);
  const zip = unzipSync(buf);
  const nombre = Object.keys(zip)
    .filter((n) => /(^|\/)plate_\d+\.gcode$/i.test(n) || /\.gcode$/i.test(n))
    .sort()[0];
  if (!nombre) throw new Error('El .3mf no trae gcode: expórtalo como "archivo laminado de la bandeja"');
  return new TextDecoder().decode(zip[nombre]);
}

export function leerLaminado(buf: Uint8Array): Laminado {
  const txt = gcodeDe(buf);
  const porFilamento = lista(valor(txt, /filament used \[g\]/)).filter((g) => g > 0);
  const total = Number(valor(txt, /total filament (?:used|weight) \[g\]/));
  const pesoG = Number.isFinite(total) && total > 0 ? total : porFilamento.reduce((a, b) => a + b, 0);
  const t = valor(txt, /estimated printing time \(normal mode\)/) ?? valor(txt, /total estimated time/);
  const tiempoH = t ? duracionH(t) : 0;
  if (!(pesoG > 0) || !(tiempoH > 0)) throw new Error('No encuentro gramos u horas en el gcode');
  const capa = Number(valor(txt, /layer_height/));
  const relleno = parseFloat(valor(txt, /sparse_infill_density/) ?? '');
  return {
    pesoG,
    tiempoH,
    gramosPorFilamento: porFilamento,
    colores: Math.max(1, porFilamento.length),
    conSoportes: /^;\s*(?:TYPE|FEATURE):\s*Support/im.test(txt),
    alturaCapa: capa > 0 ? capa : null,
    relleno: Number.isFinite(relleno) ? relleno / 100 : null,
    material: valor(txt, /filament_type/)?.split(';')[0].trim().toUpperCase() || null
  };
}
