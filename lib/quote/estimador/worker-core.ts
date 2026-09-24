// Worker-side logic without the message wiring, so the main thread can
// also run it inline when Web Workers are unavailable.

import { elegirOrientacion, type Matriz3 } from './orientar';
import { configAnalisis, costeOrientacion, type AjustesEstimador } from './index';
import type { Analisis } from './analizar';

export interface PeticionAnalisis {
  id: string;
  /** Triangle soup in print coordinates (mm, Z up). */
  tri: Float32Array;
  ajustes: AjustesEstimador;
  pieza: { material: string; resistenciaId: string; detalleId: string };
  /** false = keep the uploaded orientation. */
  auto: boolean;
  tolerancia?: number;
}

export type RespuestaAnalisis =
  | { id: string; tipo: 'progreso'; fraccion: number }
  | { id: string; tipo: 'ok'; analisis: Analisis; R: Matriz3; original: boolean }
  | { id: string; tipo: 'error'; mensaje: string };

export function procesar(
  req: PeticionAnalisis,
  progreso: (fraccion: number) => void
): { analisis: Analisis; R: Matriz3; original: boolean } {
  const res = elegirOrientacion(
    req.tri,
    configAnalisis(req.ajustes),
    costeOrientacion(req.ajustes, req.pieza),
    { auto: req.auto, tolerancia: req.tolerancia, progreso }
  );
  return { analisis: res.analisis, R: res.R, original: res.original };
}
