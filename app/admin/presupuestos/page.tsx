'use client';

// Quote requests submitted from the tasador. List + detail drawer with
// status management and admin notes.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Quote, QuoteEstado } from '@/lib/types';
import { Drawer } from '../_components/Drawer';
import { Field, inputStyle } from '../_components/Field';
import { SaveButton, SaveState } from '../_components/SaveButton';

const ESTADOS: { id: QuoteEstado | 'todos'; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'nuevo', label: 'Nuevos' },
  { id: 'revisado', label: 'Revisados' },
  { id: 'aceptado', label: 'Aceptados' },
  { id: 'rechazado', label: 'Rechazados' },
  { id: 'completado', label: 'Completados' }
];

const ESTADO_COLOR: Record<QuoteEstado, string> = {
  nuevo: 'var(--accent)',
  revisado: '#eab308',
  aceptado: '#10b981',
  rechazado: '#ef4444',
  completado: 'var(--muted)'
};

function EstadoBadge({ estado }: { estado: QuoteEstado }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 'var(--r)',
        border: `1px solid ${ESTADO_COLOR[estado]}`,
        color: ESTADO_COLOR[estado],
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase'
      }}
    >
      {estado}
    </span>
  );
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export default function AdminPresupuestos() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QuoteEstado | 'todos'>('todos');
  const [error, setError] = useState<string | null>(null);

  // drawer
  const [open, setOpen] = useState<Quote | null>(null);
  const [estado, setEstado] = useState<QuoteEstado>('nuevo');
  const [notas, setNotas] = useState('');
  const [save, setSave] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);

  const supabase = () => createClient();

  useEffect(() => {
    supabase().auth.getUser().then(({ data }) => setAuthed(!!data.user));
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    const { data, error: err } = await supabase()
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    setQuotes(data ?? []);
    setLoading(false);
  }

  const visible = useMemo(
    () => (filter === 'todos' ? quotes : quotes.filter((q) => q.estado === filter)),
    [quotes, filter]
  );

  function openQuote(q: Quote) {
    setOpen(q);
    setEstado(q.estado);
    setNotas(q.notas_admin);
    setSave('idle');
    setDirty(false);
  }

  async function persist() {
    if (!open) return;
    setSave('saving');
    const { error: err } = await supabase()
      .from('quotes')
      .update({ estado, notas_admin: notas })
      .eq('id', open.id);
    if (err) {
      setError(err.message);
      setSave('error');
      return;
    }
    setSave('saved');
    setDirty(false);
    setQuotes((prev) =>
      prev.map((q) => (q.id === open.id ? { ...q, estado, notas_admin: notas } : q))
    );
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

  const m: any = open?.metricas ?? {};
  const lineas: Array<{ concepto: string; importe: number }> = Array.isArray(
    (open?.desglose as any)?.lineas
  )
    ? (open?.desglose as any).lineas
    : [];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 20
        }}
      >
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 36,
            letterSpacing: '0.02em'
          }}
        >
          Presupuestos
        </h1>
        <Link href="/admin/tarifas" className="nav-link">
          Editar tarifas →
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {ESTADOS.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setFilter(e.id)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--r)',
              border: '1px solid ' + (filter === e.id ? 'var(--accent)' : 'var(--border)'),
              background: filter === e.id ? 'var(--accent)' : 'transparent',
              color: filter === e.id ? '#fff' : 'var(--muted)',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase'
            }}
          >
            {e.label}
            <span style={{ opacity: 0.7, marginLeft: 6 }}>
              {e.id === 'todos'
                ? quotes.length
                : quotes.filter((q) => q.estado === e.id).length}
            </span>
          </button>
        ))}
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p style={{ color: 'var(--muted)' }}>Cargando…</p>}
      {!loading && visible.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          No hay presupuestos{filter !== 'todos' ? ' en este estado' : ' todavía'}.
        </p>
      )}

      {visible.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)'
                }}
              >
                <th style={{ padding: '8px 12px 8px 0' }}>Código</th>
                <th style={{ padding: '8px 12px' }}>Fecha</th>
                <th style={{ padding: '8px 12px' }}>Cliente</th>
                <th style={{ padding: '8px 12px' }}>Pieza</th>
                <th style={{ padding: '8px 12px' }}>Material</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total</th>
                <th style={{ padding: '8px 12px' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((q) => (
                <tr
                  key={q.id}
                  onClick={() => openQuote(q)}
                  style={{
                    borderTop: '1px solid var(--border)',
                    cursor: 'pointer'
                  }}
                >
                  <td style={{ padding: '12px 12px 12px 0', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                    {q.codigo}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--muted)' }}>{fecha(q.created_at)}</td>
                  <td style={{ padding: '12px' }}>{q.nombre}</td>
                  <td style={{ padding: '12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q.archivo_nombre}
                    {q.cantidad > 1 ? ` × ${q.cantidad}` : ''}
                  </td>
                  <td style={{ padding: '12px' }}>{q.material}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {Number(q.precio_total).toFixed(2)} €
                  </td>
                  <td style={{ padding: '12px' }}>
                    <EstadoBadge estado={q.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.codigo ?? ''}
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setOpen(null)}>
              Cerrar
            </button>
            <SaveButton onClick={persist} state={save} dirty={dirty} />
          </>
        }
      >
        {open && (
          <>
            <Field label="Estado">
              <select
                style={inputStyle}
                value={estado}
                onChange={(e) => {
                  setEstado(e.target.value as QuoteEstado);
                  setDirty(true);
                }}
              >
                {ESTADOS.filter((e) => e.id !== 'todos').map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Cliente">
              <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                <strong>{open.nombre}</strong>
                <br />
                <a href={`mailto:${open.email}`} style={{ color: 'var(--accent)' }}>
                  {open.email}
                </a>
                {open.telefono && (
                  <>
                    {' · '}
                    <a
                      href={`https://wa.me/${open.telefono.replace(/[^\d]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent)' }}
                    >
                      {open.telefono}
                    </a>
                  </>
                )}
              </div>
            </Field>

            <Field label="Entrega">
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                {open.entrega === 'envio' ? (
                  <>
                    <strong>Envío nacional</strong> (coste a convenir)
                    <br />
                    {open.direccion?.calle}, {open.direccion?.cp}{' '}
                    {open.direccion?.ciudad} ({open.direccion?.provincia})
                  </>
                ) : (
                  <strong>Recogida en Salamanca</strong>
                )}
              </div>
            </Field>

            <Field label="Pieza">
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <a
                  href={open.archivo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', fontWeight: 600 }}
                >
                  ⬇ {open.archivo_nombre}
                </a>{' '}
                <span style={{ color: 'var(--muted)' }}>
                  ({(open.archivo_tamano / 1024 / 1024).toFixed(1)} MB)
                </span>
                <br />
                {m?.bbox_mm && (
                  <span>
                    {m.bbox_mm.x} × {m.bbox_mm.z} × {m.bbox_mm.y} mm ·{' '}
                  </span>
                )}
                {m?.volumen_cm3 != null && <span>{m.volumen_cm3} cm³ · </span>}
                {m?.peso_g != null && <span>~{m.peso_g} g · </span>}
                {m?.tiempo_h != null && <span>~{m.tiempo_h} h</span>}
              </div>
            </Field>

            <Field label="Configuración">
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                {open.material} · {open.resistencia}
                {m?.relleno_pct != null && ` (${m.relleno_pct}%)`} · {open.detalle} · ×{' '}
                {open.cantidad}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(open.colores ?? []).map((c, i) => (
                    <span
                      key={i}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r)',
                        fontSize: 12
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 2,
                          background: c.hex,
                          border: '1px solid var(--border-h)'
                        }}
                      />
                      {c.nombre}
                      {c.parte ? ` → ${c.parte}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            </Field>

            {lineas.length > 0 && (
              <Field label="Desglose estimado">
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r)',
                    padding: '10px 14px',
                    fontSize: 13
                  }}
                >
                  {lineas.map((l, i) => (
                    <div
                      key={i}
                      style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}
                    >
                      <span style={{ color: 'var(--muted)' }}>{l.concepto}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                        {Number(l.importe).toFixed(2)} €
                      </span>
                    </div>
                  ))}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingTop: 8,
                      marginTop: 6,
                      borderTop: '1px solid var(--border)',
                      fontWeight: 700
                    }}
                  >
                    <span>Total</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--accent)' }}>
                      {Number(open.precio_total).toFixed(2)} €
                    </span>
                  </div>
                </div>
              </Field>
            )}

            {open.mensaje && (
              <Field label="Mensaje del cliente">
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r)',
                    padding: '10px 14px',
                    fontSize: 13,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6
                  }}
                >
                  {open.mensaje}
                </div>
              </Field>
            )}

            <Field label="Notas internas">
              <textarea
                style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                value={notas}
                onChange={(e) => {
                  setNotas(e.target.value);
                  setDirty(true);
                }}
                placeholder="Anotaciones privadas sobre este presupuesto…"
              />
            </Field>
          </>
        )}
      </Drawer>
    </div>
  );
}
