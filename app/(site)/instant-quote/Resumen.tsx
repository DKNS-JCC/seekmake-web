'use client';

// Step 5 (delivery, for the whole order) and the price: lines, total, the
// promise behind it and the discount code.

import type { QuoteEntrega } from '@/lib/types';
import { fechaLarga, type QuoteResult, type QuoteSettings } from '@/lib/quote/pricing';
import { whatsappUrl } from '@/lib/contacto';
import { euros } from '@/lib/recibo/types';
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
      <div className="qt-step-label">3 · Entrega</div>
      <div className="qt-pills">
        <button
          type="button"
          className={'qt-pill' + (entrega === 'recogida' ? ' active' : '')}
          aria-pressed={entrega === 'recogida'}
          onClick={() => setEntrega('recogida')}
        >
          Recogida en Salamanca
        </button>
        <button
          type="button"
          className={'qt-pill' + (entrega === 'envio' ? ' active' : '')}
          aria-pressed={entrega === 'envio'}
          onClick={() => setEntrega('envio')}
        >
          Envío a España
        </button>
      </div>
      <p className="qt-step-hint">
        {entrega === 'recogida'
          ? 'Gratis · Plza. Barrio Vidal'
          : settings.envio_gratis_desde > 0
            ? `Gratis desde ${euros(settings.envio_gratis_desde)} · si no, por peso`
            : 'Coste por peso, incluido en el total'}
      </p>
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
  cup
}: {
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
  cup: CuponEstado;
}) {
  const { cupon } = cup;
  return (
    <div className="qt-total">
      {!numPiezas && (
        <p className="qt-total-empty">Sube una pieza para ver el precio.</p>
      )}
      {numPiezas > 0 && !settingsLoaded && (
        <p className="qt-total-empty">Cargando tarifas…</p>
      )}
      {numPiezas > 0 && settingsLoaded && numAnalizando > 0 && (
        <div className="qt-total-empty qt-analizando" role="status">
          <p>
            Calculando el precio{numAnalizando > 1 ? ` de ${numAnalizando} piezas` : ''}…{' '}
            {Math.round(progresoAnalisis * 100)} %
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
          {/* One line is the total itself: only list them when there are more. */}
          {quote.lineas.length > 1 && (
            <ul className="qt-lines">
              {quote.lineas.map((l, i) => (
                <li key={i}>
                  <span>{l.concepto.replace(/ \(~[^)]*\)/, '')}</span>
                  <span>{l.importe === 0 ? 'Gratis' : euros(l.importe)}</span>
                </li>
              ))}
            </ul>
          )}
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
          </ul>

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
