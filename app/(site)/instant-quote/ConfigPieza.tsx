'use client';

// Material and color for the active piece (color per part in a multi-part
// 3MF). Strength and detail stay at «estándar»: whoever needs more says so in
// the notes. Each piece keeps its own configuration.

import { useState } from 'react';
import { acabadoLabel, type Color, type Filamento } from '@/lib/types';
import { colorPreviewStyle } from '@/lib/color-preview';
import type { Piezas } from './usePiezas';

/** Materials by what they are for; the rest go under «Más materiales». */
const USO: Record<string, { nombre: string; para: string }> = {
  PLA: { nombre: 'Normal', para: 'Para casi todo: figuras, decoración, piezas de uso diario.' },
  PETG: { nombre: 'Resistente', para: 'Aguanta golpes, calor, humedad y exterior.' },
  TPU: { nombre: 'Flexible', para: 'Blando y elástico, como la goma.' }
};

export function ConfigPieza({
  pz,
  filamentos,
  materialColors,
  activeColors,
  activePart,
  setActivePart
}: {
  pz: Piezas;
  filamentos: Filamento[];
  materialColors: Color[];
  activeColors: Color[];
  activePart: number;
  setActivePart: (i: number) => void;
}) {
  const { piezas, activePieza, activeFilamento, partsMode, patchActiveConfig } = pz;
  const [masMateriales, setMasMateriales] = useState(false);
  if (!activePieza) return null;

  const principales = filamentos.filter((f) => USO[f.material]);
  const otros = filamentos.filter((f) => !USO[f.material]);
  const verOtros = masMateriales || otros.some((f) => f.id === activePieza.config.filamentoId);
  const elegido = partsMode
    ? activePieza.config.partColors[activePart]
    : activePieza.config.mainColor;
  const pill = (f: Filamento) => (
    <button
      key={f.id}
      type="button"
      className={'qt-pill' + (activePieza.config.filamentoId === f.id ? ' active' : '')}
      onClick={() => pz.changeMaterial(f)}
    >
      {USO[f.material] ? (
        <>
          {USO[f.material].nombre} <small>{f.material}</small>
        </>
      ) : (
        f.material
      )}
    </button>
  );

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
          {principales.map(pill)}
          {verOtros && otros.map(pill)}
        </div>
        <p className="qt-step-hint">
          {activeFilamento && (USO[activeFilamento.material]?.para ?? activeFilamento.descripcion)}{' '}
          {!verOtros && otros.length > 0 && (
            <button type="button" className="qt-link" onClick={() => setMasMateriales(true)}>
              Más materiales
            </button>
          )}
        </p>
      </div>

      {/* color */}
      <div className="qt-step">
        <div className="qt-step-label">
          2 · Color{partsMode ? ' por parte' : ''}
          {elegido ? <span className="qt-step-valor">{elegido.nombre}</span> : <small> (opcional)</small>}
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

        <div className="qt-step-enlaces">
          {!partsMode && (
            <button
              type="button"
              className="qt-link"
              aria-pressed={activePieza.config.multicolor}
              onClick={() =>
                patchActiveConfig({
                  multicolor: !activePieza.config.multicolor,
                  extraColors: activePieza.config.multicolor ? [] : activePieza.config.extraColors
                })
              }
            >
              {activePieza.config.multicolor ? 'Solo un color' : '¿Varios colores?'}
            </button>
          )}
        </div>

        {!partsMode && (
          <>
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

        {activeColors.length > 1 && (
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

    </>
  );
}
