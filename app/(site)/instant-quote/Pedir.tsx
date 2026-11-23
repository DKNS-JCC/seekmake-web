'use client';

// Asking for the quote: the short form (name, mobile, optional email),
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
import { cuerpoPedido, emailValido, fichaPieza, randomPath, telefonoValido } from './solicitud';
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
  cup,
  materialParaTodas
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
  materialParaTodas: (f: Filamento) => void;
}) {
  // Name and mobile: an email alone left us guessing who it was and writing
  // back and forth. Address and colours are asked when we answer.
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  // Marketing consent: its own box, never pre-ticked (RGPD art. 7).
  const [aceptaOfertas, setAceptaOfertas] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot

  // "Envíame el presupuesto por email" for whoever is not ready to ask yet.
  const [guardarAbierto, setGuardarAbierto] = useState(false);
  const [guardarEmail, setGuardarEmail] = useState('');
  const [guardado, setGuardado] = useState<
    { kind: 'idle' } | { kind: 'sending' } | { kind: 'ok'; email: string } | { kind: 'err'; message: string }
  >({ kind: 'idle' });

  // Two pieces in black, one left in PLA and the other in PETG: easy to miss.
  const [mezclaOk, setMezclaOk] = useState(false);
  const materiales = filamentos.filter((f) => piezas.some((p) => p.config.filamentoId === f.id));

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
    setIntentado(true);
    if (!nombre.trim()) return fallo('Dinos tu nombre.', 'nombre');
    if (!telefonoValido(telefono)) return fallo('Escribe un móvil de 9 cifras.', 'telefono');
    if (email.trim() && !emailValido(email)) return fallo('Revisa el email: parece que le falta algo.', 'email');
    if (!aceptaTerminos) return fallo('Marca la casilla de los Términos para enviarlo.', 'terminos');
    const datos = {
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      acepta_ofertas: aceptaOfertas
    };

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
        body: { ...cuerpo(archivos), ...datos, mensaje }
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
    if (!emailValido(email)) {
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
          {materiales.length > 1 && !mezclaOk && (
            <div className="qt-warn qt-mezcla" role="status">
              <p>
                ⚠ Tus piezas van en materiales distintos:{' '}
                {piezas
                  .map((p) => `${p.name} en ${filamentos.find((f) => f.id === p.config.filamentoId)?.material ?? '?'}`)
                  .join(', ')}
                . ¿Es lo que quieres?
              </p>
              <div className="qt-mezcla-botones">
                {materiales.map((f) => (
                  <button key={f.id} type="button" className="btn-outline" onClick={() => materialParaTodas(f)}>
                    Todas en {f.material}
                  </button>
                ))}
                <button type="button" className="qt-link" onClick={() => setMezclaOk(true)}>
                  Sí, así está bien
                </button>
              </div>
            </div>
          )}
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
              <p className="qt-form-label" id="qt-datos">Tus datos</p>
              <div className="qt-form-fila" role="group" aria-labelledby="qt-datos">
                <input
                  id="qt-contacto"
                  type="text"
                  autoComplete="name"
                  placeholder="Nombre"
                  aria-label="Nombre"
                  autoFocus
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  aria-invalid={intentado && !nombre.trim()}
                />
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="Móvil"
                  aria-label="Móvil"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  aria-invalid={intentado && !telefonoValido(telefono)}
                />
              </div>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Email (opcional)"
                aria-label="Email (opcional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={intentado && !!email.trim() && !emailValido(email)}
                aria-describedby="qt-contacto-ayuda"
              />
              <p id="qt-contacto-ayuda" className="qt-form-hint">
                Te escribimos por WhatsApp si hay que ajustar algo. Con email te llegan también
                los avisos del pedido.
              </p>
              <details className="qt-form-mas">
                <summary>Añadir notas (opcional)</summary>
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

              <label className="qt-form-check">
                <input
                  type="checkbox"
                  checked={aceptaTerminos}
                  onChange={(e) => setAceptaTerminos(e.target.checked)}
                  aria-invalid={intentado && !aceptaTerminos}
                />
                <span>
                  Acepto los{' '}
                  <a href="/terminos/" target="_blank" rel="noopener noreferrer">Términos</a> y la{' '}
                  <a href="/privacidad/" target="_blank" rel="noopener noreferrer">Política de Privacidad</a>.
                </span>
              </label>
              <label className="qt-form-check">
                <input
                  type="checkbox"
                  checked={aceptaOfertas}
                  onChange={(e) => setAceptaOfertas(e.target.checked)}
                />
                <span>
                  Quiero recibir por email alguna oferta o aviso de 3DCC (opcional). Te das de baja
                  con un clic.
                </span>
              </label>

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
                Usamos tus datos y archivos para preparar y gestionar este presupuesto y los
                borramos periódicamente. Puedes ejercer tus derechos en {CONTACTO.email}.
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
