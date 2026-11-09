'use client';

// Baja de las campañas por email (/baja/?e=<email>&t=<token>), enlazada al
// pie de cada correo. Pide un clic en vez de dar de baja al abrir la página:
// los escáneres de enlaces del correo abren las URLs solos.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import '../presupuesto/presupuesto.css';

type Estado = 'listo' | 'enviando' | 'hecho' | 'sin-datos' | 'error';

export function BajaClient() {
  const [estado, setEstado] = useState<Estado>('listo');
  const [datos, setDatos] = useState({ e: '', t: '' });

  useEffect(() => {
    // window.location en vez de useSearchParams: export estático, sin Suspense.
    const p = new URLSearchParams(window.location.search);
    const e = p.get('e')?.trim() ?? '';
    const t = p.get('t')?.trim() ?? '';
    setDatos({ e, t });
    if (!e || !t) setEstado('sin-datos');
  }, []);

  async function baja() {
    setEstado('enviando');
    const { error } = await createClient().functions.invoke('campana-baja', { body: datos });
    setEstado(error ? 'error' : 'hecho');
  }

  return (
    <div className="page-content pr-page">
      <section className="pr-hero">
        <div className="section-tag" style={{ justifyContent: 'center' }}>Correos de 3DCC</div>
        <h1>Darse de baja</h1>
      </section>
      <section className="pr-result">
        <div className="pr-card">
          {estado === 'sin-datos' && <p className="pr-msg err">Este enlace está incompleto. Usa el enlace del pie del correo.</p>}
          {(estado === 'listo' || estado === 'enviando') && (
            <>
              <p className="pr-msg">
                ¿Quieres dejar de recibir ofertas y novedades en <strong>{datos.e}</strong>? Seguirás
                recibiendo los correos de tus presupuestos y pedidos.
              </p>
              <button type="button" className="btn-primary" disabled={estado === 'enviando'} onClick={baja}>
                {estado === 'enviando' ? 'Un momento…' : 'Darme de baja'}
              </button>
            </>
          )}
          {estado === 'hecho' && <p className="pr-msg">Listo: tu correo está fuera de la lista y no recibirás más ofertas.</p>}
          {estado === 'error' && (
            <p className="pr-msg err">
              No hemos podido darte de baja (el enlace puede estar mal copiado). Responde a cualquiera de
              nuestros correos con la palabra «baja» y lo hacemos a mano.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
