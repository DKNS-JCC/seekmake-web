'use client';

// Justificantes de pago del cliente, dentro de /presupuesto.
//
// Solo se muestran con el token personal del pedido (el del enlace del email
// de confirmación). Con el código a secas no: un justificante lleva nombre e
// importe, y el código de pedido circula por WhatsApp con demasiada alegría.
//
// La descarga NO genera el PDF aquí: pide a la Edge Function una URL firmada
// del fichero archivado, para que el cliente reciba exactamente el mismo
// documento que quedó guardado y que se envió por email.

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ReciboCliente } from '@/lib/recibo/types';
import { METODO_LABEL, euros, fechaCorta } from '@/lib/recibo/types';
import { descargarPdfFirmado } from '@/lib/recibo/descargar';

export function RecibosCard({ codigo, token }: { codigo: string; token: string }) {
  const [recibos, setRecibos] = useState<ReciboCliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [bajando, setBajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await createClient().rpc('get_recibos_cliente', {
      p_codigo: codigo,
      p_token: token
    });
    if (!err && data) setRecibos(data as ReciboCliente[]);
    setCargando(false);
  }, [codigo, token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function descargar(r: ReciboCliente) {
    setBajando(r.codigo);
    setError(null);
    try {
      const { data, error: err } = await createClient().functions.invoke('recibo-emitir', {
        body: {
          action: 'descargar',
          recibo_codigo: r.codigo,
          quote_codigo: codigo,
          token
        }
      });
      if (err) throw new Error(err.message);
      if (data?.error) throw new Error(data.error);
      await descargarPdfFirmado(data.url, `justificante-${r.codigo}.pdf`);
    } catch {
      setError('No se pudo descargar el justificante. Inténtalo de nuevo o escríbenos.');
    } finally {
      setBajando(null);
    }
  }

  if (cargando || recibos.length === 0) return null;

  return (
    <section className="pr-recibos">
      <span className="pr-envio-label">Justificantes de pago</span>
      <ul>
        {recibos.map((r) => (
          <li key={r.codigo}>
            <div>
              <strong>{euros(r.importe)}</strong>
              <span>
                {fechaCorta(r.fecha_pago)} · {METODO_LABEL[r.metodo] ?? r.metodo}
                {r.es_adelanto ? ' · adelanto' : ''}
              </span>
            </div>
            <button
              type="button"
              className="btn-outline"
              disabled={bajando !== null}
              onClick={() => void descargar(r)}
            >
              {bajando === r.codigo ? 'Bajando…' : '⬇ PDF'}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="pr-msg err">{error}</p>}
    </section>
  );
}
