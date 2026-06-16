'use client';

// Quote management v2: clear estado pipeline, decoupled payment tracking,
// search/sort, inline estado change, archive/delete (with storage cleanup)
// and customer notifications via the notify-quote Edge Function.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Quote, QuoteEstado, QuotePago } from '@/lib/types';
import { downloadQuoteFile } from '@/lib/quote/compress';
import { Drawer } from '../_components/Drawer';
import { Field, inputStyle } from '../_components/Field';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { EnvioPanel } from '../_components/EnvioPanel';
import './presupuestos.css';

const ESTADOS: { id: QuoteEstado; label: string }[] = [
  { id: 'nuevo', label: 'Nuevo' },
  { id: 'revisado', label: 'Revisado' },
  { id: 'aceptado', label: 'Aceptado' },
  { id: 'imprimiendo', label: 'Imprimiendo' },
  { id: 'listo', label: 'Listo' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'rechazado', label: 'Rechazado' }
];

const ESTADO_COLOR: Record<QuoteEstado, string> = {
  nuevo: '#0EA5E9',
  revisado: '#a855f7',
  aceptado: '#eab308',
  imprimiendo: '#f97316',
  listo: '#10b981',
  entregado: '#6b7280',
  rechazado: '#ef4444'
};

const PAGOS: { id: QuotePago; label: string }[] = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'adelanto', label: 'Adelanto' },
  { id: 'pagado', label: 'Pagado' }
];

type SortKey = 'fecha' | 'total' | 'estado';

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function PagoBadge({ pago }: { pago: QuotePago }) {
  return <span className={`pq-pago pq-pago--${pago}`}>{pago}</span>;
}

