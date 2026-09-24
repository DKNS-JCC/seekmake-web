// Glue between the slicer-like estimator and the tariff settings: builds
// the analysis config from QuoteSettings and turns an Analisis into the
// grams / hours the pricing engine charges for.

import type { Analisis, ConfigAnalisis, PresetCapa } from './analizar';
import { evaluar, SOPORTE_ARBOL, type Calibracion, type Estimacion } from './evaluar';
import {
  MATERIALES_K1SE,
  PERFIL_K1SE,
  type PerfilImpresora,
  type PerfilMaterial
} from './perfil';

export type { Analisis } from './analizar';
export type { Calibracion, Estimacion } from './evaluar';
export type { PerfilImpresora, PerfilMaterial } from './perfil';
export { PERFIL_K1SE, MATERIALES_K1SE } from './perfil';
export { CALIBRACION_BASE, SOPORTE_ARBOL } from './evaluar';

/** The subset of QuoteSettings the estimator reads (avoids an import cycle). */
export interface AjustesEstimador {
  perfil?: Partial<PerfilImpresora>;
  calibracion?: Partial<Calibracion>;
  soporte_tipo?: 'normal' | 'arbol';
  soporte_min_g?: number;
  materiales: Record<
    string,
    {
      precio_g: number;
      densidad: number;
      vol_max?: number;
      tiempo_min_capa?: number;
      v_min?: number;
      flujo?: number;
    }
  >;
  precio_hora: number;
  resistencia: { id: string; relleno_pct: number }[];
  detalle: {
    id: string;
    altura_capa_mm: number;
    paredes?: number;
    perfil?: Partial<PerfilImpresora>;
  }[];
}

export function perfilDe(s: AjustesEstimador): PerfilImpresora {
  return { ...PERFIL_K1SE, ...(s.perfil ?? {}) };
}

/** Quality presets in settings order → analysis presets (same indices). */
export function presetsDe(s: AjustesEstimador): PresetCapa[] {
  return s.detalle.map((d) => ({
    alturaCapa: d.altura_capa_mm > 0 ? d.altura_capa_mm : 0.2,
    perfil: {
      ...(d.perfil ?? {}),
      ...(d.paredes && d.paredes > 0 ? { paredes: Math.round(d.paredes) } : {})
    }
  }));
}

export function configAnalisis(s: AjustesEstimador): ConfigAnalisis {
  return { perfil: perfilDe(s), presets: presetsDe(s) };
}

/**
 * Filament behaviour for a muestrario material name. Unknown names fall
 * back by family ("PLA Silk" → PLA, "PETG-CF" → PETG), then to PLA.
 */
export function materialDe(s: AjustesEstimador, material: string): PerfilMaterial {
  const key = material.toUpperCase();
  const familia =
    MATERIALES_K1SE[key] ??
    (key.includes('PETG')
      ? MATERIALES_K1SE.PETG
      : key.includes('ASA') || key.includes('ABS')
        ? MATERIALES_K1SE.ASA
        : key.includes('TPU') || key.includes('FLEX')
          ? MATERIALES_K1SE.TPU
          : MATERIALES_K1SE.PLA);
  const m = s.materiales[material] ?? s.materiales[key];
  return {
    densidad: m?.densidad || familia.densidad,
    flujo: m?.flujo || familia.flujo,
    volMax: m?.vol_max || familia.volMax,
    tiempoMinCapa: m?.tiempo_min_capa ?? familia.tiempoMinCapa,
    vMin: m?.v_min || familia.vMin
  };
}

export interface EstimacionPieza {
  /** Per unit (batch totals divided by the quantity). */
  pesoG: number;
  soporteG: number;
  tiempoH: number;
  /** Whole batch, every plate included. */
  pesoTotalG: number;
  tiempoTotalH: number;
  capas: number;
  /** Copies per plate and plates needed for the quantity. */
  porCama: number;
  camas: number;
  /** Supports were worth enabling (heavier than soporte_min_g). */
  conSoportes: boolean;
  detalle: Estimacion;
}

