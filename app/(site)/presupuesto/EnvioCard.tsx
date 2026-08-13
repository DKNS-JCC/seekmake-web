'use client';

// Tarjeta de seguimiento del envío, dentro de /presupuesto.
//
// Los datos vienen de la RPC pública `get_envio_status`, que solo devuelve
// campos logísticos: ni dirección, ni CP, ni coste, ni margen.
//
// El estado lo pone el admin a mano, así que la regla es no inventarse nada:
// se pintan las fechas que existen y los pasos futuros quedan en gris sin
// fecha. Nunca una estimación que nadie ha escrito.

import { useEffect, useState } from 'react';
import type { EnvioEstado, EnvioPublico } from '@/lib/types';
import { carrierInfo, urlSeguimiento } from '@/lib/envio/carriers';

const PASOS: { id: EnvioEstado; label: string; campo: keyof EnvioPublico }[] = [
  { id: 'etiqueta', label: 'Etiqueta creada', campo: 'etiqueta_at' },
  { id: 'en_transito', label: 'En tránsito', campo: 'transito_at' },
  { id: 'disponible', label: 'En tu punto de recogida', campo: 'disponible_at' },
  { id: 'entregado', label: 'Entregado', campo: 'entregado_at' }
];

function fechaBreve(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function fechaDia(ymd: string | null): string {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function EnvioCard({ envio }: { envio: EnvioPublico }) {
  const [copiado, setCopiado] = useState(false);
  const info = carrierInfo(envio.carrier);
  const nombre = envio.carrier_nombre ?? info.nombre;
  const seguimiento = urlSeguimiento(envio.carrier, envio.tracking_url);
  const punto = envio.punto_recogida ?? {};
  const tienePunto = Object.values(punto).some((v) => String(v ?? '').trim() !== '');

  const idx = PASOS.findIndex((p) => p.id === envio.estado);
  const incidencia = envio.estado === 'incidencia';

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  async function copiar() {
    if (!envio.tracking_number) return;
    try {
      await navigator.clipboard.writeText(envio.tracking_number);
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles (o http): el número está a la vista y se
      // puede seleccionar a mano, así que no merece un mensaje de error.
    }
  }

  return (
    <section className="pr-envio">
      <header className="pr-envio-head">
        <span className="pr-envio-titulo">Tu envío</span>
        <span className="pr-envio-carrier">
          <i style={{ background: info.color }} aria-hidden="true" />
          {nombre}
          {envio.metodo ? <em>{envio.metodo}</em> : null}
        </span>
      </header>

      {incidencia ? (
        <p className="pr-envio-incidencia">
          <strong>Incidencia con el envío.</strong> Estamos en ello — te escribimos en
          cuanto sepamos algo. Si prefieres, pregúntanos por WhatsApp.
        </p>
      ) : (
        <ol className="pr-envio-pasos">
          {PASOS.map((p, i) => {
            const cuando = fechaBreve(envio[p.campo] as string | null);
            const hecho = !!cuando || i < idx;
            const actual = i === idx;
            return (
              <li key={p.id} className={hecho ? (actual ? 'actual' : 'hecho') : ''}>
                <span className="pr-envio-punto" aria-hidden="true" />
                <span className="pr-envio-paso">{p.label}</span>
                <span className="pr-envio-cuando">{cuando || '—'}</span>
              </li>
            );
          })}
        </ol>
      )}

      {envio.tracking_number && (
        <div className="pr-envio-track">
          <span className="pr-envio-label">Nº de seguimiento</span>
          <div className="pr-envio-num">
            <code>{envio.tracking_number}</code>
            <button type="button" onClick={() => void copiar()}>
              {copiado ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          {seguimiento.url && (
            <>
              <a
                className="btn-outline pr-envio-btn"
                href={seguimiento.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {seguimiento.directo ? 'Ver el seguimiento' : `Seguir en ${nombre}`} ↗
              </a>
              {/* El buscador de InPost pide número Y código postal. Mejor
                  avisar que prometer un enlace que se queda a medias. */}
              {!seguimiento.directo && seguimiento.pideCp && (
                <span className="pr-envio-aviso">
                  {nombre} te pedirá también el código postal de entrega.
                </span>
              )}
            </>
          )}
        </div>
      )}

      {tienePunto && (
        <div className="pr-envio-punto-box">
          <span className="pr-envio-label">Punto de recogida</span>
          {punto.nombre && <strong>{punto.nombre}</strong>}
          {punto.direccion && (
            <span>
              {punto.direccion}
              {punto.ciudad ? `, ${punto.ciudad}` : ''}
              {punto.cp ? ` (${punto.cp})` : ''}
            </span>
          )}
          {(punto.horario || punto.hasta) && (
            <span className="pr-envio-sub">
              {[punto.horario, punto.hasta].filter(Boolean).join(' · ')}
            </span>
          )}
          {punto.codigo_apertura && (
            <span className="pr-envio-sub">
              Código de apertura: <code>{punto.codigo_apertura}</code>
            </span>
          )}
        </div>
      )}

      {envio.fecha_estimada && envio.estado !== 'entregado' && (
        <p className="pr-envio-nota">
          Entrega estimada: <strong>{fechaDia(envio.fecha_estimada)}</strong>. Es una
          estimación del transportista, no una garantía.
        </p>
      )}

      {envio.nota_cliente && <p className="pr-envio-nota">{envio.nota_cliente}</p>}
    </section>
  );
}
