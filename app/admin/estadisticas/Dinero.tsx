'use client';

// Dinero del taller: lo que entra, lo que se debe, si se aceptan los
// presupuestos, si se cumplen los plazos y si los precios aciertan. Todo sale
// de los pedidos (orders.data), el libro de cobros y las solicitudes, con las
// reglas de la Calculadora 7.2 (lib/quote/dinero.ts). Solo barras y tablas.
// useDinero calcula una vez; Kpis, PanelDinero y PanelPedidos lo pintan en
// sitios distintos de la página (cifras arriba y una pestaña cada uno).

import { useMemo } from 'react';
import Link from 'next/link';
import type { Cobro, Quote, Recibo } from '@/lib/types';
import { euros } from '@/lib/recibo/types';
import { formatHoras, formatNumero } from '@/lib/quote/formatos';
import { percentil } from '@/lib/quote/estadistica';
import { hoyMadrid } from '@/lib/quote/pricing';
import {
  TRAMOS, aceptacion, aciertoRiesgo, caja, csvPedidos, deudas, enSpan, puntualidad, recurrentes, resumen, tramoDe,
  type Pedido, type Span
} from '@/lib/quote/dinero';
import { Bar, Cifra } from './Bar';

export type FilaPedido = { id: string; quote_id: string | null; data: Pedido };

const pct = (n: number) => `${Math.round(n)} %`;
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-ES');
const vacio = <p className="hoy-vacio">Sin datos en este periodo.</p>;

export function Tarjeta({ titulo, children, ancha }: { titulo: string; children: React.ReactNode; ancha?: boolean }) {
  return (
    <section className={'adm-card' + (ancha ? ' est-ancha' : '')}>
      <h2 className="adm-card-titulo">{titulo}</h2>
      {children}
    </section>
  );
}

export function useDinero({
  filas,
  quotes,
  cobros,
  recibos,
  span
}: {
  filas: FilaPedido[];
  quotes: Quote[];
  cobros: Cobro[];
  recibos: Recibo[];
  span: Span;
}) {
  const d = useMemo(() => {
    const pedidos = filas.map((f) => f.data);
    const r = resumen(pedidos, span);
    const c = caja(cobros, span);
    const debe = deudas(pedidos);
    const origenDe = new Map(quotes.map((q) => [q.id, q.origen === 'web' ? 'Tasador web' : 'Encargo']));
    const porOrigen = ['Encargo', 'Tasador web'].map((o) => ({
      nombre: o,
      ...aceptacion(filas.filter((f) => r.emitidos.includes(f.data) && (origenDe.get(f.quote_id ?? '') ?? 'Encargo') === o).map((f) => f.data))
    }));
    const porTramo = TRAMOS.map((t, i) => ({
      nombre: t.label,
      ...aceptacion(r.emitidos.filter((o) => tramoDe(Number(o.precio_final) || 0) === i))
    }));
    // Puntualidad: solicitudes terminadas en el periodo (por la fecha en que quedaron listas).
    const terminadas = quotes.filter((q) => q.listo_at && enSpan(new Date(q.listo_at).getTime(), span));
    const pun = puntualidad(terminadas, hoyMadrid());
    const vencidas = puntualidad(quotes.filter((q) => ['aceptado', 'imprimiendo'].includes(q.estado) && !q.archivado), hoyMadrid()).vencidosSinTerminar;
    // Tasador: coste estimado frente a real, de las solicitudes web del periodo.
    const midi = quotes.filter(
      (q) => q.origen === 'web' && q.coste_estimado != null && q.coste_real != null && Number(q.coste_estimado) > 0 &&
        enSpan(new Date(q.created_at).getTime(), span)
    );
    const ratios = midi.map((q) => Number(q.coste_real) / Number(q.coste_estimado));
    return {
      r, c, debe, porOrigen, porTramo, pun, vencidas,
      acept: aceptacion(r.emitidos),
      riesgo: aciertoRiesgo(r.comprometidos),
      repiten: recurrentes(r.comprometidos).slice(0, 5),
      tasador: {
        n: midi.length,
        mediana: ratios.length ? percentil(ratios, 0.5) : 0,
        p90: ratios.length ? percentil(ratios, 0.9) : 0,
        desvio: midi.reduce((s, q) => s + Number(q.desvio_coste ?? 0), 0)
      },
      cobrosLista: cobros
        .filter((x) => !x.anulado_at && enSpan(new Date(x.cobrado_at).getTime(), span))
        .sort((a, b) => b.cobrado_at.localeCompare(a.cobrado_at))
    };
  }, [filas, quotes, cobros, span]);

  const quoteDe = useMemo(() => new Map(quotes.map((q) => [q.id, q])), [quotes]);
  // Cada pedido de taller con su solicitud (para enlazar a la ficha).
  const quoteDePedido = useMemo(() => new Map(filas.map((f) => [f.data, f.quote_id ? quoteDe.get(f.quote_id) : undefined])), [filas, quoteDe]);
  const reciboDe = useMemo(() => new Map(recibos.filter((x) => !x.anulado_at && x.cobro_id).map((x) => [x.cobro_id as string, x])), [recibos]);
  return { ...d, quoteDe, quoteDePedido, reciboDe, pendienteTotal: d.debe.reduce((s, x) => s + x.saldo, 0) };
}

