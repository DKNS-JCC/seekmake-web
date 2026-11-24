'use client';

// Lo que se ve en Dinero → Estadísticas (la carga está en page.tsx). Arriba, fijos, el periodo y las cifras del dinero;
// debajo, una pestaña por pregunta: Dinero (por dónde entra, quién debe),
// Pedidos (aceptación, plazos, riesgo, acierto del tasador), Tasador web
// (embudo, tráfico, WhatsApp, materiales) y Se fueron (abandonos). Un solo
// periodo para todo. Solo lectura, calculado en el navegador: el volumen es el
// de un taller pequeño.

import { useMemo, useState } from 'react';
import type { Cobro, Quote, QuoteEstado, QuoteEvento, Recibo } from '@/lib/types';
import { AdminCabecera } from '../_components/AdminNav';
import { ErrorBanner } from '../_components/ErrorBanner';
import { Abandonos } from './Abandonos';
import { PanelDinero, PanelPedidos, Tarjeta, useDinero, type FilaPedido } from './Dinero';
import { Pestanas } from '../_components/Pestanas';
import { Bar, Cifra } from './Bar';
import { PERIODOS, spanDe, type PeriodoId } from '@/lib/quote/dinero';
import { etiquetaOrigen } from '@/lib/tracking';

type Fila = [string, { visitas: number; solicitudes: number }];

/** Sessions per key, and how many of them sent a request. */
function porClave(claves: Map<string, string>, solicitaron: Set<string>): Fila[] {
  const m = new Map<string, { visitas: number; solicitudes: number }>();
  for (const [sesion, k] of claves) {
    const r = m.get(k) ?? { visitas: 0, solicitudes: 0 };
    r.visitas++;
    if (solicitaron.has(sesion)) r.solicitudes++;
    m.set(k, r);
  }
  return [...m].sort((a, b) => b[1].visitas - a[1].visitas);
}

const VISTAS = [
  { value: 'dinero', label: 'Dinero' },
  { value: 'pedidos', label: 'Pedidos' },
  { value: 'tasador', label: 'Tasador' },
  { value: 'abandonos', label: 'Se fueron' }
];

const ESTADOS_EN_FIRME: QuoteEstado[] = ['aceptado', 'imprimiendo', 'listo', 'entregado'];

export type Datos = {
  quotes: Quote[];
  eventos: QuoteEvento[];
  filas: FilaPedido[];
  cobros: Cobro[];
  recibos: Recibo[];
};

