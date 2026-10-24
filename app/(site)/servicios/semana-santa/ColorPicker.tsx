'use client';

import { useMemo, useRef, useState } from 'react';
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
export type Combinacion = Record<Parte, Cofradia> & { nombre: string };
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
  // one part's swatches at a time, so on a phone the figure and every colour fit on one screen
  const [parte, setParte] = useState<Parte>('capirote');
  // stock colours stay folded so a first look is just the usual cofradía set
  const [abierto, setAbierto] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  // without cíngulo the tunic covers its area and the photo layers drop the belt's relief
  const [conCingulo, setConCingulo] = useState(true);
  const sin = conCingulo ? '' : '-sin-cingulo';
  const resumen = conCingulo
    ? `capirote ${sel.capirote}, cíngulo ${sel.cingulo} y túnica ${sel.tunica}`
    : `capirote ${sel.capirote} y túnica ${sel.tunica}, sin cíngulo`;
  const hermandad = conCingulo
    ? presets.find((p) => p.capirote === sel.capirote && p.cingulo === sel.cingulo && p.tunica === sel.tunica)
    : undefined;
  const wa = whatsappUrl(
    `Hola, os escribo desde la web. Quería un mini nazareno${hermandad ? ` de ${hermandad.nombre}` : ''} con ${resumen}.`
  );

  return (
    <div className="ss-picker">
      <div ref={stage} className="ss-picker-stage" role="img" aria-label={`Mini nazareno con ${resumen}`}>
        <img src={`${IMG}nazareno-base${sin}.webp`} alt="" width={800} height={1000} />
        {PARTES.map((p) => (
          <div
            key={p.id}
            className="ss-layer"
            style={{
              background: hexDe(p.id === 'cingulo' && !conCingulo ? sel.tunica : sel[p.id]),
              maskImage: `url(${IMG}mascara-${p.id}.png)`,
              WebkitMaskImage: `url(${IMG}mascara-${p.id}.png)`
            }}
          />
        ))}
        {/* untinted glints, then the background with a soft hole so edges blend exactly */}
        <img src={`${IMG}nazareno-brillo${sin}.webp`} alt="" width={800} height={1000} className="ss-brillo" />
        <img src={`${IMG}nazareno-fondo.webp`} alt="" width={800} height={1000} />
      </div>

      <div className="ss-picker-side">
        <p className="ss-picker-label" aria-live="polite">
          {hermandad?.nombre ??
            (conCingulo ? `${sel.capirote} · ${sel.cingulo} · ${sel.tunica}` : `${sel.capirote} · ${sel.tunica}`)}
        </p>

        <div className="ss-tabs" role="group" aria-label="Parte a colorear">
          {PARTES.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ss-tab"
              aria-pressed={parte === p.id}
              onClick={() => setParte(p.id)}
            >
              <span
                className="ss-dot"
                style={{ background: p.id === 'cingulo' && !conCingulo ? 'transparent' : hexDe(sel[p.id]) }}
              />
              {p.label}
            </button>
          ))}
        </div>

        <div className="ss-swatches">
          {grupos.flatMap((grupo, g) =>
            g && !(abierto || grupo.some((c) => c.nombre === sel[parte]))
              ? grupo.length > 0 && (
                  <button key="mas" type="button" className="ss-mas" onClick={() => setAbierto(true)}>
                    + Más colores
                  </button>
                )
              : grupo.map((c, i) => (
                  <button
                    key={c.nombre}
                    type="button"
                    aria-pressed={sel[parte] === c.nombre && (parte !== 'cingulo' || conCingulo)}
                    aria-label={`${parte} ${c.nombre}`}
                    title={c.nombre}
                    className={g && !i ? 'ss-swatch ss-swatch-muestrario' : 'ss-swatch'}
                    style={{ background: c.hex }}
                    onClick={() => {
                      setSel({ ...sel, [parte]: c.nombre });
                      if (parte === 'cingulo') setConCingulo(true);
                    }}
                  />
                ))
          )}
          {parte === 'cingulo' && (
            <button type="button" className="ss-mas" aria-pressed={!conCingulo} onClick={() => setConCingulo(false)}>
              Sin cíngulo
            </button>
          )}
        </div>

        <a href={wa} className="btn-primary ss-picker-cta" target="_blank" rel="noopener noreferrer">
          Pedir esta combinación
        </a>

        <p className="ss-row-title">Hermandades de Salamanca</p>
        <div className="ss-presets">
          {presets.map((p) => (
            <button
              key={p.nombre}
              type="button"
              className="ss-preset"
              aria-pressed={hermandad === p}
              onClick={() => {
                setSel(p);
                setConCingulo(true);
                // on a phone the figure is above the list: bring it back into view to show the change
                const r = stage.current?.getBoundingClientRect();
                if (r && r.top < 0) stage.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <span className="ss-preset-colores" aria-hidden="true">
                {PARTES.map((parte) => (
                  <span key={parte.id} style={{ background: hexDe(p[parte.id]) }} />
                ))}
              </span>
              {p.nombre}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
