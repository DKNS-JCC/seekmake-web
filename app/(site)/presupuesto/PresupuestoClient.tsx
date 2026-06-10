'use client';

// Public quote-status lookup. The code (Q-YYYY-NNNN) acts like a parcel
// tracking number: the RPC only returns non-personal fields.

import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { QuoteEntrega, QuoteEstado, QuotePago } from '@/lib/types';
import './presupuesto.css';

interface StatusRow {
  codigo: string;
  estado: QuoteEstado;
  pago: QuotePago;
  entrega: QuoteEntrega;
  material: string;
  cantidad: number;
  precio_total: number;
  precio_final: number | null;
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
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup(e: FormEvent) {
    e.preventDefault();
    const code = codigo.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setResult(null);
    try {
      const { data, error: err } = await createClient().rpc('get_quote_status', {
        p_codigo: code
      });
      if (err) {
        setError('No se pudo consultar. Inténtalo de nuevo en unos segundos.');
      } else if (!data || data.length === 0) {
        setNotFound(true);
      } else {
        setResult(data[0] as StatusRow);
      }
    } catch {
      setError('Error de red. Comprueba tu conexión.');
    } finally {
      setLoading(false);
    }
  }

  const pasoIdx = result
    ? Math.max(0, PASOS.findIndex((p) => p.id === result.estado))
    : -1;
  const rechazado = result?.estado === 'rechazado';

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
            <a href="mailto:info@impresion3dcc.com">info@impresion3dcc.com</a>.
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
              <span>Actualizado el {fecha(result.updated_at)}</span>
            </div>

            <p className="pr-contact">
              ¿Alguna duda sobre tu pedido? Escríbenos por{' '}
              <a
                href={`https://wa.me/34665148956?text=${encodeURIComponent(
                  `Hola, tengo una consulta sobre mi presupuesto ${result.codigo}`
                )}`}
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
