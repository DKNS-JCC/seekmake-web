'use client';

import { useEffect, useState } from 'react';
import type { Resena, ResenasResumen } from '@/lib/types';
import { Drawer } from '../_components/Drawer';
import { Field, inputStyle } from '../_components/Field';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { RebuildButton } from '../_components/RebuildButton';
import { useConfirm } from '../_components/useConfirm';
import { mensajeDeError } from '@/lib/errors';
import { activable } from '@/lib/a11y';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { ErrorBanner } from '../_components/ErrorBanner';

type Draft = Omit<Resena, 'id' | 'created_at'>;

const hoy = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (orden: number): Draft => ({
  autor_visible: '',
  texto: '',
  estrellas: 5,
  fecha: hoy(),
  orden,
  publicada: true
});

// Reseñas de Google copiadas a mano. Fuera familiares, tutores y amistades:
// Google no admite reseñas con conflicto de intereses.
export default function AdminResenas() {
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [resumen, setResumen] = useState<ResenasResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);
  const [resumenState, setResumenState] = useState<SaveState>('idle');

  const { authed, supabase } = useAdminAuth();
  const { confirmar, dialogo } = useConfirm();

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    const [r, s] = await Promise.all([
      supabase().from('resenas').select('*').order('orden'),
      supabase().from('resenas_resumen').select('*').maybeSingle()
    ]);
    if (r.error) setError(mensajeDeError(r.error, 'No se pudieron cargar las reseñas'));
    setResenas(r.data ?? []);
    setResumen(s.data ?? null);
    setLoading(false);
  }

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    if (!draft) return;
    setDraft({ ...draft, [k]: v });
    setDirty(true);
  }

  async function save() {
    if (!draft) return;
    if (!draft.autor_visible.trim() || !draft.texto.trim()) {
      setError('Nombre y texto son obligatorios');
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    setError(null);
    const res = editingId
      ? await supabase().from('resenas').update(draft).eq('id', editingId)
      : await supabase().from('resenas').insert(draft);
    if (res.error) {
      setError(mensajeDeError(res.error, 'No se pudo guardar la reseña'));
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

  async function saveResumen() {
    if (!resumen) return;
    setResumenState('saving');
    const { error } = await supabase()
      .from('resenas_resumen')
      .update({ media: resumen.media, total: resumen.total, actualizado_el: hoy() })
      .eq('id', true);
    if (error) setError(mensajeDeError(error, 'No se pudo guardar la nota'));
    setResumenState(error ? 'error' : 'saved');
  }

  async function remove(id: string) {
    if (!(await confirmar({ mensaje: '¿Eliminar esta reseña?' }))) return;
    const { error } = await supabase().from('resenas').delete().eq('id', id);
    if (error) setError(mensajeDeError(error, 'No se pudo borrar la reseña'));
    await refresh();
  }

  if (authed === false) return <AccesoDenegado />;

  return (
    <div>
      {dialogo}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <h1 className="section-title" style={{ fontSize: 32 }}>Reseñas</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <RebuildButton small />
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setDraft(emptyDraft(resenas.length));
              setEditingId(null);
              setSaveState('idle');
              setDirty(false);
            }}
          >
            + Nueva
          </button>
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {resumen && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 28 }}>
          <Field label="Nota en Google">
            <input
              type="number" step="0.1" min={1} max={5}
              value={resumen.media}
              onChange={(e) => { setResumen({ ...resumen, media: Number(e.target.value) }); setResumenState('idle'); }}
              style={{ ...inputStyle, width: 110 }}
            />
          </Field>
          <Field label="Total de reseñas">
            <input
              type="number" min={0}
              value={resumen.total}
              onChange={(e) => { setResumen({ ...resumen, total: parseInt(e.target.value, 10) || 0 }); setResumenState('idle'); }}
              style={{ ...inputStyle, width: 130 }}
            />
          </Field>
          <div style={{ marginBottom: 18 }}>
            <SaveButton onClick={saveResumen} state={resumenState} dirty={resumenState === 'idle'} />
          </div>
        </div>
      )}

      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        La web enseña las 6 primeras publicadas, por orden. Deja fuera las de familia y amistades.
      </p>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {resenas.map((r) => (
            <article
              key={r.id}
              {...activable(() => {
                setDraft({
                  autor_visible: r.autor_visible,
                  texto: r.texto,
                  estrellas: r.estrellas,
                  fecha: r.fecha,
                  orden: r.orden,
                  publicada: r.publicada
                });
                setEditingId(r.id);
                setSaveState('idle');
                setDirty(false);
              }, `Editar reseña de ${r.autor_visible}`)}
              style={{
                display: 'flex', gap: 16, alignItems: 'flex-start',
                padding: '14px 16px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 'var(--r)',
                cursor: 'pointer', opacity: r.publicada ? 1 : 0.55
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {r.autor_visible} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {r.fecha} · {r.estrellas}★{r.publicada ? '' : ' · oculta'}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{r.texto}</div>
              </div>
              <button
                type="button"
                className="btn-outline"
                style={{ padding: '6px 10px', fontSize: 11 }}
                onClick={(e) => { e.stopPropagation(); remove(r.id); }}
              >
                Borrar
              </button>
            </article>
          ))}
          {resenas.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>
              No hay reseñas todavía. Mientras no haya ninguna publicada, la web no enseña la sección.
            </p>
          )}
        </div>
      )}

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title={editingId ? 'Editar reseña' : 'Nueva reseña'}
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setDraft(null)}>Cerrar</button>
            <SaveButton onClick={save} state={saveState} dirty={dirty} />
          </>
        }
      >
        {draft && (
          <>
            <Field label="Nombre visible" hint="Nombre e inicial del apellido: «Laura M.»">
              <input value={draft.autor_visible} onChange={(e) => patch('autor_visible', e.target.value)} maxLength={60} style={inputStyle} />
            </Field>
            <Field label="Texto" hint="Copiado tal cual de Google.">
              <textarea value={draft.texto} onChange={(e) => patch('texto', e.target.value)} rows={5} maxLength={1200} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <Field label="Fecha">
                <input type="date" value={draft.fecha} max={hoy()} onChange={(e) => patch('fecha', e.target.value || hoy())} style={inputStyle} />
              </Field>
              <Field label="Estrellas">
                <input type="number" min={1} max={5} value={draft.estrellas} onChange={(e) => patch('estrellas', Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 5)))} style={inputStyle} />
              </Field>
              <Field label="Orden" hint="Menor = antes">
                <input type="number" value={draft.orden} onChange={(e) => patch('orden', parseInt(e.target.value, 10) || 0)} style={inputStyle} />
              </Field>
            </div>
            <Field label="Publicada">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <input type="checkbox" checked={draft.publicada} onChange={(e) => patch('publicada', e.target.checked)} />
                Mostrar en la web
              </label>
            </Field>
          </>
        )}
      </Drawer>
    </div>
  );
}
