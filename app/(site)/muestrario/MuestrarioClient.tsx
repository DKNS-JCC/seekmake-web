'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Acabado, Color, Filamento } from '@/lib/types';
import './muestrario.css';

const WA_BASE = 'https://wa.me/34665148956';

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

interface SelectedColor {
  color: Color;
  material: string;
}

type TestAnswers = Record<1 | 2 | 3 | 4, string | undefined>;

export function MuestrarioClient({
  filamentos,
  colores
}: {
  filamentos: Filamento[];
  colores: Color[];
}) {
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
                  style={{ padding: '10px 24px', fontSize: 11 }}
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
                        style={{ backgroundColor: c.hex }}
                        title={c.nombre}
                        onClick={() => openModal(c, recommendedMaterial)}
                      />
                    ))}
                </div>
                <div className="mu-test-result-actions">
                  <button
                    onClick={restartTest}
                    className="btn-outline"
                    style={{ padding: '8px 18px', fontSize: 11 }}
                  >
                    Repetir
                  </button>
                  <Link
                    href="/instant-quote"
                    className="btn-primary"
                    style={{ padding: '8px 18px', fontSize: 11 }}
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
                    {items.length} colores
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
                        onClick={() => openModal(c, f.nombre)}
                      >
                        <div
                          className={'mu-swatch ' + finishClass}
                          style={{ backgroundColor: c.hex, ...glowStyle }}
                        >
                          {c.oferta && <div className="mu-swatch-oferta">OFERTA</div>}
                          {c.acabado && (
                            <span className="mu-swatch-acabado">{c.acabado}</span>
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
        byFilamento={byFilamento}
        filamentos={filamentos}
        onJumpToColor={(c, material) => openModal(c, material)}
      />
    </>
  );
}

function ColorModal({
  selected,
  onClose,
  hexCopied,
  onCopyHex,
  byFilamento,
  filamentos,
  onJumpToColor
}: {
  selected: SelectedColor | null;
  onClose: () => void;
  hexCopied: boolean;
  onCopyHex: () => void;
  byFilamento: Map<string, Color[]>;
  filamentos: Filamento[];
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

  // Find matching colors via name lookup within the same material.
  const filamento = filamentos.find((f) => f.nombre === material || f.material === materialKey);
  const materialColors = filamento ? byFilamento.get(filamento.id) ?? [] : [];
  const matchingColors: Color[] = (color.combina_con ?? [])
    .map((n) => materialColors.find((c) => c.nombre === n))
    .filter((c): c is Color => Boolean(c));

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
          style={{ backgroundColor: color.hex, ...glowStyle }}
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
            <span className="mu-modal-acabado-badge">{color.acabado}</span>
          )}
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
                      style={{ backgroundColor: m.hex }}
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
                fontSize: 11,
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
                fontSize: 11,
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
