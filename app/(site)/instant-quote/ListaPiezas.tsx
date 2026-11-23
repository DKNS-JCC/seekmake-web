'use client';

// Warnings about the files (size, units, damaged mesh) and the list of
// pieces with their quantity.

import { colorPreviewStyle } from '@/lib/color-preview';
import { whatsappUrl } from '@/lib/contacto';
import { piezaColors } from '@/lib/quote/types';
import type { QuoteResult } from '@/lib/quote/pricing';
import type { Piezas } from './usePiezas';

export function ListaPiezas({
  pz,
  quote,
  tooBig,
  degenerate,
  maxBedMm,
  scaleSuggestions,
  setActivePart
}: {
  pz: Piezas;
  quote: QuoteResult | null;
  tooBig: boolean;
  degenerate: boolean;
  maxBedMm: number;
  scaleSuggestions: { unidad: string; factor: number }[];
  setActivePart: (i: number) => void;
}) {
  const { piezas, activeId, activePieza } = pz;
  return (
    <>
      {(tooBig || degenerate || scaleSuggestions.length > 0) && (
        <div className="qt-warn">
          {scaleSuggestions.length > 0 && activePieza && (
            <div>
              <p>
                ⚠ <strong>{activePieza.name}</strong> mide solo{' '}
                {Math.max(
                  activePieza.metrics.bboxMm.x,
                  activePieza.metrics.bboxMm.y,
                  activePieza.metrics.bboxMm.z
                ).toFixed(1)}{' '}
                mm. ¿Quizá el archivo no está en milímetros?
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {scaleSuggestions.map((s) => (
                  <button
                    key={s.unidad}
                    type="button"
                    className="btn-outline"
                    style={{ padding: '6px 14px' }}
                    onClick={() => pz.rescalePieza(activePieza.id, s.factor)}
                  >
                    Convertir de {s.unidad} (×{s.factor})
                  </button>
                ))}
              </div>
            </div>
          )}
          {tooBig && (
            <p>
              ⚠ Alguna pieza supera los {maxBedMm} mm en algún eje. Puede que
              haya que imprimirla en varias partes — te lo confirmamos al revisar.
            </p>
          )}
          {degenerate && (
            <p>
              ⚠ Alguna malla parece abierta o dañada; la estimación de peso puede
              no ser fiable. La revisaremos manualmente.
            </p>
          )}
        </div>
      )}

      {/* piezas */}
      {piezas.length > 0 && (
        <div className="qt-step">
          {piezas.length > 1 && <div className="qt-step-label">Tus piezas</div>}
          <ul className="qt-piezas">
            {piezas.map((p) => (
              <li
                key={p.id}
                className={'qt-pieza' + (p.id === activeId ? ' active' : '')}
              >
                <button
                  type="button"
                  className="qt-pieza-name"
                  title={p.name}
                  onClick={() => {
                    pz.setActiveId(p.id);
                    setActivePart(0);
                  }}
                >
                  {p.name}
                  <span className="qt-pieza-dots">
                    {piezaColors(p).slice(0, 4).map((c) => (
                      <span key={c.id} style={colorPreviewStyle(c)} />
                    ))}
                  </span>
                </button>
                <div className="qt-pieza-qty">
                  <button
                    type="button"
                    onClick={() => pz.setCantidad(p.id, p.cantidad - 1)}
                    aria-label="Menos"
                  >
                    −
                  </button>
                  <span>{p.cantidad}</span>
                  <button
                    type="button"
                    onClick={() => pz.setCantidad(p.id, p.cantidad + 1)}
                    aria-label="Más"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="qt-pieza-remove"
                  onClick={() => pz.removePieza(p.id)}
                  aria-label={`Quitar ${p.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {quote && quote.descuentoPct > 0 && (
            <p className="qt-step-hint" style={{ color: 'var(--accent)' }}>
              -{quote.descuentoPct}% por cantidad ({quote.unidades} unidades en total)
            </p>
          )}
        </div>
      )}

      {/* The second door: no 3D file, just a photo, an idea or a broken part. */}
      {!piezas.length && (
        <div className="qt-sin-archivo">
          <p>
            <strong>¿No tienes archivo 3D?</strong> Mándanos una foto de la pieza o de tu idea y
            te decimos el precio.
          </p>
          <a
            className="btn-outline"
            href={whatsappUrl('Hola, no tengo archivo 3D. Os mando una foto de lo que quiero.')}
            target="_blank"
            rel="noopener noreferrer"
          >
            Mándanos una foto
          </a>
        </div>
      )}
    </>
  );
}
