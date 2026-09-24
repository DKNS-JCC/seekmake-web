'use client';

// Public quote-status lookup. The code (Q-YYYY-NNNN) acts like a parcel
// tracking number — the RPC only returns non-personal fields.
// With ?codigo=...&token=... (the personal link from the confirmation email)
// the customer can also ACCEPT a reviewed quote — the token authorises it.

import { FormEvent, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { EnvioPublico, QuoteEntrega, QuoteEstado, QuotePago } from '@/lib/types';
import './presupuesto.css';
import { CONTACTO, mailtoUrl, whatsappUrl } from '@/lib/contacto';
import { EnvioCard } from './EnvioCard';
import { RecibosCard } from './RecibosCard';

interface StatusRow {
  codigo: string;
  estado: QuoteEstado;
  pago: QuotePago;
  entrega: QuoteEntrega;
  material: string;
  cantidad: number;
  precio_total: number;
  precio_final: number | null;
  valido_hasta: string;
  aceptado_at: string | null;
  created_at: string;
  updated_at: string;
}

const PASOS: { id: QuoteEstado; label: string; desc: string }[] = [
  { id: 'nuevo', label: 'Recibido', desc: 'Tu solicitud está en cola de revisión' },
  { id: 'revisado', label: 'Revisado', desc: 'Pieza comprobada y precio confirmado' },
  { id: 'aceptado', label: 'En cola', desc: 'Pedido confirmado, esperando impresora' },
  { id: 'imprimiendo', label: 'Imprimiendo', desc: 'Tus piezas están en la impresora' },
  { id: 'listo', label: 'Listo', desc: 'Terminado, listo para recoger o enviar' },
  { id: 'entregado', label: 'Entregado', desc: '¡Disfrútalo!' }
];

const PAGO_LABEL: Record<QuotePago, string> = {
  pendiente: 'Pago pendiente',
  adelanto: 'Adelanto recibido',
  pagado: 'Pagado — gracias'
};

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

export function PresupuestoClient() {
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StatusRow | null>(null);
  const [envio, setEnvio] = useState<EnvioPublico | null>(null);
  // Pedidos hechos en el taller (Calculadora): qué se encarga, en palabras.
  const [encargo, setEncargo] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Accept-link token from the confirmation email (?codigo=..&token=..).
  const [token, setToken] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  async function doLookup(code: string) {
    if (!code) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setResult(null);
    setEnvio(null);
    setEncargo('');
    setAcceptError(null);
    try {
      const { data, error: err } = await createClient().rpc('get_quote_status', {
        p_codigo: code
      });
      if (err) {
        setError('No se pudo consultar. Inténtalo de nuevo en unos segundos.');
      } else if (!data || data.length === 0) {
        setNotFound(true);
      } else {
        const row = data[0] as StatusRow;
        setResult(row);
        const { data: det } = await createClient().rpc('get_quote_detalle', { p_codigo: row.codigo });
        if (det?.[0]?.origen === 'calculadora') setEncargo(det[0].descripcion ?? '');
        // El envío va en su propia RPC: se pide solo cuando toca y su fallo
        // no puede tumbar la consulta de estado, que es lo importante.
        if (row.entrega === 'envio') {
          const { data: env } = await createClient().rpc('get_envio_status', {
            p_codigo: row.codigo
          });
          if (env && env.length > 0) setEnvio(env[0] as EnvioPublico);
        }
      }
    } catch {
      setError('Error de red. Comprueba tu conexión.');
    } finally {
      setLoading(false);
    }
  }

  function lookup(e: FormEvent) {
    e.preventDefault();
    void doLookup(codigo.trim().toUpperCase());
  }

  // Deep link from the confirmation email: autofill and look up directly.
  // (window.location instead of useSearchParams — static export, no Suspense.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('codigo')?.trim().toUpperCase() ?? '';
    const t = params.get('token')?.trim() || null;
    if (t) setToken(t);
    if (c) {
      setCodigo(c);
      void doLookup(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acceptQuote() {
    if (!result || !token) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const { data, error: err } = await createClient().rpc('accept_quote', {
        p_codigo: result.codigo,
        p_token: token
      });
      const row = data?.[0];
      if (err || !row?.ok) {
        setAcceptError(
          'No se pudo aceptar el presupuesto. Puede que haya caducado o que el enlace no sea válido — escríbenos por WhatsApp y lo resolvemos.'
        );
      } else {
        setResult({ ...result, estado: 'aceptado' });
        void createClient()
          .from('quote_events')
          .insert({ session_id: '', evento: 'aceptado', payload: { codigo: result.codigo } })
          .then(() => undefined, () => undefined);
      }
    } catch {
      setAcceptError('Error de red. Inténtalo de nuevo.');
    } finally {
      setAccepting(false);
    }
  }

  const pasoIdx = result
    ? Math.max(0, PASOS.findIndex((p) => p.id === result.estado))
    : -1;
  const rechazado = result?.estado === 'rechazado';
  const expirado =
    !!result &&
    (result.estado === 'nuevo' || result.estado === 'revisado') &&
    new Date(result.valido_hasta).getTime() < Date.now();
  // Accepting needs the personal token AND a reviewed, unexpired quote.
  const puedeAceptar = !!result && !!token && result.estado === 'revisado' && !expirado;

  return (
    <div className="page-content pr-page">
      <section className="pr-hero">
        <div className="section-tag" style={{ justifyContent: 'center' }}>
          Seguimiento
        </div>
        <h1>Estado de tu presupuesto</h1>
        <p className="pr-desc">
          Introduce el código que recibiste al solicitar tu presupuesto
          (también está en el email de confirmación).
        </p>

        <form className="pr-form" onSubmit={lookup}>
          <input
            type="text"
            placeholder="Q-2026-0001"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            aria-label="Código de presupuesto"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Buscando…' : 'Consultar'}
          </button>
        </form>

        {error && <p className="pr-msg err">{error}</p>}
        {notFound && (
          <p className="pr-msg">
            No encontramos ningún presupuesto con ese código. Revisa que esté
            bien escrito (formato Q-AAAA-NNNN) o escríbenos a{' '}
            <a href={mailtoUrl()}>{CONTACTO.email}</a>.
          </p>
        )}
      </section>

      {result && (
        <section className="pr-result">
          <div className="pr-card">
            <div className="pr-card-head">
              <span className="pr-codigo">{result.codigo}</span>
              <span className="pr-fecha">Solicitado el {fecha(result.created_at)}</span>
            </div>

            {rechazado ? (
              <div className="pr-rechazado">
                <strong>Presupuesto no viable</strong>
                <p>
                  Lo sentimos — esta pieza no pudo aceptarse (tamaño, geometría o
                  material). Te hemos escrito con los detalles. Si quieres,
                  contáctanos para buscar una alternativa.
                </p>
              </div>
            ) : (
              <ol className="pr-steps">
                {PASOS.map((p, i) => {
                  const done = i < pasoIdx;
                  const current = i === pasoIdx;
                  return (
                    <li
                      key={p.id}
                      className={done ? 'done' : current ? 'current' : ''}
                    >
                      <span className="pr-step-dot">
                        {done ? '✓' : i + 1}
                      </span>
                      <div>
                        <strong>{p.label}</strong>
                        <span>{p.desc}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {puedeAceptar && (
              <div className="pr-accept" style={{ margin: '20px 0', textAlign: 'center' }}>
                <p style={{ marginBottom: 10 }}>
                  Hemos revisado tu pieza y el precio está confirmado
                  {result.precio_final != null
                    ? `: ${Number(result.precio_final).toFixed(2)} €`
                    : ''}
                  . ¿Seguimos adelante?
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={accepting}
                  onClick={acceptQuote}
                >
                  {accepting ? 'Aceptando…' : 'Aceptar presupuesto'}
                </button>
                {acceptError && <p className="pr-msg err" style={{ marginTop: 10 }}>{acceptError}</p>}
              </div>
            )}

            {expirado && (
              <p className="pr-msg" style={{ margin: '16px 0' }}>
                Esta estimación caducó el {fecha(result.valido_hasta)}. Los precios
                pueden haber cambiado — vuelve a calcularla o escríbenos y la
                renovamos.
              </p>
            )}

            {encargo && <p className="pr-msg" style={{ margin: '12px 0' }}>{encargo}</p>}

            <div className="pr-meta">
              <span>{result.material}</span>
              <span>× {result.cantidad}</span>
              <span>
                {result.precio_final != null
                  ? `${Number(result.precio_final).toFixed(2)} € confirmados`
                  : `${Number(result.precio_total).toFixed(2)} € estimados`}
              </span>
              <span>{result.entrega === 'envio' ? 'Envío nacional' : 'Recogida'}</span>
              <span className={'pr-pago pr-pago--' + result.pago}>
                {PAGO_LABEL[result.pago] ?? result.pago}
              </span>
              {(result.estado === 'nuevo' || result.estado === 'revisado') && !expirado && (
                <span>Válido hasta el {fecha(result.valido_hasta)}</span>
              )}
              <span>Actualizado el {fecha(result.updated_at)}</span>
            </div>

            {envio && <EnvioCard envio={envio} />}

            {token ? (
              <RecibosCard codigo={result.codigo} token={token} />
            ) : (
              result.pago !== 'pendiente' && (
                <p className="pr-envio-nota" style={{ marginTop: 18 }}>
                  Tus justificantes de pago están en el enlace personal que te
                  enviamos por email. Si no lo encuentras, escríbenos y te lo
                  reenviamos.
                </p>
              )
            )}

            <p className="pr-contact">
              ¿Alguna duda sobre tu pedido? Escríbenos por{' '}
              <a
                href={whatsappUrl(
                  `Hola, tengo una consulta sobre mi presupuesto ${result.codigo}`
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>{' '}
              indicando tu código.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
