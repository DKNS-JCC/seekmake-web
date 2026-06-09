'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Producto } from '@/lib/types';
import './catalogo.css';

type SortKey = 'destacado' | 'precio-asc' | 'precio-desc' | 'nombre';
type ViewMode = 'grid' | 'list';

export function CatalogoClient({ productos: initialProductos }: { productos: Producto[] }) {
  const [productos, setProductos] = useState<Producto[]>(initialProductos);

  // Client-side refresh to ensure dynamic updates for static exports
  useEffect(() => {
    const fetchFreshData = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('productos')
        .select('*')
        .order('destacado', { ascending: false })
        .order('legacy_id');
      if (data) setProductos(data);
    };
    fetchFreshData();
  }, []);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('todas');
  const [sort, setSort] = useState<SortKey>('destacado');
  const [view, setView] = useState<ViewMode>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [active, setActive] = useState<Producto | null>(null);

  // ESC closes the modal.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const closeModal = () => setActive(null);

  // ----- Stats -------------------------------------------------------------
  const stats = useMemo(() => {
    const total = productos.length;
    const categoriasCount = new Set(productos.map((p) => p.categoria)).size;
    const destacados = productos.filter((p) => p.destacado).length;
    return { total, categoriasCount, destacados };
  }, [productos]);

  // Compute unique categories for pills
  const allCategories = useMemo(() => {
    return Array.from(new Set(productos.map((p) => p.categoria))).sort();
  }, [productos]);

  // ----- Filtering + sorting -----------------------------------------------
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = productos.filter((p) => {
      if (category !== 'todas' && p.categoria !== category) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q) ||
        p.etiquetas.some((t) => t.toLowerCase().includes(q))
      );
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case 'precio-asc':  return a.precio - b.precio;
        case 'precio-desc': return b.precio - a.precio;
        case 'nombre':      return a.nombre.localeCompare(b.nombre);
        default:
          // destacado first, then alphabetical
          return (
            Number(b.destacado) - Number(a.destacado) ||
            a.nombre.localeCompare(b.nombre)
          );
      }
    });
    return out;
  }, [productos, query, category, sort]);

  const resetFilters = () => {
    setQuery('');
    setCategory('todas');
    setSort('destacado');
  };

  const empty = productos.length === 0;

  return (
    <>
      {/* Hero */}
      <section className="cat-hero">
        <div className="cat-hero-bg" style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.1), rgba(0,0,0,0.8))' }}>
        </div>
        <div className="cat-hero-content">
          <div className="cat-hero-tag">Catálogo 3DCC</div>
          <h1>
            Nuestros<br />
            <span>Productos</span>
          </h1>
          <p className="cat-hero-desc">
            Diseños impresos en 3D de la más alta calidad, con precisión milimétrica y atención al detalle en cada pieza.
          </p>
          <div className="cat-hero-stats">
            <div>
              <div className="cat-hero-stat-num">{stats.total}</div>
              <div className="cat-hero-stat-label">Productos</div>
            </div>
            <div>
              <div className="cat-hero-stat-num">{stats.categoriasCount}</div>
              <div className="cat-hero-stat-label">Categorías</div>
            </div>
            <div>
              <div className="cat-hero-stat-num">{stats.destacados}</div>
              <div className="cat-hero-stat-label">Destacados</div>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="cat-filters">
        <div className="cat-filters-inner">
          <button
            type="button"
            className="cat-filter-toggle"
            aria-label="Mostrar filtros"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <span className="cat-filter-toggle-left">
              <svg
                width="16"
                height="16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
              </svg>
              Filtros
            </span>
            <span className="cat-filter-toggle-count">
              {visible.length} productos
            </span>
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

          <div className="cat-pills">
            {['todas', ...allCategories].map((c) => (
              <button
                key={c}
                type="button"
                className={'cat-pill' + (category === c ? ' active' : '')}
                onClick={() => setCategory(c)}
              >
                {c === 'todas' ? 'Todos' : c}
              </button>
            ))}
          </div>

          <div className={'cat-filters-row' + (filtersOpen ? ' open' : '')}>
            <div className="cat-search">
              <svg
                className="cat-search-icon"
                width="16"
                height="16"
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
                placeholder="Buscar por nombre, tipo o etiqueta..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="cat-select-wrap">
              <select
                className="cat-select"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Ordenar productos"
              >
                <option value="destacado">Destacados</option>
                <option value="precio-asc">Precio ↑</option>
                <option value="precio-desc">Precio ↓</option>
                <option value="nombre">A — Z</option>
              </select>
            </div>

            <div className="cat-view-toggle">
              <button
                type="button"
                className={'cat-view-btn' + (view === 'grid' ? ' active' : '')}
                aria-label="Vista cuadrícula"
                onClick={() => setView('grid')}
              >
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </button>
              <button
                type="button"
                className={'cat-view-btn' + (view === 'list' ? ' active' : '')}
                aria-label="Vista lista"
                onClick={() => setView('list')}
              >
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                </svg>
              </button>
            </div>

            <button
              type="button"
              className="cat-reset-btn"
              aria-label="Resetear filtros"
              onClick={resetFilters}
            >
              <svg
                width="16"
                height="16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </div>

          <div className="cat-results-count">
            <strong>{visible.length}</strong> productos encontrados
          </div>
        </div>
      </section>

      {/* Grid */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 64px' }}>
        {empty ? (
          <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
            <div className="cat-empty">
              <div className="cat-empty-icon">
                <svg
                  width="20"
                  height="20"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <h3>Catálogo vacío</h3>
              <p>
                Estamos trabajando para llenar este catálogo con increíbles
                productos. ¡Vuelve pronto para descubrir nuestras creaciones!
              </p>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div>
            <div className="cat-empty">
              <div className="cat-empty-icon">
                <svg
                  width="20"
                  height="20"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                  <path d="M8 11h6" />
                </svg>
              </div>
              <h3>Sin resultados</h3>
              <p>
                No encontramos productos con esos filtros. Prueba con otros
                términos o resetea los filtros.
              </p>
            </div>
          </div>
        ) : (
          <div className={'cat-grid' + (view === 'list' ? ' list-view' : '')}>
            {visible.map((p) => (
              <article
                key={p.id}
                className="p-card"
                onClick={() => setActive(p)}
              >
                {p.destacado && (
                  <span className="p-card-badge">★ Destacado</span>
                )}
                <div className="p-card-img">
                  {p.imagen ? (
                    <img src={p.imagen} alt={p.nombre} loading="lazy" />
                  ) : (
                    <div className="p-card-img-placeholder">
                      <svg
                        width="48"
                        height="48"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1}
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-card-body">
                  <div className="p-card-category">{p.categoria}</div>
                  <h3 className="p-card-name">{p.nombre}</h3>
                  <p className="p-card-desc">{p.descripcion}</p>
                  <div className="p-card-footer">
                    <span className="p-card-price">
                      {Math.floor(p.precio)}
                      <span className="eur">
                        .{((p.precio % 1) * 100).toString().padStart(2, '0')}€
                      </span>
                    </span>
                    <button
                      type="button"
                      className="p-card-action"
                      aria-label="Ver detalles"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActive(p);
                      }}
                    />

                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* CTA */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 64px' }}>
        <div className="cat-cta">
          <div className="cat-cta-inner">
            <div>
              <div className="cat-cta-tag">Diseño personalizado</div>
              <h2>
                ¿No encuentras
                <br />
                lo que buscas?
              </h2>
              <p>
                Podemos crear cualquier diseño personalizado. Cuéntanos tu
                proyecto y lo haremos realidad.
              </p>
            </div>
            <div className="cat-cta-actions">
              <Link href="/#contacto" className="btn-outline">
                Contactar
              </Link>
              <Link href="/instant-quote" className="btn-primary">
                Calcular precio
                <svg
                  width="14"
                  height="14"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <ProductModal active={active} onClose={closeModal} />
    </>
  );
}

function ProductModal({
  active,
  onClose
}: {
  active: Producto | null;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  if (!active) {
    return <div ref={overlayRef} className="cat-modal-overlay" aria-hidden />;
  }

  return (
    <div
      ref={overlayRef}
      className="cat-modal-overlay open"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="cat-modal">
        <button
          type="button"
          onClick={onClose}
          className="cat-modal-close"
          aria-label="Cerrar"
        >
          <svg
            width="18"
            height="18"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="cat-modal-image">
          {active.imagen ? (
            <img src={active.imagen} alt={active.nombre} />
          ) : (
            <svg
              width="48"
              height="48"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
              style={{ color: 'var(--muted)', opacity: 0.3 }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          )}
        </div>
        <div className="cat-modal-body">
          <div className="cat-modal-tag">{active.categoria}</div>
          <h3 className="cat-modal-title">{active.nombre}</h3>
          <p className="cat-modal-desc">{active.descripcion}</p>

          <div className="cat-modal-specs">
            <div className="cat-modal-spec">
              <div className="cat-modal-spec-label">Precio</div>
              <div className="cat-modal-spec-value price-val">
                {active.precio.toFixed(2)}€
              </div>
            </div>
            <div className="cat-modal-spec">
              <div className="cat-modal-spec-label">Material</div>
              <div className="cat-modal-spec-value">{active.material}</div>
            </div>
            <div className="cat-modal-spec">
              <div className="cat-modal-spec-label">Colores</div>
              <div className="cat-modal-spec-value">
                {active.colores.length > 0
                  ? active.colores.join(', ')
                  : 'Consultar'}
              </div>
            </div>
            <div className="cat-modal-spec">
              <div className="cat-modal-spec-label">Dimensiones</div>
              <div className="cat-modal-spec-value">
                {active.dimensiones || '—'}
              </div>
            </div>
            <div className="cat-modal-spec" style={{ gridColumn: '1 / -1' }}>
              <div className="cat-modal-spec-label">Peso aproximado</div>
              <div className="cat-modal-spec-value">{active.peso || '—'}</div>
            </div>
          </div>

          <div className="cat-modal-actions">
            <Link
              href="/#contacto"
              className="btn-primary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Solicitar
              <svg
                width="14"
                height="14"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/muestrario"
              className="btn-outline"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Ver Colores
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
