// Pricing engine for the tasador, browser side. The money itself lives in
// supabase/functions/_shared/precios.ts, the same file submit-quote imports,
// so page and server price with one code. This adds what only the browser
// has: grams and hours from the slicer-like estimator (lib/quote/estimador)
// when the part's layer analysis is available, and the estimator's types on
// the settings.

import type { MeshMetrics } from './geometry';
import type { Analisis } from './estimador/analizar';
import type { Calibracion } from './estimador/evaluar';
import type { PerfilImpresora } from './estimador/perfil';
import { estimarPieza } from './estimador';
import * as motor from '../../supabase/functions/_shared/precios';

export {
  COSTES_CALCULADORA,
  diasPlazo,
  sumarLaborables,
  hoyMadrid,
  fechaTope,
  fechaLarga,
  tipoPieza,
  cabeEnCama,
  esPrecioFirme,
  senalPendiente,
  costeHoraMaquina,
  factorCalculadora,
  precioKgDe
} from '../../supabase/functions/_shared/precios';
export type {
  MaterialPricing,
  EnvioTramo,
  ResistenciaPreset,
  CostesCalculadora,
  TipoPieza,
  PiezaResult,
  Cupon,
  QuoteLine,
  QuoteResult
} from '../../supabase/functions/_shared/precios';

export type DetallePreset = motor.DetallePreset<Partial<PerfilImpresora>>;
export type QuoteSettings = motor.QuoteSettings<Partial<PerfilImpresora>, Partial<Calibracion>>;

/** Merge a stored config over the defaults so missing keys never crash. */
export const normalizeSettings = (raw: unknown) => motor.normalizeSettings(raw) as QuoteSettings;

/** Defaults with the Calculadora-derived €/g and €/h already filled in. */
export const DEFAULT_QUOTE_SETTINGS = motor.DEFAULT_QUOTE_SETTINGS as QuoteSettings;

export interface PiezaInput {
  nombre: string;
  metrics: MeshMetrics;
  /** Layer analysis in print orientation; absent → volume heuristic. */
  analisis?: Analisis | null;
  cantidad: number;
  /** Each piece carries its own full configuration. */
  material: string;
  /** Distinct muestrario colors applied to this piece (1 = single color). */
  colores: motor.ColorPieza[];
  resistenciaId: string;
  detalleId: string;
  /** Several bodies of one color each that do not touch (objetosSeparados). */
  separados?: boolean;
}

export function computeQuote(
  piezas: PiezaInput[],
  settings: QuoteSettings,
  entrega: 'recogida' | 'envio' = 'recogida',
  cupon: motor.Cupon | null = null
): motor.QuoteResult {
  const cotizables = piezas.map((p): motor.PiezaCotizable => {
    const { mat, res, det } = motor.presetsDe(settings, p.material, p.resistenciaId, p.detalleId);
    const cantidad = Math.max(1, Math.floor(p.cantidad));
    const comun = {
      nombre: p.nombre,
      material: p.material,
      cantidad,
      colores: p.colores,
      resistenciaId: p.resistenciaId,
      detalleId: p.detalleId,
      bboxMm: p.metrics.bboxMm,
      separados: p.separados
    };
    if (p.analisis && p.analisis.muestras.length) {
      const e = estimarPieza(p.analisis, settings, {
        material: p.material,
        resistenciaId: res.id,
        detalleId: det.id,
        cantidad
      });
      return {
        ...comun,
        pesoG: e.pesoG,
        soporteG: e.soporteG,
        tiempoH: e.tiempoH,
        metodo: 'capas',
        porCama: e.porCama,
        camas: e.camas,
        conSoportes: e.conSoportes
      };
    }
    // Same precision the quote page sends to the server (see fichaPieza).
    const a = motor.estimacionAproximada(
      Math.round(p.metrics.volumenCm3 * 100) / 100,
      Math.round((p.metrics.soporteCm3 ?? 0) * 10) / 10,
      p.metrics.bboxMm.y,
      settings,
      mat,
      res.relleno_pct,
      det
    );
    return { ...comun, ...a, metodo: 'aproximado', porCama: 1, camas: cantidad };
  });
  return motor.cotizar(cotizables, settings, entrega, cupon);
}
