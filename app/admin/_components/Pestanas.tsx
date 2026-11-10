'use client';

// Pestañas con role="tablist": flechas izquierda/derecha (y Inicio/Fin) mueven
// el foco y la selección. El contenido de cada pestaña lo pinta quien la usa
// dentro de un role="tabpanel" con aria-labelledby={`${id}-${valor}`}.

import { KeyboardEvent, useRef } from 'react';

export function Pestanas({
  id,
  etiqueta,
  value,
  onChange,
  pestanas
}: {
  id: string;
  etiqueta: string;
  value: string;
  onChange: (v: string) => void;
  pestanas: { value: string; label: string }[];
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent, i: number) {
    const n = pestanas.length;
    const ir = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (ir < 0) return;
    e.preventDefault();
    onChange(pestanas[ir].value);
    refs.current[ir]?.focus();
  }

  return (
    <div className="pestanas" role="tablist" aria-label={etiqueta}>
      {pestanas.map((p, i) => (
        <button
          key={p.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${id}-${p.value}`}
          aria-selected={value === p.value}
          aria-controls={`${id}-panel`}
          tabIndex={value === p.value ? 0 : -1}
          onClick={() => onChange(p.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
