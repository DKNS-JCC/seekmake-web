'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { acabadoLabel, type Acabado, type Color, type Filamento } from '@/lib/types';
import { colorPreviewStyle } from '@/lib/color-preview';
import { useCatalogoColores } from '@/lib/useCatalogoColores';
import './muestrario.css';
import { whatsappUrl } from '@/lib/contacto';
import { activable } from '@/lib/a11y';

// Lazy-load the 3D visualizer so three.js (~150 KB gzipped) doesn't ship
// with the muestrario bundle until the user opens it.
const Visualizer3D = dynamic(
  () => import('./Visualizer3D').then((m) => m.Visualizer3D),
  { ssr: false }
);

const WA_BASE = whatsappUrl();

// Material technical specs — same data the legacy JS embedded inline.
const ESPECIFICACIONES: Record<
  string,
  { usos: string; resistencia: string; temp: string; exterior: string; flexibilidad: string }
> = {
  PLA: {
    usos: 'Decoración, prototipos, figuras, maquetas',
    resistencia: 'Media',
    temp: '50-60°C',
    exterior: 'No recomendado',
    flexibilidad: 'Rígido'
  },
  PETG: {
    usos: 'Piezas funcionales, uso diario, contenedores',
    resistencia: 'Alta',
    temp: '70-80°C',
    exterior: 'Moderado',
    flexibilidad: 'Semi-rígido'
  },
  ASA: {
    usos: 'Exterior, automoción, alta temperatura',
    resistencia: 'Muy Alta',
    temp: '100-120°C',
    exterior: 'Excelente',
    flexibilidad: 'Rígido'
  },
  TPU: {
    usos: 'Fundas, juntas, amortiguadores, carcasas',
    resistencia: 'Muy Alta',
    temp: '60-70°C',
    exterior: 'Bueno',
    flexibilidad: 'Elástico (95A)'
  }
};

const MATERIAL_DESC: Record<string, string> = {
  PLA: 'Biodegradable, excelente acabado. Ideal para prototipos y piezas decorativas.',
  PETG: 'Alta resistencia mecánica y térmica. Para piezas funcionales.',
  ASA: 'Resistente a UV e intemperie. El mejor para uso exterior.',
  TPU: 'Flexible y elástico. Ideal para fundas, juntas y amortiguadores.'
};

function getFinishClass(acabado: Acabado | null | undefined): string {
  if (!acabado) return '';
  const map: Record<Acabado, string> = {
    'Metálico':    'finish-metallic',
    'Fluorescente':'finish-fluorescente',
    'Translucido': 'finish-translucido',
    'Textura':     'finish-textura',
    'Brillante':   'finish-brillante',
    'Purpurina':   'finish-purpurina',
    'Mate':        'finish-mate',
    'Flexible':    'finish-flexible'
  };
  return map[acabado] ?? '';
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ─── Color theory helpers ────────────────────────────────────────────────
// Combinations are computed automatically from each color's HSL value:
// neutrals pair with anything; saturated colors pair with their harmonic
// hue partners (mono, analogous, triadic, split-complementary, complementary).
// The metric is symmetric: if A → B is a match, B → A is too.

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const v = hex.replace('#', '');
  const n = v.length === 3
    ? v.split('').map((c) => c + c).join('')
    : v.padEnd(6, '0');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h, s, l };
}

function isNeutral(hsl: { h: number; s: number; l: number }): boolean {
  return hsl.s < 0.12 || hsl.l < 0.08 || hsl.l > 0.95;
}

