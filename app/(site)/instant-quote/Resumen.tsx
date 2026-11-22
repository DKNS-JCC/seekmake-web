'use client';

// Step 5 (delivery, for the whole order) and the price: lines, total, what
// backs it, the room left in the minimum and the discount code.

import type { RefObject } from 'react';
import type { QuoteEntrega, ResenasResumen } from '@/lib/types';
import { fechaLarga, type QuoteResult, type QuoteSettings } from '@/lib/quote/pricing';
import type { Pieza } from '@/lib/quote/types';
import { whatsappUrl } from '@/lib/contacto';
import { euros } from '@/lib/recibo/types';
import { MAX_FILES } from './modelo';
import type { CuponEstado } from './useCupon';

export function Tick() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

export function Entrega({
  settings,
  entrega,
  setEntrega,
  cp,
  setCp
}: {
  settings: QuoteSettings;
  entrega: QuoteEntrega;
  setEntrega: (e: QuoteEntrega) => void;
  cp: string;
  setCp: (cp: string) => void;
}) {
  return (
    <div className="qt-step">
      <div className="qt-step-label">5 · Entrega del pedido</div>
      <div className="qt-cards">
        <button
          type="button"
          className={'qt-card' + (entrega === 'recogida' ? ' active' : '')}
          aria-pressed={entrega === 'recogida'}
          onClick={() => setEntrega('recogida')}
        >
          <strong>Recogida en Salamanca</strong>
          <span>Gratis · Plza. Barrio Vidal</span>
        </button>
        <button
          type="button"
          className={'qt-card' + (entrega === 'envio' ? ' active' : '')}
          aria-pressed={entrega === 'envio'}
          onClick={() => setEntrega('envio')}
        >
          <strong>Envío nacional</strong>
          <span>
            {settings.envio_gratis_desde > 0
              ? `Gratis desde ${euros(settings.envio_gratis_desde)} · si no, por peso`
              : 'Coste por peso, incluido en el total'}
          </span>
        </button>
      </div>
      {entrega === 'envio' && (
        <label className="qt-cp">
          <span>Código postal <small>(opcional)</small></span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            placeholder="37001"
            value={cp}
            onChange={(e) => setCp(e.target.value.replace(/\D/g, ''))}
          />
        </label>
      )}
    </div>
  );
}

