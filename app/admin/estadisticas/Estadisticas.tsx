'use client';

// Dinero → Estadísticas: arriba el dinero del taller (Dinero.tsx: facturado,
// cobrado, beneficio, quién debe, aceptación, plazos, riesgo, tasador); debajo,
// lo del tasador web (embudo, abandonos, tráfico, WhatsApp, materiales). Un
// solo periodo para todo. Solo lectura, calculado en el navegador: el volumen
// es el de un taller pequeño.

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Cobro, Quote, QuoteEstado, QuoteEvento, Recibo } from '@/lib/types';
import { AccesoDenegado, useAdminAuth } from '../_components/useAdminAuth';
import { AdminCabecera } from '../_components/AdminNav';
import { ErrorBanner } from '../_components/ErrorBanner';
import { mensajeDeError } from '@/lib/errors';
import { Abandonos } from './Abandonos';
import { Dinero, type FilaPedido } from './Dinero';
import { Bar } from './Bar';
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

const ESTADOS_EN_FIRME: QuoteEstado[] = ['aceptado', 'imprimiendo', 'listo', 'entregado'];

export default function AdminEstadisticas() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [eventos, setEventos] = useState<QuoteEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filas, setFilas] = useState<FilaPedido[]>([]);
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<PeriodoId>('30');
  const [mes, setMes] = useState('');
  const { authed } = useAdminAuth();

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
      supabase
        .from('quote_events')
        .select('*')
        .gte('created_at', new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase.from('orders').select('id, quote_id, data').eq('empresa', '3dcc'),
      supabase.from('cobros').select('*').eq('empresa', '3dcc'),
      supabase.from('recibos').select('id, codigo, cobro_id, anulado_at')
    ]).then(([qres, eres, ores, cres, rres]) => {
      const fallo = [qres, ores, cres].find((r) => r.error)?.error;
      if (fallo) setError(mensajeDeError(fallo, 'No se pudieron cargar todos los datos'));
      setQuotes((qres.data as Quote[]) ?? []);
      setEventos((eres.data as QuoteEvento[]) ?? []);
      setFilas((ores.data as unknown as FilaPedido[]) ?? []);
      setCobros((cres.data as unknown as Cobro[]) ?? []);
      setRecibos((rres.data as unknown as Recibo[]) ?? []);
      setLoading(false);
    });
  }, []);

  // Un mes concreto tiene prioridad sobre las píldoras mientras esté puesto.
  const span = useMemo(() => spanDe(mes ? 'concreto' : periodo, mes), [periodo, mes]);
  const desde = span.from;
  const etiqueta = mes
    ? new Date(span.from).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    : (PERIODOS.find((x) => x.id === periodo)?.label ?? '').toLowerCase();

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

  if (authed === false) return <AccesoDenegado />;
  if (loading) return <p style={{ color: 'var(--muted)' }}>Cargando…</p>;

  const maxMaterial = Math.max(1, ...stats.porMaterial.map(([, c]) => c));
  const maxSemana = Math.max(1, ...stats.semanas.map((s) => s.count));
  const f = stats.funnel;
  const convSolicitud = f.sesionesConPieza > 0 ? (f.solicitudes / f.sesionesConPieza) * 100 : 0;
  const convAceptado = f.solicitudes > 0 ? (f.aceptados / f.solicitudes) * 100 : 0;
  const topEmbudo = Math.max(1, f.visitas, f.sesionesConPieza);
  const pctAbandono = f.precioVisto > 0 ? (f.abandonos / f.precioVisto) * 100 : 0;

  return (
    <div>
      <AdminCabecera titulo="Estadísticas">
        El dinero sale de los pedidos y del libro de cobros; el embudo, las visitas y los materiales son solo
        del tasador web. Todo usa el mismo periodo.
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

      <Dinero filas={filas} quotes={quotes} cobros={cobros} recibos={recibos} span={span} />

      <h2 className="est-titulo">Tasador web</h2>

      {/* Funnel */}
      <section className="adm-card">
        <h2 className="adm-card-titulo">Embudo ({etiqueta})</h2>
        <Bar label="Visitaron" value={f.visitas} max={topEmbudo} color="#6b7280" />
        <Bar label="Subieron pieza" value={f.sesionesConPieza} max={topEmbudo} color="#0EA5E9" />
        <Bar label="Antes del precio" value={f.antesDelPrecio} max={topEmbudo} color="#6b7280" />
        <Bar label="Vieron el precio" value={f.precioVisto} max={topEmbudo} color="#0EA5E9" />
        <Bar label="Se fueron sin más" value={f.abandonos} max={topEmbudo} color="#ef4444" />
        <Bar label="Descargaron PDF" value={f.pdfs} max={topEmbudo} color="#eab308" />
        <Bar label="Abrieron formulario" value={f.formularios} max={topEmbudo} color="#a855f7" />
        <Bar label="Error en formulario" value={f.conError} max={topEmbudo} color="#ef4444" />
        <Bar label="Solicitaron" value={f.solicitudes} max={topEmbudo} color="#a855f7" />
        <Bar label="Pidieron por WhatsApp" value={f.whatsapp} max={topEmbudo} color="#25D366" />
        <Bar label="Aceptaron" value={f.aceptados} max={topEmbudo} color="#10b981" />
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          Conversión a solicitud: <strong>{convSolicitud.toFixed(0)}%</strong> ·
          solicitud → aceptado: <strong>{convAceptado.toFixed(0)}%</strong> ·
          abandono tras ver el precio: <strong>{pctAbandono.toFixed(0)}%</strong>
        </p>
      </section>

      {/* Who left without asking */}
      <section className="adm-card">
        <h2 className="adm-card-titulo">Se fueron sin pedir ({etiqueta})</h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '-4px 0 12px' }}>
          Cada visita anónima que subió algo y no envió la solicitud: qué subió, cuántas veces y el
          último precio que vio. «También en otras visitas» es la misma pieza subida otro día o por
          otra persona. Las miniaturas se borran a los 30 días.
        </p>
        <Abandonos eventos={eventos} desde={desde} />
      </section>

      {/* Traffic */}
      <section className="adm-card">
        <h2 className="adm-card-titulo">De dónde vienen ({etiqueta})</h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '-4px 0 12px' }}>
          Visitas al tasador y, al lado, cuántas acabaron en solicitud. Sin tus sesiones: el
          navegador que entra al admin (o abre la web con ?no-rastrear=1) no cuenta.
        </p>
        {[
          ['Origen', stats.porOrigen],
          ['Dispositivo', stats.porDispositivo],
          ['Entrega', stats.porZona]
        ].map(([titulo, filas]) => (
          <div key={titulo as string} style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 6px' }}>{titulo as string}</h3>
            {(filas as Fila[]).slice(0, 8).map(([k, r]) => (
              <Bar key={k} label={k} value={r.visitas} max={Math.max(1, (filas as Fila[])[0][1].visitas)} color="#0EA5E9" suffix={` · ${r.solicitudes} sol.`} />
            ))}
            {!(filas as Fila[]).length && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Sin datos aún.</p>}
          </div>
        ))}
        {stats.errores.length > 0 && (
          <>
            <h3 style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 6px' }}>Errores del formulario</h3>
            {stats.errores.slice(0, 6).map(([m, c]) => (
              <Bar key={m} label={m} value={c} max={stats.errores[0][1]} color="#ef4444" />
            ))}
          </>
        )}
      </section>

      {/* WhatsApp */}
      <section className="adm-card">
        <h2 className="adm-card-titulo">
          Clics en WhatsApp ({etiqueta}): {stats.whatsapp.reduce((n, [, c]) => n + c, 0)}
        </h2>
        {stats.whatsapp.slice(0, 8).map(([pagina, c]) => (
          <Bar key={pagina} label={pagina} value={c} max={Math.max(1, stats.whatsapp[0][1])} color="#15803d" />
        ))}
      </section>

      {/* Weekly volume */}
      <section className="adm-card">
        <h2 className="adm-card-titulo">Solicitudes por semana (8 semanas)</h2>
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
      </section>

      {/* Materials */}
      <section className="adm-card">
        <h2 className="adm-card-titulo">Materiales solicitados ({etiqueta})</h2>
        {stats.porMaterial.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin solicitudes en el periodo.</p>
        )}
        {stats.porMaterial.map(([mat, count]) => (
          <Bar key={mat} label={mat} value={count} max={maxMaterial} color="#0EA5E9" />
        ))}
      </section>
    </div>
  );
}
