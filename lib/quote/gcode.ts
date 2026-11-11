// Lee de un laminado de OrcaSlicer (`.gcode` o `.gcode.3mf`) lo que hace falta
// para comparar con el estimador y para «Nuevo encargo»: gramos, horas,
// impresora, ranuras de filamento (tipo y color) y cambios de color. Se
// reutiliza en el benchmark (scripts/benchmark-estimador.ts) y en
// app/admin/encargo.
//
// Orca escribe las cifras como comentarios (cabecera y pie del gcode):
//   ; filament used [g] = 12.80, 0.00, 0.00, 1.61, 0.00   (uno por ranura)
//   ; total filament used [g] = 14.41
//   ; total filament change = 25
//   ; estimated printing time (normal mode) = 1h 31m 14s
//   ; filament_type = PLA;PLA;PLA;PLA;TPU · ; filament_colour = #FFFFFF;…
//   ; printer_model = Creality K1C · ; flush_volumes_matrix = 0,208,…
// El gcode de la K1 NO cuenta el filamento purgado en multicolor (ver
// docs/plan-calculadora/01-banco-de-pruebas.md, parte D); el de la Kobra X sí.

import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';

/** Una ranura de filamento del laminado, en su posición (también las de 0 g). */
export interface Ranura {
  indice: number;
  gramos: number;
  /** filament_type en la misma posición ("PLA", "TPU"…). */
  tipo: string | null;
  /** filament_colour en la misma posición ("#FFFFFF"). */
  colorHex: string | null;
  /** filament_settings_id ("SUNLU PLA+ - Tuned"). */
  ajustes: string | null;
  densidad: number | null;
}

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
  /** Todas las ranuras, con la posición que une gramos, tipo y color. */
  ranuras: Ranura[];
  /** printer_model ("Creality K1C", "Anycubic Kobra X"). */
  impresora: string | null;
  /** total filament change (0 si no lo trae). */
  cambios: number;
  /**
   * Purga media por cambio entre las ranuras usadas, mm³: media de
   * flush_volumes_matrix entre ellas × flush_multiplier. null sin matriz.
   */
  purgaMm3PorCambio: number | null;
}

/** "1d 2h 3m 4s", "1h 31m", "45s" → horas. */
export function duracionH(txt: string): number {
  let s = 0;
  for (const [, n, u] of txt.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/g)) {
    s += Number(n) * ({ d: 86400, h: 3600, m: 60, s: 1 } as Record<string, number>)[u];
  }
  return s / 3600;
}

/**
 * Valor de un comentario `; clave = valor`. La ÚLTIMA aparición: la Kobra X
 * repite «estimated printing time» como marca de progreso a lo largo del
 * archivo, y la buena es la del bloque final.
 */
function valor(txt: string, clave: RegExp): string | null {
  let v: string | null = null;
  for (const m of txt.matchAll(new RegExp(`^;\\s*${clave.source}\\s*[=:]\\s*(.+?)\\s*$`, 'gmi'))) v = m[1];
  return v;
}

const lista = (s: string | null): number[] =>
  (s ?? '').split(/[,;]/).map(Number).filter((n) => Number.isFinite(n));

const partes = (s: string | null): string[] =>
  (s ?? '').split(';').map((x) => x.trim().replace(/^"|"$/g, ''));

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

/**
 * Lo que trae el laminado, sin exigir nada: lo que falte sale a 0 / null y
 * «Nuevo encargo» lo avisa y deja el campo para teclear.
 */
export function leerDatosLaminado(buf: Uint8Array): Laminado {
  const txt = gcodeDe(buf);
  const todas = lista(valor(txt, /filament used \[g\]/));
  const porFilamento = todas.filter((g) => g > 0);
  const total = Number(valor(txt, /total filament (?:used|weight) \[g\]/));
  const pesoG = Number.isFinite(total) && total > 0 ? total : porFilamento.reduce((a, b) => a + b, 0);
  const t = valor(txt, /estimated printing time \(normal mode\)/) ?? valor(txt, /total estimated time/);
  // Las marcas de progreso llevan «= segundos» detrás: solo cuenta la duración.
  const tiempoH = t ? duracionH(t.split('=')[0]) : 0;
  const capa = Number(valor(txt, /layer_height/));
  const relleno = parseFloat(valor(txt, /sparse_infill_density/) ?? '');
  const tipos = partes(valor(txt, /filament_type/));
  const hex = partes(valor(txt, /filament_colour/));
  const ajustes = partes(valor(txt, /filament_settings_id/));
  const dens = lista(valor(txt, /filament_density/));
  const ranuras: Ranura[] = todas.map((gramos, i) => ({
    indice: i,
    gramos,
    tipo: tipos[i] ? tipos[i].toUpperCase() : null,
    colorHex: /^#[0-9a-f]{6}$/i.test(hex[i] ?? '') ? hex[i].toUpperCase() : null,
    ajustes: ajustes[i] || null,
    densidad: dens[i] > 0 ? dens[i] : null
  }));

  // Purga: matriz n×n (de la fila a la columna) entre las ranuras usadas.
  // ponytail: media de los pares, no el recuento real de cada cambio T…
  // (exigiría leer el archivo entero); con dos colores la diferencia es <1 g.
  const matriz = lista(valor(txt, /flush_volumes_matrix/));
  const mult = Number(valor(txt, /flush_multiplier/)) || 1;
  const n = Math.round(Math.sqrt(matriz.length));
  const usadas = ranuras.filter((r) => r.gramos > 0).map((r) => r.indice);
  const pares = usadas
    .flatMap((a) => usadas.filter((b) => b !== a).map((b) => matriz[a * n + b]))
    .filter((v) => Number.isFinite(v));

  return {
    pesoG,
    tiempoH,
    gramosPorFilamento: porFilamento,
    colores: Math.max(1, porFilamento.length),
    conSoportes: /^;\s*(?:TYPE|FEATURE):\s*Support/im.test(txt),
    alturaCapa: capa > 0 ? capa : null,
    relleno: Number.isFinite(relleno) ? relleno / 100 : null,
    material: tipos[0] ? tipos[0].toUpperCase() : null,
    ranuras,
    impresora: valor(txt, /printer_model/),
    cambios: Math.max(0, Math.round(Number(valor(txt, /total filament change/)) || 0)),
    purgaMm3PorCambio:
      n > 0 && n * n === matriz.length && pares.length ? (pares.reduce((a, b) => a + b, 0) / pares.length) * mult : null
  };
}

/** Como leerDatosLaminado, pero sin gramos u horas no vale (benchmark). */
export function leerLaminado(buf: Uint8Array): Laminado {
  const l = leerDatosLaminado(buf);
  if (!(l.pesoG > 0) || !(l.tiempoH > 0)) throw new Error('No encuentro gramos u horas en el gcode');
  return l;
}
