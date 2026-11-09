'use client';

// Tasador analytics: request pipeline, funnel (quote_events), revenue and
// material mix. Read-only — everything is computed client-side from two
// queries, fine for a hobby-scale volume.

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Quote, QuoteEstado, QuoteEvento } from '@/lib/types';
import { AccesoDenegado, useAdminAuth } from '../_components/useAdminAuth';
import { AdminCabecera } from '../_components/AdminNav';
import { Abandonos } from './Abandonos';
import { euros } from '@/lib/recibo/types';
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

const ESTADO_LABEL: Record<QuoteEstado, string> = {
  nuevo: 'Nuevo',
  revisado: 'Revisado',
  aceptado: 'Aceptado',
  imprimiendo: 'Imprimiendo',
  listo: 'Listo',
  entregado: 'Entregado',
  rechazado: 'Rechazado'
};

const ESTADO_COLOR: Record<QuoteEstado, string> = {
  nuevo: '#0EA5E9',
  revisado: '#a855f7',
  aceptado: '#eab308',
  imprimiendo: '#f97316',
  listo: '#10b981',
  entregado: '#6b7280',
  rechazado: '#ef4444'
};

const ORDEN_ESTADOS: QuoteEstado[] = [
  'nuevo', 'revisado', 'aceptado', 'imprimiendo', 'listo', 'entregado', 'rechazado'
];

const ESTADOS_EN_FIRME: QuoteEstado[] = ['aceptado', 'imprimiendo', 'listo', 'entregado'];

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  padding: 20,
  marginBottom: 20
};

const h2Style: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  marginBottom: 14
};

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        padding: '16px 20px',
        minWidth: 150,
        flex: '1 1 150px'
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  color,
  suffix
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  suffix?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <span style={{ width: 110, fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 4, height: 18, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            minWidth: value > 0 ? 4 : 0,
            height: '100%',
            background: color,
            borderRadius: 4,
            transition: 'width 0.4s'
          }}
        />
      </div>
      <span style={{ width: 70, fontSize: 12, fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>
        {value}
        {suffix ?? ''}
      </span>
    </div>
  );
}

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

