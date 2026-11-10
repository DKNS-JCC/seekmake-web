'use client';

// Steps 1-4 for the active piece: material, color (per part in a multi-part
// 3MF), strength and detail. Each piece keeps its own configuration.

import { acabadoLabel, type Color, type Filamento } from '@/lib/types';
import { colorPreviewStyle } from '@/lib/color-preview';
import type { QuoteSettings } from '@/lib/quote/pricing';
import type { Piezas } from './usePiezas';

export function ConfigPieza({
  pz,
  settings,
  filamentos,
  materialColors,
  activeColors,
  activePart,
  setActivePart
}: {
  pz: Piezas;
  settings: QuoteSettings;
  filamentos: Filamento[];
  materialColors: Color[];
  activeColors: Color[];
  activePart: number;
  setActivePart: (i: number) => void;
}) {
  const { piezas, activePieza, activeFilamento, partsMode, patchActiveConfig } = pz;
  if (!activePieza) return null;
  return (
    <>
      {piezas.length > 1 && (
        <div className="qt-configuring">
          <span>
            Configurando: <strong>{activePieza.name}</strong>
          </span>
          <button type="button" onClick={pz.applyToAll}>
            Aplicar a todas
          </button>
        </div>
      )}

      {/* material */}
      <div className="qt-step">
        <div className="qt-step-label">1 · Material</div>
        <div className="qt-pills">
          {filamentos.map((f) => (
            <button
              key={f.id}
              type="button"
              className={
                'qt-pill' + (activePieza.config.filamentoId === f.id ? ' active' : '')
              }
              onClick={() => pz.changeMaterial(f)}
            >
              {f.material}
            </button>
          ))}
        </div>
        {activeFilamento?.descripcion && (
          <p className="qt-step-hint">{activeFilamento.descripcion}</p>
        )}
      </div>

      {/* color */}
      <div className="qt-step">
        <div className="qt-step-label">
          2 · Color{partsMode ? ' por parte' : ''}
        </div>

        {partsMode && (
          <>
            <p className="qt-step-hint">
              Elige una parte (o tócala en el visor) y después su color.
              {activePieza.sugeridos.some(Boolean) &&
                ' Hemos puesto los colores más parecidos a los de tu archivo; cámbialos si quieres.'}
            </p>
            <div className="qt-parts" role="group" aria-label="Partes de la pieza">
              {activePieza.partNames.map((name, i) => {
                const c = activePieza.config.partColors[i];
                return (
                  <button
                    key={i}
                    type="button"
                    className={'qt-part' + (activePart === i ? ' active' : '')}
                    aria-pressed={activePart === i}
                    onClick={() => setActivePart(i)}
                  >
                    <span
                      className={'qt-part-swatch' + (c ? '' : ' vacio')}
                      style={c ? colorPreviewStyle(c) : undefined}
                    />
                    <span className="qt-part-txt">
                      <strong>{name}</strong>
                      <small>{c?.nombre ?? 'Sin color'}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="qt-swatches">
          {materialColors.map((c) => {
            const cfg = activePieza.config;
            // In parts mode only the selected part's color is marked.
            const isMain = partsMode
              ? cfg.partColors[activePart]?.id === c.id
              : cfg.mainColor?.id === c.id;
            const isExtra =
              !partsMode && cfg.multicolor && cfg.extraColors.some((x) => x.id === c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={
                  'qt-swatch' +
                  (isMain || isExtra ? ' active' : '') +
                  (c.agotado ? ' agotado' : '')
                }
                style={colorPreviewStyle(c)}
                disabled={c.agotado}
                aria-pressed={isMain || isExtra}
                aria-label={c.nombre + (c.agotado ? ' (agotado)' : '')}
                title={
                  c.nombre +
                  (c.acabado ? ` · ${acabadoLabel(c.acabado)}` : '') +
                  (c.agotado ? ' · Agotado' : '')
                }
                onClick={() => pz.pickColor(c)}
              />
            );
          })}
        </div>

        {!partsMode && (
          <>
            <label className="qt-toggle">
              <input
                type="checkbox"
                checked={activePieza.config.multicolor}
                onChange={(e) =>
                  patchActiveConfig({
                    multicolor: e.target.checked,
                    extraColors: e.target.checked
                      ? activePieza.config.extraColors
                      : []
                  })
                }
              />
              Quiero combinar varios colores en esta pieza
            </label>
            {activePieza.config.multicolor && (
              <div className="qt-extra">
                <p className="qt-step-hint">
                  Marca hasta 3 colores adicionales y cuéntanos en el mensaje
                  cómo repartirlos. Si nos subes un 3MF con cada color como
                  parte (o pintado en Bambu Studio u Orca), podrás elegir el
                  color de cada parte aquí mismo.
                </p>
                <div className="qt-swatches">
                  {materialColors
                    .filter((c) => c.id !== activePieza.config.mainColor?.id)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={
                          'qt-swatch' +
                          (activePieza.config.extraColors.some((x) => x.id === c.id)
                            ? ' active'
                            : '') +
                          (c.agotado ? ' agotado' : '')
                        }
                        style={colorPreviewStyle(c)}
                        disabled={c.agotado}
                        title={c.nombre + (c.agotado ? ' · Agotado' : '')}
                        onClick={() => pz.toggleExtraColor(c)}
                      />
                    ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeColors.length > 0 && (
          <div className="qt-chosen">
            {activeColors.map((c) => (
              <span key={c.id} className="qt-chosen-chip">
                <span style={colorPreviewStyle(c)} />
                {c.nombre}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* resistencia */}
      <div className="qt-step">
        <div className="qt-step-label">3 · ¿Cómo de resistente la necesitas?</div>
        <div className="qt-cards">
          {settings.resistencia.map((r) => (
            <button
              key={r.id}
              type="button"
              className={
                'qt-card' + (activePieza.config.resistenciaId === r.id ? ' active' : '')
              }
              onClick={() => patchActiveConfig({ resistenciaId: r.id })}
            >
              <strong>{r.nombre}</strong>
              <span>{r.descripcion}</span>
            </button>
          ))}
        </div>
      </div>

      {/* detalle */}
      <div className="qt-step">
        <div className="qt-step-label">4 · ¿Cuánto detalle?</div>
        <div className="qt-cards">
          {settings.detalle.map((d) => (
            <button
              key={d.id}
              type="button"
              className={
                'qt-card' + (activePieza.config.detalleId === d.id ? ' active' : '')
              }
              onClick={() => patchActiveConfig({ detalleId: d.id })}
            >
              <strong>{d.nombre}</strong>
              <span>{d.descripcion}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
