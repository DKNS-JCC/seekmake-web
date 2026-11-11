'use client';

// Aviso transitorio abajo («Línea quitada · Deshacer»): uno a la vez, se
// cierra solo a los 6 s.
//
//   const { avisar, aviso } = useAviso();
//   avisar('Formulario limpio', { label: 'Deshacer', run: () => … });
//   …{aviso}

import { useCallback, useEffect, useRef, useState } from 'react';

type Accion = { label: string; run: () => void };

export function useAviso() {
  const [actual, setActual] = useState<{ texto: string; accion?: Accion; n: number } | null>(null);
  const n = useRef(0);

  const avisar = useCallback((texto: string, accion?: Accion) => {
    setActual({ texto, accion, n: ++n.current });
  }, []);

  useEffect(() => {
    if (!actual) return;
    const t = setTimeout(() => setActual(null), 6000);
    return () => clearTimeout(t);
  }, [actual]);

  const aviso = (
    <div className="aviso" role="status" aria-live="polite">
      {actual && (
        <div className="aviso-caja">
          <span>{actual.texto}</span>
          {actual.accion && (
            <button
              type="button"
              onClick={() => {
                actual.accion!.run();
                setActual(null);
              }}
            >
              {actual.accion.label}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return { avisar, aviso };
}
