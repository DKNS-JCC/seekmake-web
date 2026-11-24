'use client';

// Pickup slot picker, inside /presupuesto. Only with the personal token and
// only for orders «listo» for pickup (the RPC checks both). The customer asks
// for a slot; the workshop confirms it by email.

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CONTACTO } from '@/lib/contacto';
import { citaCorta } from '@/lib/recogida';

type Hueco = { id: string; inicio: string; lugar: string; mio: boolean; confirmada: boolean };

const diaDe = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

export function RecogidaCard({ codigo, token }: { codigo: string; token: string }) {
  const [huecos, setHuecos] = useState<Hueco[] | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: err } = await createClient().rpc('get_huecos_recogida', { p_codigo: codigo, p_token: token });
    if (err) setError('No se pudieron cargar las horas de recogida. Inténtalo de nuevo en unos segundos.');
    setHuecos(data ?? []);
  }, [codigo, token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function pedir(h: Hueco) {
    setEnviando(h.id);
    setError(null);
    const { data, error: err } = await createClient().rpc('pedir_hueco_recogida', {
      p_codigo: codigo,
      p_token: token,
      p_hueco: h.id
    });
    if (err) setError('No se pudo guardar. Inténtalo de nuevo.');
    else if (!data) setError('Esa hora acaba de ocuparse. Elige otra.');
    setEnviando(null);
    void cargar();
  }

  if (huecos === null) return null;
  const mio = huecos.find((h) => h.mio);
  const wa = `https://wa.me/${CONTACTO.whatsapp}?text=${encodeURIComponent(
    `Hola, mi pedido ${codigo} está listo y ninguna hora de recogida me viene bien.`
  )}`;

  if (mio?.confirmada) {
    return (
      <section className="pr-recibos">
        <span className="pr-envio-label">Tu cita de recogida</span>
        <div className="pr-envio-punto-box">
          <strong>{diaDe(mio.inicio)} a las {horaDe(mio.inicio)}</strong>
          <span>{mio.lugar}</span>
        </div>
        <p className="pr-envio-nota">
          ¿Te surge algo? <a href={wa} target="_blank" rel="noopener noreferrer">Escríbenos por WhatsApp</a>.
        </p>
      </section>
    );
  }

  const libres = huecos.filter((h) => !h.mio);
  const dias = [...new Set(libres.map((h) => diaDe(h.inicio)))];

  return (
    <section className="pr-recibos">
      <span className="pr-envio-label">Elige cuándo recogerlo</span>
      {mio && (
        <p className="pr-envio-nota" role="status">
          Has pedido <strong>{citaCorta(mio.inicio)}</strong> en {mio.lugar}. Te confirmamos la cita por email; mientras, puedes cambiarla.
        </p>
      )}
      {error && <p className="pr-envio-nota" role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      {dias.length === 0 ? (
        <p className="pr-envio-nota">Ahora mismo no hay horas abiertas. Escríbenos y la cuadramos.</p>
      ) : (
        dias.map((d) => (
          <div key={d} style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 14, textTransform: 'capitalize' }}>{d}</strong>
            <div className="pr-envio-num" style={{ marginTop: 6 }}>
              {libres
                .filter((h) => diaDe(h.inicio) === d)
                .map((h) => (
                  <button key={h.id} type="button" disabled={!!enviando} onClick={() => pedir(h)} style={{ padding: '8px 14px' }} title={h.lugar}>
                    {enviando === h.id ? '…' : horaDe(h.inicio)}
                  </button>
                ))}
            </div>
          </div>
        ))
      )}
      {libres.length > 0 && new Set(libres.map((h) => h.lugar)).size === 1 && (
        <p className="pr-envio-nota">Lugar: {libres[0].lugar}</p>
      )}
      <p className="pr-envio-nota">
        ¿Ninguna te viene bien? <a href={wa} target="_blank" rel="noopener noreferrer">Escríbenos por WhatsApp</a>.
      </p>
    </section>
  );
}
