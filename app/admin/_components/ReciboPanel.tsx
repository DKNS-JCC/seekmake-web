'use client';

// Cobros y justificantes de pago dentro del drawer de un presupuesto.
//
// El dinero vive en el libro `cobros` (0028), el mismo que usa la Calculadora:
// lo que se registre aquí aparece en el pedido y al revés. `importe_pagado` y
// el estado de pago de la quote se calculan de ese libro; no se editan a mano.
//
// El justificante PDF es OPCIONAL y documenta un cobro concreto. La emisión
// sigue siendo de un clic y nunca automática: un recibo con la fecha o el
// método equivocados ya enviado al cliente no se deshace, solo se anula.
//
// El PDF lo genera la Edge Function `recibo-emitir`, no el navegador, para que
// el fichero archivado, el que descarga el cliente y el que va adjunto al
// email sean exactamente el mismo.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Cobro, Quote } from '@/lib/types';
import type { Recibo, ReciboMetodo } from '@/lib/recibo/types';
import { METODO_LABEL, METODO_OPCIONES, euros, fechaCorta } from '@/lib/recibo/types';
import { descargarPdfFirmado } from '@/lib/recibo/descargar';
import { Field, inputStyle } from './Field';
import { useConfirm } from './useConfirm';

const supabase = createClient;

const box: React.CSSProperties = {
  marginTop: 10,
  padding: 14,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)'
};

const btnSm: React.CSSProperties = { padding: '7px 14px', fontSize: 12 };
const btnXs: React.CSSProperties = { padding: '4px 10px', fontSize: 11 };

