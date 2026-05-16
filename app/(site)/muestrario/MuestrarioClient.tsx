'use client';

import { useMemo, useState } from 'react';
import type { Color, Filamento } from '@/lib/types';

// Minimal first cut. The full muestrario port (interactive material test,
// finish overlays, sticky tabs, modal preview) is the next migration step
// and will live in this file.
export function MuestrarioClient({
  filamentos,
  colores
}: {
  filamentos: Filamento[];
  colores: Color[];
}) {
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const byMat = new Map<string, Color[]>();
    for (const c of colores) {
      const arr = byMat.get(c.filamento_id) ?? [];
      arr.push(c);
      byMat.set(c.filamento_id, arr);
    }
    return byMat;
  }, [colores]);

  const empty = filamentos.length === 0;

  return (
    <main className="page-content">
      <div className="container-3dcc" style={{ paddingTop: 56, paddingBottom: 96 }}>
        <div className="section-tag">Materiales y Colores</div>
        <h1 className="section-title">Muestrario</h1>
        <p className="section-desc" style={{ marginTop: 18, marginBottom: 40 }}>
          Filamentos disponibles. Pulsa sobre cualquier color para copiar su
          código.
        </p>

        {empty ? (
          <div className="card" style={{ maxWidth: 720 }}>
            <p style={{ color: 'var(--muted)' }}>
              Aún no se ha conectado Supabase. Configura{' '}
              <code>NEXT_PUBLIC_SUPABASE_URL</code> y la anon key en{' '}
              <code>.env.local</code>, ejecuta el schema en{' '}
              <code>supabase/migrations/0001_initial.sql</code> y corre{' '}
              <code>npm run seed</code> para poblar los datos desde los YAML
              originales.
            </p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 32 }}>
              <input
                type="text"
                placeholder="Buscar color..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: 360,
                  padding: '12px 16px',
                  borderRadius: 'var(--r)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13
                }}
              />
            </div>

            {filamentos.map((f) => {
              const items = (grouped.get(f.id) ?? []).filter((c) =>
                c.nombre.toLowerCase().includes(query.toLowerCase())
              );
              if (!items.length && query) return null;
              return (
                <section key={f.id} style={{ marginBottom: 56 }}>
                  <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: '0.04em' }}>
                    {f.material}
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                        color: 'var(--muted)',
                        marginLeft: 12,
                        letterSpacing: '0.1em'
                      }}
                    >
                      {items.length} colores
                    </span>
                  </h2>
                  <p style={{ color: 'var(--muted)', marginBottom: 24, maxWidth: 520 }}>
                    {f.descripcion}
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                      gap: 12
                    }}
                  >
                    {items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(c.hex);
                        }}
                        style={{
                          background: c.hex,
                          color: c.texto,
                          padding: 0,
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r)',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textAlign: 'left'
                        }}
                        title={`Copiar ${c.hex}`}
                      >
                        <div style={{ aspectRatio: '1', position: 'relative' }} />
                        <div style={{ padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)' }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{c.nombre}</div>
                          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'var(--muted)' }}>
                            {c.hex}
                            {c.acabado && ` · ${c.acabado}`}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}
