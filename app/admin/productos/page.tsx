'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Categoria, Producto } from '@/lib/types';
import { Drawer } from '../_components/Drawer';
import { Field, inputStyle } from '../_components/Field';
import { ChipInput } from '../_components/ChipInput';
import { ImageUploadField } from '../_components/ImageUploadField';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { RebuildButton } from '../_components/RebuildButton';
import { useConfirm } from '../_components/useConfirm';
import { mensajeDeError } from '@/lib/errors';
import { activableRow } from '@/lib/a11y';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { ErrorBanner } from '../_components/ErrorBanner';

type Draft = Omit<Producto, 'id' | 'created_at' | 'updated_at'>;

const emptyDraft = (): Draft => ({
  legacy_id: null,
  nombre: '',
  descripcion: '',
  precio: 0,
  categoria: 'Keycaps',
  material: 'PLA',
  colores: [],
  dimensiones: '',
  peso: '',
  imagen: '',
  destacado: false,
  etiquetas: []
});

export default function AdminProductos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);

  // Search + filter
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<'todas' | Categoria>('todas');

  const { authed, supabase } = useAdminAuth();
  const { confirmar, dialogo } = useConfirm();

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase()
      .from('productos')
      .select('*')
      .order('destacado', { ascending: false })
      .order('legacy_id');
    if (error) setError(mensajeDeError(error, 'No se pudieron cargar los productos'));
    setProductos(data ?? []);
    setLoading(false);
  }

  function startCreate() {
    setDraft(emptyDraft());
    setEditingId(null);
    setSaveState('idle');
    setDirty(false);
  }

  function startEdit(p: Producto) {
    setDraft({
      legacy_id: p.legacy_id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio,
      categoria: p.categoria,
      material: p.material,
      colores: p.colores,
      dimensiones: p.dimensiones,
      peso: p.peso,
      imagen: p.imagen,
      destacado: p.destacado,
      etiquetas: p.etiquetas
    });
    setEditingId(p.id);
    setSaveState('idle');
    setDirty(false);
  }

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    if (!draft) return;
    setDraft({ ...draft, [k]: v });
    setDirty(true);
  }

  async function save() {
    if (!draft) return;
    setSaveState('saving');
    setError(null);
    const res = editingId
      ? await supabase().from('productos').update(draft).eq('id', editingId)
      : await supabase().from('productos').insert(draft);
    if (res.error) {
      setError(mensajeDeError(res.error, 'No se pudo guardar el producto'));
      setSaveState('error');
      return;
    }
    setSaveState('saved');
    setDirty(false);
    await refresh();
    // Close drawer after a brief success indicator.
    setTimeout(() => {
      setDraft(null);
      setEditingId(null);
    }, 800);
  }

  async function remove(id: string) {
    if (!(await confirmar({ mensaje: '¿Eliminar este producto?' }))) return;
    const { error } = await supabase().from('productos').delete().eq('id', id);
    if (error) {
      setError(mensajeDeError(error, 'No se pudo borrar el producto'));
      return;
    }
    await refresh();
  }

  // Filtered list
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return productos.filter((p) => {
      if (catFilter !== 'todas' && p.categoria !== catFilter) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q) ||
        p.etiquetas.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [productos, query, catFilter]);

  if (authed === false) return <AccesoDenegado />;

  return (
    <div>
      {dialogo}
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
          Productos
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <RebuildButton small />
          <button type="button" className="btn-primary" onClick={startCreate}>
            + Nuevo
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 20,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        <input
          type="text"
          placeholder="Buscar por nombre, descripción o etiqueta…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, maxWidth: 360 }}
        />
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto' }}
        >
          <option value="todas">Todas las categorías</option>
          {Array.from(new Set(productos.map((p) => p.categoria))).map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            color: 'var(--muted)',
            marginLeft: 'auto'
          }}
        >
          {visible.length} de {productos.length}
        </span>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      ) : (
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
              <th style={th}>Categoría</th>
              <th style={th}>Precio</th>
              <th style={th}>Destacado</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr
                key={p.id}
                style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                {...activableRow(() => startEdit(p), `Editar ${p.nombre}`)}
              >
                <td style={{ ...td, width: 64 }}>
                  {p.imagen ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imagen}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: 48,
                        height: 48,
                        objectFit: 'cover',
                        borderRadius: 'var(--r)',
                        background: 'var(--surface-2)'
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        background: 'var(--surface-2)',
                        borderRadius: 'var(--r)'
                      }}
                    />
                  )}
                </td>
                <td style={td}>
                  <strong>{p.nombre}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                    {p.descripcion.slice(0, 80)}
                    {p.descripcion.length > 80 ? '…' : ''}
                  </div>
                </td>
                <td style={td}>{p.categoria}</td>
                <td style={td}>{p.precio.toFixed(2)}€</td>
                <td style={td}>{p.destacado ? '★' : ''}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(p.id);
                    }}
                    style={{ ...btnLink, color: '#dc2626' }}
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>
                  {productos.length === 0
                    ? 'No hay productos todavía.'
                    : 'Sin resultados para esos filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title={editingId ? 'Editar producto' : 'Nuevo producto'}
        footer={
          <>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setDraft(null)}
            >
              Cerrar
            </button>
            <SaveButton onClick={save} state={saveState} dirty={dirty} />
          </>
        }
      >
        {draft && (
          <>
            <Field label="Nombre">
              <input
                value={draft.nombre}
                onChange={(e) => patch('nombre', e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Imagen">
              <ImageUploadField
                value={draft.imagen}
                onChange={(v) => patch('imagen', v)}
                folder="productos"
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Categoría">
                <input
                  type="text"
                  value={draft.categoria}
                  onChange={(e) => patch('categoria', e.target.value)}
                  placeholder="Ej. Decoración"
                  style={inputStyle}
                  list="categorias-list"
                />
                <datalist id="categorias-list">
                  {Array.from(new Set(productos.map((p) => p.categoria))).map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </Field>
              <Field label="Precio (€, 0 = a consultar)">
                <input
                  type="number"
                  step="0.01"
                  value={draft.precio}
                  onChange={(e) => patch('precio', parseFloat(e.target.value) || 0)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Material">
                <input
                  value={draft.material}
                  onChange={(e) => patch('material', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Destacado">
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
                    checked={draft.destacado}
                    onChange={(e) => patch('destacado', e.target.checked)}
                  />
                  <span style={{ fontSize: 13 }}>Mostrar como destacado</span>
                </label>
              </Field>
              <Field label="Dimensiones">
                <input
                  value={draft.dimensiones}
                  onChange={(e) => patch('dimensiones', e.target.value)}
                  placeholder="3x3x3 cm"
                  style={inputStyle}
                />
              </Field>
              <Field label="Peso">
                <input
                  value={draft.peso}
                  onChange={(e) => patch('peso', e.target.value)}
                  placeholder="15g"
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="Colores" hint="Enter o coma para añadir, Backspace para borrar">
              <ChipInput
                values={draft.colores}
                onChange={(v) => patch('colores', v)}
                placeholder="Añadir color…"
              />
            </Field>

            <Field label="Etiquetas" hint="Para mejorar la búsqueda en el catálogo">
              <ChipInput
                values={draft.etiquetas}
                onChange={(v) => patch('etiquetas', v)}
                placeholder="Añadir etiqueta…"
              />
            </Field>

            <Field label="Descripción">
              <textarea
                rows={5}
                value={draft.descripcion}
                onChange={(e) => patch('descripcion', e.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>
          </>
        )}
      </Drawer>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: 12,
  textAlign: 'left',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--muted)'
};

const td: React.CSSProperties = { padding: 12, verticalAlign: 'middle' };

const btnLink: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: "'IBM Plex Mono', monospace",
  textTransform: 'uppercase',
  letterSpacing: '0.1em'
};
