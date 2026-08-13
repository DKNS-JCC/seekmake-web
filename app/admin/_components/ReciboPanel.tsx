'use client';

// Justificantes de pago dentro del drawer de un presupuesto.
//
// La emisión es SEMIAUTOMÁTICA a propósito: al marcar un pedido como pagado no
// se emite nada solo, se precarga este formulario y hace falta un clic. Un
// recibo emitido por un automatismo con la fecha o el método equivocados es un
// documento erróneo ya enviado al cliente, y eso no se deshace: solo se anula
// y se emite otro. Un clic cuesta dos segundos y elimina esa clase de error.
//
// El PDF lo genera la Edge Function `recibo-emitir`, no el navegador, para que
// el fichero archivado, el que descarga el cliente y el que va adjunto al
// email sean exactamente el mismo.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Quote } from '@/lib/types';
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

/** Fecha de hoy en YYYY-MM-DD según el reloj local, no UTC. */
function hoy(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function ReciboPanel({ quote }: { quote: Quote }) {
  const { confirmar, dialogo } = useConfirm();

  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [busy, setBusy] = useState<'' | 'emitir' | 'descargar'>('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const total = quote.precio_final != null ? Number(quote.precio_final) : Number(quote.precio_total);

  const cobrado = useMemo(
    () => round2(recibos.filter((r) => !r.anulado_at).reduce((s, r) => s + Number(r.importe), 0)),
    [recibos]
  );
  const pendiente = round2(Math.max(0, total - cobrado));

  // Descuadre entre lo que dicen los recibos y `quotes.importe_pagado`.
  // No se corrige solo: `importe_pagado` puede venir de la Calculadora (el
  // trigger project_order_to_quote lo sobrescribe) y los recibos no escriben
  // en quotes. Si no cuadran, lo decide una persona.
  const importePagado = round2(Number(quote.importe_pagado) || 0);
  const descuadre = recibos.length > 0 && Math.abs(cobrado - importePagado) > 0.004;

  // ── Formulario ──
  const [importe, setImporte] = useState('');
  const [metodo, setMetodo] = useState<ReciboMetodo>('bizum');
  const [fechaPago, setFechaPago] = useState(hoy());
  const [concepto, setConcepto] = useState('');
  const [enviarEmail, setEnviarEmail] = useState(true);

  const conceptoSugerido = useMemo(() => {
    const piezas = (quote.archivos ?? []).reduce((n, a) => n + (Number(a.cantidad) || 1), 0);
    const desc = piezas > 0 ? `${piezas} pieza${piezas === 1 ? '' : 's'}` : 'impresión 3D';
    return `Impresión 3D — ${desc} en ${quote.material} · pedido ${quote.codigo}`;
  }, [quote]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase()
      .from('recibos')
      .select('*')
      .eq('quote_id', quote.id)
      .order('created_at', { ascending: true });
    if (error) setErr('No se pudieron cargar los justificantes: ' + error.message);
    else setRecibos((data ?? []) as Recibo[]);
    setCargando(false);
  }, [quote.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrirFormulario() {
    // Se precarga con lo que falta por cobrar; si ya está todo, con el total.
    const sugerido = pendiente > 0.004 ? pendiente : total;
    setImporte(sugerido > 0 ? sugerido.toFixed(2) : '');
    setMetodo('bizum');
    setFechaPago(hoy());
    setConcepto(conceptoSugerido);
    setEnviarEmail(true);
    setErr(null);
    setInfo(null);
    setAbierto(true);
  }

  async function emitir() {
    const imp = round2(Number(importe));
    if (!Number.isFinite(imp) || imp <= 0) {
      setErr('El importe tiene que ser mayor que cero.');
      return;
    }
    if (total > 0 && imp > round2(total - cobrado) + 0.004) {
      const seguir = await confirmar({
        titulo: 'Importe mayor que lo pendiente',
        mensaje:
          `Vas a emitir un justificante de ${euros(imp)} cuando solo quedan ` +
          `${euros(pendiente)} pendientes de un total de ${euros(total)}.`,
        detalle: 'Comprueba el importe: una vez emitido solo se puede anular.',
        confirmar: 'Emitir igualmente',
        destructivo: false
      });
      if (!seguir) return;
    }

    setBusy('emitir');
    setErr(null);
    setInfo(null);
    try {
      const { data, error } = await supabase().functions.invoke('recibo-emitir', {
        body: {
          action: 'emitir',
          quote_id: quote.id,
          importe: imp,
          metodo,
          fecha_pago: fechaPago,
          concepto: concepto.trim(),
          // Es adelanto si, después de este cobro, sigue quedando algo.
          es_adelanto: total > 0 && round2(cobrado + imp) < round2(total) - 0.004,
          enviar_email: enviarEmail
        }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setInfo(
        `Justificante ${data.codigo} emitido.` +
          (data.enviado ? ' Enviado al cliente por email.' : '') +
          (data.aviso ? ` ⚠ ${data.aviso}` : '')
      );
      setAbierto(false);
      if (data.url) await descargarPdfFirmado(data.url, `justificante-${data.codigo}.pdf`);
      await cargar();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo emitir el justificante.');
    } finally {
      setBusy('');
    }
  }

  async function descargar(r: Recibo) {
    setBusy('descargar');
    setErr(null);
    try {
      const { data, error } = await supabase().functions.invoke('recibo-emitir', {
        body: { action: 'descargar', recibo_codigo: r.codigo }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      await descargarPdfFirmado(data.url, `justificante-${r.codigo}.pdf`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo descargar.');
    } finally {
      setBusy('');
    }
  }

  async function anular(r: Recibo) {
    const seguir = await confirmar({
      titulo: `Anular ${r.codigo}`,
      mensaje: 'Un justificante no se edita ni se borra: se anula y se emite otro.',
      detalle:
        'Si el cliente ya lo tiene descargado, su código QR pasará a decir "anulado". ' +
        'El PDF archivado se conserva.',
      confirmar: 'Anular'
    });
    if (!seguir) return;

    setErr(null);
    try {
      const { data, error } = await supabase().functions.invoke('recibo-emitir', {
        body: { action: 'anular', recibo_id: r.id, motivo: 'Anulado desde el panel' }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setInfo(`${r.codigo} anulado.`);
      await cargar();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo anular.');
    }
  }

  return (
    <div style={box}>
      {dialogo}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>🧾 Justificantes de pago</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
          {euros(cobrado)} de {euros(total)}
        </span>
      </div>

      {descuadre && (
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
          ⚠ <strong>Descuadre.</strong> Los justificantes suman {euros(cobrado)}, pero el
          pedido tiene {euros(importePagado)} como importe cobrado. Puede venir de la
          Calculadora o de un cobro sin justificante. Revísalo antes de emitir más.
        </div>
      )}

      {cargando ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cargando…</div>
      ) : recibos.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
          Todavía no has emitido ninguno para este pedido.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {recibos.map((r) => {
            const anulado = !!r.anulado_at;
            return (
              <li
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  padding: '8px 10px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r)',
                  fontSize: 12,
                  opacity: anulado ? 0.55 : 1
                }}
              >
                <strong
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    textDecoration: anulado ? 'line-through' : 'none'
                  }}
                >
                  {r.codigo}
                </strong>
                <span style={{ fontWeight: 700 }}>{euros(r.importe)}</span>
                <span style={{ color: 'var(--muted)' }}>
                  {METODO_LABEL[r.metodo] ?? r.metodo} · {fechaCorta(r.fecha_pago)}
                  {r.es_adelanto ? ' · adelanto' : ''}
                </span>
                {anulado && (
                  <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 11 }}>ANULADO</span>
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    disabled={busy !== '' || !r.pdf_path}
                    onClick={() => void descargar(r)}
                  >
                    ⬇ PDF
                  </button>
                  {!anulado && (
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '4px 10px', fontSize: 11, borderColor: '#ef4444', color: '#ef4444' }}
                      onClick={() => void anular(r)}
                    >
                      Anular
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!abierto ? (
        <button type="button" className="btn-primary" style={btnSm} onClick={abrirFormulario}>
          Emitir justificante
        </button>
      ) : (
        <div style={{ ...box, marginTop: 0, background: 'var(--bg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field
              label="Importe cobrado (€)"
              hint={pendiente > 0.004 ? `Pendiente: ${euros(pendiente)}` : 'Pedido ya cubierto'}
            >
              <input
                style={inputStyle}
                type="number"
                step={0.01}
                min={0.01}
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
              />
            </Field>
            <Field label="Forma de pago">
              <select
                style={inputStyle}
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as ReciboMetodo)}
              >
                {METODO_OPCIONES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Fecha del cobro">
            <input
              style={inputStyle}
              type="date"
              value={fechaPago}
              max={hoy()}
              onChange={(e) => setFechaPago(e.target.value)}
            />
          </Field>

          <Field label="Concepto" hint="Aparece tal cual en el PDF.">
            <input
              style={inputStyle}
              value={concepto}
              maxLength={600}
              onChange={(e) => setConcepto(e.target.value)}
            />
          </Field>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              marginBottom: 12,
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={enviarEmail}
              onChange={(e) => setEnviarEmail(e.target.checked)}
            />
            Enviárselo al cliente por email ({quote.email || 'sin email'})
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn-primary"
              style={btnSm}
              disabled={busy !== ''}
              onClick={() => void emitir()}
            >
              {busy === 'emitir' ? 'Emitiendo…' : 'Emitir y archivar'}
            </button>
            <button
              type="button"
              className="btn-outline"
              style={btnSm}
              disabled={busy !== ''}
              onClick={() => setAbierto(false)}
            >
              Cancelar
            </button>
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
            Se emite un justificante <strong>por cada cobro</strong>. Una vez emitido no se
            puede editar, solo anular y volver a emitir.
          </div>
        </div>
      )}

      {err && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>⚠ {err}</div>}
      {info && <div style={{ color: '#10b981', fontSize: 12, marginTop: 8 }}>✓ {info}</div>}
    </div>
  );
}
