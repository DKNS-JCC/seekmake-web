'use client';

import { useMemo, useState } from 'react';
import { whatsappUrl } from '@/lib/contacto';
import { useCatalogoColores } from '@/lib/useCatalogoColores';
import type { Color as ColorMuestrario, Filamento } from '@/lib/types';

const IMG = '/images/semana-santa/';

// The usual cofradía colours, always offered; multiplied over the neutral shading layer (rojo/negro
// are also the photographed piece's colours the shading was extracted with).
export const COLORES = {
  negro: '#262626',
  blanco: '#f4f2ee',
  crema: '#efe4c8',
  rojo: '#d42020',
  granate: '#7a1426',
  morado: '#5a2a8a',
  'azul marino': '#1f2f5c',
  azul: '#2c63c0',
  celeste: '#8cc4ea',
  verde: '#1f7a3a',
  oro: '#e0b42a',
  marrón: '#6b4426',
  gris: '#9a9a9a'
} as const;

export type Cofradia = keyof typeof COLORES;
type Parte = 'capirote' | 'cingulo' | 'tunica';
export type Combinacion = Record<Parte, Cofradia> & { file: string; alt: string };
type Opcion = { nombre: string; hex: string };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// a stock colour this close to a cofradía one would just be a duplicate swatch
const cercano = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i])) < 35;

/** Solid, in-stock PLA colours from the muestrario that the cofradía list does not already cover. */
export function coloresPla(filamentos: Filamento[], colores: ColorMuestrario[]): Opcion[] {
  const pla = new Set(filamentos.filter((f) => f.material.trim().toUpperCase() === 'PLA').map((f) => f.id));
  const base = Object.entries(COLORES);
  return colores
    .filter((c) => pla.has(c.filamento_id) && c.muestra_tipo === 'solido' && !c.agotado && /^#[0-9a-f]{6}$/i.test(c.hex))
    .map((c) => ({ nombre: c.nombre.trim().toLowerCase(), hex: c.hex }))
    .filter((c) => !base.some(([n, hex]) => n === c.nombre || cercano(hex, c.hex)))
    .filter((c, i, todos) => todos.findIndex((o) => o.nombre === c.nombre) === i);
}

const PARTES: { id: Parte; label: string }[] = [
  { id: 'capirote', label: 'Capirote' },
  { id: 'cingulo', label: 'Cíngulo' },
  { id: 'tunica', label: 'Túnica' }
];

export function ColorPicker({
  presets,
  filamentos: initialFilamentos,
  colores: initialColores
}: {
  presets: Combinacion[];
  filamentos: Filamento[];
  colores: ColorMuestrario[];
}) {
  // build-time snapshot first, then live stock (new colours, agotado) on mount
  const { filamentos, colores } = useCatalogoColores({ filamentos: initialFilamentos, colores: initialColores });
  const extra = useMemo(() => coloresPla(filamentos, colores), [filamentos, colores]);
  const grupos: Opcion[][] = [Object.entries(COLORES).map(([nombre, hex]) => ({ nombre, hex })), extra];
  const hexDe = (n: string) => grupos.flat().find((o) => o.nombre === n)?.hex ?? COLORES.negro;
  const [sel, setSel] = useState<Record<Parte, string>>(presets[0]);
  // stock colours stay folded so a first look is just the usual cofradía set
  const [abiertas, setAbiertas] = useState<Partial<Record<Parte, boolean>>>({});
  const resumen = `capirote ${sel.capirote}, cíngulo ${sel.cingulo} y túnica ${sel.tunica}`;
  const wa = whatsappUrl(`Hola, os escribo desde la web. Quería un mini nazareno con ${resumen}.`);

  return (
    <div className="ss-picker">
      <div className="ss-picker-stage" role="img" aria-label={`Mini nazareno con ${resumen}`}>
        <img src={`${IMG}nazareno-base.webp`} alt="" width={800} height={1000} />
        {PARTES.map((p) => (
          <div
            key={p.id}
            className="ss-layer"
            style={{
              background: hexDe(sel[p.id]),
              maskImage: `url(${IMG}mascara-${p.id}.png)`,
              WebkitMaskImage: `url(${IMG}mascara-${p.id}.png)`
            }}
          />
        ))}
        {/* untinted glints, then the background with a soft hole so edges blend exactly */}
        <img src={`${IMG}nazareno-brillo.webp`} alt="" width={800} height={1000} className="ss-brillo" />
        <img src={`${IMG}nazareno-fondo.webp`} alt="" width={800} height={1000} />
      </div>

      <div className="ss-picker-side">
        <p className="ss-picker-label" aria-live="polite">
          {sel.capirote} · {sel.cingulo} · {sel.tunica}
        </p>

        {PARTES.map((p) => (
          <fieldset key={p.id} className="ss-row">
            <legend>{p.label}</legend>
            <div className="ss-swatches">
              {grupos.map((grupo, g) =>
                g && !(abiertas[p.id] || grupo.some((c) => c.nombre === sel[p.id]))
                  ? grupo.length > 0 && (
                      <button
                        key="mas"
                        type="button"
                        className="ss-mas"
                        onClick={() => setAbiertas({ ...abiertas, [p.id]: true })}
                      >
                        + Más colores
                      </button>
                    )
                  : grupo.map((c, i) => (
                      <button
                        key={c.nombre}
                        type="button"
                        aria-pressed={sel[p.id] === c.nombre}
                        aria-label={`${p.label} ${c.nombre}`}
                        title={c.nombre}
                        className={g && !i ? 'ss-swatch ss-swatch-muestrario' : 'ss-swatch'}
                        style={{ background: c.hex }}
                        onClick={() => setSel({ ...sel, [p.id]: c.nombre })}
                      />
                    ))
              )}
            </div>
          </fieldset>
        ))}

        <a href={wa} className="btn-primary ss-picker-cta" target="_blank" rel="noopener noreferrer">
          Pedir esta combinación
        </a>

        <p className="ss-row-title">Combinaciones típicas</p>
        <div className="ss-presets">
          {presets.map((p) => (
            <button
              key={p.file}
              type="button"
              className="ss-preset"
              aria-pressed={p.capirote === sel.capirote && p.cingulo === sel.cingulo && p.tunica === sel.tunica}
              onClick={() => setSel(p)}
            >
              <img src={`${IMG}${p.file}.webp`} alt={p.alt} width={400} height={500} loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
