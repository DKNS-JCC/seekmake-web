'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Acabado, Color, Filamento } from '@/lib/types';
import { Drawer } from '../_components/Drawer';
import { Field, inputStyle } from '../_components/Field';
import { ColorPickerField } from '../_components/ColorPickerField';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { RebuildButton } from '../_components/RebuildButton';
import './filamentos.css';

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

type ColorDraft = Omit<Color, 'id'>;

const emptyColorDraft = (filamento_id: string, orden: number): ColorDraft => ({
  filamento_id,
  nombre: 'Nuevo color',
  hex: '#cccccc',
  texto: 'black',
  acabado: null,
  combina_con: [],
  oferta: false,
  orden
});

export default function AdminFilamentos() {
  const [filamentos, setFilamentos] = useState<Filamento[]>([]);
  const [colores, setColores] = useState<Color[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Color drawer state
  const [colorDraft, setColorDraft] = useState<ColorDraft | null>(null);
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [colorSave, setColorSave] = useState<SaveState>('idle');
  const [colorDirty, setColorDirty] = useState(false);

  // Filamento (material) drawer state
  const [matDraft, setMatDraft] = useState<Omit<Filamento, 'id'> | null>(null);
  const [editingMatId, setEditingMatId] = useState<string | null>(null);
  const [matSave, setMatSave] = useState<SaveState>('idle');
  const [matDirty, setMatDirty] = useState(false);

  const supabase = () => createClient();

  useEffect(() => {
    supabase().auth.getUser().then(({ data }) => setAuthed(!!data.user));
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

  // ───────── Material CRUD via drawer ─────────

  function startMatCreate() {
    setMatDraft({
      material: '',
      nombre: '',
      descripcion: '',
      orden: filamentos.length
    });
    setEditingMatId(null);
    setMatSave('idle');
    setMatDirty(false);
  }

  function startMatEdit(f: Filamento) {
    setMatDraft({
      material: f.material,
      nombre: f.nombre,
      descripcion: f.descripcion,
      orden: f.orden
    });
    setEditingMatId(f.id);
    setMatSave('idle');
    setMatDirty(false);
  }

  async function saveMat() {
    if (!matDraft) return;
    setMatSave('saving');
    setError(null);
    const res = editingMatId
      ? await supabase().from('filamentos').update(matDraft).eq('id', editingMatId)
      : await supabase().from('filamentos').insert(matDraft).select().single();
    if (res.error) {
      setError(res.error.message);
      setMatSave('error');
      return;
    }
    setMatSave('saved');
    setMatDirty(false);
    await refresh();
    if (!editingMatId && 'data' in res && res.data && 'id' in res.data) {
      setActive(res.data.id as string);
    }
    setTimeout(() => {
      setMatDraft(null);
      setEditingMatId(null);
    }, 800);
  }

  async function deleteFilamento(f: Filamento) {
    if (!confirm(`¿Eliminar ${f.material} y todos sus colores?`)) return;
    const { error } = await supabase().from('filamentos').delete().eq('id', f.id);
    if (error) setError(error.message);
    await refresh();
  }

  // ───────── Color CRUD via drawer ─────────

  function startColorCreate() {
    if (!active) return;
    setColorDraft(
      emptyColorDraft(
        active,
        colores.filter((c) => c.filamento_id === active).length
      )
    );
    setEditingColorId(null);
    setColorSave('idle');
    setColorDirty(false);
  }

  function startColorEdit(c: Color) {
    setColorDraft({
      filamento_id: c.filamento_id,
      nombre: c.nombre,
      hex: c.hex,
      texto: c.texto,
      acabado: c.acabado,
      combina_con: c.combina_con,
      oferta: c.oferta,
      orden: c.orden
    });
    setEditingColorId(c.id);
    setColorSave('idle');
    setColorDirty(false);
  }

  function patchColor<K extends keyof ColorDraft>(k: K, v: ColorDraft[K]) {
    if (!colorDraft) return;
    setColorDraft({ ...colorDraft, [k]: v });
    setColorDirty(true);
  }

  async function saveColor() {
    if (!colorDraft) return;
    setColorSave('saving');
    setError(null);
    const res = editingColorId
      ? await supabase().from('colores').update(colorDraft).eq('id', editingColorId)
      : await supabase().from('colores').insert(colorDraft);
    if (res.error) {
      setError(res.error.message);
      setColorSave('error');
      return;
    }
    setColorSave('saved');
    setColorDirty(false);
    await refresh();
    setTimeout(() => {
      setColorDraft(null);
      setEditingColorId(null);
    }, 800);
  }

  async function deleteColor(c: Color) {
    if (!confirm(`¿Eliminar el color "${c.nombre}"?`)) return;
    const { error } = await supabase().from('colores').delete().eq('id', c.id);
    if (error) setError(error.message);
    await refresh();
  }

  // ───────── Render ─────────

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
  const colorsInSameMaterial = visibleColors;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          gap: 16,
          flexWrap: 'wrap'
        }}
      >
        <h1 className="section-title" style={{ fontSize: 32 }}>
          Filamentos
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <RebuildButton small />
          <button type="button" className="btn-primary" onClick={startMatCreate}>
            + Material
          </button>
        </div>
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
        <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      ) : filamentos.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          Crea un material para empezar.
        </p>
      ) : (
        <div className="filamentos-layout">
          <aside className="filamentos-aside">
            {filamentos.map((f) => (
              <button
                type="button"
                key={f.id}
                onClick={() => setActive(f.id)}
                className={'filamento-pill' + (active === f.id ? ' active' : '')}
              >
                <div className="filamento-pill-name">{f.material}</div>
                <div className="filamento-pill-meta">
                  {colores.filter((c) => c.filamento_id === f.id).length} colores
                </div>
              </button>
            ))}
          </aside>

          <section>
            {activeFilamento && (
              <>
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r)',
                    padding: 20,
                    marginBottom: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap'
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 32,
                        lineHeight: 1
                      }}
                    >
                      {activeFilamento.nombre}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--muted)',
                        marginTop: 6
                      }}
                    >
                      {activeFilamento.descripcion || (
                        <em>Sin descripción</em>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => startMatEdit(activeFilamento)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteFilamento(activeFilamento)}
                      style={{ ...btnLink, color: '#dc2626' }}
                    >
                      Borrar
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16
                  }}
                >
                  <h2
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 28
                    }}
                  >
                    Colores
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                        color: 'var(--muted)',
                        marginLeft: 10,
                        letterSpacing: '0.12em'
                      }}
                    >
                      {visibleColors.length}
                    </span>
                  </h2>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={startColorCreate}
                  >
                    + Color
                  </button>
                </div>

                <div className="color-grid">
                  {visibleColors.map((c) => (
                    <article
                      key={c.id}
                      className="color-card"
                      onClick={() => startColorEdit(c)}
                    >
                      <div
                        className="color-swatch"
                        style={{ background: c.hex }}
                      >
                        {c.oferta && <span className="color-badge">OFERTA</span>}
                        {c.acabado && (
                          <span className="color-acabado">{c.acabado}</span>
                        )}
                      </div>
                      <div className="color-info">
                        <div className="color-name">{c.nombre}</div>
                        <div className="color-hex">{c.hex}</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteColor(c);
                        }}
                        aria-label="Borrar color"
                        className="color-delete"
                      >
                        ×
                      </button>
                    </article>
                  ))}
                  {visibleColors.length === 0 && (
                    <p
                      style={{
                        color: 'var(--muted)',
                        gridColumn: '1 / -1',
                        textAlign: 'center',
                        padding: '24px 0'
                      }}
                    >
                      Sin colores. Añade uno con el botón.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* ───────── Material drawer ───────── */}
      <Drawer
        open={!!matDraft}
        onClose={() => setMatDraft(null)}
        title={editingMatId ? 'Editar material' : 'Nuevo material'}
        footer={
          <>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setMatDraft(null)}
            >
              Cerrar
            </button>
            <SaveButton onClick={saveMat} state={matSave} dirty={matDirty} />
          </>
        }
      >
        {matDraft && (
          <>
            <Field label="Clave (PLA, PETG, ASA, TPU…)" hint="Identificador corto, mayúsculas">
              <input
                value={matDraft.material}
                onChange={(e) => {
                  setMatDraft({ ...matDraft, material: e.target.value });
                  setMatDirty(true);
                }}
                style={inputStyle}
                placeholder="PLA"
              />
            </Field>
            <Field label="Nombre completo">
              <input
                value={matDraft.nombre}
                onChange={(e) => {
                  setMatDraft({ ...matDraft, nombre: e.target.value });
                  setMatDirty(true);
                }}
                style={inputStyle}
                placeholder="PLA"
              />
            </Field>
            <Field label="Descripción">
              <textarea
                rows={4}
                value={matDraft.descripcion}
                onChange={(e) => {
                  setMatDraft({ ...matDraft, descripcion: e.target.value });
                  setMatDirty(true);
                }}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>
            <Field label="Orden" hint="Posición en la lista pública (menor = primero)">
              <input
                type="number"
                value={matDraft.orden}
                onChange={(e) => {
                  setMatDraft({ ...matDraft, orden: parseInt(e.target.value, 10) || 0 });
                  setMatDirty(true);
                }}
                style={inputStyle}
              />
            </Field>
          </>
        )}
      </Drawer>

      {/* ───────── Color drawer ───────── */}
      <Drawer
        open={!!colorDraft}
        onClose={() => setColorDraft(null)}
        title={editingColorId ? 'Editar color' : 'Nuevo color'}
        footer={
          <>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setColorDraft(null)}
            >
              Cerrar
            </button>
            <SaveButton onClick={saveColor} state={colorSave} dirty={colorDirty} />
          </>
        }
      >
        {colorDraft && (
          <>
            <Field label="Color">
              <ColorPickerField
                value={colorDraft.hex}
                onChange={(v) => patchColor('hex', v)}
                acabado={colorDraft.acabado}
              />
            </Field>

            <Field label="Nombre">
              <input
                value={colorDraft.nombre}
                onChange={(e) => patchColor('nombre', e.target.value)}
                style={inputStyle}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Acabado">
                <select
                  value={colorDraft.acabado ?? ''}
                  onChange={(e) =>
                    patchColor(
                      'acabado',
                      (e.target.value || null) as Acabado | null
                    )
                  }
                  style={inputStyle}
                >
                  <option value="">— Sin acabado —</option>
                  {ACABADOS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Color de texto" hint="Sobre el swatch">
                <select
                  value={colorDraft.texto}
                  onChange={(e) =>
                    patchColor('texto', e.target.value as 'black' | 'white')
                  }
                  style={inputStyle}
                >
                  <option value="black">Oscuro</option>
                  <option value="white">Claro</option>
                </select>
              </Field>
            </div>

            <Field label="Oferta">
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r)',
                  background: 'var(--surface)',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={colorDraft.oferta}
                  onChange={(e) => patchColor('oferta', e.target.checked)}
                />
                <span style={{ fontSize: 13 }}>Mostrar etiqueta "OFERTA"</span>
              </label>
            </Field>

            <Field
              label="Combina con"
              hint="Colores del mismo material que combinan bien"
            >
              <CombinaConPicker
                value={colorDraft.combina_con}
                options={colorsInSameMaterial.filter(
                  (c) => c.id !== editingColorId
                )}
                onChange={(v) => patchColor('combina_con', v)}
              />
            </Field>
          </>
        )}
      </Drawer>
    </div>
  );
}

function CombinaConPicker({
  value,
  options,
  onChange
}: {
  value: string[];
  options: Color[];
  onChange: (v: string[]) => void;
}) {
  const selectedSet = useMemo(() => new Set(value), [value]);

  const toggle = (nombre: string) => {
    if (selectedSet.has(nombre)) {
      onChange(value.filter((v) => v !== nombre));
    } else {
      onChange([...value, nombre]);
    }
  };

  if (options.length === 0) {
    return (
      <div style={{ color: 'var(--muted)', fontSize: 13, fontStyle: 'italic' }}>
        Crea más colores en este material para poder combinarlos.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 6
      }}
    >
      {options.map((c) => {
        const on = selectedSet.has(c.nombre);
        return (
          <button
            type="button"
            key={c.id}
            onClick={() => toggle(c.nombre)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 6,
              border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'),
              background: on ? 'var(--accent-dim)' : 'var(--surface)',
              borderRadius: 'var(--r)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              textAlign: 'left'
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                background: c.hex,
                border: '1px solid var(--border)',
                flexShrink: 0
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {c.nombre}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const btnLink: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text)',
  padding: '8px 16px',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  cursor: 'pointer'
};