// Lower = more harmonious. Returns Infinity for identical colors.
function harmonyScore(a: Color, b: Color): number {
  if (a.id === b.id) return Infinity;
  const A = hexToHsl(a.hex);
  const B = hexToHsl(b.hex);
  const aN = isNeutral(A);
  const bN = isNeutral(B);
  // Neutrals pair with anything; small penalty between two near-identical
  // neutrals so we surface more interesting matches first.
  if (aN || bN) {
    // Two near-identical neutrals (white+white) get a small penalty so
    // contrasting neutrals (black+white) and neutral+color pairs win.
    if (aN && bN) return Math.abs(A.l - B.l) < 0.08 ? 8 : 2;
    return 2;
  }
  const dh = Math.abs(A.h - B.h);
  const wrap = Math.min(dh, 360 - dh); // 0..180
  // Classic harmonic angles relative to the base hue.
  const targets = [0, 30, 120, 150, 180];
  let best = Infinity;
  for (const t of targets) {
    const d = Math.abs(wrap - t);
    if (d < best) best = d;
  }
  // Penalty for two colors that are basically the same hue AND same
  // lightness — they "match" but look like the same chip twice.
  const lightnessGap = Math.abs(A.l - B.l);
  if (best < 8 && lightnessGap < 0.1) best += 20;
  return best;
}

function computeMatches(base: Color, all: Color[], limit = 6): Color[] {
  return all
    .filter((c) => c.id !== base.id)
    .map((c) => ({ c, score: harmonyScore(base, c) }))
    .filter((x) => x.score < 18) // harmonic threshold
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.c);
}

interface SelectedColor {
  color: Color;
  material: string;
}

type TestAnswers = Record<1 | 2 | 3 | 4, string | undefined>;

