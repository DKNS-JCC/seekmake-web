'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Producto, Categoria } from '@/lib/types';

type SortKey = 'destacado' | 'price-asc' | 'price-desc' | 'name';

// Minimal first cut — full port (modal, fancy product cards, sticky filter
// bar, etc.) lives in the next migration step.
export function CatalogoClient({ productos }: { productos: Producto[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | Categoria>('all');
  const [sort, setSort] = useState<SortKey>('destacado');

  const visible = useMemo(() => {
    let out = productos.filter((p) => {
      if (category !== 'all' && p.categoria !== category) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          p.nombre.toLowerCase().includes(q) ||
          p.descripcion.toLowerCase().includes(q) ||
          p.etiquetas.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case 'price-asc':  return a.precio - b.precio;
        case 'price-desc': return b.precio - a.precio;
        case 'name':       return a.nombre.localeCompare(b.nombre);
        default:           return Number(b.destacado) - Number(a.destacado);
      }
    });
    return out;
  }, [productos, query, category, sort]);

  return (
    <main className="page-content">
      <div className="container-3dcc" style={{ paddingTop: 56, paddingBottom: 96 }}>
        <div className="section-tag">Productos</div>
        <h1 className="section-title">Catálogo</h1>
        <p className="section-desc" style={{ marginTop: 18, marginBottom: 32 }}>
          {productos.length === 0
            ? 'Conecta Supabase y ejecuta `npm run seed` para poblar el catálogo desde el YAML original.'
            : 'Selecciona el producto que quieres encargar y nos pondremos en contacto.'}
        </p>

        {productos.length > 0 && (
          <>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 32,
                alignItems: 'center'
              }}
            >
              <input
                type="text"
                placeholder="Buscar..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={inputStyle}
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as 'all' | Categoria)}
                style={inputStyle}
              >
                <option value="all">Todas las categorías</option>
                <option value="Keycaps">Keycaps</option>
                <option value="Figuras">Figuras</option>
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                style={inputStyle}
              >
                <option value="destacado">Destacados</option>
                <option value="price-asc">Precio: menor a mayor</option>
                <option value="price-desc">Precio: mayor a menor</option>
                <option value="name">Nombre A–Z</option>
              </select>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--muted)' }}>
                {visible.length} productos
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 16
              }}
            >
              {visible.map((p) => (
                <article
                  key={p.id}
                  className="card"
                  style={{ padding: 0, overflow: 'hidden', position: 'relative' }}
                >
                  {p.destacado && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        background: 'linear-gradient(90deg,#f59e0b,#f97316)',
                        color: '#fff',
                        fontSize: 10,
                        padding: '4px 10px',
                        borderRadius: 999,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        zIndex: 2
                      }}
                    >
                      ★ Destacado
                    </span>
                  )}
                  {p.imagen ? (
                    <img
                      src={p.imagen}
                      alt={p.nombre}
                      loading="lazy"
                      style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: 200, background: 'var(--surface-2)' }} />
                  )}
                  <div style={{ padding: 18 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{p.nombre}</div>
                    <p
                      style={{
                        fontSize: 13,
                        color: 'var(--muted)',
                        marginBottom: 12,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {p.descripcion}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 20 }}>
                        {p.precio.toFixed(2)} €
                      </span>
                      <Link href="/#contacto" className="btn-primary" style={{ padding: '8px 14px', fontSize: 11 }}>
                        Solicitar
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 'var(--r)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 12
};
