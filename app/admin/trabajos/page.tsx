'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Trabajo } from '@/lib/types';
import { Drawer } from '../_components/Drawer';
import { Field, inputStyle } from '../_components/Field';
import { ChipInput } from '../_components/ChipInput';
import { ImageUploadField } from '../_components/ImageUploadField';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { AdminCabecera } from '../_components/AdminNav';
import { useConfirm } from '../_components/useConfirm';
import { mensajeDeError } from '@/lib/errors';
import { activable } from '@/lib/a11y';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { ErrorBanner } from '../_components/ErrorBanner';

type Draft = Omit<
  Trabajo,
  'id' | 'created_at' | 'updated_at' | 'fecha_efectiva'
>;

const emptyDraft = (): Draft => ({
  titulo: '',
  descripcion: '',
  imagen: '',
  material: '',
  etiquetas: [],
  destacado: true,
  orden: 0,
  fecha_realizacion: null
});

export default function AdminTrabajos() {
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);

  const [query, setQuery] = useState('');

  const { authed, supabase } = useAdminAuth();
  const { confirmar, dialogo } = useConfirm();

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase()
      .from('trabajos')
      .select('*')
      .order('destacado', { ascending: false })
      .order('orden');
    if (error) setError(mensajeDeError(error, 'No se pudieron cargar los trabajos'));
    setTrabajos(data ?? []);
    setLoading(false);
  }

  function startCreate() {
    setDraft({ ...emptyDraft(), orden: trabajos.length });
    setEditingId(null);
    setSaveState('idle');
    setDirty(false);
  }

  function startEdit(t: Trabajo) {
    setDraft({
      titulo: t.titulo,
      descripcion: t.descripcion,
      imagen: t.imagen,
      material: t.material,
      etiquetas: t.etiquetas,
      destacado: t.destacado,
      orden: t.orden,
      fecha_realizacion: t.fecha_realizacion
    });
    setEditingId(t.id);
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
    if (!draft.titulo.trim()) {
      setError('El título es obligatorio');
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    setError(null);
    const res = editingId
      ? await supabase().from('trabajos').update(draft).eq('id', editingId)
      : await supabase().from('trabajos').insert(draft);
    if (res.error) {
      setError(mensajeDeError(res.error, 'No se pudo guardar el trabajo'));
      setSaveState('error');
      return;
    }
    setSaveState('saved');
    setDirty(false);
    await refresh();
    setTimeout(() => {
      setDraft(null);
      setEditingId(null);
    }, 800);
  }

  async function remove(id: string) {
    if (!(await confirmar({ mensaje: '¿Eliminar este trabajo?' }))) return;
    const { error } = await supabase().from('trabajos').delete().eq('id', id);
    if (error) setError(mensajeDeError(error, 'No se pudo borrar el trabajo'));
    await refresh();
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trabajos;
    return trabajos.filter(
      (t) =>
        t.titulo.toLowerCase().includes(q) ||
        t.descripcion.toLowerCase().includes(q) ||
        t.material.toLowerCase().includes(q) ||
        t.etiquetas.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [trabajos, query]);

  if (authed === false) return <AccesoDenegado />;

  return (
    <div>
      {dialogo}
      <AdminCabecera
        titulo="Trabajos"
        acciones={
          <>
          <button type="button" className="btn-primary" onClick={startCreate}>
            + Nuevo
          </button>
          </>
        }
      />

      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap'
        }}
      >
        <input
          type="text"
          placeholder="Buscar por título, material o etiqueta…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, maxWidth: 360 }}
        />
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            color: 'var(--muted)',
            marginLeft: 'auto'
          }}
        >
          {visible.length} de {trabajos.length}
        </span>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16
          }}
        >
          {visible.map((t) => (
            <article
              key={t.id}
              {...activable(() => startEdit(t), `Editar ${t.titulo}`)}
              style={{
                position: 'relative',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'border-color 0.15s, transform 0.15s'
              }}
            >
              {t.destacado && (
                <span
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: 10,
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    zIndex: 1
                  }}
                >
                  ★ Destacado
                </span>
              )}
              <div
                style={{
                  aspectRatio: '4/3',
                  background: 'var(--surface-2)'
                }}
              >
                {t.imagen && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.imagen}
                    alt={t.titulo}
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.titulo}</div>
                {t.material && (
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      color: 'var(--muted)',
                      marginTop: 4,
                      textTransform: 'uppercase'
                    }}
                  >
                    {t.material}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(t.id);
                }}
                aria-label="Borrar"
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(0,0,0,0.45)',
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </article>
          ))}
          {visible.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>
              {trabajos.length === 0
                ? 'No hay trabajos todavía. Crea el primero.'
                : 'Sin resultados.'}
            </div>
          )}
        </div>
      )}

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        error={error}
        dirty={dirty}
        title={editingId ? 'Editar trabajo' : 'Nuevo trabajo'}
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setDraft(null)}>
              Cerrar
            </button>
            <SaveButton onClick={save} state={saveState} dirty={dirty} />
          </>
        }
      >
        {draft && (
          <>
            <Field label="Título">
              <input
                value={draft.titulo}
                onChange={(e) => patch('titulo', e.target.value)}
                placeholder="Figura coleccionable de Charizard"
                style={inputStyle}
              />
            </Field>

            <Field label="Imagen del trabajo">
              <ImageUploadField
                value={draft.imagen}
                onChange={(v) => patch('imagen', v)}
                folder="trabajos"
              />
            </Field>

            <Field label="Descripción">
              <textarea
                value={draft.descripcion}
                onChange={(e) => patch('descripcion', e.target.value)}
                rows={3}
                placeholder="Una línea sobre el trabajo, qué cliente, qué retos hubo…"
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>

            <Field
              label="Fecha de realización"
              hint="Cuándo terminaste la pieza. Si lo dejas vacío se usa la fecha de subida."
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="date"
                  value={draft.fecha_realizacion ?? ''}
                  onChange={(e) =>
                    patch('fecha_realizacion', e.target.value || null)
                  }
                  max={new Date().toISOString().slice(0, 10)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  className="btn-outline"
                  style={{ padding: '8px 14px', fontSize: 11, whiteSpace: 'nowrap' }}
                  onClick={() =>
                    patch(
                      'fecha_realizacion',
                      new Date().toISOString().slice(0, 10)
                    )
                  }
                >
                  Hoy
                </button>
                {draft.fecha_realizacion && (
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ padding: '8px 14px', fontSize: 11, whiteSpace: 'nowrap' }}
                    onClick={() => patch('fecha_realizacion', null)}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Material">
                <input
                  value={draft.material}
                  onChange={(e) => patch('material', e.target.value)}
                  placeholder="PLA, PETG, Resina…"
                  style={inputStyle}
                />
              </Field>
              <Field label="Orden" hint="Menor = aparece antes">
                <input
                  type="number"
                  value={draft.orden}
                  onChange={(e) => patch('orden', parseInt(e.target.value, 10) || 0)}
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="Etiquetas" hint="Para filtrar / SEO. Enter para añadir.">
              <ChipInput
                values={draft.etiquetas}
                onChange={(v) => patch('etiquetas', v)}
                placeholder="Pokémon, keycap, decoración…"
              />
            </Field>

            <Field label="Destacado">
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
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
                <span style={{ fontSize: 13 }}>
                  Mostrar en la home{' '}
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                    (los no destacados solo se ven en /trabajos)
                  </span>
                </span>
              </label>
            </Field>
          </>
        )}
      </Drawer>
    </div>
  );
}