export function Resumen({
  totalRef,
  settings,
  settingsLoaded,
  numPiezas,
  numAnalizando,
  progresoAnalisis,
  listo,
  quote,
  precioFinal,
  consultar,
  firmeActivo,
  listoAntes,
  entrega,
  resenas,
  masUnaUnidad,
  masUno,
  otraPieza,
  cup
}: {
  totalRef: RefObject<HTMLDivElement>;
  settings: QuoteSettings;
  settingsLoaded: boolean;
  numPiezas: number;
  numAnalizando: number;
  progresoAnalisis: number;
  listo: boolean;
  quote: QuoteResult | null;
  precioFinal: boolean;
  /** Big order: no price on screen, we send it (esConsultar). */
  consultar: boolean;
  firmeActivo: boolean;
  listoAntes: string | null;
  entrega: QuoteEntrega;
  resenas: ResenasResumen | null;
  masUnaUnidad: { pieza: Pieza; extra: number } | null;
  /** One more unit of that piece. */
  masUno: (p: Pieza) => void;
  otraPieza: () => void;
  cup: CuponEstado;
}) {
  const { cupon } = cup;
  return (
    <div className="qt-total" ref={totalRef}>
      {!numPiezas && (
        <p className="qt-total-empty">Sube una pieza para ver el precio.</p>
      )}
      {numPiezas > 0 && !settingsLoaded && (
        <p className="qt-total-empty">Cargando tarifas…</p>
      )}
      {numPiezas > 0 && settingsLoaded && numAnalizando > 0 && (
        <div className="qt-total-empty qt-analizando" role="status">
          <p>
            Laminando {numAnalizando === 1 ? 'tu pieza' : `${numAnalizando} piezas`}{' '}
            para calcular gramos y horas reales…
          </p>
          <div className="qt-progress">
            <span style={{ width: `${Math.round(progresoAnalisis * 100)}%` }} />
          </div>
        </div>
      )}
      {numPiezas > 0 && listo && quote && consultar && (
        <div className="qt-consultar">
          <div className="qt-total-row">
            <span>Total</span>
            <strong>A consultar</strong>
          </div>
          <p>
            Es un pedido grande. Estos no los dejamos al cálculo automático: los
            presupuestamos a mano para ajustar el precio al máximo.{' '}
            <strong>Envíanos la solicitud y te mandamos el precio en menos de 24 h.</strong>
          </p>
          {listoAntes && (
            <p className="qt-total-note">
              Orientativo: listo antes del {fechaLarga(listoAntes)}
              {entrega === 'envio' ? ' + envío' : ''}.
            </p>
          )}
        </div>
      )}
      {numPiezas > 0 && listo && quote && !consultar && (
        <>
          <ul className="qt-lines">
            {quote.lineas.map((l, i) => (
              <li key={i}>
                <span>{l.concepto}</span>
                <span>{l.importe === 0 ? 'Gratis' : euros(l.importe)}</span>
              </li>
            ))}
          </ul>
          <div className="qt-total-row">
            <span>{precioFinal ? 'Total' : 'Total estimado'}</span>
            <strong>{euros(quote.total)}</strong>
          </div>

          {/* Trust, right where the number is read */}
          <ul className="qt-trust">
            <li>
              <Tick />
              {precioFinal
                ? 'Precio final, sin sorpresas'
                : firmeActivo
                  ? 'Te confirmamos el precio en menos de 24 h'
                  : 'Precio orientativo: lo cerramos al revisar la pieza'}
            </li>
            {listoAntes && (
              <li>
                <Tick />
                <span>
                  Listo antes del {fechaLarga(listoAntes)}
                  {entrega === 'envio' ? ' + envío' : ''}.{' '}
                  <a
                    href={whatsappUrl(`Hola, necesito mi pedido antes del ${fechaLarga(listoAntes)}. ¿Se puede?`)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ¿Lo necesitas antes? Escríbenos
                  </a>
                </span>
              </li>
            )}
            {resenas && resenas.total > 0 && (
              <li>
                <Tick />
                {resenas.total} reseñas ·{' '}
                {Number(resenas.media).toLocaleString('es-ES', { maximumFractionDigits: 1 })}★
              </li>
            )}
            <li>
              <Tick />
              Recogida en Salamanca o envío a toda España
            </li>
          </ul>

          {/* Small orders: show the room left inside the same price */}
          {masUnaUnidad && (
            <div className="qt-upsell">
              <p>
                {masUnaUnidad.extra === 0 ? (
                  <>Una unidad más de <strong>{masUnaUnidad.pieza.name}</strong> te sale <strong>gratis</strong>.</>
                ) : (
                  <>
                    2 unidades de <strong>{masUnaUnidad.pieza.name}</strong> por solo{' '}
                    <strong>+{euros(masUnaUnidad.extra)}</strong>.
                  </>
                )}
                {quote.margenMinimo >= 1 && numPiezas < MAX_FILES && (
                  <> O añade otra pieza: hasta {euros(quote.margenMinimo)} entran en el mismo precio.</>
                )}
              </p>
              <div className="qt-upsell-acciones">
                <button type="button" className="btn-outline" onClick={() => masUno(masUnaUnidad.pieza)}>
                  + 1 unidad
                </button>
                {numPiezas < MAX_FILES && (
                  <button type="button" className="btn-outline" onClick={otraPieza}>
                    + Otra pieza
                  </button>
                )}
              </div>
            </div>
          )}
          {entrega === 'envio' && quote.faltaEnvioGratis > 0 && (
            <p className="qt-total-note qt-envio-gratis">
              Te faltan {euros(quote.faltaEnvioGratis)} para el envío gratis.
            </p>
          )}

          <div className="qt-cupon">
            {cupon ? (
              <p className={quote.cupon ? 'qt-cupon-ok' : 'qt-cupon-aviso'}>
                {quote.cupon
                  ? `Código ${cupon.codigo} aplicado: −${euros(quote.cuponDescuento)}`
                  : quote.descuentoPct > 0
                    ? `El descuento por cantidad es mayor que el código ${cupon.codigo}; aplicamos ese.`
                    : `El código ${cupon.codigo} es para pedidos desde ${euros(cupon.pedido_minimo)} en piezas.`}
                <button type="button" className="qt-cupon-quitar" onClick={() => cup.setCupon(null)}>
                  Quitar
                </button>
              </p>
            ) : cup.cuponAbierto ? (
              <form
                className="qt-cupon-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void cup.aplicarCupon(cup.cuponTxt);
                }}
              >
                <input
                  value={cup.cuponTxt}
                  onChange={(e) => cup.setCuponTxt(e.target.value)}
                  placeholder="Código de descuento"
                  aria-label="Código de descuento"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={30}
                />
                <button type="submit" className="btn-outline" disabled={cup.cuponCargando || !cup.cuponTxt.trim()}>
                  {cup.cuponCargando ? '…' : 'Aplicar'}
                </button>
              </form>
            ) : (
              <button type="button" className="qt-cupon-abrir" onClick={() => cup.setCuponAbierto(true)}>
                ¿Tienes un código de descuento?
              </button>
            )}
            {cup.cuponError && !cupon && (
              <p className="qt-cupon-error" role="alert">{cup.cuponError}</p>
            )}
          </div>
          <p className="qt-total-note">
            Calculado laminando tus piezas como en nuestra impresora
            (~{Math.round(quote.pesoG)} g, ~{quote.tiempoH.toFixed(1)} h de impresión
            en total), válido {settings.validez_dias} días.
            {!precioFinal && ' Alguna pieza necesita que la revisemos; te confirmamos el precio antes de imprimir.'}
          </p>
          {quote.piezas.some((p) => p.metodo === 'aproximado') && (
            <p className="qt-total-note">
              Alguna pieza no se pudo laminar en el navegador; su precio es una
              aproximación por volumen.
            </p>
          )}
        </>
      )}
    </div>
  );
}
