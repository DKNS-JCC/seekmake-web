'use client';

// Ficha del pedido: cajón con cabecera fija (estado, plazo, siguiente paso) y
// cuatro pestañas. Estado y cobros actúan al momento; fecha, precio, notas y
// reimpresiones se guardan con el botón (y el cajón avisa si se cierra sin
// guardar). La lista decide qué hacer con el estado y el borrado:
// aquí solo se piden.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Quote, QuoteEstado } from '@/lib/types';
import { colorPreviewStyle } from '@/lib/color-preview';
import { downloadQuoteFile } from '@/lib/quote/compress';
import { euros } from '@/lib/recibo/types';
import { fechaLarga, fechaTope, hoyMadrid, senalPendiente, type QuoteSettings } from '@/lib/quote/pricing';
import { openQuotePdf } from '@/lib/quote/pdf';
import { BotonTicket } from './BotonTicket';
import { whatsappTo } from '@/lib/contacto';
import { mensajeDeError } from '@/lib/errors';
import { Drawer } from '../_components/Drawer';
import { Field, inputStyle } from '../_components/Field';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { EnvioPanel } from '../_components/EnvioPanel';
import { ReciboPanel } from '../_components/ReciboPanel';
import { Pestanas } from '../_components/Pestanas';
import { CampoNumero } from '../_components/Campos';
import { useAdminAuth } from '../_components/useAdminAuth';
import { parseNumero } from '@/lib/quote/formatos';
import {
  AVISABLES, ESTADOS, ESTADO_COLOR, ESTADO_LABEL, PAGO_LABEL, siguientePaso,
  diaCorto, fechaCorta, piezas
} from './estados';
import { contabilizarMaterial, lineasMaterial, parchearOrden, type PedidoRow } from './orden';

export type AccionesFicha = {
  /** Sin avisar (undefined): pregunta si mandar el email. */
  mover: (q: Quote, a: QuoteEstado, avisar?: boolean) => Promise<void>;
  eliminar: (q: Quote) => Promise<void>;
  duplicar: (q: Quote) => Promise<void>;
  /** Vuelve a leer el pedido (los triggers pueden haber tocado pago o estado). */
  releer: (id: string) => Promise<void>;
  avisar: (texto: string, accion?: { label: string; run: () => void }) => void;
  /** Manda al cliente el email del estado actual; devuelve el texto del resultado. */
  avisarCliente: (q: Quote) => Promise<string>;
};

const PESTANAS = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'piezas', label: 'Piezas' },
  { value: 'cobros', label: 'Cobros' },
  { value: 'envio', label: 'Envío' }
];

const num = (s: string) => {
  const n = parseNumero(s);
  return n === null || Number.isNaN(n) ? 0 : n;
};

/** One piece as quote_a_order_data keeps it (20261112100000); figures per unit. */
type PiezaPedido = {
  nombre: string;
  cantidad: number;
  material: string;
  colores: { nombre: string; hex?: string; parte?: string }[];
  peso_g: number | null;
  horas: number | null;
};
const coma = (n: number) => String(Math.round(Number(n) * 100) / 100).replace('.', ',');

