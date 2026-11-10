// «Dinero» (lib/quote/dinero.ts) frente a la Calculadora 7.2: mismo comprometido,
// mismo coste real y beneficio por pedido, misma caja por fecha de cobro y
// mismas sumas del periodo que Statistics.vue (cur = sumMoney(committed)).
//
//   npx tsx scripts/test-dinero.ts
//
// La referencia es scripts/calculadora-7.2/backend.mjs (copia de la 7.2.0).

// @ts-expect-error — módulo JS sin tipos (copia de la Calculadora)
import { isCommitted, normalizeEstado, orderCashEvents, orderRealCost, orderRealProfit } from './calculadora-7.2/backend.mjs';
import {
  aceptacion, aciertoRiesgo, caja, csvPedidos, costeReal, cuota, deudas, esComprometido, fechaPedido, puntualidad,
  recurrentes, resumen, spanDe, tramoDe, type Pedido
} from '../lib/quote/dinero';
import { check, done, eq, section } from './_assert';

const ESTADOS = ['Nuevo', 'Presupuesto enviado', 'Aceptado', 'En producción', 'Post-procesado', 'Listo para entregar', 'Entregado', 'Descartado', 'Enviado', 'Rechazado', '', undefined];

// Pedidos sintéticos con todo lo que mueve el dinero: reimpresiones, gastos
// extra, reparto con el socio, fechas en los dos formatos y cobros sueltos.
function pedido(i: number): Pedido {
  const estado = ESTADOS[i % ESTADOS.length];
  const precio = 10 + (i % 7) * 13.37;
  const hist = i % 3 === 0 ? [] : [
    { id: 'a' + i, created_at: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z`, method: i % 2 ? 'Bizum' : 'Efectivo', amount: Math.round(precio * 50) / 100, source: 'manual' },
    ...(i % 4 === 0 ? [{ id: 'b' + i, created_at: '2026-10-30T12:00:00Z', method: 'Bizum', amount: 0, source: 'recalculation' }] : [])
  ];
  return {
    id: 'P' + i,
    estado,
    fecha: i % 5 === 0 ? `${String(1 + (i % 28)).padStart(2, '0')}/10/2026` : `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
    cliente: 'Cliente ' + (i % 6),
    precio_final: Math.round(precio * 100) / 100,
    coste_bruto: Math.round(precio * 0.3 * 100) / 100,
    gasto_misc: i % 4 === 0 ? 2.5 : 0,
    repeticiones_error: i % 6 === 0 ? 2 : i % 5 === 0 ? 1 : 0,
    peso_g: String(20 + i * 3),
    horas: String(1 + (i % 5) * 0.5),
    cantidad: 1 + (i % 3),
    error_rate: [0.25, 0.5, 1][i % 3],
    is_shared: i % 9 === 0,
    shared_split: i % 9 === 0 ? { '3DCC': 60, SILAB3D: 40 } : null,
    payment_history: hist,
    importe_pagado: hist.reduce((s, p) => s + p.amount, 0),
    last_status_update: '2026-10-31T09:00:00Z',
    created_at: '2026-10-01T09:00:00Z'
  };
}
const pedidos = Array.from({ length: 80 }, (_, i) => pedido(i));

section('Por pedido: comprometido, coste y beneficio reales');
{
  let mal = 0;
  for (const o of pedidos) {
    if (esComprometido(o) !== isCommitted(o)) mal++;
    if (Math.abs(costeReal(o) - orderRealCost(o)) > 1e-9) mal++;
  }
  check(`80 pedidos: isCommitted y orderRealCost idénticos (${mal} diferencias)`, mal === 0);
  check('normalizarEstado = normalizeEstado', ESTADOS.every((e) => normalizeEstado(e) === normalizeEstado(e)));
  eq('orderRealProfit', Math.round((pedidos[3].precio_final - costeReal(pedidos[3])) * 100) / 100, orderRealProfit(pedidos[3]));
  check('cuota: sin reparto 1, con reparto 60 %', cuota(pedidos[1]) === 1 && cuota(pedidos[9]) === 0.6);
}

section('Periodo: las sumas de Statistics.vue (cur = sumMoney(committed))');
{
  // Las fórmulas de Statistics.vue, a mano: pedidos de octubre, comprometidos, × cuota.
  const span = spanDe('concreto', '2026-10', new Date(2026, 10, 10));
  const dentro = pedidos.filter((o) => {
    const t = fechaPedido(o.fecha);
    return t !== null && t >= span.from && t <= span.to;
  });
  const com = dentro.filter(isCommitted);
  const share = (o: Pedido) => (o.is_shared && o.shared_split ? Number(o.shared_split['3DCC']) / 100 : 1);
  const facturado = com.reduce((s, o) => s + Number(o.precio_final) * share(o), 0);
  const coste = com.reduce((s, o) => s + orderRealCost(o) * share(o), 0);
  const horas = com.reduce((s, o) => s + Number(o.horas || 0) * share(o), 0);
  const r = resumen(pedidos, span);
  check('todos los pedidos son de octubre', dentro.length === pedidos.length, `${dentro.length}`);
  eq('facturado', r.facturado, facturado, 1e-6);
  eq('coste real', r.coste, coste, 1e-6);
  eq('beneficio', r.beneficio, facturado - coste, 1e-6);
  eq('€ por hora de impresora', r.beneficioHora, (facturado - coste) / horas, 1e-6);
  check('comprometidos', r.comprometidos.length === com.length);
  // Un mes sin pedidos: todo a cero y sin NaN.
  const vacio = resumen(pedidos, spanDe('concreto', '2025-01', new Date(2026, 10, 10)));
  check('mes vacío: ceros, sin NaN', vacio.facturado === 0 && vacio.margenPct === 0 && vacio.beneficioHora === 0 && vacio.ticketMedio === 0);
}

section('Caja por fecha de cobro y método (libro de cobros) = orderCashEvents');
{
  const span = spanDe('concreto', '2026-10', new Date(2026, 10, 10));
  // El libro de cobros tiene un apunte por cada movimiento del historial (sin los de importe 0).
  const cobros = pedidos.flatMap((o) =>
    orderCashEvents(o).map((e: { ts: number; amount: number; method: string }) => ({
      importe: e.amount, metodo: e.method, cobrado_at: new Date(e.ts).toISOString(), anulado_at: null
    }))
  );
  const esperado = pedidos.flatMap((o) => orderCashEvents(o)).filter((e: { ts: number }) => e.ts >= span.from && e.ts <= span.to);
  const c = caja(cobros, span);
  eq('total cobrado', c.total, esperado.reduce((s: number, e: { amount: number }) => s + e.amount, 0), 0.005);
  const metodos = new Set(esperado.map((e: { method: string }) => e.method));
  check('mismos métodos', c.porMetodo.length === metodos.size);
  // Anulado no cuenta.
  const anulado = caja([{ importe: 50, metodo: 'Bizum', cobrado_at: '2026-10-05T10:00:00Z', anulado_at: '2026-10-06T10:00:00Z' }], span);
  check('un cobro anulado no suma', anulado.total === 0);
  check('sin método → «Sin registrar»', caja([{ importe: 5, metodo: ' ', cobrado_at: '2026-10-05T10:00:00Z' }], span).porMetodo[0][0] === 'Sin registrar');
}

section('Pendiente, aceptación, riesgo, clientes y puntualidad');
{
  const d = deudas(pedidos, new Date(2026, 10, 10).getTime());
  const esperado = pedidos.filter(isCommitted).filter((o) => (Number(o.precio_final) - Number(o.importe_pagado)) * cuota(o) > 0.01);
  check('deudas = comprometidos con saldo', d.length === esperado.length);
  check('la más antigua primero', d.every((x, i) => i === 0 || d[i - 1].dias >= x.dias));
  const a = aceptacion(pedidos);
  check('aceptación: emitidos = aceptados + descartados + abiertos', a.emitidos === a.aceptados + a.descartados + a.abiertos);
  eq('conversión sobre los resueltos', a.conversionPct, (a.aceptados / (a.aceptados + a.descartados)) * 100, 1e-9);
  check('tramos', tramoDe(5) === 0 && tramoDe(20) === 1 && tramoDe(99.99) === 2 && tramoDe(500) === 3);
  const r = aciertoRiesgo([{ repeticiones_error: 2, error_rate: 0.25 }, { repeticiones_error: 0, error_rate: 0.5 }]);
  check('riesgo: real 1 por pedido, presupuestado 0,375', r.realPorPedido === 1 && Math.abs(r.presupuestadoPorPedido - 0.375) < 1e-9 && r.conReimpresion === 1);
  const rec = recurrentes(pedidos.filter(isCommitted));
  check('recurrentes: solo más de un pedido, por facturado', rec.every((c) => c.pedidos > 1) && rec.every((c, i) => i === 0 || rec[i - 1].facturado >= c.facturado));
  const p = puntualidad(
    [
      { fecha_prometida: '2026-11-14', listo_at: '2026-11-13T10:00:00Z' },
      { fecha_prometida: '2026-11-14', listo_at: '2026-11-14T22:00:00Z' },
      { fecha_prometida: '2026-11-14', listo_at: '2026-11-16T09:00:00Z' },
      { fecha_prometida: '2026-11-01', listo_at: null },
      { fecha_prometida: '2026-11-30', listo_at: null }
    ],
    '2026-11-10'
  );
  check('puntualidad: 2 de 3 en plazo, 1 vencido sin terminar', p.medidos === 3 && p.enPlazo === 2 && p.vencidosSinTerminar === 1, JSON.stringify(p));
  eq('retraso medio (−1, 0, +2 días)', p.desvioMedioDias, 1 / 3, 1e-9);
}

section('Exportación CSV (misma que Statistics.vue)');
{
  const o = { ...pedido(2), estado: 'Aceptado', cliente: 'Ana "la" García', precio_final: 40, coste_bruto: 10, repeticiones_error: 1, gasto_misc: 2.5, importe_pagado: 20, is_shared: false, shared_split: null, fecha: '2026-10-05', cantidad: 2, filamento: 'PLA' };
  const [cab, fila] = csvPedidos([o]).split('\n');
  check('cabecera', cab.startsWith('ID,Fecha,Cliente,Estado,Material,Cantidad,Facturado'));
  // facturado 40, coste 10×2+2,5 = 22,50, beneficio 17,50, cobrado 20, pendiente 20.
  check('fila', fila.includes('40.00,22.50,17.50,20.00,20.00') && fila.includes('"Ana ""la"" García"'), fila);
  check('una sola fila de cabecera y otra por pedido', csvPedidos(pedidos).split('\n').length === pedidos.length + 1);
}

section('Periodos');
{
  const ahora = new Date(2026, 10, 10, 15, 0);
  const m = spanDe('mes', '', ahora);
  check('este mes: del 1 de noviembre a hoy', new Date(m.from).getDate() === 1 && new Date(m.from).getMonth() === 10 && new Date(m.to).getDate() === 10);
  const c = spanDe('concreto', '2026-02', ahora);
  check('mes concreto: febrero de 28 días', new Date(c.to).getDate() === 28 && new Date(c.to).getMonth() === 1);
  const t = spanDe('30', '', ahora);
  check('30 días incluye hoy y 29 anteriores', Math.round((new Date(2026, 10, 10).getTime() - t.from) / 86400000) === 29);
  check('fechaPedido entiende los dos formatos', fechaPedido('2026-10-05') === fechaPedido('05/10/2026') && fechaPedido('') === null);
}

done();
