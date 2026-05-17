'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Categoria, Producto } from '@/lib/types';

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
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lazy: client creation reads NEXT_PUBLIC_* env vars and would throw
  // during build-time prerender if they're missing.
  const supabase = () => createClient();

  useEffect(() => {
    const s = supabase();
    s.auth.getUser().then(({ data }) => setAuthed(!!data.user));
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
    if (error) setError(error.message);
    setProductos(data ?? []);
    setLoading(false);
  }

  function startCreate() {
    setDraft(emptyDraft());
    setEditingId(null);
    setError(null);
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
    setError(null);
  }

  async function save() {
    if (!draft) return;
    setError(null);
    if (editingId) {
      const { error } = await supabase()
        .from('productos')
        .update(draft)
        .eq('id', editingId);
      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase().from('productos').insert(draft);
      if (error) {
        setError(error.message);
        return;
      }
    }
    setDraft(null);
    setEditingId(null);
    await refresh();
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este producto?')) return;
    const { error } = await supabase().from('productos').delete().eq('id', id);
    if (error) {
      setError(error.message);
      return;
    }
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
          Productos
        </h1>
        <button type="button" className="btn-primary" onClick={startCreate}>
          + Nuevo
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

      {draft && (
        <ProductForm
          draft={draft}
          onChange={setDraft}
          onSave={save}
          onCancel={() => {
            setDraft(null);
            setEditingId(null);
          }}
          isEditing={!!editingId}
        />
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Cargando...</p>
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
              <th style={th}>Nombre</th>
              <th style={th}>Categoría</th>
              <th style={th}>Precio</th>
              <th style={th}>Destacado</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td}>
                  <strong>{p.nombre}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                    {p.descripcion.slice(0, 60)}…
                  </div>
                </td>
                <td style={td}>{p.categoria}</td>
                <td style={td}>{p.precio.toFixed(2)}€</td>
                <td style={td}>{p.destacado ? '★' : ''}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => startEdit(p)}
                    style={btnLink}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    style={{ ...btnLink, color: '#dc2626' }}
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>
                  No hay productos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ProductForm({
  draft,
  onChange,
  onSave,
  onCancel,
  isEditing
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  isEditing: boolean;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    onChange({ ...draft, [k]: v });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        padding: 24,
        marginBottom: 32,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12
      }}
    >
      <h2
        style={{
          gridColumn: '1 / -1',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 28
        }}
      >
        {isEditing ? 'Editar producto' : 'Nuevo producto'}
      </h2>
      <Field label="Nombre">
        <input
          required
          value={draft.nombre}
          onChange={(e) => set('nombre', e.target.value)}
          style={input}
        />
      </Field>
      <Field label="Categoría">
        <select
          value={draft.categoria}
          onChange={(e) => set('categoria', e.target.value as Categoria)}
          style={input}
        >
          <option value="Keycaps">Keycaps</option>
          <option value="Figuras">Figuras</option>
        </select>
      </Field>
      <Field label="Precio (€)">
        <input
          type="number"
          step="0.01"
          required
          value={draft.precio}
          onChange={(e) => set('precio', parseFloat(e.target.value) || 0)}
          style={input}
        />
      </Field>
      <Field label="Material">
        <input
          value={draft.material}
          onChange={(e) => set('material', e.target.value)}
          style={input}
        />
      </Field>
      <Field label="Dimensiones">
        <input
          value={draft.dimensiones}
          onChange={(e) => set('dimensiones', e.target.value)}
          style={input}
        />
      </Field>
      <Field label="Peso">
        <input
          value={draft.peso}
          onChange={(e) => set('peso', e.target.value)}
          style={input}
        />
      </Field>
      <Field label="URL imagen" full>
        <input
          value={draft.imagen}
          onChange={(e) => set('imagen', e.target.value)}
          style={input}
        />
      </Field>
      <Field label="Colores (separados por comas)" full>
        <input
          value={draft.colores.join(', ')}
          onChange={(e) =>
            set(
              'colores',
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          style={input}
        />
      </Field>
      <Field label="Etiquetas (separadas por comas)" full>
        <input
          value={draft.etiquetas.join(', ')}
          onChange={(e) =>
            set(
              'etiquetas',
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          style={input}
        />
      </Field>
      <Field label="Descripción" full>
        <textarea
          rows={4}
          value={draft.descripcion}
          onChange={(e) => set('descripcion', e.target.value)}
          style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </Field>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / -1' }}>
        <input
          type="checkbox"
          checked={draft.destacado}
          onChange={(e) => set('destacado', e.target.checked)}
        />
        Destacado
      </label>
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-outline" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary">
          Guardar
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  full,
  children
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'block', gridColumn: full ? '1 / -1' : undefined }}>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 6
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 13
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

const td: React.CSSProperties = { padding: 12, verticalAlign: 'top' };

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