/** Gap the slicer's arrange leaves between copies, mm. */
const SEPARACION_COPIAS = 6;

/** How many copies of a footprint fit on the bed (either rotation). */
export function copiasPorCama(bbox: { x: number; y: number }, cama: { x: number; y: number }): number {
  const cabe = (a: number, b: number) =>
    Math.floor((cama.x + SEPARACION_COPIAS) / (a + SEPARACION_COPIAS)) *
    Math.floor((cama.y + SEPARACION_COPIAS) / (b + SEPARACION_COPIAS));
  return Math.max(1, cabe(bbox.x, bbox.y), cabe(bbox.y, bbox.x));
}

/**
 * Grams and hours for `cantidad` units of a part, as the shop would slice
 * them: copies share plates (up to what fits the bed), which is much faster
 * than printing them one by one.
 */
export function estimarPieza(
  an: Analisis,
  s: AjustesEstimador,
  pieza: { material: string; resistenciaId: string; detalleId: string; cantidad?: number }
): EstimacionPieza {
  const res = s.resistencia.find((r) => r.id === pieza.resistenciaId) ?? s.resistencia[0];
  let preset = s.detalle.findIndex((d) => d.id === pieza.detalleId);
  if (preset < 0 || preset >= an.presets.length) preset = 0;
  const calib: Partial<Calibracion> = {
    ...(s.soporte_tipo === 'arbol' ? SOPORTE_ARBOL : {}),
    ...(s.calibracion ?? {})
  };
  const base = {
    perfil: perfilDe(s),
    material: materialDe(s, pieza.material),
    preset,
    relleno: (res?.relleno_pct ?? 20) / 100,
    calibracion: calib
  };
  let e = evaluar(an, { ...base, soportes: true });
  let conSoportes = true;
  // Tiny supports the shop would not bother enabling are left out.
  if (e.soporteG < Math.max(0, s.soporte_min_g ?? 1)) {
    e = evaluar(an, { ...base, soportes: false });
    conSoportes = false;
  }
  const cantidad = Math.max(1, Math.floor(pieza.cantidad ?? 1));
  const porCama = Math.min(cantidad, copiasPorCama(an.bboxMm, perfilDe(s).cama));
  const llenas = Math.floor(cantidad / porCama);
  const resto = cantidad - llenas * porCama;
  const lote = (n: number) =>
    n === 1 ? e : evaluar(an, { ...base, soportes: conSoportes, copias: n });
  const cama = lote(porCama);
  const parcial = resto > 0 ? lote(resto) : null;
  const pesoTotalG = cama.pesoG * llenas + (parcial?.pesoG ?? 0);
  const tiempoTotalH = (cama.tiempoS * llenas + (parcial?.tiempoS ?? 0)) / 3600;
  return {
    pesoG: pesoTotalG / cantidad,
    soporteG: conSoportes ? e.soporteG : 0,
    tiempoH: tiempoTotalH / cantidad,
    pesoTotalG,
    tiempoTotalH,
    capas: e.capas,
    porCama,
    camas: llenas + (resto > 0 ? 1 : 0),
    conSoportes,
    detalle: e
  };
}

/**
 * Money cost of an orientation (standard quality, PLA-like material) used
 * to rank candidate orientations with the shop's own tariff.
 */
export function costeOrientacion(
  s: AjustesEstimador,
  pieza: { material: string; resistenciaId: string; detalleId: string }
): (an: Analisis) => number {
  const precioG = (s.materiales[pieza.material] ?? s.materiales.PLA)?.precio_g ?? 0.05;
  return (an) => {
    if (!(an.volumenMm3 > 0) || !an.muestras.length) return Infinity;
    const e = estimarPieza(an, s, pieza);
    const c = e.pesoG * precioG + e.tiempoH * s.precio_hora;
    return Number.isFinite(c) ? c : Infinity;
  };
}
