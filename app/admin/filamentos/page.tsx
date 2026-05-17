'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Acabado, Color, Filamento } from '@/lib/types';

const ACABADOS: Acabado[] = [
  'Metálico',
  'Fluorescente',
  'Translucido',
  'Textura',
  'Brillante',
  'Purpurina',
  'Mate',
  'Flexible'
];

export default function AdminFilamentos() {
  const [filamentos, setFilamentos] = useState<Filamento[]>([]);
  const [colores, setColores] = useState<Color[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lazy: avoid throwing during static prerender if env vars are missing.
  const supabase = () => createClient();

  useEffect(() => {
    const s = supabase();
    s.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    const s = supabase();
    const [fres, cres] = await Promise.all([
      s.from('filamentos').select('*').order('orden'),
      s.from('colores').select('*').order('orden')
    ]);
    if (fres.error) setError(fres.error.message);
    if (cres.error) setError(cres.error.message);
    setFilamentos(fres.data ?? []);
    setColores(cres.data ?? []);
    if (!active && fres.data?.[0]) setActive(fres.data[0].id);
    setLoading(false);
  }

  async function addFilamento() {
    const material = prompt('Material (PLA, PETG, ASA, TPU, ...)');
    if (!material) return;
    const nombre = prompt('Nombre completo') ?? material;
    const { error, data } = await supabase()
      .from('filamentos')
      .insert({
        material,
        nombre,
        descripcion: '',
        orden: filamentos.length
      })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    await refresh();
    if (data) setActive(data.id);
  }

  async function updateFilamento(f: Filamento, patch: Partial<Filamento>) {
    const { error } = await supabase()
      .from('filamentos')
      .update(patch)
      .eq('id', f.id);
    if (error) setError(error.message);
    await refresh();
  }

  async function deleteFilamento(f: Filamento) {
    if (!confirm(`Eliminar ${f.material} y todos sus colores?`)) return;
    const { error } = await supabase().from('filamentos').delete().eq('id', f.id);
    if (error) setError(error.message);
    await refresh();
  }

  async function addColor() {
    if (!active) return;
    const { error } = await supabase().from('colores').insert({
      filamento_id: active,
      nombre: 'Nuevo color',
      hex: '#cccccc',
      texto: 'black',
      acabado: null,
      combina_con: [],
      oferta: false,
      orden: colores.filter((c) => c.filamento_id === active).length
    });
    if (error) setError(error.message);
    await refresh();
  }

  async function updateColor(c: Color, patch: Partial<Color>) {
    const { error } = await supabase()
      .from('colores')
      .update(patch)
      .eq('id', c.id);
    if (error) setError(error.message);
    await refresh();
  }

  async function deleteColor(c: Color) {
    if (!confirm(`Eliminar el color "${c.nombre}"?`)) return;
    const { error } = await supabase().from('colores').delete().eq('id', c.id);
    if (error) setError(error.message);
    await refresh();
  }

  if (authed === false) {
    return (
      <div>
        <h1 className="section-title" style={{ fontSize: 32, marginBottom: 24 }}>
          Acceso denegado
        </h1>
        <Link href="/admin/login" className="btn-primary">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  const activeFilamento = filamentos.find((f) => f.id === active);
  const visibleColors = colores.filter((c) => c.filamento_id === active);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24
        }}
      >
        <h1 className="section-title" style={{ fontSize: 32 }}>
          Filamentos
        </h1>
        <button type="button" className="btn-primary" onClick={addFilamento}>
          + Material
        </button>
      </div>

      {error && (
        <div
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: 12,
            borderRadius: 'var(--r)',
            marginBottom: 16,
            fontSize: 13
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Cargando...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
          <aside>
            {filamentos.map((f) => (
              <button
                type="button"
                key={f.id}
                onClick={() => setActive(f.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  marginBottom: 6,
                  background: active === f.id ? 'var(--accent)' : 'var(--surface)',
                  color: active === f.id ? '#fff' : 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 700 }}>{f.material}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>
                  {colores.filter((c) => c.filamento_id === f.id).length} colores
                </div>
              </button>
            ))}
          </aside>

          <section>
            {activeFilamento ? (
              <>
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r)',
                    padding: 20,
                    marginBottom: 24,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12
                  }}
                >
                  <label style={{ gridColumn: '1 / -1' }}>
                    <div style={fieldLabel}>Material (clave)</div>
                    <input
                      defaultValue={activeFilamento.material}
                      onBlur={(e) =>
                        updateFilamento(activeFilamento, {
                          material: e.target.value
                        })
                      }
                      style={input}
                    />
                  </label>
                  <label>
                    <div style={fieldLabel}>Nombre</div>
                    <input
                      defaultValue={activeFilamento.nombre}
                      onBlur={(e) =>
                        updateFilamento(activeFilamento, {
                          nombre: e.target.value
                        })
                      }
                      style={input}
                    />
                  </label>
                  <label>
                    <div style={fieldLabel}>Orden</div>
                    <input
                      type="number"
                      defaultValue={activeFilamento.orden}
                      onBlur={(e) =>
                        updateFilamento(activeFilamento, {
                          orden: parseInt(e.target.value, 10) || 0
                        })
                      }
                      style={input}
                    />
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    <div style={fieldLabel}>Descripción</div>
                    <textarea
                      defaultValue={activeFilamento.descripcion}
                      onBlur={(e) =>
                        updateFilamento(activeFilamento, {
                          descripcion: e.target.value
                        })
                      }
                      rows={2}
                      style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
                    />
                  </label>
                  <div style={{ gridColumn: '1 / -1', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => deleteFilamento(activeFilamento)}
                      style={{ ...btnLink, color: '#dc2626' }}
                    >
                      Borrar material
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12
                  }}
                >
                  <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28 }}>
                    Colores
                  </h2>
                  <button type="button" className="btn-primary" onClick={addColor}>
                    + Color
                  </button>
                </div>

                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r)',
                    overflow: 'hidden'
                  }}
                >
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <th style={th}></th>
                      <th style={th}>Nombre</th>
                      <th style={th}>Hex</th>
                      <th style={th}>Acabado</th>
                      <th style={th}>Texto</th>
                      <th style={th}>Oferta</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleColors.map((c) => (
                      <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ ...td, width: 32 }}>
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 4,
                              background: c.hex,
                              border: '1px solid var(--border)'
                            }}
                          />
                        </td>
                        <td style={td}>
                          <input
                            defaultValue={c.nombre}
                            onBlur={(e) => updateColor(c, { nombre: e.target.value })}
                            style={cellInput}
                          />
                        </td>
                        <td style={td}>
                          <input
                            defaultValue={c.hex}
                            onBlur={(e) => updateColor(c, { hex: e.target.value })}
                            style={cellInput}
                          />
                        </td>
                        <td style={td}>
                          <select
                            defaultValue={c.acabado ?? ''}
                            onChange={(e) =>
                              updateColor(c, {
                                acabado: (e.target.value || null) as Acabado | null
                              })
                            }
                            style={cellInput}
                          >
                            <option value="">—</option>
                            {ACABADOS.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={td}>
                          <select
                            defaultValue={c.texto}
                            onChange={(e) =>
                              updateColor(c, {
                                texto: e.target.value as 'black' | 'white'
                              })
                            }
                            style={cellInput}
                          >
                            <option value="black">black</option>
                            <option value="white">white</option>
                          </select>
                        </td>
                        <td style={td}>
                          <input
                            type="checkbox"
                            defaultChecked={c.oferta}
                            onChange={(e) => updateColor(c, { oferta: e.target.checked })}
                          />
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => deleteColor(c)}
                            style={{ ...btnLink, color: '#dc2626' }}
                          >
                            Borrar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {visibleColors.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>
                          Sin colores. Añade uno con el botón.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            ) : (
              <p style={{ color: 'var(--muted)' }}>
                Crea un material para empezar.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 6
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 13
};

const cellInput: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 12
};

const th: React.CSSProperties = {
  padding: 12,
  textAlign: 'left',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--muted)'
};

const td: React.CSSProperties = { padding: 8, verticalAlign: 'middle' };

const btnLink: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 12,
  cursor: 'pointer',
   marginLeft: 8,
  fontFamily: "'IBM Plex Mono', monospace",
  textTransform: 'uppercase',
  letterSpacing: '0.1em'
};