export function MuestrarioClient({
  filamentos: initialFilamentos,
  colores: initialColores
}: {
  filamentos: Filamento[];
  colores: Color[];
}) {
  // Static export bakes these in at build time; the hook swaps in live data
  // on mount so admin edits (new colours, agotado) show up without a rebuild.
  const { filamentos, colores } = useCatalogoColores({
    filamentos: initialFilamentos,
    colores: initialColores
  });

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | string>('all');
  const [selected, setSelected] = useState<SelectedColor | null>(null);
  const [hexCopied, setHexCopied] = useState(false);

  // Material test state
  const [testOpen, setTestOpen] = useState(false);
  const [testStage, setTestStage] =
    useState<'start' | 'questions' | 'result'>('start');
  const [answers, setAnswers] = useState<TestAnswers>({} as TestAnswers);
  const [currentQ, setCurrentQ] = useState<1 | 2 | 3 | 4>(1);

  // Group colors by filamento_id for fast lookup.
  const byFilamento = useMemo(() => {
    const map = new Map<string, Color[]>();
    for (const c of colores) {
      const arr = map.get(c.filamento_id) ?? [];
      arr.push(c);
      map.set(c.filamento_id, arr);
    }
    return map;
  }, [colores]);

  const empty = filamentos.length === 0;

  // 3D visualizer
  const [vizOpen, setVizOpen] = useState(false);

  // ----- Modal helpers ------------------------------------------------------

  const openModal = (color: Color, material: string) => {
    setSelected({ color, material });
    setHexCopied(false);
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    setSelected(null);
    document.body.style.overflow = '';
  };

  // ESC closes the modal.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const copyHex = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.color.hex);
      setHexCopied(true);
      setTimeout(() => setHexCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  // ----- Test helpers -------------------------------------------------------

  const startTest = () => {
    setAnswers({} as TestAnswers);
    setCurrentQ(1);
    setTestStage('questions');
  };

  const answer = (q: 1 | 2 | 3 | 4, value: string) => {
    const next = { ...answers, [q]: value };
    setAnswers(next);
    if (q < 4) setCurrentQ(((q as number) + 1) as 1 | 2 | 3 | 4);
    else setTestStage('result');
  };

  const restartTest = () => {
    setAnswers({} as TestAnswers);
    setCurrentQ(1);
    setTestStage('start');
  };

  const recommendedMaterial = useMemo(() => {
    if (answers[2] === 'flexible') return 'TPU';
    if (answers[1] === 'exterior') return 'ASA';
    if (answers[3] === 'resistente') return 'PETG';
    return 'PLA';
  }, [answers]);

  const recommendedFilamento = filamentos.find(
    (f) => f.material === recommendedMaterial
  );

  // ----- Filtering ----------------------------------------------------------

  const filteredCardId = (c: Color) => {
    if (!query) return true;
    const q = normalize(query);
    return (
      normalize(c.nombre).includes(q) ||
      normalize(c.acabado ?? '').includes(q) ||
      c.hex.toLowerCase().includes(q)
    );
  };

  // ----- Material tab scroll -----------------------------------------------

  const scrollToMaterial = (materialId: string) => {
    setActiveTab(materialId);
    if (materialId === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = document.getElementById('material-' + materialId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ----- Render -------------------------------------------------------------

  return (
    <>
      <section className="mu-hero">
        <div className="container-3dcc">
          <div className="section-tag">Muestrario</div>
          <h1>Colores y Materiales</h1>
          <p className="mu-hero-desc">
            Explora nuestra paleta de filamentos 3D. Pulsa sobre cualquier color
            para ver los detalles.
          </p>
          <div className="mu-hero-tip">
            Puedes solicitar una <strong>foto real</strong> del color antes de
            tu pedido
          </div>
        </div>
      </section>

      {/* Material Test */}
      <div className="mu-test">
        <div className="mu-test-card">
          <button
            type="button"
            className={'mu-test-toggle' + (testOpen ? ' open' : '')}
            onClick={() => setTestOpen((v) => !v)}
          >
            <div className="mu-test-toggle-left">
              <div>
                <div className="mu-test-toggle-label">Descubre tu material</div>
                <div className="mu-test-toggle-title">
                  ¿Cuál es tu material ideal?
                </div>
              </div>
            </div>
            <svg
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <div className={'mu-test-body' + (testOpen ? ' open' : '')}>
            {testStage === 'start' && (
              <div style={{ textAlign: 'center', padding: '8px 0 12px' }}>
                <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
                  Responde 4 preguntas rápidas para descubrir el filamento perfecto
                </p>
                <button
                  type="button"
                  onClick={startTest}
                  className="btn-primary"
                  style={{ padding: '10px 24px' }}
                >
                  Comenzar
                </button>
              </div>
            )}
            {testStage === 'questions' && (
              <div>
                <div className="mu-test-progress">
                  <div className="mu-test-progress-label">
                    Pregunta {currentQ} de 4
                  </div>
                  <div className="mu-test-progress-bar">
                    <div
                      className="mu-test-progress-fill"
                      style={{ width: `${(currentQ / 4) * 100}%` }}
                    />
                  </div>
                </div>
                {currentQ === 1 && (
                  <>
                    <div className="mu-test-q">
                      ¿Tu pieza estará expuesta al sol o intemperie?
                    </div>
                    <div className="mu-test-options">
                      <button className="mu-test-opt" onClick={() => answer(1, 'exterior')}>
                        Sí, exterior
                      </button>
                      <button className="mu-test-opt" onClick={() => answer(1, 'interior')}>
                        No, interior
                      </button>
                    </div>
                  </>
                )}
                {currentQ === 2 && (
                  <>
                    <div className="mu-test-q">¿Necesitas que sea flexible o elástica?</div>
                    <div className="mu-test-options">
                      <button className="mu-test-opt" onClick={() => answer(2, 'flexible')}>
                        Sí, flexible
                      </button>
                      <button className="mu-test-opt" onClick={() => answer(2, 'rigido')}>
                        No, rígida
                      </button>
                    </div>
                  </>
                )}
                {currentQ === 3 && (
                  <>
                    <div className="mu-test-q">¿Soportará esfuerzos mecánicos o golpes?</div>
                    <div className="mu-test-options">
                      <button className="mu-test-opt" onClick={() => answer(3, 'resistente')}>
                        Sí, resistente
                      </button>
                      <button className="mu-test-opt" onClick={() => answer(3, 'decorativo')}>
                        No, decorativo
                      </button>
                    </div>
                  </>
                )}
                {currentQ === 4 && (
                  <>
                    <div className="mu-test-q">¿Qué priorizas más?</div>
                    <div className="mu-test-options">
                      <button className="mu-test-opt" onClick={() => answer(4, 'calidad')}>
                        Máxima calidad
                      </button>
                      <button className="mu-test-opt" onClick={() => answer(4, 'precio')}>
                        Mejor precio
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {testStage === 'result' && (
              <div className="mu-test-result">
                <div className="mu-test-progress-label">Tu material recomendado</div>
                <div className="mu-test-result-name">{recommendedMaterial}</div>
                <p className="mu-test-result-desc">
                  {MATERIAL_DESC[recommendedMaterial]}
                </p>
                <div className="mu-test-result-colors">
                  {recommendedFilamento &&
                    (byFilamento.get(recommendedFilamento.id) ?? []).map((c) => (
                      <div
                        key={c.id}
                        className="mu-test-result-swatch"
                        style={colorPreviewStyle(c)}
                        title={c.nombre}
                        {...activable(
                          () => openModal(c, recommendedMaterial),
                          `Ver el color ${c.nombre}`
                        )}
                      />
                    ))}
                </div>
                <div className="mu-test-result-actions">
                  <button
                    onClick={restartTest}
                    className="btn-outline"
                    style={{ padding: '8px 18px' }}
                  >
                    Repetir
                  </button>
                  <Link
                    href="/instant-quote"
                    className="btn-primary"
                    style={{ padding: '8px 18px' }}
                  >
                    Calcular precio
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mu-filters">
        <div className="mu-filters-inner">
          <div className="mu-pills">
            <button
              type="button"
              className={'mu-pill' + (activeTab === 'all' ? ' active' : '')}
              onClick={() => scrollToMaterial('all')}
            >
              Todos
            </button>
            {filamentos.map((f) => (
              <button
                key={f.id}
                type="button"
                className={'mu-pill' + (activeTab === f.material ? ' active' : '')}
                onClick={() => scrollToMaterial(f.material)}
              >
                {f.nombre}
                <span className="mu-pill-count">
                  {(byFilamento.get(f.id) ?? []).length}
                </span>
              </button>
            ))}
          </div>
          <div className="mu-search">
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Buscar color..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main */}
      <main
        id="filamentosContainer"
        style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 64px' }}
      >
        {empty ? (
          <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
            <p style={{ color: 'var(--muted)' }}>
              Aún no se ha conectado Supabase. Configura{' '}
              <code>NEXT_PUBLIC_SUPABASE_URL</code> y la anon key en{' '}
              <code>.env.local</code>, ejecuta el schema en{' '}
              <code>supabase/migrations/</code> y corre <code>npm run seed</code>{' '}
              para poblar los datos desde los YAML originales.
            </p>
          </div>
        ) : (
          filamentos.map((f) => {
            const items = byFilamento.get(f.id) ?? [];
            const specs = ESPECIFICACIONES[f.material];
            return (
              <section
                key={f.id}
                id={'material-' + f.material}
                className="mu-section"
              >
                <div className="mu-section-header">
                  <h2 className="mu-section-name">{f.nombre}</h2>
                  <span className="mu-section-desc">{f.descripcion}</span>
                  <span className="mu-section-count">
                    {items.length} {items.length === 1 ? 'color' : 'colores'}
                  </span>
                </div>

                {specs && (
                  <div className="mu-specs">
                    <div className="mu-spec">
                      <div className="mu-spec-label">Resistencia</div>
                      <div className="mu-spec-value">{specs.resistencia}</div>
                    </div>
                    <div className="mu-spec">
                      <div className="mu-spec-label">Temperatura max.</div>
                      <div className="mu-spec-value">{specs.temp}</div>
                    </div>
                    <div className="mu-spec">
                      <div className="mu-spec-label">Flexibilidad</div>
                      <div className="mu-spec-value">{specs.flexibilidad}</div>
                    </div>
                    <div className="mu-spec">
                      <div className="mu-spec-label">Exterior</div>
                      <div className="mu-spec-value">{specs.exterior}</div>
                    </div>
                  </div>
                )}

                <div className="mu-color-grid">
                  {items.map((c) => {
                    const matches = filteredCardId(c);
                    const finishClass = getFinishClass(c.acabado);
                    const glowStyle =
                      c.acabado === 'Fluorescente'
                        ? ({ ['--glow-color' as any]: c.hex } as React.CSSProperties)
                        : {};
                    return (
                      <div
                        key={c.id}
                        className={'mu-color-card' + (matches ? '' : ' dimmed')}
                        title={c.nombre}
                        {...activable(() => openModal(c, f.nombre), `Ver el color ${c.nombre}`)}
                      >
                        <div
                          className={'mu-swatch ' + finishClass}
                          style={{ ...colorPreviewStyle(c), ...glowStyle }}
                        >
                          {c.oferta && <div className="mu-swatch-oferta">OFERTA</div>}
                          {c.agotado && (
                            <div className="mu-swatch-agotado">AGOTADO</div>
                          )}
                          {c.acabado && (
                            <span className="mu-swatch-acabado">{acabadoLabel(c.acabado)}</span>
                          )}
                        </div>
                        <div className="mu-color-info">
                          <div className="mu-color-name">{c.nombre}</div>
                          <div className="mu-color-hex">{c.hex}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </main>

      {/* CTA */}
      <section
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 24px 64px'
        }}
      >
        <div className="mu-cta">
          <div className="mu-cta-inner">
            <div>
              <div className="section-tag">Más información</div>
              <h2>
                ¿Necesitas ayuda
                <br />
                con tu proyecto?
              </h2>
              <p>
                Contacta con nosotros para conocer más detalles sobre
                materiales, acabados o cualquier consulta.
              </p>
            </div>
            <div className="mu-cta-actions">
              <Link href="/#contacto" className="btn-outline">
                Contactar
              </Link>
              <Link href="/instant-quote" className="btn-primary">
                Calcular precio
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Modal */}
      <ColorModal
        selected={selected}
        onClose={closeModal}
        hexCopied={hexCopied}
        onCopyHex={copyHex}
        colores={colores}
        onJumpToColor={(c, material) => openModal(c, material)}
      />

      {/* Floating 3D visualizer button */}
      {!empty && (
        <button
          type="button"
          className="viz-fab"
          onClick={() => setVizOpen(true)}
          aria-label="Abrir visualizador 3D"
        >
          <svg
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
          </svg>
          Visualizador 3D
        </button>
      )}

      {vizOpen && (
        <Visualizer3D
          filamentos={filamentos}
          colores={colores}
          initialSelected={
            selected
              ? {
                  color: selected.color,
                  filamento:
                    filamentos.find(
                      (f) =>
                        f.nombre === selected.material ||
                        f.material === selected.material
                    ) ?? filamentos[0]
                }
              : null
          }
          onClose={() => setVizOpen(false)}
        />
      )}
    </>
  );
}

function ColorModal({
  selected,
  onClose,
  hexCopied,
  onCopyHex,
  colores,
  onJumpToColor
}: {
  selected: SelectedColor | null;
  onClose: () => void;
  hexCopied: boolean;
  onCopyHex: () => void;
  colores: Color[];
  onJumpToColor: (c: Color, material: string) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  if (!selected) {
    return (
      <div ref={overlayRef} className="mu-modal-overlay" aria-hidden />
    );
  }

  const { color, material } = selected;
  const materialKey = material.replace(/\s.*/, '');
  const specs = ESPECIFICACIONES[materialKey];
  const finishClass = getFinishClass(color.acabado);
  const glowStyle =
    color.acabado === 'Fluorescente'
      ? ({ ['--glow-color' as any]: color.hex } as React.CSSProperties)
      : {};

  // Auto-computed matching colors based on color theory (HSL harmony).
  // Restricted to the SAME material — two filaments only combine if you
  // can physically print them on the same machine/setup.
  const sameMaterial = colores.filter(
    (c) => c.filamento_id === color.filamento_id
  );
  const matchingColors = computeMatches(color, sameMaterial);

  const waMsg = encodeURIComponent(
    `Hola, me gustaría recibir una foto real del color ${color.nombre} (${color.hex}) en ${material}. Gracias.`
  );

  return (
    <div
      ref={overlayRef}
      className="mu-modal-overlay open"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="mu-modal">
        <div
          className="mu-modal-swatch"
            style={{ ...colorPreviewStyle(color), ...glowStyle }}
        >
          <div className={'mu-modal-finish ' + finishClass} />
          <button
            type="button"
            onClick={onClose}
            className="mu-modal-close"
            aria-label="Cerrar"
          >
            <svg
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          {color.acabado && (
            <span className="mu-modal-acabado-badge">{acabadoLabel(color.acabado)}</span>
          )}
          {color.agotado && <div className="mu-swatch-agotado">AGOTADO</div>}
        </div>
        <div className="mu-modal-body">
          <h3 className="mu-modal-name">{color.nombre}</h3>
          <div className="mu-modal-material">{material}</div>

          <div className="mu-modal-hex-row">
            <span className="mu-modal-hex">
              {hexCopied ? 'Copiado' : color.hex}
            </span>
            <button
              type="button"
              className={'mu-modal-copy' + (hexCopied ? ' copied' : '')}
              onClick={onCopyHex}
            >
              Copiar
              <svg
                width="12"
                height="12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>

          {specs && (
            <>
              <div className="mu-modal-specs">
                <div className="mu-modal-spec">
                  <div className="mu-modal-spec-label">Resistencia</div>
                  <div className="mu-modal-spec-val">{specs.resistencia}</div>
                </div>
                <div className="mu-modal-spec">
                  <div className="mu-modal-spec-label">Temperatura Max.</div>
                  <div className="mu-modal-spec-val">{specs.temp}</div>
                </div>
                <div className="mu-modal-spec">
                  <div className="mu-modal-spec-label">Exterior</div>
                  <div className="mu-modal-spec-val">{specs.exterior}</div>
                </div>
                <div className="mu-modal-spec">
                  <div className="mu-modal-spec-label">Flexibilidad</div>
                  <div className="mu-modal-spec-val">{specs.flexibilidad}</div>
                </div>
              </div>
              <div className="mu-modal-usos">
                <strong>Usos recomendados</strong>
                <span>{specs.usos}</span>
              </div>
            </>
          )}

          {matchingColors.length > 0 && (
            <div className="mu-modal-combina">
              <span className="mu-modal-combina-label">Combina con</span>
              <div className="mu-modal-combina-list">
                {matchingColors.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="mu-modal-combina-item"
                    onClick={() => onJumpToColor(m, material)}
                  >
                    <span
                      className="mu-modal-combina-swatch"
                      style={colorPreviewStyle(m)}
                    />
                    <span className="mu-modal-combina-name">{m.nombre}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mu-modal-actions">
            <Link
              href="/instant-quote"
              className="btn-primary"
              style={{
                fontSize: 14,
                padding: '10px 20px',
                justifyContent: 'center'
              }}
            >
              Calcular precio
            </Link>
            <a
              href={`${WA_BASE}?text=${waMsg}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline"
              style={{
                fontSize: 14,
                padding: '10px 20px',
                justifyContent: 'center',
                borderColor: '#25D366',
                color: '#25D366'
              }}
            >
              Pedir foto real
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