export default function AdminPresupuestos() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QuoteEstado | 'todos'>('todos');
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('fecha');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // drawer
  const [open, setOpen] = useState<Quote | null>(null);
  const [estado, setEstado] = useState<QuoteEstado>('nuevo');
  const [pago, setPago] = useState<QuotePago>('pendiente');
  const [importePagado, setImportePagado] = useState(0);
  const [precioFinal, setPrecioFinal] = useState<string>('');
  const [notas, setNotas] = useState('');
  const [save, setSave] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);
  const [notifying, setNotifying] = useState(false);

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

  const visible = useMemo(() => {
    let list = quotes.filter((q) => (showArchived ? true : !q.archivado));
    if (filter !== 'todos') list = list.filter((q) => q.estado === filter);
    const qq = query.trim().toLowerCase();
    if (qq) {
      list = list.filter(
        (q) =>
          q.codigo.toLowerCase().includes(qq) ||
          q.nombre.toLowerCase().includes(qq) ||
          q.email.toLowerCase().includes(qq) ||
          (q.archivos ?? []).some((a) => a.nombre.toLowerCase().includes(qq))
      );
    }
    const orden = ESTADOS.map((e) => e.id);
    return [...list].sort((a, b) => {
      if (sort === 'total') return Number(b.precio_total) - Number(a.precio_total);
      if (sort === 'estado') return orden.indexOf(a.estado) - orden.indexOf(b.estado);
      return a.created_at < b.created_at ? 1 : -1;
    });
  }, [quotes, filter, showArchived, query, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: 0 };
    for (const q of quotes) {
      if (q.archivado && !showArchived) continue;
      c.todos++;
      c[q.estado] = (c[q.estado] ?? 0) + 1;
    }
    return c;
  }, [quotes, showArchived]);

  function openQuote(q: Quote) {
    setOpen(q);
    setEstado(q.estado);
    setPago(q.pago ?? 'pendiente');
    setImportePagado(Number(q.importe_pagado) || 0);
    setPrecioFinal(q.precio_final != null ? String(q.precio_final) : '');
    setNotas(q.notas_admin);
    setSave('idle');
    setDirty(false);
    setInfo(null);
  }

  function buildUpdate() {
    return {
      estado,
      pago,
      importe_pagado: importePagado,
      precio_final: precioFinal === '' ? null : Number(precioFinal),
      notas_admin: notas
    };
  }

  async function persist(): Promise<boolean> {
    if (!open) return false;
    setSave('saving');
    setError(null);
    const upd = buildUpdate();
    const { error: err } = await supabase().from('quotes').update(upd).eq('id', open.id);
    if (err) {
      setError(err.message);
      setSave('error');
      return false;
    }
    setSave('saved');
    setDirty(false);
    setQuotes((prev) => prev.map((q) => (q.id === open.id ? { ...q, ...upd } : q)));
    return true;
  }

  async function persistAndNotify() {
    if (!open) return;
    const ok = await persist();
    if (!ok) return;
    setNotifying(true);
    setInfo(null);
    try {
      const { data, error: err } = await supabase().functions.invoke('notify-quote', {
        body: { quote_id: open.id }
      });
      if (err) setError(err.message ?? 'No se pudo avisar al cliente.');
      else if (data?.error) setError(data.error);
      else setInfo(data?.message ?? 'Cliente avisado por email.');
    } catch {
      setError('Error de red al avisar al cliente.');
    } finally {
      setNotifying(false);
    }
  }

  // Inline estado change from the list (no drawer).
  async function quickEstado(q: Quote, value: QuoteEstado) {
    const { error: err } = await supabase()
      .from('quotes')
      .update({ estado: value })
      .eq('id', q.id);
    if (err) {
      setError(err.message);
      return;
    }
    setQuotes((prev) => prev.map((x) => (x.id === q.id ? { ...x, estado: value } : x)));
  }

  async function toggleArchive(q: Quote) {
    const { error: err } = await supabase()
      .from('quotes')
      .update({ archivado: !q.archivado })
      .eq('id', q.id);
    if (err) {
      setError(err.message);
      return;
    }
    setQuotes((prev) =>
      prev.map((x) => (x.id === q.id ? { ...x, archivado: !q.archivado } : x))
    );
    setOpen(null);
  }

  async function removeQuote(q: Quote) {
    if (
      !window.confirm(
        `¿Borrar definitivamente ${q.codigo}? Se eliminan también sus archivos del almacenamiento.`
      )
    ) {
      return;
    }
    setError(null);
    // Storage first so no orphan files are left behind.
    const paths = (q.archivos ?? []).map((a) => a.path).filter(Boolean);
    if (paths.length) {
      const { error: stErr } = await supabase().storage.from('quote-uploads').remove(paths);
      if (stErr) {
        setError('No se pudieron borrar los archivos: ' + stErr.message);
        return;
      }
    }
    const { error: err } = await supabase().from('quotes').delete().eq('id', q.id);
    if (err) {
      setError(err.message);
      return;
    }
    setQuotes((prev) => prev.filter((x) => x.id !== q.id));
    setOpen(null);
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

  const estadoSelect = (q: Quote) => (
    <select
      className="pq-estado-select"
      style={{ color: ESTADO_COLOR[q.estado], borderColor: ESTADO_COLOR[q.estado] }}
      value={q.estado}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => void quickEstado(q, e.target.value as QuoteEstado)}
    >
      {ESTADOS.map((e) => (
        <option key={e.id} value={e.id}>
          {e.label}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8
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
          {(counts['nuevo'] ?? 0) > 0 && (
            <span
              style={{
                marginLeft: 12,
                verticalAlign: 'middle',
                display: 'inline-block',
                padding: '3px 10px',
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: 'var(--r)',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: '0.08em'
              }}
            >
              {counts['nuevo']} nuevos
            </span>
          )}
        </h1>
        <Link href="/admin/tarifas" className="nav-link">
          Editar tarifas →
        </Link>
      </div>

      <div className="pq-toolbar">
        <input
          className="pq-search"
          type="search"
          placeholder="Buscar por código, nombre, email o archivo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="pq-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="fecha">Más recientes</option>
          <option value="total">Mayor importe</option>
          <option value="estado">Por estado</option>
        </select>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--muted)',
            cursor: 'pointer'
          }}
        >
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          Ver archivados
        </label>
      </div>

      <div className="pq-filters">
        <button
          type="button"
          className={'pq-filter' + (filter === 'todos' ? ' active' : '')}
          onClick={() => setFilter('todos')}
        >
          Todos<span>{counts.todos ?? 0}</span>
        </button>
        {ESTADOS.map((e) => (
          <button
            key={e.id}
            type="button"
            className={'pq-filter' + (filter === e.id ? ' active' : '')}
            onClick={() => setFilter(e.id)}
          >
            {e.label}
            <span>{counts[e.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p style={{ color: 'var(--muted)' }}>Cargando…</p>}
      {!loading && visible.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>No hay presupuestos que coincidan.</p>
      )}

      {visible.length > 0 && (
        <>
          {/* desktop table */}
          <table className="pq-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Piezas</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Pago</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((q) => (
                <tr
                  key={q.id}
                  className={q.archivado ? 'archived' : ''}
                  onClick={() => openQuote(q)}
                >
                  <td className="pq-codigo">{q.codigo}</td>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {fecha(q.created_at)}
                  </td>
                  <td>{q.nombre}</td>
                  <td className="pq-pieza-cell">
                    {(q.archivos ?? [])
                      .map((a) => `${a.nombre}${a.cantidad > 1 ? ` ×${a.cantidad}` : ''}`)
                      .join(', ') || '—'}
                  </td>
                  <td className="pq-total">
                    {Number(q.precio_final ?? q.precio_total).toFixed(2)} €
                  </td>
                  <td>
                    <PagoBadge pago={q.pago ?? 'pendiente'} />
                  </td>
                  <td>{estadoSelect(q)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* mobile cards */}
          <div className="pq-cards">
            {visible.map((q) => (
              <div
                key={q.id}
                className={'pq-card' + (q.archivado ? ' archived' : '')}
                onClick={() => openQuote(q)}
              >
                <div className="pq-card-top">
                  <span className="pq-codigo">{q.codigo}</span>
                  <span className="pq-total">
                    {Number(q.precio_final ?? q.precio_total).toFixed(2)} €
                  </span>
                </div>
                <div className="pq-card-mid">
                  {q.nombre} ·{' '}
                  {(q.archivos ?? [])
                    .map((a) => `${a.nombre}${a.cantidad > 1 ? ` ×${a.cantidad}` : ''}`)
                    .join(', ')}
                </div>
                <div className="pq-card-bottom">
                  {estadoSelect(q)}
                  <PagoBadge pago={q.pago ?? 'pendiente'} />
                  <span className="pq-card-fecha">{fecha(q.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.codigo ?? ''}
        footer={
          <>
            <button
              type="button"
              className="btn-outline"
              style={{ marginRight: 'auto', borderColor: '#ef4444', color: '#ef4444' }}
              onClick={() => open && void removeQuote(open)}
            >
              Borrar
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => open && void toggleArchive(open)}
            >
              {open?.archivado ? 'Desarchivar' : 'Archivar'}
            </button>
            <button
              type="button"
              className="btn-outline"
              disabled={notifying}
              onClick={() => void persistAndNotify()}
            >
              {notifying ? 'Avisando…' : 'Guardar y avisar'}
            </button>
            <SaveButton
              onClick={async () => {
                await persist();
              }}
              state={save}
              dirty={dirty}
            />
          </>
        }
      >
        {open && (
          <>
            {info && (
              <p
                style={{
                  padding: '8px 12px',
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid #10b981',
                  borderRadius: 'var(--r)',
                  fontSize: 13,
                  marginBottom: 16
                }}
              >
                ✓ {info}
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Estado">
                <select
                  style={inputStyle}
                  value={estado}
                  onChange={(e) => {
                    setEstado(e.target.value as QuoteEstado);
                    setDirty(true);
                  }}
                >
                  {ESTADOS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pago">
                <select
                  style={inputStyle}
                  value={pago}
                  onChange={(e) => {
                    setPago(e.target.value as QuotePago);
                    setDirty(true);
                  }}
                >
                  {PAGOS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Precio final (€)" hint={`Estimado: ${Number(open.precio_total).toFixed(2)} €`}>
                <input
                  style={inputStyle}
                  type="number"
                  step={0.01}
                  min={0}
                  placeholder={Number(open.precio_total).toFixed(2)}
                  value={precioFinal}
                  onChange={(e) => {
                    setPrecioFinal(e.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <Field label="Importe cobrado (€)">
                <input
                  style={inputStyle}
                  type="number"
                  step={0.01}
                  min={0}
                  value={importePagado}
                  onChange={(e) => {
                    setImportePagado(Number(e.target.value) || 0);
                    setDirty(true);
                  }}
                />
              </Field>
            </div>

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

            {open.entrega === 'envio' && <EnvioPanel quote={open} />}

            <Field label={`Piezas (${(open.archivos ?? []).length})`}>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(open.archivos ?? []).map((a, i) => {
                  const am: any = a.metricas ?? {};
                  return (
                    <li
                      key={i}
                      style={{
                        padding: '10px 12px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r)',
                        fontSize: 13
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <strong
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {a.nombre}
                          {a.cantidad > 1 ? ` × ${a.cantidad}` : ''}
                        </strong>
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ padding: '5px 12px', fontSize: 10, flexShrink: 0 }}
                          onClick={() =>
                            downloadQuoteFile(a.url, a.url.endsWith('.gz') ? a.nombre + '.gz' : a.nombre).catch(
                              (err) => setError(String(err?.message ?? err))
                            )
                          }
                        >
                          ⬇ Descargar
                        </button>
                      </div>
                      {a.material && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexWrap: 'wrap',
                            fontSize: 12,
                            marginTop: 5
                          }}
                        >
                          <strong>{a.material}</strong>
                          {(a.colores ?? []).map((c, j) => (
                            <span
                              key={j}
                              title={c.nombre + (c.parte ? ` → ${c.parte}` : '')}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '1px 7px',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--r)'
                              }}
                            >
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 2,
                                  background: c.hex,
                                  border: '1px solid var(--border-h)'
                                }}
                              />
                              {c.nombre}
                            </span>
                          ))}
                          <span style={{ color: 'var(--muted)' }}>
                            · {a.resistencia}
                            {am.relleno_pct != null && ` (${am.relleno_pct}%)`} · {a.detalle}
                          </span>
                        </div>
                      )}
                      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                        {am.bbox_mm
                          ? `${am.bbox_mm.x} × ${am.bbox_mm.z} × ${am.bbox_mm.y} mm · `
                          : ''}
                        {am.volumen_cm3 != null && `${am.volumen_cm3} cm³ · `}
                        {am.peso_g != null && `~${am.peso_g} g · `}
                        {(a.tamano / 1024 / 1024).toFixed(1)} MB
                        {a.comprimido &&
                          ` (gzip, original ${(a.tamano_original / 1024 / 1024).toFixed(1)} MB)`}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Field>

            <Field label="Configuración">
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                {open.material} · {open.resistencia}
                {m?.relleno_pct != null && ` (${m.relleno_pct}%)`} · {open.detalle} ·{' '}
                {open.cantidad} unidad{open.cantidad !== 1 ? 'es' : ''}
                {m?.dias_estimados != null && ` · ~${m.dias_estimados} días`}
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
                    <span>Total estimado</span>
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
