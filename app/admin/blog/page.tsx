'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BlogPost } from '@/lib/types';
import { renderMarkdown, slugify } from '@/lib/markdown';
import { Drawer } from '../_components/Drawer';
import { Field, inputStyle } from '../_components/Field';
import { ImageUploadField } from '../_components/ImageUploadField';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { AdminCabecera } from '../_components/AdminNav';
import { useConfirm } from '../_components/useConfirm';
import './blog-admin.css';
import { mensajeDeError } from '@/lib/errors';
import { activableRow } from '@/lib/a11y';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { ErrorBanner } from '../_components/ErrorBanner';

type Draft = Omit<BlogPost, 'id' | 'created_at' | 'updated_at'>;

const emptyDraft = (): Draft => ({
  slug: '',
  title: '',
  excerpt: '',
  content: '',
  cover_image: '',
  published: false,
  published_at: null
});

export default function AdminBlog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);
  const [slugDirty, setSlugDirty] = useState(false);

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
      .from('blog_posts')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) setError(mensajeDeError(error, 'No se pudieron cargar los posts'));
    setPosts(data ?? []);
    setLoading(false);
  }

  function startCreate() {
    setDraft(emptyDraft());
    setEditingId(null);
    setSaveState('idle');
    setDirty(false);
    setSlugDirty(false);
  }

  function startEdit(p: BlogPost) {
    setDraft({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      content: p.content,
      cover_image: p.cover_image,
      published: p.published,
      published_at: p.published_at
    });
    setEditingId(p.id);
    setSaveState('idle');
    setDirty(false);
    setSlugDirty(true); // editing existing post — don't auto-overwrite slug
  }

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    if (!draft) return;
    const next = { ...draft, [k]: v };
    // Auto-fill the slug from the title until the user touches it manually.
    if (k === 'title' && !slugDirty && !editingId) {
      next.slug = slugify(v as string);
    }
    if (k === 'slug') {
      setSlugDirty(true);
    }
    setDraft(next);
    setDirty(true);
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError('El título es obligatorio');
      setSaveState('error');
      return;
    }
    if (!draft.slug.trim()) {
      setError('El slug es obligatorio');
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    setError(null);

    // Stamp published_at when transitioning to published.
    const payload: Draft = {
      ...draft,
      published_at:
        draft.published && !draft.published_at
          ? new Date().toISOString()
          : draft.published
            ? draft.published_at
            : null
    };

    const res = editingId
      ? await supabase().from('blog_posts').update(payload).eq('id', editingId)
      : await supabase().from('blog_posts').insert(payload);
    if (res.error) {
      setError(mensajeDeError(res.error, 'No se pudo guardar el post'));
      setSaveState('error');
      return;
    }
    setSaveState('saved');
    setDirty(false);
    await refresh();
    setTimeout(() => {
      setDraft(null);
      setEditingId(null);
    }, 900);
  }

  async function remove(id: string) {
    if (!(await confirmar({ mensaje: '¿Borrar este post?' }))) return;
    const { error } = await supabase().from('blog_posts').delete().eq('id', id);
    if (error) setError(mensajeDeError(error, 'No se pudieron cargar los posts'));
    await refresh();
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q)
    );
  }, [posts, query]);

  if (authed === false) return <AccesoDenegado />;

  return (
    <div>
      {dialogo}
      <AdminCabecera
        titulo="Blog"
        acciones={
          <>
          <button type="button" className="btn-primary" onClick={startCreate}>
            + Nuevo post
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
          placeholder="Buscar por título o slug…"
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
          {visible.length} de {posts.length}
        </span>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      ) : (
        <table className="adm-tabla">
          <thead>
            <tr>
              <th>Título</th>
              <th>Slug</th>
              <th>Estado</th>
              <th>Actualizado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr
                key={p.id}
                style={{ cursor: 'pointer' }}
                {...activableRow(() => startEdit(p), `Editar ${p.title}`)}
              >
                <td className="adm-sin-etiqueta">
                  <strong>{p.title}</strong>
                  {p.excerpt && (
                    <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
                      {p.excerpt.slice(0, 80)}
                      {p.excerpt.length > 80 ? '…' : ''}
                    </div>
                  )}
                </td>
                <td data-label="Slug" translate="no" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, overflowWrap: 'anywhere' }}>
                  {p.slug}
                </td>
                <td data-label="Estado">
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontFamily: "'IBM Plex Mono', monospace",
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      background: p.published ? '#10b981' : 'var(--surface-2)',
                      color: p.published ? '#fff' : 'var(--muted)'
                    }}
                  >
                    {p.published ? 'Publicado' : 'Borrador'}
                  </span>
                </td>
                <td data-label="Actualizado" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--muted)' }}>
                  {new Date(p.updated_at).toLocaleDateString('es-ES')}
                </td>
                <td className="adm-sin-etiqueta" style={{ textAlign: 'right', gap: 16 }}>
                  {p.published && (
                    <a
                      href={`/blog/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={btnLink}
                    >
                      Ver
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(p.id);
                    }}
                    style={{ ...btnLink, color: '#dc2626', marginLeft: 12 }}
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="adm-sin-etiqueta" style={{ color: 'var(--muted)' }}>
                  {posts.length === 0
                    ? 'No hay posts todavía. Crea el primero.'
                    : 'Sin resultados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        error={error}
        dirty={dirty}
        title={editingId ? 'Editar post' : 'Nuevo post'}
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
                value={draft.title}
                onChange={(e) => patch('title', e.target.value)}
                style={inputStyle}
                placeholder="Cómo elegir el material para piezas de exterior"
              />
            </Field>

            <Field label="Slug" hint="URL del post: /blog/<slug>">
              <input
                value={draft.slug}
                onChange={(e) => patch('slug', slugify(e.target.value))}
                style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }}
                placeholder="como-elegir-material-exterior"
              />
            </Field>

            <Field label="Resumen" hint="1-2 frases que aparecen en la lista del blog">
              <textarea
                value={draft.excerpt}
                onChange={(e) => patch('excerpt', e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>

            <Field label="Imagen de portada">
              <ImageUploadField
                value={draft.cover_image}
                onChange={(v) => patch('cover_image', v)}
                folder="blog"
              />
            </Field>

            <Field
              label="Contenido (Markdown)"
              hint="**negrita**, *cursiva*, # Heading, [texto](url), ![alt](url-imagen), - listas"
            >
              <textarea
                value={draft.content}
                onChange={(e) => patch('content', e.target.value)}
                rows={16}
                style={{
                  ...inputStyle,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13,
                  lineHeight: 1.6,
                  resize: 'vertical',
                  minHeight: 320
                }}
              />
            </Field>

            {draft.content && (
              <Field label="Vista previa">
                <div
                  className="blog-content blog-preview"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.content) }}
                />
              </Field>
            )}

            <Field label="Estado">
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
                  checked={draft.published}
                  onChange={(e) => patch('published', e.target.checked)}
                />
                <span style={{ fontSize: 13 }}>
                  Publicado{' '}
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                    (visible en /blog)
                  </span>
                </span>
              </label>
              {draft.published && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--r)',
                    fontSize: 11,
                    color: 'var(--muted)',
                    fontFamily: "'IBM Plex Mono', monospace"
                  }}
                >
                  ⚠ Los posts nuevos aparecen tras la próxima publicación del
                  sitio. Tras guardar, haz un commit/push o reejecuta el
                  workflow de GitHub Pages para regenerar el HTML estático.
                </div>
              )}
            </Field>
          </>
        )}
      </Drawer>
    </div>
  );
}

const btnLink: React.CSSProperties = {
  padding: '10px 4px',
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: "'IBM Plex Mono', monospace",
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  textDecoration: 'none'
};
