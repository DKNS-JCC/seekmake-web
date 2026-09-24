// Web Worker: runs the layer analysis (and the orientation search) off the
// main thread so the 3D viewer stays responsive while a part is "sliced".

import { procesar, type PeticionAnalisis, type RespuestaAnalisis } from './worker-core';

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<PeticionAnalisis>) => void) | null;
  postMessage: (msg: RespuestaAnalisis) => void;
};

ctx.onmessage = (ev) => {
  const req = ev.data;
  try {
    let ultimo = 0;
    const r = procesar(req, (f) => {
      // Throttle progress messages to ~5 % steps.
      if (f - ultimo >= 0.05 || f >= 1) {
        ultimo = f;
        ctx.postMessage({ id: req.id, tipo: 'progreso', fraccion: f });
      }
    });
    ctx.postMessage({ id: req.id, tipo: 'ok', ...r });
  } catch (err) {
    ctx.postMessage({ id: req.id, tipo: 'error', mensaje: String((err as Error)?.message ?? err) });
  }
};
