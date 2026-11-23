'use client';

// Asking for the quote: the short form (only a way to reach the customer),
// WhatsApp and "envíame el presupuesto por email".
// STL/OBJ are gzipped client-side before upload to protect Storage quota.

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Filamento, QuoteEntrega } from '@/lib/types';
import type { QuoteResult } from '@/lib/quote/pricing';
import { piezaColors, type Pieza, type QuoteStatus } from '@/lib/quote/types';
import { gzipFile, shouldCompress } from '@/lib/quote/compress';
import { WhatsAppIcon } from '@/components/WhatsAppFAB';
import { CONTACTO, ESCRIBENOS, whatsappUrl } from '@/lib/contacto';
import { euros } from '@/lib/recibo/types';
import { cuerpoPedido, fichaPieza, leerContacto, randomPath } from './solicitud';
import { trackEvent } from './seguimiento';
import { Tick } from './Resumen';
import { Recibido } from './Recibido';
import type { CuponEstado } from './useCupon';

/** The function's own message for a non-2xx answer, if it sent one. */
async function cuerpoError(error: unknown): Promise<{ error?: string; cupon_invalido?: boolean } | null> {
  return (await (error as { context?: Response }).context?.json().catch(() => null)) ?? null;
}

export function Pedir({
  piezas,
  quote,
  listo,
  filamentos,
  entrega,
  cpValido,
  consultar,
  status,
  setStatus,
  cup
}: {
  piezas: Pieza[];
  quote: QuoteResult | null;
  listo: boolean;
  filamentos: Filamento[];
  entrega: QuoteEntrega;
  cpValido: string | undefined;
  /** Big order: no price anywhere, we send it. */
  consultar: boolean;
  status: QuoteStatus;
  setStatus: (s: QuoteStatus) => void;
  cup: CuponEstado;
}) {
  // Only a way to reach the customer: name, address and colours are asked
  // when we answer (the long form was where people gave up).
  const [showForm, setShowForm] = useState(false);
  const [contacto, setContacto] = useState('');
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [website, setWebsite] = useState(''); // honeypot

  // "Envíame el presupuesto por email" for whoever is not ready to ask yet.
  const [guardarAbierto, setGuardarAbierto] = useState(false);
  const [guardarEmail, setGuardarEmail] = useState('');
  const [guardado, setGuardado] = useState<
    { kind: 'idle' } | { kind: 'sending' } | { kind: 'ok'; email: string } | { kind: 'err'; message: string }
  >({ kind: 'idle' });

  const ficha = (p: Pieza, i: number) => fichaPieza(p, i, quote, filamentos);
  const cuerpo = (archivos: Record<string, unknown>[]) =>
    cuerpoPedido(archivos, piezas, quote, entrega, cpValido, website);

  function fallo(message: string, motivo: string) {
    setStatus({ kind: 'err', message });
    trackEvent('formulario_error', { motivo: motivo.slice(0, 80) });
  }

  function abrirFormulario() {
    setShowForm(true);
    trackEvent('formulario_abierto', { total: quote?.total, entrega });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!piezas.length || !quote || !listo || status.kind === 'sending') return;
    const datos = leerContacto(contacto);
    if (!datos) {
      fallo('Escribe un email (tu@email.com) o un móvil de 9 cifras.', 'contacto');
      return;
    }

    const supabase = createClient();

    try {
      // 1. Upload every model file (gzipped when it pays off).
      const archivos: Record<string, unknown>[] = [];
      for (let i = 0; i < piezas.length; i++) {
        const p = piezas[i];
        setStatus({
          kind: 'sending',
          progress: `Subiendo pieza ${i + 1} de ${piezas.length}…`
        });

        let blob: Blob = p.file;
        let path = randomPath(p.ext);
        let comprimido = false;
        if (shouldCompress(p.ext)) {
          const gz = await gzipFile(p.file);
          if (gz && gz.size < p.size) {
            blob = gz;
            path += '.gz';
            comprimido = true;
          }
        }

        const { error: upErr } = await supabase.storage
          .from('quote-uploads')
          .upload(path, blob, {
            contentType: 'application/octet-stream',
            upsert: false
          });
        if (upErr) {
          setStatus({
            kind: 'err',
            message: `No se pudo subir ${p.name}: ${upErr.message}`
          });
          return;
        }
        const { data: pub } = supabase.storage.from('quote-uploads').getPublicUrl(path);

        archivos.push({
          ...ficha(p, i),
          url: pub.publicUrl,
          path,
          tamano: blob.size,
          tamano_original: p.size,
          comprimido
        });
      }

      setStatus({ kind: 'sending', progress: 'Registrando solicitud…' });

      // 2. Quote request → Edge Function (inserts row + emails).
      const { data, error } = await supabase.functions.invoke('submit-quote', {
        body: { ...cuerpo(archivos), ...datos, nombre, mensaje }
      });

      if (error) {
        const respuesta = await cuerpoError(error);
        if (respuesta?.cupon_invalido) {
          // Expired or ran out since the price was shown: drop it and let the
          // customer see the new total before sending again.
          cup.setCupon(null);
          cup.setCuponError(respuesta.error ?? null);
          fallo(`${respuesta.error} Hemos recalculado el precio sin él: revísalo y vuelve a enviar.`, 'cupon');
          return;
        }
        const msg = respuesta?.error ?? error.message ?? 'No se pudo enviar la solicitud.';
        fallo(msg, msg);
        return;
      }
      if (data?.error) {
        fallo(data.error, data.error);
        return;
      }
      // Only a real code is a saved request: anything else must not look sent.
      if (!/^Q-\d{4}-\d+$/.test(String(data?.codigo ?? ''))) {
        fallo(`No hemos podido registrar tu solicitud. Inténtalo de nuevo o ${ESCRIBENOS}.`, 'sin_codigo');
        return;
      }
      if (!data?.duplicado) {
        trackEvent('solicitud_enviada', {
          codigo: data?.codigo,
          piezas: piezas.length,
          total: quote.total,
          consultar,
          entrega,
          cp: cpValido,
          via: datos.email ? 'email' : 'whatsapp'
        });
      }
      setStatus({ kind: 'ok', codigo: data?.codigo ?? '', duplicado: !!data?.duplicado, porEmail: !!datos.email });
    } catch {
      fallo(`Error de red. Inténtalo de nuevo o ${ESCRIBENOS}.`, 'red');
    }
  }

  async function enviarPorEmail(e: FormEvent) {
    e.preventDefault();
    const email = guardarEmail.trim();
    if (!quote || guardado.kind === 'sending') return;
    if (!leerContacto(email)?.email) {
      setGuardado({ kind: 'err', message: 'Revisa el email: parece que le falta algo.' });
      return;
    }
    setGuardado({ kind: 'sending' });
    try {
      const { data, error } = await createClient().functions.invoke('submit-quote', {
        body: { ...cuerpo(piezas.map(ficha)), accion: 'guardar', email }
      });
      const msg = error ? (await cuerpoError(error))?.error ?? 'No hemos podido enviarlo.' : data?.error;
      setGuardado(msg ? { kind: 'err', message: msg } : { kind: 'ok', email });
    } catch {
      setGuardado({ kind: 'err', message: 'Error de red. Inténtalo de nuevo.' });
    }
  }

  // Night visitors would rather type than fill a form: the whole order, ready to send.
  const waPedido = quote
    ? [
        consultar
          ? 'Hola, quiero pedir esto de la web (pedido grande, precio a consultar):'
          : 'Hola, quiero pedir este presupuesto de la web:',
        ...(consultar
          ? piezas.map((p) => `• ${p.name}${p.cantidad > 1 ? ` × ${p.cantidad}` : ''}`)
          : quote.lineas.map((l) => `• ${l.concepto}: ${euros(l.importe)}`)),
        `${consultar ? '' : `Total: ${euros(quote.total)} · `}${entrega === 'envio' ? `envío${cpValido ? ` a ${cpValido}` : ''}` : 'recogida en Salamanca'}`,
        `Colores: ${piezas
          .map((p) => `${piezas.length > 1 ? `${p.name} → ` : ''}${piezaColors(p).map((c) => c.nombre).join(', ') || 'me ayudáis a elegir'}`)
          .join('; ')}`,
        'Os mando el archivo por aquí.'
      ].join('\n')
    : '';

  return (
    <>
      {/* request: form, WhatsApp, or keep it for later */}
      {piezas.length > 0 && listo && quote && status.kind !== 'ok' && (
        <div className={'qt-pedir' + (showForm ? ' con-form' : '')}>
          {!showForm && (
            <div className="qt-ctas">
              <button id="qt-pedirlo" type="button" className="btn-primary qt-cta" onClick={abrirFormulario}>
                {consultar ? 'Pedirlo' : `Pedirlo · ${euros(quote.total)}`}
              </button>
              <a
                className="btn-outline qt-cta qt-cta-wa"
                href={whatsappUrl(waPedido)}
                target="_blank"
                rel="noopener noreferrer"
                data-no-contar
                onClick={() =>
                  trackEvent('whatsapp_clic', {
                    pagina: 'tasador (pedido)',
                    total: consultar ? null : quote.total,
                    piezas: piezas.length,
                    consultar
                  })
                }
              >
                <WhatsAppIcon />
                WhatsApp
              </a>
            </div>
          )}
          {!showForm && consultar && <p className="qt-pedir-nota">No pagas nada ahora. Sin registro.</p>}

          {showForm && (
            <form className="qt-form" onSubmit={submit} noValidate>
              <label className="qt-form-label" htmlFor="qt-contacto">
                ¿Dónde te enviamos el presupuesto?
              </label>
              <input
                id="qt-contacto"
                type="text"
                inputMode="email"
                autoComplete="email"
                placeholder="Email o WhatsApp"
                autoFocus
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
                aria-invalid={status.kind === 'err' && !leerContacto(contacto)}
                aria-describedby="qt-contacto-ayuda"
              />
              <p id="qt-contacto-ayuda" className="qt-form-hint">
                Nada más. Nombre{entrega === 'envio' ? ', dirección' : ''} y colores te los
                preguntamos al contestarte.
              </p>
              <details className="qt-form-mas">
                <summary>Añadir nombre o notas (opcional)</summary>
                <input
                  type="text"
                  placeholder="Tu nombre"
                  aria-label="Tu nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  autoComplete="name"
                />
                <textarea
                  placeholder="Reparto de colores, plazo, lo que necesites…"
                  aria-label="Notas"
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                />
              </details>
              {/* honeypot */}
              <div className="qt-honeypot" aria-hidden="true">
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              {status.kind === 'err' && (
                <div className="qt-msg err" role="alert">{status.message}</div>
              )}

              <button
                type="submit"
                className="btn-primary qt-cta"
                disabled={status.kind === 'sending'}
                aria-busy={status.kind === 'sending'}
              >
                {status.kind === 'sending'
                  ? status.progress
                  : consultar
                    ? 'Enviar solicitud'
                    : `Enviar solicitud · ${euros(quote.total)}`}
              </button>
              <p className="qt-form-legal">
                Al enviar aceptas los{' '}
                <a href="/terminos/" target="_blank" rel="noopener noreferrer">Términos</a>. Usamos
                tus datos y archivos para preparar y gestionar este presupuesto y los borramos
                periódicamente. También podremos enviarte alguna oferta o aviso a tu email; cada
                correo trae un enlace para darte de baja. Puedes ejercer tus derechos en{' '}
                {CONTACTO.email}. Más en la{' '}
                <a href="/privacidad/">Política de Privacidad</a>.
              </p>
            </form>
          )}

          {/* Not ready yet: keep it (and a reminder tomorrow). Not for big
              orders: it would hand out the automatic price. */}
          {!consultar && !showForm && (
          <div className="qt-guardar">
            {guardado.kind === 'ok' ? (
              <p className="qt-guardar-ok" role="status">
                <Tick /> Enviado a {guardado.email}. Mira tu bandeja (o spam).
              </p>
            ) : guardarAbierto ? (
              <form className="qt-cupon-form" onSubmit={enviarPorEmail} noValidate>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="tu@email.com"
                  aria-label="Tu email"
                  autoFocus
                  value={guardarEmail}
                  onChange={(e) => setGuardarEmail(e.target.value)}
                />
                <button type="submit" className="btn-outline" disabled={guardado.kind === 'sending'}>
                  {guardado.kind === 'sending' ? 'Enviando…' : 'Enviar'}
                </button>
              </form>
            ) : (
              <p className="qt-pedir-nota">
                No pagas nada ahora ·{' '}
                <button type="button" className="qt-cupon-abrir" onClick={() => setGuardarAbierto(true)}>
                  Envíamelo por email
                </button>
              </p>
            )}
            {guardarAbierto && guardado.kind !== 'ok' && (
              <p className="qt-form-hint">
                Te llega ahora, y mañana un único recordatorio con un pequeño descuento. Nada más.
              </p>
            )}
            {guardado.kind === 'err' && (
              <p className="qt-cupon-error" role="alert">{guardado.message}</p>
            )}
          </div>
          )}
        </div>
      )}

      {status.kind === 'ok' && <Recibido status={status} />}
    </>
  );
}