export function Ficha({
  q,
  pedido,
  conPedido,
  ajustes,
  pestana,
  onPestana,
  onCerrar,
  acciones
}: {
  q: Quote | null;
  pedido: PedidoRow | null;
  conPedido: boolean;
  ajustes: QuoteSettings;
  pestana: string;
  onPestana: (p: string) => void;
  onCerrar: () => void;
  acciones: AccionesFicha;
}) {
  const { supabase } = useAdminAuth();
  const [precio, setPrecio] = useState('');
  const [fecha, setFecha] = useState('');
  const [urgente, setUrgente] = useState(false);
  const [notas, setNotas] = useState('');
  const [reps, setReps] = useState(0);
  const [extra, setExtra] = useState('');
  const [dirty, setDirty] = useState(false);
  const [save, setSave] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState('');

  const d = pedido?.data ?? null;
  const recargo = ajustes.urgencia_recargo_pct;

  // Al abrir otro pedido se vuelve a empezar.
  useEffect(() => {
    if (!q) return;
    setPrecio(q.precio_final != null ? Number(q.precio_final).toFixed(2).replace('.', ',') : '');
    setFecha(q.fecha_prometida ?? '');
    setUrgente(!!q.urgente);
    setNotas(q.notas_admin ?? '');
    setSave('idle');
    setDirty(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id]);
  // Reimpresiones y gastos viven en el pedido, que llega después.
  useEffect(() => {
    setReps(Math.max(0, Math.floor(Number(d?.repeticiones_error) || 0)));
    setExtra(d?.gasto_misc ? String(d.gasto_misc).replace('.', ',') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.id, q?.id]);
  // La base de datos pone la fecha al aceptar: que el campo la vea.
  useEffect(() => {
    if (q && !dirty) setFecha(q.fecha_prometida ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.fecha_prometida]);

  const sucio = (fn: () => void) => {
    fn();
    setDirty(true);
    setSave('idle');
  };

  const total = q ? Number(q.precio_final ?? q.precio_total) : 0;
  const costeReal = useMemo(() => {
    if (!d) return null;
    const bruto = Number(d.coste_bruto) || 0;
    return Math.round((bruto * (1 + reps) + num(extra)) * 100) / 100;
  }, [d, reps, extra]);

  if (!q) return <Drawer open={false} onClose={onCerrar} title="" >{null}</Drawer>;

  const siguiente = siguientePaso(q);
  const puedeAvisar = !!q.email;
  const material = d ? lineasMaterial(d) : [];
  const sinApuntar = !!d && ['aceptado', 'imprimiendo', 'listo', 'entregado'].includes(q.estado) && !d.material_contabilizado && material.length > 0;

  async function persist(): Promise<boolean> {
    if (!q) return false;
    setSave('saving');
    setError(null);
    try {
      const upd: Partial<Quote> = { notas_admin: notas, urgente };
      if (fecha !== (q.fecha_prometida ?? '')) upd.fecha_prometida = fecha || null;
      // Precio firme o con pedido de taller: no se manda (la base de datos lo rechaza o lo fija el pedido).
      if (!conPedido && !q.precio_firme) upd.precio_final = precio.trim() === '' ? null : num(precio);
      const { error: err } = await supabase().from('quotes').update(upd).eq('id', q.id);
      if (err) throw err;
      if (d) {
        await parchearOrden(supabase(), q.id, {
          notes: notas,
          repeticiones_error: reps,
          gasto_misc: Math.round(num(extra) * 100) / 100
        });
      }
      setSave('saved');
      setDirty(false);
      await acciones.releer(q.id);
      return true;
    } catch (e) {
      setError(mensajeDeError(e as { message?: string }, 'No se pudieron guardar los cambios'));
      setSave('error');
      return false;
    }
  }

  async function paso(avisar: boolean) {
    if (!q || !siguiente) return;
    setTrabajando(avisar ? 'avisando' : 'paso');
    setError(null);
    try {
      if (dirty && !(await persist())) return;
      await acciones.mover(q, siguiente.a, avisar);
    } finally {
      setTrabajando('');
    }
  }

  // Avisar en cualquier momento (p. ej. pedidos que se pusieron en «Listo» sin avisar).
  async function reavisar() {
    if (!q) return;
    setTrabajando('avisando');
    try {
      acciones.avisar(await acciones.avisarCliente(q));
    } finally {
      setTrabajando('');
    }
  }

  async function recalcularFecha() {
    if (!q) return;
    const { data, error: err } = await supabase().rpc('fecha_tope_quote', { p_quote_id: q.id });
    if (err) setError(mensajeDeError(err, 'No se pudo calcular la fecha'));
    else if (data) sucio(() => setFecha(String(data).slice(0, 10)));
  }

  // El cliente cambió el encargo: quita el precio firme y reinicia la aceptación.
  async function rehacer() {
    if (!q) return;
    const motivo = window.prompt(
      `Rehacer el presupuesto ${q.codigo}: quita el precio firme y el cliente tendrá que aceptarlo de nuevo.\n\n¿Qué ha cambiado? (unidades, material, diseño, envío, urgencia…)`
    );
    if (!motivo?.trim()) return;
    const { error: err } = await supabase().rpc('rehacer_presupuesto', { p_quote_id: q.id, p_motivo: motivo.trim() });
    if (err) return setError(mensajeDeError(err, 'No se pudo rehacer el presupuesto'));
    await acciones.releer(q.id);
    acciones.avisar('Presupuesto rehecho: pon el precio nuevo y avisa al cliente.');
  }

  async function apuntarMaterial() {
    if (!q) return;
    try {
      const msg = await contabilizarMaterial(supabase(), q.id);
      acciones.avisar(msg ?? 'Material ya apuntado.');
      await acciones.releer(q.id);
    } catch (e) {
      setError(mensajeDeError(e as { message?: string }, 'No se pudo apuntar el material'));
    }
  }

  function pdf() {
    if (!q) return;
    const lineas = Array.isArray((q.desglose as { lineas?: unknown })?.lineas)
      ? ((q.desglose as { lineas: { concepto: string; importe: number }[] }).lineas)
      : [{ concepto: piezas(q), importe: total }];
    const horas = Number(d?.horas) || Number((q.metricas as { tiempo_h?: number })?.tiempo_h) || 0;
    const ok = openQuotePdf(
      { lineas, total, pesoG: Number(d?.peso_g) || 0, tiempoH: horas },
      ajustes,
      0,
      { fechaTope: q.fecha_prometida?.slice(0, 10) ?? fechaTope(horas, ajustes, 0, hoyMadrid()), codigo: q.codigo }
    );
    if (!ok) setError('El navegador bloqueó la ventana del PDF. Permite las ventanas emergentes.');
  }

  const m = (q.metricas ?? {}) as { relleno_pct?: number; dias_estimados?: number };
  const lineasDesglose = Array.isArray((q.desglose as { lineas?: unknown })?.lineas)
    ? ((q.desglose as { lineas: { concepto: string; importe: number }[] }).lineas)
    : [];
  const pagado = Number(q.importe_pagado || 0);
  const tope = q.fecha_prometida ? `Listo antes del ${diaCorto(q.fecha_prometida)}` : 'Sin fecha tope';

  const principal = (clase: string) => {
    if (q.estado === 'nuevo' && !siguiente) {
      return (
        <Link className={`btn-primary ${clase}`} href={`/admin/encargo?solicitud=${encodeURIComponent(q.codigo)}`}>
          Presupuestar
        </Link>
      );
    }
    if (!siguiente) return null;
    const conAviso = puedeAvisar && AVISABLES.includes(siguiente.a);
    return (
      <>
        <button type="button" className={`btn-primary ${clase}`} disabled={trabajando !== ''} onClick={() => void paso(conAviso)}>
          {trabajando ? 'Un momento…' : conAviso ? `${siguiente.label} y avisar` : siguiente.label}
        </button>
        {conAviso && (
          <button type="button" className={`fi-sin-avisar ${clase}`} disabled={trabajando !== ''} onClick={() => void paso(false)}>
            sin avisar
          </button>
        )}
      </>
    );
  };

  return (
    <Drawer
      open
      onClose={onCerrar}
      error={error}
      dirty={dirty}
      title={`${q.codigo} · ${q.nombre}`}
      footer={
        <>
          <span className="fi-principal-pie">{principal('fi-pie')}</span>
          <SaveButton onClick={async () => void (await persist())} state={save} dirty={dirty} />
        </>
      }
    >
      <div className="fi-cab">
        <p className="fi-resumen">
          <span className="pq-estado-badge" style={{ borderColor: ESTADO_COLOR[q.estado] }}>
            <i style={{ background: ESTADO_COLOR[q.estado] }} aria-hidden="true" />
            {ESTADO_LABEL[q.estado]}
          </span>{' '}
          {tope} · <strong className="adm-num">{euros(total)}</strong> · cobrado {euros(pagado)}
          {q.origen === 'web' && <span className="pq-origen" style={{ marginLeft: 8 }}>web</span>}
        </p>
        <div className="fi-principal-cab">{principal('fi-cabeza')}</div>
        {['aceptado', 'imprimiendo', 'listo'].includes(q.estado) && senalPendiente(total, pagado) && (
          <p className="pq-aviso">
            <strong>⚠ Señal del 50 % pendiente</strong>
            <span>{euros(pagado)} cobrados de {euros(total / 2)}</span>
          </p>
        )}
        <Pestanas id="fi" etiqueta="Secciones del pedido" value={pestana} onChange={onPestana} pestanas={PESTANAS} />
      </div>

      <div role="tabpanel" id="fi-panel" aria-labelledby={`fi-${pestana}`}>
        {pestana === 'resumen' && (
          <>
            {sinApuntar && (
              <p className="pq-aviso">
                <span>El material de este pedido aún no está apuntado en el gasto de filamento.</span>
                <button type="button" className="btn-outline" onClick={() => void apuntarMaterial()}>
                  Apuntar material
                </button>
              </p>
            )}

            <div className="pq-respuesta">
              <Field label="Estado">
                <span className="fi-fila">
                  <select
                    style={inputStyle}
                    value={q.estado}
                    onChange={(e) => void acciones.mover(q, e.target.value as QuoteEstado)}
                  >
                    {ESTADOS.map((e) => (
                      <option key={e.id} value={e.id}>{e.label}</option>
                    ))}
                  </select>
                  {puedeAvisar && AVISABLES.includes(q.estado) && (
                    <button type="button" className="btn-outline" disabled={trabajando !== ''} onClick={() => void reavisar()}>
                      {trabajando === 'avisando' ? 'Avisando…' : `Avisar de «${ESTADO_LABEL[q.estado]}»`}
                    </button>
                  )}
                </span>
              </Field>
              <Field label="Listo antes del" hint={q.listo_at ? `Listo el ${fechaCorta(q.listo_at)}` : fecha ? fechaLarga(fecha) : 'Se fija sola al aceptar.'}>
                <span className="fi-fila">
                  <input style={inputStyle} type="date" value={fecha} onChange={(e) => sucio(() => setFecha(e.target.value))} />
                  <button type="button" className="btn-outline" onClick={() => void recalcularFecha()}>Recalcular</button>
                </span>
              </Field>
            </div>

            <div className="pq-respuesta">
              <Field
                label="Precio final"
                hint={
                  q.precio_firme
                    ? 'Precio firme: es el que vio el cliente. Para cambiarlo, «Rehacer presupuesto».'
                    : conPedido
                      ? 'Lo fija el pedido: cámbialo en «Editar y recalcular».'
                      : `Estimado: ${euros(q.precio_total)}`
                }
              >
                <CampoNumero
                  value={q.precio_firme ? Number(q.precio_total).toFixed(2).replace('.', ',') : precio}
                  onChange={(v) => sucio(() => setPrecio(v))}
                  unidad="€"
                  disabled={conPedido || !!q.precio_firme}
                  enterKeyHint="done"
                />
              </Field>
              <Field label="Urgencia" hint={`La fecha ignora la cola. Con recargo (+${recargo} %): ${euros(Math.round(Number(q.precio_total) * (1 + recargo / 100) * 100) / 100)}`}>
                <label className="fi-urgente">
                  <input type="checkbox" checked={urgente} onChange={(e) => sucio(() => setUrgente(e.target.checked))} style={{ accentColor: 'var(--accent)' }} />
                  Urgente
                  {urgente && !conPedido && !q.precio_firme && (
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => sucio(() => setPrecio((Math.round(Number(q.precio_total) * (1 + recargo / 100) * 100) / 100).toFixed(2).replace('.', ',')))}
                    >
                      Aplicar recargo
                    </button>
                  )}
                </label>
              </Field>
            </div>
            {q.precio_firme && (
              <p className="pq-aviso">
                <strong>Precio firme · {euros(q.precio_total)}</strong>
                <button type="button" className="btn-outline" onClick={() => void rehacer()}>Rehacer presupuesto…</button>
              </p>
            )}
            {q.rehecho_at && <p className="pq-nota">Rehecho el {fechaCorta(q.rehecho_at)}: «{q.rehecho_motivo}»</p>}

            {d && (
              <dl className="fi-cifras">
                <div><dt>Coste previsto</dt><dd className="adm-num">{euros(Number(d.coste_bruto) || 0)}</dd></div>
                <div><dt>Beneficio previsto</dt><dd className="adm-num">{euros(total - (Number(d.coste_bruto) || 0))}</dd></div>
                <div><dt>Coste real</dt><dd className="adm-num">{euros(costeReal)}</dd></div>
                <div><dt>Beneficio real</dt><dd className="adm-num">{euros(total - (costeReal ?? 0))}</dd></div>
              </dl>
            )}

            <Field label="Contacto">
              <div className="fi-contacto">
                <strong>{q.nombre}</strong>
                {q.email && <a href={`mailto:${q.email}`}>{q.email}</a>}
                {q.telefono && (
                  <span>
                    <a href={`tel:${q.telefono}`}>{q.telefono}</a> · <a href={whatsappTo(q.telefono)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                  </span>
                )}
                {!q.email && !q.telefono && <span style={{ color: 'var(--muted)' }}>Sin email ni teléfono.</span>}
              </div>
            </Field>

            {d && (
              <Field label="Reimpresiones por fallo" hint="Cuentan como coste real (estadísticas).">
                <span className="fi-reps">
                  <button type="button" className="btn-outline" aria-label="Una reimpresión menos" disabled={reps <= 0} onClick={() => sucio(() => setReps((r) => Math.max(0, r - 1)))}>−</button>
                  <output aria-live="polite">{reps}</output>
                  <button type="button" className="btn-outline" aria-label="Una reimpresión más" onClick={() => sucio(() => setReps((r) => r + 1))}>+</button>
                </span>
              </Field>
            )}
            {d && (
              <Field label="Gastos extra" hint="Material comprado aparte, envases… (de tu bolsillo)">
                <CampoNumero value={extra} onChange={(v) => sucio(() => setExtra(v))} unidad="€" />
              </Field>
            )}

            <Field label="Notas internas">
              <textarea
                style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                value={notas}
                onChange={(e) => sucio(() => setNotas(e.target.value))}
                placeholder="Anotaciones privadas sobre este pedido…"
              />
            </Field>

            <div className="pq-mas">
              <span className="fi-acciones">
                <Link className="btn-outline" href={`/admin/encargo?${d && q.origen === 'web' && q.estado === 'nuevo' ? 'solicitud' : 'editar'}=${encodeURIComponent(q.codigo)}`}>
                  Editar y recalcular
                </Link>
                <button type="button" className="btn-outline" onClick={() => void acciones.duplicar(q)} disabled={!d}>Duplicar</button>
                <button type="button" className="btn-outline" onClick={pdf}>PDF</button>
                <BotonTicket q={q} piezas={Array.isArray(d?.piezas) ? (d.piezas as PiezaPedido[]) : []} onError={setError} />
              </span>
            </div>
            <p style={{ marginTop: 28 }}>
              <button type="button" className="pq-borrar" onClick={() => void acciones.eliminar(q)}>Eliminar pedido…</button>
            </p>
          </>
        )}

        {pestana === 'piezas' && (
          <>
            {q.origen === 'calculadora' && q.descripcion && (
              <Field label="Encargo"><div style={{ fontSize: 14, lineHeight: 1.6 }}>{q.descripcion}</div></Field>
            )}
            {q.mensaje && (
              <Field label="Mensaje del cliente">
                <div className="fi-caja" style={{ whiteSpace: 'pre-wrap' }}>{q.mensaje}</div>
              </Field>
            )}

            {d && (
              <Field label="Datos del taller">
                <dl className="fi-datos">
                  {d.impresora && <div><dt>Impresora</dt><dd>{d.impresora}</dd></div>}
                  <div><dt>Material</dt><dd>
                    {material.length
                      ? material.map((l) => `${l.material} ${l.color} · ${String(Math.round(l.grams * 10) / 10).replace('.', ',')} g`).join(' + ')
                      : '—'}
                  </dd></div>
                  <div><dt>Horas</dt><dd>{String(d.horas ?? '—').replace('.', ',')} h</dd></div>
                  {d.cantidad > 1 && <div><dt>Unidades</dt><dd>{d.cantidad}</dd></div>}
                  {d.diseno_modelado && <div><dt>Diseño</dt><dd>{d.diseno_modelado}{Number(d.diseno_horas) > 0 ? ` · ${d.diseno_horas} h` : ''}</dd></div>}
                  {d.postprocesado_label && <div><dt>Post-procesado</dt><dd>{d.postprocesado_label}</dd></div>}
                  {d.probabilidad_error_label && <div><dt>Riesgo</dt><dd>{d.probabilidad_error_label}</dd></div>}
                  {d.markup_label && <div><dt>Margen</dt><dd>{d.markup_label}</dd></div>}
                </dl>
              </Field>
            )}

            {Array.isArray(d?.piezas) && d.piezas.length > 1 && (
              <Field label={`Piezas del pedido (${d.piezas.length})`}>
                <ul className="fi-lista">
                  {(d.piezas as PiezaPedido[]).map((p, i) => (
                    <li key={i} className="fi-caja">
                      <div className="fi-fila" style={{ justifyContent: 'space-between' }}>
                        <strong title={p.nombre} className="fi-nombre">
                          {p.nombre}{p.cantidad > 1 ? ` × ${p.cantidad}` : ''}
                        </strong>
                        <span>{p.material}</span>
                      </div>
                      <div className="fi-colores">
                        {(p.colores ?? []).map((c, j) => (
                          <span key={j} className="fi-color" title={c.nombre + (c.parte ? ` → ${c.parte}` : '')}>
                            <i style={{ background: c.hex ?? '#ccc' }} />
                            {c.nombre}
                          </span>
                        ))}
                        <span style={{ color: 'var(--muted)' }}>
                          · {p.peso_g != null ? `${coma(p.peso_g)} g` : '— g'} · {p.horas != null ? `${coma(p.horas)} h` : '— h'}
                          {p.cantidad > 1 ? ' por unidad' : ''}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Field>
            )}

            {(q.archivos ?? []).length > 0 && (
              <Field label={`Archivos (${q.archivos.length})`}>
                <ul className="fi-lista">
                  {q.archivos.map((a, i) => {
                    const am = (a.metricas ?? {}) as { bbox_mm?: { x: number; y: number; z: number }; volumen_cm3?: number; peso_g?: number; relleno_pct?: number };
                    return (
                      <li key={i} className="fi-caja">
                        <div className="fi-fila" style={{ justifyContent: 'space-between' }}>
                          <strong title={a.nombre} className="fi-nombre">
                            {a.nombre}{a.cantidad > 1 ? ` × ${a.cantidad}` : ''}
                          </strong>
                          <button
                            type="button"
                            className="btn-outline"
                            onClick={() =>
                              downloadQuoteFile(a.url, a.url.endsWith('.gz') ? a.nombre + '.gz' : a.nombre).catch((err) =>
                                setError(mensajeDeError(err))
                              )
                            }
                          >
                            Descargar
                          </button>
                        </div>
                        {a.material && (
                          <div className="fi-colores">
                            <strong>{a.material}</strong>
                            {(a.colores ?? []).map((c, j) => (
                              <span key={j} className="fi-color" title={c.nombre + (c.parte ? ` → ${c.parte}` : '')}>
                                <i style={{ ...colorPreviewStyle(c) }} />
                                {c.nombre}
                              </span>
                            ))}
                            <span style={{ color: 'var(--muted)' }}>
                              · {a.resistencia}{am.relleno_pct != null && ` (${am.relleno_pct}%)`} · {a.detalle}
                            </span>
                          </div>
                        )}
                        <div className="pq-nota" style={{ margin: '4px 0 0' }}>
                          {am.bbox_mm ? `${am.bbox_mm.x} × ${am.bbox_mm.z} × ${am.bbox_mm.y} mm · ` : ''}
                          {am.volumen_cm3 != null && `${am.volumen_cm3} cm³ · `}
                          {am.peso_g != null && `~${am.peso_g} g · `}
                          {(a.tamano / 1024 / 1024).toFixed(1).replace('.', ',')} MB
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Field>
            )}

            {q.origen !== 'calculadora' && (
              <Field label="Configuración (tasador)">
                <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                  {q.material} · {q.resistencia}{m.relleno_pct != null && ` (${m.relleno_pct}%)`} · {q.detalle} · {q.cantidad} unidad{q.cantidad !== 1 ? 'es' : ''}
                  {m.dias_estimados != null && ` · ~${m.dias_estimados} días`}
                </div>
                <div className="fi-colores">
                  {(q.colores ?? []).map((c, i) => (
                    <span key={i} className="fi-color">
                      <i style={{ ...colorPreviewStyle(c) }} />
                      {c.nombre}{c.parte ? ` → ${c.parte}` : ''}
                    </span>
                  ))}
                </div>
              </Field>
            )}

            {lineasDesglose.length > 0 && (
              <Field label="Desglose">
                <div className="fi-caja">
                  {lineasDesglose.map((l, i) => (
                    <div key={i} className="fi-linea"><span>{l.concepto}</span><span className="adm-num">{euros(l.importe)}</span></div>
                  ))}
                  <div className="fi-linea fi-total"><span>Total estimado</span><span className="adm-num">{euros(q.precio_total)}</span></div>
                </div>
              </Field>
            )}
          </>
        )}

        {pestana === 'cobros' && (
          <>
            {q.coste_estimado != null && (
              <p className="pq-nota">
                Coste de impresión: estimado {euros(Number(q.coste_estimado))} · real {euros(Number(q.coste_real ?? q.coste_estimado))} · desvío{' '}
                {Number(q.desvio_coste ?? 0) > 0 ? '+' : ''}{euros(Number(q.desvio_coste ?? 0))}
              </p>
            )}
            <p style={{ fontSize: 14, margin: '0 0 14px' }}>
              <span className={`pq-pago pq-pago--${q.pago ?? 'pendiente'}`}>{PAGO_LABEL[q.pago ?? 'pendiente']}</span>{' '}
              {euros(pagado)} cobrados de {euros(total)}
            </p>
            <ReciboPanel quote={q} onCambio={() => void acciones.releer(q.id)} />
          </>
        )}

        {pestana === 'envio' && (
          q.entrega === 'envio' ? (
            <>
              <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
                <strong>Envío nacional</strong><br />
                {q.direccion?.calle}, {q.direccion?.cp} {q.direccion?.ciudad} ({q.direccion?.provincia})
              </p>
              <EnvioPanel quote={q} />
            </>
          ) : (
            <p style={{ fontSize: 14 }}><strong>Recogida en Salamanca.</strong> Este pedido no lleva envío.</p>
          )
        )}
      </div>
    </Drawer>
  );
}
