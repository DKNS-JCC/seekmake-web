'use client';

// Quote management v2: clear estado pipeline, decoupled payment tracking,
// search/sort, inline estado change, archive/delete (with storage cleanup)
// and customer notifications via the notify-quote Edge Function.
//
// Sincronizado con la Calculadora (docs/plan-sincronizacion-web-calculadora.md):
// el estado viaja en los dos sentidos, lo cobrado sale del libro de cobros
// (no se edita a mano) y en los presupuestos con pedido el precio lo fija el
// taller en la Calculadora.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Quote, QuoteEstado, QuotePago } from '@/lib/types';
import { colorPreviewStyle } from '@/lib/color-preview';
import { downloadQuoteFile } from '@/lib/quote/compress';
import { Drawer } from '../_components/Drawer';
import { Field, inputStyle } from '../_components/Field';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { EnvioPanel } from '../_components/EnvioPanel';
import { ReciboPanel } from '../_components/ReciboPanel';
import { useConfirm } from '../_components/useConfirm';
import './presupuestos.css';
import { whatsappTo } from '@/lib/contacto';
import { mensajeDeError } from '@/lib/errors';
import { activable, activableRow } from '@/lib/a11y';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';

const ESTADOS: { id: QuoteEstado; label: string }[] = [
  { id: 'nuevo', label: 'Nuevo' },
  { id: 'revisado', label: 'Presupuestado' },
  { id: 'aceptado', label: 'Aceptado' },
  { id: 'imprimiendo', label: 'Imprimiendo / post-procesado' },
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

const PAGO_LABEL: Record<QuotePago, string> = {
  pendiente: 'Pendiente',
  adelanto: 'Adelanto',
  pagado: 'Pagado'
};

/** Estados con plantilla de aviso en notify-quote. */
const AVISABLES: QuoteEstado[] = ['revisado', 'aceptado', 'imprimiendo', 'listo', 'entregado', 'rechazado'];

/** Qué se encarga: archivos del tasador o descripción del pedido de la Calculadora. */
function piezas(q: Quote): string {
  const archivos = (q.archivos ?? [])
    .map((a) => `${a.nombre}${a.cantidad > 1 ? ` ×${a.cantidad}` : ''}`)
    .join(', ');
  return archivos || q.descripcion?.trim() || '—';
}

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
  // Presupuestos con pedido en la Calculadora: su precio se fija allí.
  const [conPedido, setConPedido] = useState<Set<string>>(new Set());
  const [precioFinal, setPrecioFinal] = useState<string>('');
  const [notas, setNotas] = useState('');
  const [save, setSave] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);
  const [notifying, setNotifying] = useState(false);

  const { authed, supabase } = useAdminAuth();
  const { confirmar, dialogo } = useConfirm();

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    const [{ data, error: err }, pedidos] = await Promise.all([
      supabase().from('quotes').select('*').order('created_at', { ascending: false }),
      supabase().rpc('quotes_con_pedido')
    ]);
    if (err) setError(mensajeDeError(err, 'No se pudieron cargar los presupuestos'));
    setQuotes(data ?? []);
    if (!pedidos.error) setConPedido(new Set((pedidos.data ?? []).map(String)));
    setLoading(false);
  }

  // Relee una quote tras un cambio: los triggers pueden haber tocado el pago
  // (libro de cobros) o el estado (Calculadora).
  async function releer(id: string) {
    const { data } = await supabase().from('quotes').select('*').eq('id', id).single();
    if (!data) return;
    setQuotes((prev) => prev.map((q) => (q.id === id ? data : q)));
    setOpen((cur) => (cur && cur.id === id ? data : cur));
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
    setPrecioFinal(q.precio_final != null ? String(q.precio_final) : '');
    setNotas(q.notas_admin);
    setSave('idle');
    setDirty(false);
    setInfo(null);
  }

  function buildUpdate() {
    const upd: Partial<Quote> = { estado, notas_admin: notas };
    if (open && !conPedido.has(open.id)) {
      upd.precio_final = precioFinal === '' ? null : Number(precioFinal);
    }
    return upd;
  }

  async function persist(): Promise<boolean> {
    if (!open) return false;
    setSave('saving');
    setError(null);
    const upd = buildUpdate();
    const { error: err } = await supabase().from('quotes').update(upd).eq('id', open.id);
    if (err) {
      setError(mensajeDeError(err, 'No se pudieron guardar los cambios'));
      setSave('error');
      return false;
    }
    setSave('saved');
    setDirty(false);
    setQuotes((prev) => prev.map((q) => (q.id === open.id ? { ...q, ...upd } : q)));
    await releer(open.id);
    return true;
  }

  async function avisar(quoteId: string) {
    setNotifying(true);
    setInfo(null);
    try {
      const { data, error: err } = await supabase().functions.invoke('notify-quote', {
        body: { quote_id: quoteId }
      });
      if (err) setError(mensajeDeError(err, 'No se pudo avisar al cliente'));
      else if (data?.error) setError(data.error);
      else setInfo(data?.message ?? 'Cliente avisado por email.');
    } catch {
      setError('Error de red al avisar al cliente.');
    } finally {
      setNotifying(false);
    }
  }

  async function persistAndNotify() {
    if (!open) return;
    const ok = await persist();
    if (!ok) return;
    await avisar(open.id);
  }

  // Inline estado change from the list (no drawer).
  async function quickEstado(q: Quote, value: QuoteEstado) {
    const { error: err } = await supabase()
      .from('quotes')
      .update({ estado: value })
      .eq('id', q.id);
    if (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el estado'));
      return;
    }
    setQuotes((prev) => prev.map((x) => (x.id === q.id ? { ...x, estado: value } : x)));
    // Mismo criterio que la Calculadora: al cambiar de estado se pregunta si
    // avisar al cliente; nunca se avisa solo.
    if (AVISABLES.includes(value) && q.email) {
      const si = await confirmar({
        titulo: `¿Avisar a ${q.nombre}?`,
        mensaje: `Se le enviará un email con el nuevo estado (${ESTADOS.find((e) => e.id === value)?.label}).`,
        detalle: q.email,
        confirmar: 'Avisar',
        destructivo: false
      });
      if (si) await avisar(q.id);
    }
  }

  async function toggleArchive(q: Quote) {
    const { error: err } = await supabase()
      .from('quotes')
      .update({ archivado: !q.archivado })
      .eq('id', q.id);
    if (err) {
      setError(mensajeDeError(err, 'No se pudo archivar el presupuesto'));
      return;
    }
    setQuotes((prev) =>
      prev.map((x) => (x.id === q.id ? { ...x, archivado: !q.archivado } : x))
    );
    setOpen(null);
  }

  async function removeQuote(q: Quote) {
    if (
      !(await confirmar({
        mensaje: `¿Borrar definitivamente el presupuesto ${q.codigo}?`,
        detalle:
          'Se eliminan también sus archivos del almacenamiento. No se puede deshacer.',
        confirmar: 'Borrar'
      }))
    ) {
      return;
    }
    setError(null);
    // Storage first so no orphan files are left behind.
    const paths = (q.archivos ?? []).map((a) => a.path).filter(Boolean);
    if (paths.length) {
      const { error: stErr } = await supabase().storage.from('quote-uploads').remove(paths);
      if (stErr) {
        setError(mensajeDeError(stErr, 'No se pudieron borrar los archivos'));
        return;
      }
    }
    const { error: err } = await supabase().from('quotes').delete().eq('id', q.id);
    if (err) {
      setError(mensajeDeError(err, 'No se pudo borrar el presupuesto'));
      return;
    }
    setQuotes((prev) => prev.filter((x) => x.id !== q.id));
    setOpen(null);
  }

  if (authed === false) return <AccesoDenegado />;

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
      {dialogo}
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
                  {...activableRow(() => openQuote(q), `Abrir el presupuesto ${q.codigo}`)}
                >
                  <td className="pq-codigo">{q.codigo}</td>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {fecha(q.created_at)}
                  </td>
                  <td>{q.nombre}</td>
                  <td className="pq-pieza-cell">
                    {q.origen === 'calculadora' && <span className="pq-origen">Calculadora</span>}
                    {piezas(q)}
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
                {...activable(() => openQuote(q), `Abrir el presupuesto ${q.codigo}`)}
              >
                <div className="pq-card-top">
                  <span className="pq-codigo">{q.codigo}</span>
                  <span className="pq-total">
                    {Number(q.precio_final ?? q.precio_total).toFixed(2)} €
                  </span>
                </div>
                <div className="pq-card-mid">
                  {q.nombre} · {piezas(q)}
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
              <Field label="Pago" hint="Sale del libro de cobros (abajo).">
                <div style={{ fontSize: 14, padding: '9px 0' }}>
                  <PagoBadge pago={open.pago ?? 'pendiente'} />{' '}
                  {PAGO_LABEL[open.pago ?? 'pendiente']} · {Number(open.importe_pagado || 0).toFixed(2)} € cobrados
                </div>
              </Field>
              <Field
                label="Precio final (€)"
                hint={
                  conPedido.has(open.id)
                    ? 'Lo fija el pedido de la Calculadora.'
                    : `Estimado: ${Number(open.precio_total).toFixed(2)} €`
                }
              >
                <input
                  style={inputStyle}
                  type="number"
                  step={0.01}
                  min={0}
                  placeholder={Number(open.precio_total).toFixed(2)}
                  value={precioFinal}
                  disabled={conPedido.has(open.id)}
                  onChange={(e) => {
                    setPrecioFinal(e.target.value);
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
                      href={whatsappTo(open.telefono)}
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

            {open.origen === 'calculadora' && open.descripcion && (
              <Field label="Encargo (pedido de la Calculadora)">
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>{open.descripcion}</div>
              </Field>
            )}

            <ReciboPanel quote={open} onCambio={() => void releer(open.id)} />

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
                              (err) => setError(mensajeDeError(err))
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
                                  ...colorPreviewStyle(c),
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
                          ...colorPreviewStyle(c),
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
