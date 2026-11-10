// Dinero del taller: facturación, coste real, beneficio, caja y pendiente,
// calculados sobre los pedidos (orders.data) con las mismas reglas que la
// pestaña Estadísticas de la Calculadora 7.2 (backend.mjs: isCommitted,
// orderRealCost, orderRealProfit; Statistics.vue; utils/orderShare.js).
// scripts/test-dinero.ts lo compara con la copia de la 7.2.
//
// Todo son funciones puras sobre datos ya leídos: el volumen es el de un
// taller pequeño (decenas de pedidos al año).

export type Pedido = Record<string, any>;
export type Span = { from: number; to: number };

const DIA = 86400000;
export const COMPROMETIDOS = ['Aceptado', 'En producción', 'Post-procesado', 'Listo para entregar', 'Entregado'];
export const DESCARTADO = 'Descartado';

export const round2 = (v: number) => Math.round(Number(v || 0) * 100) / 100;

/** normalizeEstado de la 7.2: vacío = presupuesto enviado; los legados se pliegan. */
export function normalizarEstado(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return 'Presupuesto enviado';
  if (s === 'Enviado') return 'Presupuesto enviado';
  if (s === 'Rechazado' || s === 'descartado') return DESCARTADO;
  return s;
}

/** Solo los pedidos con compromiso (de «Aceptado» en adelante) cuentan como facturación. */
export const esComprometido = (o: Pedido) => COMPROMETIDOS.includes(normalizarEstado(o?.estado));

/** Fracción del pedido que es de 3DCC (los repartos históricos con el socio). */
export function cuota(o: Pedido, empresa = '3DCC'): number {
  if (!o?.is_shared || !o?.shared_split) return 1;
  return Number(o.shared_split[empresa] ?? 100) / 100;
}

/** Lo que costó de verdad: coste de impresión × (1 + reimpresiones) + extras. */
export function costeReal(o: Pedido): number {
  const reps = Math.max(0, Math.floor(Number(o?.repeticiones_error) || 0));
  return round2(Number(o?.coste_bruto || 0) * (1 + reps) + Number(o?.gasto_misc || 0));
}
export const beneficioReal = (o: Pedido) => round2(Number(o?.precio_final || 0) - costeReal(o));

