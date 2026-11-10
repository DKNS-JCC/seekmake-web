'use client';

// Taller → Cola de impresión: lo aceptado y en producción, por fecha tope.
// Solo lectura: se mueve de estado desde «Pedidos» o «Hoy».

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { mensajeDeError } from '@/lib/errors';
import { formatHoras } from '@/lib/quote/formatos';
import { normalizeSettings, hoyMadrid } from '@/lib/quote/pricing';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { AdminCabecera } from '../_components/AdminNav';
import { ErrorBanner } from '../_components/ErrorBanner';
import { ESTADO_LABEL, plazoDe } from '../presupuestos/estados';
import type { QuoteEstado } from '@/lib/types';

type Fila = {
  id: string;
  data: { impresora?: string; horas?: string; descripcion?: string; cantidad?: number };
  quotes: { codigo: string; nombre: string; estado: QuoteEstado; fecha_prometida: string | null; urgente: boolean };
};

export default function AdminTaller() {
  const { authed, supabase } = useAdminAuth();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [colaH, setColaH] = useState(0);
  const [horasDia, setHorasDia] = useState(4);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    void (async () => {
      const [o, cola, s] = await Promise.all([
        supabase()
          .from('orders')
          .select('id, data, quotes!inner(codigo, nombre, estado, fecha_prometida, urgente, archivado)')
          .eq('empresa', '3dcc')
          .in('quotes.estado', ['aceptado', 'imprimiendo'])
          .eq('quotes.archivado', false),
        supabase().rpc('plazo_cola_horas', {}),
        supabase().from('quote_settings').select('config').eq('id', 1).maybeSingle()
      ]);
      if (o.error) setError(mensajeDeError(o.error, 'No se pudo cargar la cola'));
      const f = ((o.data ?? []) as unknown as Fila[]).sort((a, b) =>
        (a.quotes.fecha_prometida ?? '9999').localeCompare(b.quotes.fecha_prometida ?? '9999')
      );
      setFilas(f);
      setColaH(Number(cola.data) || 0);
      setHorasDia(normalizeSettings(s.data?.config ?? null).plazo_horas_dia);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  if (authed === false) return <AccesoDenegado />;
  const dias = Math.ceil(colaH / Math.max(1, horasDia));
  const hoy = hoyMadrid();

  return (
    <div>
      <AdminCabecera titulo="Cola de impresión">
        {colaH > 0
          ? `${formatHoras(colaH)} pendientes · ${dias} día${dias === 1 ? '' : 's'} a ${horasDia} h/día.`
          : 'Nada pendiente de imprimir.'}
      </AdminCabecera>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {filas === null && !error ? (
        <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      ) : filas && filas.length === 0 ? (
        <p className="hoy-vacio">La cola está vacía. Los pedidos aparecen aquí al aceptarlos.</p>
      ) : (
        <section className="hoy-grupo" aria-label="Cola">
          <ul>
            {(filas ?? []).map((f) => {
              const plazo = plazoDe(f.quotes, hoy);
              const h = Number(f.data.horas) || 0;
              return (
                <li key={f.id}>
                  <Link href={`/admin/presupuestos?abrir=${encodeURIComponent(f.quotes.codigo)}`} className="hoy-fila">
                    <span className="hoy-fila-txt">
                      <strong>{f.quotes.nombre}</strong>
                      <span>
                        {f.quotes.codigo} · {f.data.descripcion || 'sin descripción'}
                        {f.data.impresora ? ` · ${f.data.impresora}` : ''} · {ESTADO_LABEL[f.quotes.estado]}
                      </span>
                    </span>
                    <span className="adm-num">
                      {h > 0 ? formatHoras(h) : '—'}
                      <br />
                      <span style={{ fontSize: 12, color: plazo.riesgo ? '#b91c1c' : 'var(--muted)' }}>
                        {plazo.riesgo ? '⚠ ' : ''}
                        {plazo.texto}
                        {f.quotes.urgente ? ' · urgente' : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
