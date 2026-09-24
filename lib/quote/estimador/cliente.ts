// Main-thread side of the estimator worker: one shared worker, a promise
// per request, progress callbacks. Falls back to running inline (after a
// tick, so the UI can paint "analizando…") when workers are unavailable.

import type { Analisis } from './analizar';
import type { Matriz3 } from './orientar';
import type { PeticionAnalisis, RespuestaAnalisis } from './worker-core';

export interface ResultadoAnalisis {
  analisis: Analisis;
  R: Matriz3;
  original: boolean;
}

type Pendiente = {
  resolve: (r: ResultadoAnalisis) => void;
  reject: (e: Error) => void;
  progreso?: (f: number) => void;
};

let worker: Worker | null = null;
let workerRoto = false;
const pendientes = new Map<string, Pendiente>();

function obtenerWorker(): Worker | null {
  if (worker || workerRoto) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<RespuestaAnalisis>) => {
      const msg = ev.data;
      const p = pendientes.get(msg.id);
      if (!p) return;
      if (msg.tipo === 'progreso') p.progreso?.(msg.fraccion);
      else if (msg.tipo === 'ok') {
        pendientes.delete(msg.id);
        p.resolve({ analisis: msg.analisis, R: msg.R, original: msg.original });
      } else {
        pendientes.delete(msg.id);
        p.reject(new Error(msg.mensaje));
      }
    };
    worker.onerror = () => {
      // A worker that fails to boot: reject what is queued, go inline.
      workerRoto = true;
      worker = null;
      for (const [id, p] of pendientes) {
        pendientes.delete(id);
        p.reject(new Error('worker'));
      }
    };
  } catch {
    workerRoto = true;
    worker = null;
  }
  return worker;
}

async function enLinea(
  req: PeticionAnalisis,
  progreso?: (f: number) => void
): Promise<ResultadoAnalisis> {
  await new Promise((r) => setTimeout(r, 30));
  const { procesar } = await import('./worker-core');
  return procesar(req, (f) => progreso?.(f));
}

/** Analyse a part (orientation search included unless `auto` is false). */
export function analizarEnSegundoPlano(
  req: PeticionAnalisis,
  progreso?: (f: number) => void
): Promise<ResultadoAnalisis> {
  const w = obtenerWorker();
  if (!w) return enLinea(req, progreso);
  return new Promise<ResultadoAnalisis>((resolve, reject) => {
    pendientes.set(req.id, { resolve, reject, progreso });
    // The buffer is copied, not transferred: the caller keeps its mesh.
    w.postMessage(req);
  }).catch((err) => {
    if (workerRoto) return enLinea(req, progreso);
    throw err;
  });
}