/** La página sin la carga: page.tsx le pasa los datos (y así se puede probar con datos de ejemplo). */
export function Estadisticas({ quotes, eventos, filas, cobros, recibos, error }: Datos & { error?: string | null }) {
  const [periodo, setPeriodo] = useState<PeriodoId>('30');
  const [mes, setMes] = useState('');
  const [vista, setVista] = useState('dinero');

  // Un mes concreto tiene prioridad sobre las píldoras mientras esté puesto.
  const span = useMemo(() => spanDe(mes ? 'concreto' : periodo, mes), [periodo, mes]);
  const desde = span.from;

  const stats = useMemo(() => {
    // Archivar un pedido terminado (0027) no lo borra de la historia; el resto
    // de archivados son descartes a mano o pedidos borrados en la Calculadora.
    const visibles = quotes.filter(
      (q) => !q.archivado || q.estado === 'entregado' || q.estado === 'rechazado'
    );
    // Lo del tasador: los pedidos hechos a mano en la Calculadora (origen
    // 'calculadora', 0027) no pasaron por el embudo web. Dinero y pipeline sí.
    const web = visibles.filter((q) => q.origen !== 'calculadora');
    const periodo = web.filter((q) => new Date(q.created_at).getTime() >= desde && new Date(q.created_at).getTime() <= span.to);

    // Material mix (top-level material can be "PLA, PETG" for mixed orders).
    const porMaterial = new Map<string, number>();
    for (const q of periodo) {
      for (const m of q.material.split(',').map((x) => x.trim()).filter(Boolean)) {
        porMaterial.set(m, (porMaterial.get(m) ?? 0) + 1);
      }
    }

    // Weekly volume, last 8 weeks.
    const semanas: { label: string; count: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const fin = Date.now() - w * 7 * 24 * 3600 * 1000;
      const ini = fin - 7 * 24 * 3600 * 1000;
      const count = web.filter((q) => {
        const t = new Date(q.created_at).getTime();
        return t > ini && t <= fin;
      }).length;
      const d = new Date(ini);
      semanas.push({
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        count
      });
    }

    // Funnel from anonymous events (selected period), per session so a
    // double submit or several PDFs don't inflate the rates.
    const ev = eventos.filter((e) => new Date(e.created_at).getTime() >= desde);
    const sesiones = (tipo: QuoteEvento['evento']) =>
      new Set(ev.filter((e) => e.evento === tipo && e.session_id).map((e) => e.session_id));
    const conPieza = sesiones('pieza_anadida');
    const conPrecio = sesiones('precio_visto');
    const conSolicitud = sesiones('solicitud_enviada');
    const conPdf = sesiones('pdf_descargado');
    // Solo el botón «Pedir por WhatsApp» del tasador lleva sesión (el flotante no).
    const conWhatsapp = sesiones('whatsapp_clic');
    const conVisita = sesiones('visita');
    const conFormulario = sesiones('formulario_abierto');
    const conError = sesiones('formulario_error');

    // Where visits come from and on what device (one 'visita' per session).
    const origen = new Map<string, string>();
    const dispositivo = new Map<string, string>();
    // Postcode chosen for shipping, last one per session: local or national.
    const zona = new Map<string, string>();
    const errores = new Map<string, number>();
    for (const e of [...ev].reverse()) {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      if (!e.session_id) continue;
      if (e.evento === 'visita') {
        origen.set(e.session_id, etiquetaOrigen(p));
        dispositivo.set(e.session_id, p.dispositivo === 'movil' ? 'Móvil' : 'Escritorio');
      } else if (e.evento === 'precio_visto' || e.evento === 'solicitud_enviada') {
        const cp = typeof p.cp === 'string' ? p.cp : '';
        zona.set(
          e.session_id,
          p.entrega !== 'envio' ? 'Recogida (local)' : !cp ? 'Envío, sin CP' : cp.startsWith('37') ? 'Envío a Salamanca' : `Envío CP ${cp.slice(0, 2)}…`
        );
      } else if (e.evento === 'formulario_error') {
        const m = String(p.motivo ?? '?');
        errores.set(m, (errores.get(m) ?? 0) + 1);
      }
    }
    // Vieron el precio y se fueron sin solicitar ni descargar el PDF.
    const abandonos = [...conPrecio].filter((s) => !conSolicitud.has(s) && !conPdf.has(s) && !conWhatsapp.has(s)).length;
    // Se fueron mientras se laminaba (o el archivo no se pudo tasar). Solo
    // desde el primer 'precio_visto': antes el tasador no lo mandaba y toda
    // sesión antigua contaría aquí.
    const inicioPrecio = Math.min(
      ...eventos.filter((e) => e.evento === 'precio_visto').map((e) => new Date(e.created_at).getTime())
    );
    const antesDelPrecio = new Set(
      ev
        .filter(
          (e) =>
            e.evento === 'pieza_anadida' &&
            e.session_id &&
            !conPrecio.has(e.session_id) &&
            new Date(e.created_at).getTime() >= inicioPrecio
        )
        .map((e) => e.session_id)
    ).size;
    // From the quotes, not the 'aceptado' event: that one also fires for
    // Calculadora orders and misses acceptances made from the admin.
    // Clics en cualquier enlace de WhatsApp, por página (WhatsAppFAB).
    const porPagina = new Map<string, number>();
    for (const e of ev) {
      if (e.evento !== 'whatsapp_clic') continue;
      const pagina = String((e.payload as { pagina?: unknown })?.pagina ?? '?');
      porPagina.set(pagina, (porPagina.get(pagina) ?? 0) + 1);
    }
    const whatsapp = [...porPagina.entries()].sort((a, b) => b[1] - a[1]);
    const aceptados = periodo.filter(
      (q) => q.aceptado_at != null || ESTADOS_EN_FIRME.includes(q.estado)
    ).length;

    return {
      porMaterial: [...porMaterial.entries()].sort((a, b) => b[1] - a[1]),
      semanas,
      whatsapp,
      porOrigen: porClave(origen, conSolicitud),
      porDispositivo: porClave(dispositivo, conSolicitud),
      porZona: porClave(zona, conSolicitud),
      errores: [...errores].sort((a, b) => b[1] - a[1]),
      funnel: {
        visitas: conVisita.size,
        formularios: conFormulario.size,
        conError: conError.size,
        sesionesConPieza: conPieza.size,
        precioVisto: conPrecio.size,
        antesDelPrecio,
        solicitudes: conSolicitud.size,
        pdfs: conPdf.size,
        whatsapp: conWhatsapp.size,
        abandonos,
        aceptados
      }
    };
  }, [quotes, eventos, desde, span.to]);

  const dinero = useDinero({ filas, quotes, cobros, recibos, span });

  const maxMaterial = Math.max(1, ...stats.porMaterial.map(([, c]) => c));
  const maxSemana = Math.max(1, ...stats.semanas.map((s) => s.count));
  const f = stats.funnel;
  const convSolicitud = f.sesionesConPieza > 0 ? (f.solicitudes / f.sesionesConPieza) * 100 : 0;
  const convAceptado = f.solicitudes > 0 ? (f.aceptados / f.solicitudes) * 100 : 0;
  const topEmbudo = Math.max(1, f.visitas, f.sesionesConPieza);
  const pctAbandono = f.precioVisto > 0 ? (f.abandonos / f.precioVisto) * 100 : 0;

  const lista = (titulo: string, filas: Fila[]) => (
    <Tarjeta key={titulo} titulo={titulo}>
      {filas.slice(0, 8).map(([k, r]) => (
        <Bar key={k} label={k} value={r.visitas} max={Math.max(1, filas[0][1].visitas)} suffix={` · ${r.solicitudes} sol.`} />
      ))}
      {!filas.length && <p className="hoy-vacio">Sin datos aún.</p>}
    </Tarjeta>
  );

  return (
    <div>
      <AdminCabecera titulo="Estadísticas">
        El periodo elegido vale para todas las pestañas.
      </AdminCabecera>
      <div className="est-periodo" role="group" aria-label="Periodo">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={!mes && periodo === p.id}
            className={'pq-filter' + (!mes && periodo === p.id ? ' active' : '')}
            onClick={() => { setMes(''); setPeriodo(p.id); }}
          >
            {p.label}
          </button>
        ))}
        <input type="month" aria-label="Un mes concreto" value={mes} onChange={(e) => setMes(e.target.value)} />
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="est-pestanas">
        <Pestanas id="est" etiqueta="Qué mirar" value={vista} onChange={setVista} pestanas={VISTAS} />
      </div>

      <div role="tabpanel" id="est-panel" aria-labelledby={`est-${vista}`}>
        {vista === 'dinero' && <PanelDinero d={dinero} />}
        {vista === 'pedidos' && <PanelPedidos d={dinero} />}

        {vista === 'tasador' && (
          <>
            <div className="est-cifras">
              <Cifra label="Visitas" valor={f.visitas} nota="al tasador" />
              <Cifra label="Solicitudes" valor={f.solicitudes} nota={`${f.aceptados} aceptadas`} />
              <Cifra label="Conversión" valor={`${convSolicitud.toFixed(0)} %`} nota="de quien sube pieza, solicita" />
              <Cifra label="Aceptación" valor={`${convAceptado.toFixed(0)} %`} nota="de las solicitudes" />
              <Cifra label="Abandono" valor={`${pctAbandono.toFixed(0)} %`} nota="tras ver el precio" />
            </div>
            <div className="est-grid">
              <Tarjeta titulo="Embudo">
                {([
                  ['Visitaron', f.visitas],
                  ['Subieron pieza', f.sesionesConPieza],
                  ['Vieron el precio', f.precioVisto],
                  ['Solicitaron', f.solicitudes],
                  ['Aceptaron', f.aceptados]
                ] as const).map(([l, v], i, todos) => (
                  <Bar
                    key={l}
                    label={l}
                    value={v}
                    max={topEmbudo}
                    // Qué parte del paso anterior llega a este.
                    texto={i > 0 && todos[i - 1][1] > 0 ? `${v} · ${Math.round((v / todos[i - 1][1]) * 100)} %` : String(v)}
                  />
                ))}
                <h3 className="est-sub">Por el camino</h3>
                <Bar tenue label="Antes del precio" value={f.antesDelPrecio} max={topEmbudo} />
                <Bar tenue label="Se fueron sin más" value={f.abandonos} max={topEmbudo} />
                <Bar tenue label="Descargaron PDF" value={f.pdfs} max={topEmbudo} />
                <Bar tenue label="Abrieron formulario" value={f.formularios} max={topEmbudo} />
                <Bar tenue label="Error en formulario" value={f.conError} max={topEmbudo} />
                <Bar tenue label="Pidieron por WhatsApp" value={f.whatsapp} max={topEmbudo} />
                <p className="est-nota">El % es cuántos del paso anterior llegan a este.</p>
              </Tarjeta>

              <Tarjeta titulo="Solicitudes por semana (8 semanas)">
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120 }}>
                  {stats.semanas.map((s, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{s.count}</span>
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 48,
                          height: `${Math.max(3, (s.count / maxSemana) * 80)}px`,
                          background: 'var(--accent)',
                          opacity: s.count > 0 ? 1 : 0.25,
                          borderRadius: '4px 4px 0 0'
                        }}
                      />
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </Tarjeta>

              {lista('Origen', stats.porOrigen)}
              {lista('Dispositivo', stats.porDispositivo)}
              {lista('Entrega', stats.porZona)}

              <Tarjeta titulo={`Clics en WhatsApp · ${stats.whatsapp.reduce((n, [, c]) => n + c, 0)}`}>
                {stats.whatsapp.slice(0, 8).map(([pagina, c]) => (
                  <Bar key={pagina} label={pagina} value={c} max={Math.max(1, stats.whatsapp[0][1])} />
                ))}
                {!stats.whatsapp.length && <p className="hoy-vacio">Sin clics en el periodo.</p>}
              </Tarjeta>

              <Tarjeta titulo="Materiales solicitados">
                {stats.porMaterial.map(([mat, count]) => (
                  <Bar key={mat} label={mat} value={count} max={maxMaterial} />
                ))}
                {!stats.porMaterial.length && <p className="hoy-vacio">Sin solicitudes en el periodo.</p>}
              </Tarjeta>

              {stats.errores.length > 0 && (
                <Tarjeta titulo="Errores del formulario">
                  {stats.errores.slice(0, 6).map(([m, c]) => (
                    <Bar key={m} label={m} value={c} max={stats.errores[0][1]} />
                  ))}
                </Tarjeta>
              )}
            </div>
            <p className="est-nota">
              Las visitas no incluyen tus sesiones: el navegador que entra al admin (o abre la web con
              ?no-rastrear=1) no cuenta. «sol.» = cuántas de esas visitas acabaron en solicitud.
            </p>
          </>
        )}

        {vista === 'abandonos' && (
          <section className="adm-card">
            <h2 className="adm-card-titulo">Se fueron sin pedir</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '-4px 0 12px' }}>
              Cada visita anónima que subió algo y no envió la solicitud: qué subió, cuántas veces y el
              último precio que vio. «También en otras visitas» es la misma pieza subida otro día o por
              otra persona. Las miniaturas se borran a los 30 días.
            </p>
            <Abandonos eventos={eventos} desde={desde} />
          </section>
        )}
      </div>
    </div>
  );
}