/** Fecha del pedido (YYYY-MM-DD o DD/MM/YYYY) a milisegundos locales a medianoche; null si no se entiende. */
export function fechaPedido(str: unknown): number | null {
  const s = String(str ?? '');
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const p = s.split('/');
  if (p.length === 3) return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime();
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const finDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

export type PeriodoId = '30' | '90' | 'mes' | 'anio' | 'todo' | 'concreto';
export const PERIODOS: { id: PeriodoId; label: string }[] = [
  { id: '30', label: '30 días' },
  { id: '90', label: '90 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'anio', label: 'Este año' },
  { id: 'todo', label: 'Todo' }
];

/** `mes` = «YYYY-MM» para un mes concreto. «Todo» = desde 2000. */
export function spanDe(id: PeriodoId, mes = '', ahora = new Date()): Span {
  const fin = finDia(ahora);
  if (id === 'concreto' && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split('-').map(Number);
    return { from: new Date(y, m - 1, 1).getTime(), to: finDia(new Date(y, m, 0)) };
  }
  if (id === '30' || id === '90') return { from: inicioDia(ahora) - (Number(id) - 1) * DIA, to: fin };
  if (id === 'mes') return { from: new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime(), to: fin };
  if (id === 'anio') return { from: new Date(ahora.getFullYear(), 0, 1).getTime(), to: fin };
  return { from: new Date(2000, 0, 1).getTime(), to: fin };
}
export const enSpan = (t: number, s: Span) => t >= s.from && t <= s.to;

export type Resumen = {
  /** Todos los pedidos con fecha en el periodo, sea cual sea su estado. */
  emitidos: Pedido[];
  comprometidos: Pedido[];
  facturado: number;
  coste: number;
  beneficio: number;
  margenPct: number;
  horas: number;
  gramos: number;
  ticketMedio: number;
  /** Beneficio por hora de impresora. */
  beneficioHora: number;
};

export function resumen(pedidos: Pedido[], span: Span): Resumen {
  const emitidos = pedidos.filter((o) => {
    const t = fechaPedido(o.fecha);
    return t !== null && enSpan(t, span);
  });
  const comprometidos = emitidos.filter(esComprometido);
  let facturado = 0, coste = 0, horas = 0, gramos = 0;
  for (const o of comprometidos) {
    const s = cuota(o);
    facturado += Number(o.precio_final || 0) * s;
    coste += costeReal(o) * s;
    horas += Number(o.horas || 0) * s;
    gramos += Number(o.peso_g || 0) * s;
  }
  const beneficio = facturado - coste;
  const n = comprometidos.filter((o) => Number(o.precio_final) * cuota(o) > 0).length;
  return {
    emitidos, comprometidos, facturado, coste, beneficio,
    margenPct: facturado > 0 ? (beneficio / facturado) * 100 : 0,
    horas, gramos,
    ticketMedio: n ? facturado / n : 0,
    beneficioHora: horas > 0 ? beneficio / horas : 0
  };
}

export type Deuda = { pedido: Pedido; saldo: number; dias: number };

/** Saldo de lo comprometido a día de hoy (ajeno al periodo), el más antiguo primero. */
export function deudas(pedidos: Pedido[], ahora = Date.now()): Deuda[] {
  return pedidos
    .filter(esComprometido)
    .map((o) => {
      const saldo = (Number(o.precio_final || 0) - Number(o.importe_pagado || 0)) * cuota(o);
      const t = fechaPedido(o.fecha) ?? 0;
      return { pedido: o, saldo, dias: t ? Math.floor((ahora - t) / DIA) : 0 };
    })
    .filter((d) => d.saldo > 0.01)
    .sort((a, b) => b.dias - a.dias);
}

export type Cobro = { importe: number; metodo: string; cobrado_at: string; anulado_at?: string | null };
/** Caja del periodo: cobros vivos por su fecha de cobro, y por método. */
export function caja(cobros: Cobro[], span: Span) {
  const vivos = cobros.filter((c) => !c.anulado_at && enSpan(new Date(c.cobrado_at).getTime(), span));
  const porMetodo = new Map<string, number>();
  for (const c of vivos) {
    const m = String(c.metodo || '').trim() || 'Sin registrar';
    porMetodo.set(m, round2((porMetodo.get(m) ?? 0) + Number(c.importe)));
  }
  return {
    total: round2(vivos.reduce((s, c) => s + Number(c.importe), 0)),
    porMetodo: [...porMetodo].sort((a, b) => b[1] - a[1])
  };
}

export type Aceptacion = { emitidos: number; aceptados: number; descartados: number; abiertos: number; conversionPct: number };
/** Presupuestos del periodo y qué fue de ellos (conversión sobre los resueltos, como la 7.2). */
export function aceptacion(lista: Pedido[]): Aceptacion {
  const aceptados = lista.filter(esComprometido).length;
  const descartados = lista.filter((o) => normalizarEstado(o.estado) === DESCARTADO).length;
  const resueltos = aceptados + descartados;
  return {
    emitidos: lista.length, aceptados, descartados,
    abiertos: lista.length - resueltos,
    conversionPct: resueltos > 0 ? (aceptados / resueltos) * 100 : 0
  };
}

export const TRAMOS = [
  { label: 'Hasta 20 €', max: 20 },
  { label: '20 – 50 €', max: 50 },
  { label: '50 – 100 €', max: 100 },
  { label: 'Más de 100 €', max: Infinity }
];
export const tramoDe = (precio: number) => TRAMOS.findIndex((t) => precio < t.max);

/** Reimpresiones reales por pedido frente a lo presupuestado (error_rate = reimpresiones esperadas por pedido). */
export function aciertoRiesgo(comprometidos: Pedido[]) {
  const n = comprometidos.length;
  const reps = comprometidos.reduce((s, o) => s + Math.max(0, Math.floor(Number(o.repeticiones_error) || 0)), 0);
  const presupuestado = comprometidos.reduce((s, o) => s + Number(o.error_rate || 0), 0);
  return {
    pedidos: n,
    conReimpresion: comprometidos.filter((o) => Number(o.repeticiones_error) > 0).length,
    realPorPedido: n ? reps / n : 0,
    presupuestadoPorPedido: n ? presupuestado / n : 0
  };
}

export type Cliente = { nombre: string; pedidos: number; facturado: number };
/** Clientes con más de un pedido comprometido (no es un CRM: sale de los pedidos). */
export function recurrentes(comprometidos: Pedido[]): Cliente[] {
  const m = new Map<string, Cliente>();
  for (const o of comprometidos) {
    const k = String(o.cliente || '').trim().toLowerCase();
    if (!k) continue;
    const c = m.get(k) ?? { nombre: String(o.cliente).trim(), pedidos: 0, facturado: 0 };
    c.pedidos++;
    c.facturado += Number(o.precio_final || 0) * cuota(o);
    m.set(k, c);
  }
  return [...m.values()].filter((c) => c.pedidos > 1).sort((a, b) => b.facturado - a.facturado);
}

/** Puntualidad: ¿se llegó a la fecha tope? `listo_at` (instante) frente a `fecha_prometida` (día). */
export function puntualidad(
  quotes: { fecha_prometida?: string | null; listo_at?: string | null }[],
  hoyIso: string
) {
  const hechos = quotes.filter((q) => q.fecha_prometida && q.listo_at);
  const dia = (iso: string) => iso.slice(0, 10);
  const enPlazo = hechos.filter((q) => dia(q.listo_at as string) <= dia(q.fecha_prometida as string)).length;
  const dias = hechos.map(
    (q) => (Date.parse(dia(q.listo_at as string)) - Date.parse(dia(q.fecha_prometida as string))) / DIA
  );
  const tarde = quotes.filter((q) => q.fecha_prometida && !q.listo_at && dia(q.fecha_prometida) < hoyIso).length;
  return {
    medidos: hechos.length,
    enPlazo,
    enPlazoPct: hechos.length ? (enPlazo / hechos.length) * 100 : 0,
    /** Días de media de retraso (negativo = se adelantó). */
    desvioMedioDias: dias.length ? dias.reduce((s, d) => s + d, 0) / dias.length : 0,
    vencidosSinTerminar: tarde
  };
}

/** CSV del periodo con las mismas columnas que la exportación de Statistics.vue (7.2). */
export function csvPedidos(emitidos: Pedido[]): string {
  const cab = ['ID', 'Fecha', 'Cliente', 'Estado', 'Material', 'Cantidad', 'Facturado', 'Coste real', 'Beneficio real', 'Cobrado', 'Pendiente', 'Metodos de cobro'];
  const filas = emitidos.map((o) => {
    const s = cuota(o);
    const facturado = Number(o.precio_final || 0) * s;
    const coste = costeReal(o) * s;
    const pagado = Number(o.importe_pagado || 0) * s;
    const metodos = [...new Set(
      (Array.isArray(o.payment_history) ? o.payment_history : [])
        .filter((p: Pedido) => Number(p?.amount))
        .map((p: Pedido) => String(p?.method || '').trim() || 'Sin registrar')
    )].join(' + ');
    return [
      o.id, o.fecha, `"${String(o.cliente || '').replace(/"/g, '""')}"`, normalizarEstado(o.estado), o.filamento || '',
      Math.max(1, Number(o.cantidad) || 1), facturado.toFixed(2), coste.toFixed(2), (facturado - coste).toFixed(2),
      pagado.toFixed(2), Math.max(0, facturado - pagado).toFixed(2), `"${metodos}"`
    ].join(',');
  });
  return [cab.join(','), ...filas].join('\n');
}
