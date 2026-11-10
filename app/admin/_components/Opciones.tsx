'use client';

// Grupo de radios nativos pintados como píldoras: una parada de tabulación,
// flechas para cambiar (comportamiento nativo). Sustituye a los desplegables
// de 2-6 opciones.

import { ReactNode } from 'react';

export function Opciones({
  legend,
  name,
  value,
  onChange,
  opciones,
  children
}: {
  legend: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  opciones: { value: string; label: string; sub?: string }[];
  /** Ayuda bajo el grupo. */
  children?: ReactNode;
}) {
  return (
    <fieldset className="opciones">
      <legend>{legend}</legend>
      <div className="opciones-lista">
        {opciones.map((o) => (
          <label key={o.value} className="opcion">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>
              {o.label}
              {o.sub && <small>{o.sub}</small>}
            </span>
          </label>
        ))}
      </div>
      {children}
    </fieldset>
  );
}