export default function AdminEstadisticas() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [eventos, setEventos] = useState<QuoteEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
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
        .limit(5000)
    ]).then(([qres, eres]) => {
      setQuotes((qres.data as Quote[]) ?? []);
      setEventos((eres.data as QuoteEvento[]) ?? []);
      setLoading(false);
    });
  }, []);

  const desde = useMemo(() => Date.now() - dias * 24 * 3600 * 1000, [dias]);

  const stats = useMemo(() => {
    // Archivar un pedido terminado (0027) no lo borra de la historia; el resto
    // de archivados son descartes a mano o pedidos borrados en la Calculadora.
    const visibles = quotes.filter(
      (q) => !q.archivado || q.estado === 'entregado' || q.estado === 'rechazado'
    );
    // Lo del tasador: los pedidos hechos a mano en la Calculadora (origen
    // 'calculadora', 0027) no pasaron por el embudo web. Dinero y pipeline sí.
    const web = visibles.filter((q) => q.origen !== 'calculadora');
    const periodo = web.filter((q) => new Date(q.created_at).getTime() >= desde);

    const porEstado = new Map<QuoteEstado, number>();
    for (const e of ORDEN_ESTADOS) porEstado.set(e, 0);
    for (const q of visibles) porEstado.set(q.estado, (porEstado.get(q.estado) ?? 0) + 1);

    const avanzados = visibles.filter((q) => ESTADOS_EN_FIRME.includes(q.estado));
    const entregados = visibles.filter((q) => q.estado === 'entregado');

    const ingresos = visibles.reduce((s, q) => s + num(q.importe_pagado), 0);
    const confirmado = avanzados.reduce(
      (s, q) => s + (q.precio_final != null ? num(q.precio_final) : num(q.precio_total)),
      0
    );
    const ticketMedio = avanzados.length ? confirmado / avanzados.length : 0;

    const pesoG = avanzados.reduce((s, q) => s + num((q.metricas as any)?.peso_g), 0);
    const horas = avanzados.reduce((s, q) => s + num((q.metricas as any)?.tiempo_h), 0);

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
    const abandonos = [...conPrecio].filter((s) => !conSolicitud.has(s) && !conPdf.has(s)).length;
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
      total: web.length,
      periodo: periodo.length,
      porEstado,
      avanzados: avanzados.length,
      entregados: entregados.length,
      ingresos,
      confirmado,
      ticketMedio,
      pesoG,
      horas,
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
        abandonos,
        aceptados
      }
    };
  }, [quotes, eventos, desde]);

  if (authed === false) return <AccesoDenegado />;
  if (loading) return <p style={{ color: 'var(--muted)' }}>Cargando…</p>;

  const maxEstado = Math.max(1, ...[...stats.porEstado.values()]);
  const maxMaterial = Math.max(1, ...stats.porMaterial.map(([, c]) => c));
  const maxSemana = Math.max(1, ...stats.semanas.map((s) => s.count));
  const f = stats.funnel;
  const convSolicitud = f.sesionesConPieza > 0 ? (f.solicitudes / f.sesionesConPieza) * 100 : 0;
  const convAceptado = f.solicitudes > 0 ? (f.aceptados / f.solicitudes) * 100 : 0;
  const topEmbudo = Math.max(1, f.visitas, f.sesionesConPieza);
  const pctAbandono = f.precioVisto > 0 ? (f.abandonos / f.precioVisto) * 100 : 0;

  return (
    <div>
      <AdminCabecera
        titulo="Estadísticas del tasador"
        acciones={
        <div style={{ display: 'flex', gap: 8 }}>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              className={d === dias ? 'btn-primary' : 'btn-outline'}
              style={{ padding: '6px 14px', fontSize: 11 }}
              onClick={() => setDias(d)}
            >
              {d} días
            </button>
          ))}
        </div>
        }
      >
        El embudo, las solicitudes y los materiales son solo del tasador web y
        usan el periodo seleccionado; pipeline e importes son históricos e
        incluyen los pedidos de la Calculadora.
      </AdminCabecera>

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <Kpi label="Solicitudes" value={String(stats.total)} sub={`${stats.periodo} en ${dias} días`} />
        <Kpi label="Pedidos en firme" value={String(stats.avanzados)} sub={`${stats.entregados} entregados`} />
        <Kpi label="Cobrado" value={`${euros(stats.ingresos)}`} sub={`${euros(stats.confirmado)} confirmados`} />
        <Kpi label="Ticket medio" value={`${euros(stats.ticketMedio)}`} sub="pedidos aceptados o más" />
        <Kpi
          label="Material impreso"
          value={stats.pesoG >= 1000 ? `${(stats.pesoG / 1000).toFixed(1)} kg` : `${Math.round(stats.pesoG)} g`}
          sub={`~${Math.round(stats.horas)} h de impresión`}
        />
      </div>

      {/* Funnel */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Embudo ({dias} días)</h2>
        <Bar label="Visitaron" value={f.visitas} max={topEmbudo} color="#6b7280" />
        <Bar label="Subieron pieza" value={f.sesionesConPieza} max={topEmbudo} color="#0EA5E9" />
        <Bar label="Antes del precio" value={f.antesDelPrecio} max={topEmbudo} color="#6b7280" />
        <Bar label="Vieron el precio" value={f.precioVisto} max={topEmbudo} color="#0EA5E9" />
        <Bar label="Se fueron sin más" value={f.abandonos} max={topEmbudo} color="#ef4444" />
        <Bar label="Descargaron PDF" value={f.pdfs} max={topEmbudo} color="#eab308" />
        <Bar label="Abrieron formulario" value={f.formularios} max={topEmbudo} color="#a855f7" />
        <Bar label="Error en formulario" value={f.conError} max={topEmbudo} color="#ef4444" />
        <Bar label="Solicitaron" value={f.solicitudes} max={topEmbudo} color="#a855f7" />
        <Bar label="Aceptaron" value={f.aceptados} max={topEmbudo} color="#10b981" />
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          Conversión a solicitud: <strong>{convSolicitud.toFixed(0)}%</strong> ·
          solicitud → aceptado: <strong>{convAceptado.toFixed(0)}%</strong> ·
          abandono tras ver el precio: <strong>{pctAbandono.toFixed(0)}%</strong>
        </p>
      </section>

      {/* Who left without asking */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Se fueron sin pedir ({dias} días)</h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '-4px 0 12px' }}>
          Cada visita anónima que subió algo y no envió la solicitud: qué subió, cuántas veces y el
          último precio que vio. «También en otras visitas» es la misma pieza subida otro día o por
          otra persona. Las miniaturas se borran a los 30 días.
        </p>
        <Abandonos eventos={eventos} desde={desde} />
      </section>

      {/* Traffic */}
      <section style={cardStyle}>
        <h2 style={h2Style}>De dónde vienen ({dias} días)</h2>
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
      <section style={cardStyle}>
        <h2 style={h2Style}>
          Clics en WhatsApp ({dias} días): {stats.whatsapp.reduce((n, [, c]) => n + c, 0)}
        </h2>
        {stats.whatsapp.slice(0, 8).map(([pagina, c]) => (
          <Bar key={pagina} label={pagina} value={c} max={Math.max(1, stats.whatsapp[0][1])} color="#15803d" />
        ))}
      </section>

      {/* Pipeline */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Pipeline (histórico)</h2>
        {ORDEN_ESTADOS.map((e) => (
          <Bar
            key={e}
            label={ESTADO_LABEL[e]}
            value={stats.porEstado.get(e) ?? 0}
            max={maxEstado}
            color={ESTADO_COLOR[e]}
          />
        ))}
      </section>

      {/* Weekly volume */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Solicitudes por semana (8 semanas)</h2>
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
      <section style={cardStyle}>
        <h2 style={h2Style}>Materiales solicitados ({dias} días)</h2>
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
