'use client';

// Verificación pública de un justificante de pago: la página a la que apunta
// el QR impreso en el PDF (/recibo/?c=R-2026-0001&t=<token>).
//
// El token es lo que autoriza: sin él la RPC no devuelve nada, así que los
// códigos no se pueden ir probando uno detrás de otro. Y como el documento
// archivado es inmutable, esta página es la única forma de saber que un
// justificante fue anulado después de emitirse.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ReciboVerificado } from '@/lib/recibo/types';
import { METODO_LABEL, euros, fechaCorta } from '@/lib/recibo/types';
import { CONTACTO, mailtoUrl } from '@/lib/contacto';
import '../presupuesto/presupuesto.css';
import './recibo.css';

type Estado = 'cargando' | 'valido' | 'anulado' | 'no-encontrado' | 'sin-datos' | 'error';

export function ReciboVerify() {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [recibo, setRecibo] = useState<ReciboVerificado | null>(null);

  useEffect(() => {
    // window.location en vez de useSearchParams: export estático, sin Suspense.
    const params = new URLSearchParams(window.location.search);
    const codigo = params.get('c')?.trim().toUpperCase() ?? '';
    const token = params.get('t')?.trim() ?? '';

    // El token se valida antes de llamar: la RPC lo recibe como uuid y un
    // texto cualquiera devolvería un error de base de datos, que en pantalla
    // se leería como "no hemos podido comprobarlo" en vez de "enlace mal".
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!codigo || !token || !esUuid.test(token)) {
      setEstado('sin-datos');
      return;
    }

    let vivo = true;
    createClient()
      .rpc('verificar_recibo', { p_codigo: codigo, p_token: token })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          setEstado('error');
        } else if (!data || data.length === 0) {
          setEstado('no-encontrado');
        } else {
          const r = data[0] as ReciboVerificado;
          setRecibo(r);
          setEstado(r.anulado ? 'anulado' : 'valido');
        }
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="page-content pr-page">
      <section className="pr-hero">
        <div className="section-tag" style={{ justifyContent: 'center' }}>
          Verificación
        </div>
        <h1>Justificante de pago</h1>
      </section>

      <section className="pr-result">
        <div className="pr-card rv-card">
          {estado === 'cargando' && <p className="pr-msg">Comprobando…</p>}

          {estado === 'sin-datos' && (
            <p className="pr-msg">
              Esta página comprueba justificantes de pago de {CONTACTO.nombre}. Para
              usarla, escanea el código QR del PDF o abre el enlace completo que
              aparece junto a él.
            </p>
          )}

          {estado === 'error' && (
            <p className="pr-msg err">
              No hemos podido comprobarlo ahora mismo. Inténtalo en unos segundos.
            </p>
          )}

          {estado === 'no-encontrado' && (
            <>
              <div className="rv-sello rv-sello--no">✕</div>
              <h2 className="rv-titulo">No encontrado</h2>
              <p className="pr-msg">
                No consta ningún justificante con ese código y ese enlace. Comprueba que
                has abierto el enlace completo del PDF. Si el documento te llegó por otra
                vía, escríbenos a <a href={mailtoUrl()}>{CONTACTO.email}</a>.
              </p>
            </>
          )}

          {(estado === 'valido' || estado === 'anulado') && recibo && (
            <>
              <div className={'rv-sello ' + (estado === 'valido' ? 'rv-sello--si' : 'rv-sello--anu')}>
                {estado === 'valido' ? '✓' : '!'}
              </div>
              <h2 className="rv-titulo">
                {estado === 'valido' ? 'Justificante auténtico' : 'Justificante anulado'}
              </h2>

              {estado === 'anulado' && (
                <p className="pr-msg" style={{ marginBottom: 4 }}>
                  Este documento se emitió pero después se anuló, así que ya no acredita
                  nada. Debería haber otro que lo sustituya — si no lo tienes, escríbenos.
                </p>
              )}

              <dl className="rv-datos">
                <div>
                  <dt>Justificante</dt>
                  <dd className="rv-mono">{recibo.codigo}</dd>
                </div>
                <div>
                  <dt>Pedido</dt>
                  <dd className="rv-mono">{recibo.pedido}</dd>
                </div>
                <div>
                  <dt>Importe</dt>
                  <dd className="rv-importe">{euros(recibo.importe)}</dd>
                </div>
                <div>
                  <dt>Fecha del cobro</dt>
                  <dd>{fechaCorta(recibo.fecha_pago)}</dd>
                </div>
                <div>
                  <dt>Forma de pago</dt>
                  <dd>{METODO_LABEL[recibo.metodo] ?? recibo.metodo}</dd>
                </div>
              </dl>

              {recibo.concepto && <p className="rv-concepto">{recibo.concepto}</p>}

              <p className="pr-contact">
                Comprueba que estos datos coinciden con los del PDF que tienes. Si algo no
                cuadra, escríbenos a <a href={mailtoUrl()}>{CONTACTO.email}</a>.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
