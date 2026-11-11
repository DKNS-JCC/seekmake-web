'use client';

// Campos numérico y de duración de la Calculadora (CampoNumero.vue y
// CampoTiempo.vue): coma o punto, seleccionan todo al entrar, limpian lo
// pegado («12,5 g» → 12,5) y llevan la unidad dentro. El valor es el texto
// tecleado; quien lo usa lo lee con parseNumero / parseHoras.

import { InputHTMLAttributes, forwardRef } from 'react';
import { formatHoras, parseHoras, parseNumero } from '@/lib/quote/formatos';

type Base = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (v: string) => void;
  unidad?: string;
  invalido?: boolean;
};

export const CampoNumero = forwardRef<HTMLInputElement, Base>(function CampoNumero(
  { value, onChange, unidad, invalido, className, ...rest },
  ref
) {
  return (
    <span className={'campo' + (className ? ` ${className}` : '')}>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={invalido || undefined}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const n = parseNumero(e.clipboardData.getData('text'));
          if (n !== null && !Number.isNaN(n)) {
            e.preventDefault();
            onChange(String(n).replace('.', ','));
          }
        }}
        {...rest}
      />
      {unidad && <span className="campo-unidad" aria-hidden="true">{unidad}</span>}
    </span>
  );
});

/** Duración: «1h31», «1:31», «91» (min), «1,5» (h). Enseña la equivalencia al escribir. */
export const CampoTiempo = forwardRef<HTMLInputElement, Base & { idEquivalencia?: string }>(function CampoTiempo(
  { value, onChange, invalido, idEquivalencia, onBlur, ...rest },
  ref
) {
  const h = parseHoras(value);
  const valida = h !== null && !Number.isNaN(h);
  return (
    <>
      <span className="campo">
        <input
          ref={ref}
          type="text"
          inputMode="text"
          autoComplete="off"
          value={value}
          aria-invalid={invalido || undefined}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            // Al salir se reescribe en el formato de lectura («1 h 31 min»).
            if (valida && h > 0) onChange(formatHoras(h));
            onBlur?.(e);
          }}
          {...rest}
        />
      </span>
      <span id={idEquivalencia} className="campo-ayuda">
        {valida && h > 0 ? `= ${formatHoras(h)}` : '1h31 · 1:31 · 91 (min) · 1,5 (h)'}
      </span>
    </>
  );
});