/** Fecha de hoy en YYYY-MM-DD según el reloj local, no UTC. */
function hoy(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const ORIGEN_LABEL: Record<Cobro['origen'], string> = {
  web: 'web',
  calculadora: 'Calculadora',
  migracion: 'histórico'
};

export function ReciboPanel({ quote, onCambio }: { quote: Quote; onCambio?: () => void }) {
  const { confirmar, dialogo } = useConfirm();

  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const total = quote.precio_final != null ? Number(quote.precio_final) : Number(quote.precio_total);
  const vivos = useMemo(() => cobros.filter((c) => !c.anulado_at), [cobros]);
  const cobrado = useMemo(() => round2(vivos.reduce((s, c) => s + Number(c.importe), 0)), [vivos]);
  const pendiente = round2(Math.max(0, total - cobrado));

  const reciboDe = useCallback(
    (c: Cobro) => recibos.find((r) => r.cobro_id === c.id && !r.anulado_at),
    [recibos]
  );
  // Justificantes antiguos que la migración no pudo casar con un cobro.
  const sinCasar = useMemo(() => recibos.filter((r) => !r.cobro_id && !r.anulado_at), [recibos]);

  // ── Formulario ──
  const [importe, setImporte] = useState('');
  const [metodo, setMetodo] = useState<ReciboMetodo>('bizum');
  const [fechaPago, setFechaPago] = useState(hoy());
  const [concepto, setConcepto] = useState('');
  const [conJustificante, setConJustificante] = useState(false);
  const [enviarEmail, setEnviarEmail] = useState(true);

  const conceptoSugerido = useMemo(() => {
    const piezas = (quote.archivos ?? []).reduce((n, a) => n + (Number(a.cantidad) || 1), 0);
    const desc = quote.descripcion?.trim()
      ? quote.descripcion.trim()
      : `${piezas > 0 ? `${piezas} pieza${piezas === 1 ? '' : 's'}` : 'impresión 3D'} en ${quote.material}`;
    return `Impresión 3D — ${desc} · pedido ${quote.codigo}`;
  }, [quote]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [c, r] = await Promise.all([
      supabase().from('cobros').select('*').eq('quote_id', quote.id).order('cobrado_at', { ascending: true }),
      supabase().from('recibos').select('*').eq('quote_id', quote.id).order('created_at', { ascending: true })
    ]);
    if (c.error) setErr('No se pudieron cargar los cobros: ' + c.error.message);
    else setCobros((c.data ?? []) as Cobro[]);
    if (r.error) setErr('No se pudieron cargar los justificantes: ' + r.error.message);
    else setRecibos((r.data ?? []) as Recibo[]);
    setCargando(false);
  }, [quote.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function recargar() {
    await cargar();
    onCambio?.();
  }

  function abrirFormulario() {
    // Se precarga con lo que falta por cobrar; si ya está todo, con el total.
    const sugerido = pendiente > 0.004 ? pendiente : total;
    setImporte(sugerido > 0 ? sugerido.toFixed(2) : '');
    setMetodo('bizum');
    setFechaPago(hoy());
    setConcepto(conceptoSugerido);
    setConJustificante(false);
    setEnviarEmail(true);
    setErr(null);
    setInfo(null);
    setAbierto(true);
  }

  async function invocarRecibo(body: Record<string, unknown>) {
    const { data, error } = await supabase().functions.invoke('recibo-emitir', { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function registrar() {
    const imp = round2(Number(importe));
    if (!Number.isFinite(imp) || imp <= 0) {
      setErr('El importe tiene que ser mayor que cero.');
      return;
    }
    if (total > 0 && imp > pendiente + 0.004) {
      const seguir = await confirmar({
        titulo: 'Importe mayor que lo pendiente',
        mensaje:
          `Vas a registrar ${euros(imp)} cuando solo quedan ` +
          `${euros(pendiente)} pendientes de un total de ${euros(total)}.`,
        detalle: 'Comprueba el importe antes de seguir.',
        confirmar: 'Registrar igualmente',
        destructivo: false
      });
      if (!seguir) return;
    }

    setBusy('registrar');
    setErr(null);
    setInfo(null);
    try {
      if (conJustificante) {
        // La función registra el cobro y emite su justificante en un paso.
        const data = await invocarRecibo({
          action: 'emitir',
          quote_id: quote.id,
          importe: imp,
          metodo,
          fecha_pago: fechaPago,
          concepto: concepto.trim(),
          es_adelanto: total > 0 && round2(cobrado + imp) < round2(total) - 0.004,
          enviar_email: enviarEmail
        });
        setInfo(
          `Cobro registrado y justificante ${data.codigo} emitido.` +
            (data.enviado ? ' Enviado al cliente por email.' : '') +
            (data.aviso ? ` ⚠ ${data.aviso}` : '')
        );
        if (data.url) await descargarPdfFirmado(data.url, `justificante-${data.codigo}.pdf`);
      } else {
        const { error } = await supabase().rpc('registrar_cobro', {
          p_importe: imp,
          p_metodo: METODO_LABEL[metodo],
          p_quote_id: quote.id,
          p_fecha: fechaPago,
          p_nota: concepto.trim()
        });
        if (error) throw new Error(error.message);
        setInfo(`Cobro de ${euros(imp)} registrado. Ya aparece en la Calculadora.`);
      }
      setAbierto(false);
      await recargar();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo registrar el cobro.');
    } finally {
      setBusy('');
    }
  }

  async function emitirPara(c: Cobro) {
    setBusy(c.id);
    setErr(null);
    setInfo(null);
    try {
      const data = await invocarRecibo({
        action: 'emitir',
        cobro_id: c.id,
        concepto: c.nota || conceptoSugerido,
        es_adelanto: total > 0 && cobrado < round2(total) - 0.004,
        enviar_email: false
      });
      setInfo(`Justificante ${data.codigo} emitido.${data.aviso ? ` ⚠ ${data.aviso}` : ''}`);
      if (data.url) await descargarPdfFirmado(data.url, `justificante-${data.codigo}.pdf`);
      await cargar();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo emitir el justificante.');
    } finally {
      setBusy('');
    }
  }

  async function descargar(r: Recibo) {
    setBusy(r.id);
    setErr(null);
    try {
      const data = await invocarRecibo({ action: 'descargar', recibo_codigo: r.codigo });
      await descargarPdfFirmado(data.url, `justificante-${r.codigo}.pdf`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo descargar.');
    } finally {
      setBusy('');
    }
  }

  async function anularCobro(c: Cobro) {
    const r = reciboDe(c);
    const seguir = await confirmar({
      titulo: `Anular el cobro de ${euros(c.importe)}`,
      mensaje: 'Deja de contar en lo cobrado, aquí y en la Calculadora. No se borra: queda anulado.',
      detalle: r ? `Su justificante ${r.codigo} se anulará también.` : undefined,
      confirmar: 'Anular'
    });
    if (!seguir) return;
    setErr(null);
    try {
      const { error } = await supabase().rpc('anular_cobro', {
        p_cobro_id: c.id,
        p_motivo: 'Anulado desde el panel'
      });
      if (error) throw new Error(error.message);
      if (r) await invocarRecibo({ action: 'anular', recibo_id: r.id, motivo: 'Cobro anulado' });
      setInfo('Cobro anulado.');
      await recargar();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo anular.');
    }
  }

  async function anularRecibo(r: Recibo) {
    const seguir = await confirmar({
      titulo: `Anular ${r.codigo}`,
      mensaje: 'Un justificante no se edita ni se borra: se anula y se emite otro. El cobro sigue contando.',
      detalle:
        'Si el cliente ya lo tiene descargado, su código QR pasará a decir "anulado". ' +
        'El PDF archivado se conserva.',
      confirmar: 'Anular'
    });
    if (!seguir) return;
    setErr(null);
    try {
      await invocarRecibo({ action: 'anular', recibo_id: r.id, motivo: 'Anulado desde el panel' });
      setInfo(`${r.codigo} anulado.`);
      await cargar();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo anular.');
    }
  }

  // Un justificante antiguo sin cobro: o era un cobro que el libro no tiene
  // (se registra), o ya está contado en otro apunte (se deja como está).
  async function registrarDesdeRecibo(r: Recibo) {
    setBusy(r.id);
    setErr(null);
    try {
      const { data, error } = await supabase().rpc('registrar_cobro', {
        p_importe: Number(r.importe),
        p_metodo: METODO_LABEL[r.metodo] ?? 'Otro',
        p_quote_id: quote.id,
        p_fecha: r.fecha_pago,
        p_nota: r.concepto || `Justificante ${r.codigo}`
      });
      if (error) throw new Error(error.message);
      const cobroId = data?.id;
      if (cobroId) await supabase().from('recibos').update({ cobro_id: cobroId }).eq('id', r.id);
      setInfo(`${r.codigo} registrado como cobro.`);
      await recargar();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo registrar.');
    } finally {
      setBusy('');
    }
  }

  const fila: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    padding: '8px 10px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r)',
    fontSize: 12
  };

  return (
    <div style={box}>
      {dialogo}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>💶 Cobros y justificantes</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
          {euros(cobrado)} de {euros(total)}
          {pendiente > 0.004 ? ` · faltan ${euros(pendiente)}` : ''}
        </span>
      </div>

      {sinCasar.length > 0 && (
        <div
          style={{
            ...box,
            marginTop: 0,
            marginBottom: 10,
            background: 'rgba(245,158,11,0.10)',
            borderColor: '#f59e0b',
            fontSize: 12,
            lineHeight: 1.5
          }}
        >
          ⚠ <strong>Justificantes sin cobro.</strong> Se emitieron antes del libro de cobros
          y no casan con ningún apunte de la Calculadora. Si el dinero no está ya contado,
          regístralo; si lo está, anula el justificante duplicado.
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {sinCasar.map((r) => (
              <li key={r.id} style={fila}>
                <strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{r.codigo}</strong>
                <span style={{ fontWeight: 700 }}>{euros(r.importe)}</span>
                <span style={{ color: 'var(--muted)' }}>
                  {METODO_LABEL[r.metodo] ?? r.metodo} · {fechaCorta(r.fecha_pago)}
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button type="button" className="btn-outline" style={btnXs} disabled={busy !== ''}
                    onClick={() => void registrarDesdeRecibo(r)}>
                    Registrar cobro
                  </button>
                  <button type="button" className="btn-outline"
                    style={{ ...btnXs, borderColor: '#ef4444', color: '#ef4444' }}
                    onClick={() => void anularRecibo(r)}>
                    Anular
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cargando ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cargando…</div>
      ) : cobros.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
          Todavía no hay cobros de este pedido.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {cobros.map((c) => {
            const anulado = !!c.anulado_at;
            const r = reciboDe(c);
            return (
              <li key={c.id} style={{ ...fila, opacity: anulado ? 0.55 : 1 }}>
                <span style={{ fontWeight: 700, textDecoration: anulado ? 'line-through' : 'none' }}>
                  {euros(c.importe)}
                </span>
                <span style={{ color: 'var(--muted)' }}>
                  {c.metodo} · {fechaCorta(c.fecha)} · {ORIGEN_LABEL[c.origen]}
                  {c.tipo === 'ajuste' ? ' · ajuste' : ''}
                  {c.nota ? ` · ${c.nota}` : ''}
                </span>
                {anulado && <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 11 }}>ANULADO</span>}
                {r && (
                  <strong style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>{r.codigo}</strong>
                )}
                {!anulado && (
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {r ? (
                      <button type="button" className="btn-outline" style={btnXs}
                        disabled={busy !== '' || !r.pdf_path} onClick={() => void descargar(r)}>
                        ⬇ PDF
                      </button>
                    ) : (
                      c.importe > 0 && (
                        <button type="button" className="btn-outline" style={btnXs}
                          disabled={busy !== ''} onClick={() => void emitirPara(c)}>
                          {busy === c.id ? 'Emitiendo…' : '🧾 Justificante'}
                        </button>
                      )
                    )}
                    <button type="button" className="btn-outline"
                      style={{ ...btnXs, borderColor: '#ef4444', color: '#ef4444' }}
                      onClick={() => void anularCobro(c)}>
                      Anular
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!abierto ? (
        <button type="button" className="btn-primary" style={btnSm} onClick={abrirFormulario}>
          Registrar cobro
        </button>
      ) : (
        <div style={{ ...box, marginTop: 0, background: 'var(--bg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field
              label="Importe cobrado (€)"
              hint={pendiente > 0.004 ? `Pendiente: ${euros(pendiente)}` : 'Pedido ya cubierto'}
            >
              <input style={inputStyle} type="number" step={0.01} min={0.01} value={importe}
                onChange={(e) => setImporte(e.target.value)} />
              {/* Atajos: la señal (mitad del total, menos lo ya cobrado) y el resto. */}
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {Math.max(0, round2(total / 2 - cobrado)) > 0.004 && (
                  <button type="button" className="btn-outline" style={btnXs}
                    onClick={() => setImporte(round2(total / 2 - cobrado).toFixed(2))}>
                    Señal 50 % ({euros(round2(total / 2 - cobrado))})
                  </button>
                )}
                {pendiente > 0.004 && (
                  <button type="button" className="btn-outline" style={btnXs}
                    onClick={() => setImporte(pendiente.toFixed(2))}>
                    Resto ({euros(pendiente)})
                  </button>
                )}
              </span>
            </Field>
            <Field label="Forma de pago">
              <select style={inputStyle} value={metodo}
                onChange={(e) => setMetodo(e.target.value as ReciboMetodo)}>
                {METODO_OPCIONES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Fecha del cobro">
            <input style={inputStyle} type="date" value={fechaPago} max={hoy()}
              onChange={(e) => setFechaPago(e.target.value)} />
          </Field>

          <Field label="Concepto" hint={conJustificante ? 'Aparece tal cual en el PDF.' : 'Nota interna del cobro.'}>
            <input style={inputStyle} value={concepto} maxLength={600}
              onChange={(e) => setConcepto(e.target.value)} />
          </Field>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={conJustificante} onChange={(e) => setConJustificante(e.target.checked)} />
            Emitir justificante PDF
          </label>
          {conJustificante && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 12, marginLeft: 22, cursor: 'pointer' }}>
              <input type="checkbox" checked={enviarEmail} onChange={(e) => setEnviarEmail(e.target.checked)} />
              Enviárselo al cliente por email ({quote.email || 'sin email'})
            </label>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" style={btnSm} disabled={busy !== ''}
              onClick={() => void registrar()}>
              {busy === 'registrar' ? 'Guardando…' : conJustificante ? 'Registrar y emitir' : 'Registrar cobro'}
            </button>
            <button type="button" className="btn-outline" style={btnSm} disabled={busy !== ''}
              onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
            El cobro se apunta en el libro común: la Calculadora lo verá en el pedido. Un
            justificante emitido no se edita, solo se anula y se vuelve a emitir.
          </div>
        </div>
      )}

      {err && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>⚠ {err}</div>}
      {info && <div style={{ color: '#10b981', fontSize: 12, marginTop: 8 }}>✓ {info}</div>}
    </div>
  );
}
