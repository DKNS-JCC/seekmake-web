'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Quote } from '@/lib/types';
import { euros } from '@/lib/recibo/types';
import { mensajeDeError } from '@/lib/errors';
import { useAdminAuth, AccesoDenegado } from './_components/useAdminAuth';
import { AdminCabecera } from './_components/AdminNav';
import { ErrorBanner } from './_components/ErrorBanner';
import { hoyMadrid, senalPendiente } from '@/lib/quote/pricing';
import { plazoDe } from './presupuestos/estados';

// "Hoy": what needs doing, oldest first. Each row opens the quote.
type Fila = Pick<
  Quote,
  'id' | 'codigo' | 'nombre' | 'estado' | 'pago' | 'entrega' | 'precio_total' | 'precio_final' |
  'importe_pagado' | 'created_at' | 'updated_at' | 'valido_hasta' | 'fecha_prometida' | 'urgente'
>;

const DIA = 24 * 60 * 60 * 1000;

function hace(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'hace un momento';
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
}

function Grupo({
  titulo,
  vacio,
  filas,
  detalle,
  verTodos,
  enlace
}: {
  titulo: string;
  vacio: string;
  filas: Fila[];
  detalle: (q: Fila) => string;
  verTodos?: string;
  /** Dónde abre cada fila (por defecto, la ficha). */
  enlace?: (q: Fila) => string;
}) {
  return (
    <section className="hoy-grupo" aria-labelledby={`hoy-${titulo}`}>
      <div className="hoy-grupo-cab">
        <h2 id={`hoy-${titulo}`}>
          {titulo} <span className="hoy-n">{filas.length}</span>
        </h2>
        {verTodos && filas.length > 0 && (
          <Link href={verTodos} className="hoy-ver">Ver en la lista</Link>
        )}
      </div>
      {filas.length === 0 ? (
        <p className="hoy-vacio">{vacio}</p>
      ) : (
        <ul>
          {filas.slice(0, 8).map((q) => (
            <li key={q.id}>
              <Link href={enlace ? enlace(q) : `/admin/presupuestos?abrir=${encodeURIComponent(q.codigo)}`} className="hoy-fila">
                <span className="hoy-fila-txt">
                  <strong>{q.nombre}</strong>
                  <span>{q.codigo} · {detalle(q)}</span>
                </span>
                <span className="adm-num">{euros(q.precio_final ?? q.precio_total)}</span>
              </Link>
            </li>
          ))}
          {filas.length > 8 && <li className="hoy-vacio">y {filas.length - 8} más…</li>}
        </ul>
      )}
    </section>
  );
}