type D = ReturnType<typeof useDinero>;

function Kpis({ d }: { d: D }) {
  return (
    <div className="est-cifras">
      <Cifra label="Facturado" valor={euros(d.r.facturado)} nota="pedidos aceptados" />
      <Cifra label="Cobrado" valor={euros(d.c.total)} nota={`${d.cobrosLista.length} cobro${d.cobrosLista.length === 1 ? '' : 's'}`} />
      <Cifra label="Beneficio" valor={euros(d.r.beneficio)} nota={d.r.facturado > 0 ? `margen ${pct(d.r.margenPct)}` : undefined} />
      <Cifra label="Por cobrar" valor={euros(d.pendienteTotal)} nota={`${d.debe.length} pedido${d.debe.length === 1 ? '' : 's'}, a día de hoy`} />
      <Cifra label="Beneficio / hora" valor={d.r.horas > 0 ? euros(d.r.beneficioHora) : '—'} nota="de impresora" />
    </div>
  );
}

/** Pestaña «Dinero»: por dónde entra, quién debe, quién repite. */
export function PanelDinero({ d }: { d: D }) {
  const { quoteDe, quoteDePedido, reciboDe } = d;
  function exportarCsv() {
    const blob = new Blob(['﻿' + csvPedidos(d.r.emitidos)], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pedidos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const deudor = ({ pedido: o, saldo, dias }: (typeof d.debe)[number]) => {
    const q = quoteDePedido.get(o);
    return (
      <li key={String(o.id)}>
        {q ? (
          <Link href={`/admin/presupuestos?abrir=${encodeURIComponent(q.codigo)}&pestana=cobros`} className="est-fila">
            <span><strong>{String(o.cliente || q.nombre)}</strong><small>{q.codigo} · hace {dias} día{dias === 1 ? '' : 's'}</small></span>
            <span className="adm-num">{euros(saldo)}</span>
          </Link>
        ) : (
          <span className="est-fila"><span><strong>{String(o.cliente)}</strong><small>hace {dias} días</small></span><span className="adm-num">{euros(saldo)}</span></span>
        )}
      </li>
    );
  };
  const maxMetodo = Math.max(1, ...d.c.porMetodo.map(([, v]) => v));
  return (
    <>
      <Kpis d={d} />
      <div className="est-grid">
      <Tarjeta titulo="¿Cuánto entra y por dónde?" ancha>
        {d.c.porMetodo.length === 0 ? vacio : (
          <>
            {d.c.porMetodo.map(([m, v]) => (
              <Bar key={m} label={m} value={v} max={maxMetodo} texto={euros(v)} />
            ))}
            <details className="est-mas">
            <summary>Ver los cobros ({d.cobrosLista.length})</summary>
            <table className="adm-tabla" style={{ marginTop: 8 }}>
              <thead>
                <tr><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>Método</th><th style={{ textAlign: 'right' }}>Importe</th><th>Justificante</th></tr>
              </thead>
              <tbody>
                {d.cobrosLista.map((x) => {
                  const q = x.quote_id ? quoteDe.get(x.quote_id) : undefined;
                  return (
                    <tr key={x.id}>
                      <td>{fechaCorta(x.cobrado_at)}</td>
                      <td data-label="Pedido">
                        {q ? <Link href={`/admin/presupuestos?abrir=${encodeURIComponent(q.codigo)}&pestana=cobros`} style={{ color: 'var(--accent)' }}>{q.codigo}</Link> : '—'}
                      </td>
                      <td data-label="Cliente">{q?.nombre ?? '—'}</td>
                      <td data-label="Método">{x.metodo || 'Sin registrar'}{x.tipo === 'ajuste' ? ' (ajuste)' : ''}</td>
                      <td data-label="Importe" className="adm-num">{euros(Number(x.importe))}</td>
                      <td data-label="Justificante">{reciboDe.get(x.id)?.codigo ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={4} style={{ textAlign: 'right' }}><strong>Total</strong></td><td className="adm-num"><strong>{euros(d.c.total)}</strong></td><td /></tr>
              </tfoot>
            </table>
            </details>
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo={`¿Quién debe? · ${euros(d.pendienteTotal)}`}>
        {d.debe.length === 0 ? <p className="hoy-vacio">Todo lo aceptado está cobrado.</p> : (
          <>
          <ul className="est-lista">{d.debe.slice(0, 5).map(deudor)}</ul>
          {d.debe.length > 5 && (
            <details className="est-mas">
              <summary>Ver los otros {d.debe.length - 5}</summary>
              <ul className="est-lista">{d.debe.slice(5).map(deudor)}</ul>
            </details>
          )}
          </>
        )}
      </Tarjeta>


      {d.repiten.length > 0 && (
        <Tarjeta titulo="Clientes que repiten">
          <ul className="est-lista">
            {d.repiten.map((c) => (
              <li key={c.nombre}><span className="est-fila"><span><strong>{c.nombre}</strong><small>{c.pedidos} pedidos</small></span><span className="adm-num">{euros(c.facturado)}</span></span></li>
            ))}
          </ul>
        </Tarjeta>
      )}
      </div>
      <p className="est-nota">
        <button type="button" className="btn-outline" disabled={d.r.emitidos.length === 0} onClick={exportarCsv}>Exportar los pedidos del periodo (CSV)</button>
      </p>
      {d.r.horas > 0 && <p className="est-nota">En el periodo: {formatHoras(d.r.horas)} de impresión y {formatNumero(d.r.gramos / 1000, 2)} kg.</p>}
    </>
  );
}

/** Pestaña «Pedidos»: aceptación, plazos, riesgo y acierto del tasador. */
export function PanelPedidos({ d }: { d: D }) {
  const filaAcept = (x: (typeof d.porOrigen)[number]) => (
    <tr key={x.nombre}>
      <td>{x.nombre}</td>
      <td data-label="Presupuestos" className="adm-num">{x.emitidos}</td>
      <td data-label="Aceptados" className="adm-num">{x.aceptados}</td>
      <td data-label="Descartados" className="adm-num">{x.descartados}</td>
      <td data-label="Abiertos" className="adm-num">{x.abiertos}</td>
      <td data-label="Aceptación" className="adm-num">{x.aceptados + x.descartados > 0 ? pct(x.conversionPct) : '—'}</td>
    </tr>
  );
  const cabAcept = (
    <thead>
      <tr><th /><th className="adm-num">Presupuestos</th><th className="adm-num">Aceptados</th><th className="adm-num">Descartados</th><th className="adm-num">Abiertos</th><th className="adm-num">Aceptación</th></tr>
    </thead>
  );

  const pun = d.pun.medidos > 0 ? pct(d.pun.enPlazoPct) : '—';
  return (
    <>
    <div className="est-cifras">
      <Cifra label="Aceptación" valor={d.acept.aceptados + d.acept.descartados > 0 ? pct(d.acept.conversionPct) : '—'} nota={`${d.acept.emitidos} presupuestos, ${d.acept.abiertos} abiertos`} />
      <Cifra label="En plazo" valor={pun} nota={d.vencidas > 0 ? `${d.vencidas} vencido${d.vencidas === 1 ? '' : 's'} en producción` : `${d.pun.medidos} terminados`} />
      <Cifra label="Reimpresiones" valor={d.riesgo.pedidos > 0 ? formatNumero(d.riesgo.realPorPedido, 2) : '—'} nota="por pedido" />
      <Cifra label="Tasador" valor={d.tasador.n > 0 ? formatNumero(d.tasador.mediana, 2) : '—'} nota="coste real ÷ estimado" />
    </div>
    <div className="est-grid">
      <Tarjeta titulo="¿Se aceptan los presupuestos?" ancha>
        {d.r.emitidos.length === 0 ? vacio : (
          <>
            <table className="adm-tabla">{cabAcept}<tbody>{d.porOrigen.map(filaAcept)}</tbody></table>
            <h3 className="est-sub">Por tramo de precio</h3>
            <table className="adm-tabla">{cabAcept}<tbody>{d.porTramo.map(filaAcept)}</tbody></table>
            <p className="est-nota">Aceptación = aceptados ÷ (aceptados + descartados). Si un tramo se descarta mucho, se corrige con el margen o el mínimo, no con el estimador.</p>
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="¿Se cumplen los plazos?">
        {d.pun.medidos === 0 && d.vencidas === 0 ? vacio : (
          <>
            {d.pun.medidos > 0 && (
              <p style={{ margin: '0 0 8px' }}>
                <strong>{pct(d.pun.enPlazoPct)}</strong> en plazo ({d.pun.enPlazo} de {d.pun.medidos} pedidos terminados).
                Retraso medio: {d.pun.desvioMedioDias > 0 ? '+' : ''}{formatNumero(d.pun.desvioMedioDias, 1)} días
                {d.pun.desvioMedioDias <= 0 ? ' (te adelantas)' : ''}.
              </p>
            )}
            {d.vencidas > 0 && <p style={{ margin: 0 }}>⚠ {d.vencidas} pedido{d.vencidas === 1 ? '' : 's'} en producción con la fecha tope vencida.</p>}
            <p className="est-nota">Fecha tope frente a la fecha en que el pedido quedó listo. Si casi siempre sobra, la holgura de Ajustes → Precios puede bajar.</p>
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="¿Acierta el riesgo?">
        {d.riesgo.pedidos === 0 ? vacio : (
          <>
            <p style={{ margin: '0 0 8px' }}>
              Reimpresiones por pedido: <strong>{formatNumero(d.riesgo.realPorPedido, 2)}</strong> reales frente a{' '}
              <strong>{formatNumero(d.riesgo.presupuestadoPorPedido, 2)}</strong> presupuestadas.
            </p>
            <p style={{ margin: 0 }}>{d.riesgo.conReimpresion} de {d.riesgo.pedidos} pedidos ({pct((d.riesgo.conReimpresion / d.riesgo.pedidos) * 100)}) necesitaron alguna reimpresión.</p>
            <p className="est-nota">Si lo real queda siempre por debajo, el riesgo por defecto cobra de más; por encima, regalas margen.</p>
          </>
        )}
      </Tarjeta>

      <Tarjeta titulo="¿Acierta el tasador?">
        {d.tasador.n === 0 ? vacio : (
          <>
            <p style={{ margin: '0 0 8px' }}>
              Coste real ÷ estimado en {d.tasador.n} solicitud{d.tasador.n === 1 ? '' : 'es'} web: mediana <strong>{formatNumero(d.tasador.mediana, 2)}</strong>,
              {' '}percentil 90 <strong>{formatNumero(d.tasador.p90, 2)}</strong>.
            </p>
            <p style={{ margin: 0 }}>
              Desvío acumulado: <strong>{d.tasador.desvio > 0 ? '+' : ''}{euros(d.tasador.desvio)}</strong>
              {d.tasador.desvio > 0 ? ' (lo asumió el taller)' : ' (a favor del taller)'}.
            </p>
            <p className="est-nota">El objetivo es 1,00 de mediana: centrado, no acolchado. El detalle por tipo de pieza está en Ajustes → Tasador.</p>
          </>
        )}
      </Tarjeta>

    </div>
    </>
  );
}