export default function AdminHoy() {
  const { authed, supabase } = useAdminAuth();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    supabase()
      .from('quotes')
      .select('id, codigo, nombre, estado, pago, entrega, precio_total, precio_final, importe_pagado, created_at, updated_at, valido_hasta, fecha_prometida, urgente')
      .eq('archivado', false)
      .in('estado', ['nuevo', 'revisado', 'aceptado', 'imprimiendo', 'listo'])
      .order('created_at', { ascending: true })
      .then(({ data, error: err }) => {
        if (err) setError(mensajeDeError(err, 'No se pudieron cargar los pedidos'));
        setFilas((data as Fila[]) ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  if (authed === false) return <AccesoDenegado />;

  const de = (...e: Fila['estado'][]) => (filas ?? []).filter((q) => e.includes(q.estado));
  const nuevos = de('nuevo');
  const esperando = de('revisado').sort((a, b) => a.valido_hasta.localeCompare(b.valido_hasta));
  // Por imprimir: lo que antes vence primero (sin fecha, al final).
  const enMarcha = de('aceptado', 'imprimiendo').sort((a, b) =>
    (a.fecha_prometida ?? '9999').localeCompare(b.fecha_prometida ?? '9999')
  );
  const hoy = hoyMadrid();
  const plazoTxt = (q: Fila): string => {
    if (!q.fecha_prometida) return 'sin fecha';
    const p = plazoDe(q, hoy);
    return p.riesgo ? `en riesgo · ${p.texto}` : `antes del ${p.texto}`;
  };
  const enRiesgo = enMarcha.filter((q) => plazoDe(q, hoy).riesgo).length;
  const sinSenal = enMarcha.filter((q) =>
    senalPendiente(Number(q.precio_final ?? q.precio_total), Number(q.importe_pagado))
  ).length;
  const listos = de('listo');
  const sinCobrar = de('aceptado', 'imprimiendo', 'listo').filter((q) => q.pago !== 'pagado');
  const pendiente = sinCobrar.reduce(
    (s, q) => s + Math.max(0, Number(q.precio_final ?? q.precio_total) - Number(q.importe_pagado || 0)),
    0
  );

  return (
    <div>
      <AdminCabecera titulo="Hoy">
        Lo que tienes pendiente: lo por imprimir, por fecha tope; el resto, lo más antiguo primero. Toca un pedido para abrirlo.
      </AdminCabecera>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {filas === null && !error ? (
        <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      ) : (
        <>
          <div className="hoy-kpis">
            <div><span>{nuevos.length}</span>sin contestar</div>
            <div><span>{enMarcha.length}</span>en producción</div>
            <div><span>{listos.length}</span>para entregar</div>
            <div><span>{euros(pendiente)}</span>por cobrar</div>
            {enRiesgo > 0 && <div className="hoy-alerta"><span>{enRiesgo}</span>en riesgo de llegar tarde</div>}
            {sinSenal > 0 && <div className="hoy-alerta"><span>{sinSenal}</span>con la señal pendiente</div>}
          </div>
          <div className="hoy-grid">
            <Grupo
              titulo="Por presupuestar"
              vacio="Ninguna solicitud nueva."
              filas={nuevos}
              detalle={(q) => `llegó ${hace(q.created_at)}`}
              verTodos="/admin/presupuestos?estado=nuevo"
            />
            <Grupo
              titulo="Por imprimir"
              vacio="Nada aceptado pendiente de imprimir."
              filas={enMarcha}
              detalle={(q) =>
                plazoTxt(q) +
                (q.urgente ? ' · urgente' : '') +
                (q.estado === 'imprimiendo' ? ' · en la impresora' : '') +
                (senalPendiente(Number(q.precio_final ?? q.precio_total), Number(q.importe_pagado)) ? ' · señal pendiente' : '')
              }
              verTodos="/admin/presupuestos?estado=aceptado"
            />
            <Grupo
              titulo="Para entregar"
              vacio="Nada listo pendiente de entrega."
              filas={listos}
              detalle={(q) => (q.entrega === 'envio' ? 'envío' : 'recogida') + (q.pago !== 'pagado' ? ' · sin cobrar todo' : '')}
              verTodos="/admin/presupuestos?estado=listo"
            />
            <Grupo
              titulo="Esperando al cliente"
              vacio="Ningún presupuesto pendiente de respuesta."
              filas={esperando}
              detalle={(q) => {
                const d = Math.ceil((new Date(q.valido_hasta).getTime() - Date.now()) / DIA);
                // Recordatorio al taller a los 3 y 7 días sin respuesta; a los 15 se descarta solo (limpieza_pedidos).
                const sin = Math.floor((Date.now() - new Date(q.updated_at).getTime()) / DIA);
                const aviso = sin >= 7 ? `recuérdaselo: ${sin} días sin respuesta · ` : sin >= 3 ? `${sin} días sin respuesta · ` : '';
                return aviso + (d < 0 ? 'caducado' : d === 0 ? 'caduca hoy' : `caduca en ${d} día${d === 1 ? '' : 's'}`);
              }}
              verTodos="/admin/presupuestos?estado=revisado"
            />
            <Grupo
              titulo="Por cobrar"
              vacio="Todo lo aceptado está cobrado."
              filas={sinCobrar}
              detalle={(q) => `cobrado ${euros(q.importe_pagado)}`}
              enlace={(q) => `/admin/presupuestos?abrir=${encodeURIComponent(q.codigo)}&pestana=cobros`}
            />
          </div>
        </>
      )}
    </div>
  );
}
