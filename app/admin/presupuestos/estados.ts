// Vocabulario de la lista de pedidos y de la ficha: estados, siguiente paso y
// plazo. Lo comparten la lista, la ficha y «Hoy».

import type { Quote, QuoteEstado, QuotePago } from '@/lib/types';
import { hoyMadrid } from '@/lib/quote/pricing';

export const ESTADOS: { id: QuoteEstado; label: string }[] = [
  { id: 'nuevo', label: 'Por presupuestar' },
  { id: 'revisado', label: 'Presupuestado' },
  { id: 'aceptado', label: 'Aceptado' },
  { id: 'imprimiendo', label: 'En producción' },
  { id: 'listo', label: 'Listo' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'rechazado', label: 'Descartado' }
];
export const ESTADO_LABEL = Object.fromEntries(ESTADOS.map((e) => [e.id, e.label])) as Record<QuoteEstado, string>;

// Solo el punto y el borde llevan color; el texto va en --text.
export const ESTADO_COLOR: Record<QuoteEstado, string> = {
  nuevo: '#0EA5E9',
  revisado: '#a855f7',
  aceptado: '#ca8a04',
  imprimiendo: '#f97316',
  listo: '#10b981',
  entregado: '#6b7280',
  rechazado: '#ef4444'
};

export const PAGO_LABEL: Record<QuotePago, string> = {
  pendiente: 'Pendiente',
  adelanto: 'Señal',
  pagado: 'Pagado'
};

/** Estados con plantilla de aviso en notify-quote. */
export const AVISABLES: QuoteEstado[] = ['revisado', 'aceptado', 'imprimiendo', 'listo', 'entregado', 'rechazado'];

/** Siguiente paso del pedido. «nuevo» se presupuesta en «Nuevo encargo», no aquí. */
export const SIGUIENTE: Partial<Record<QuoteEstado, { a: QuoteEstado; label: string }>> = {
  revisado: { a: 'aceptado', label: 'Marcar aceptado' },
  aceptado: { a: 'imprimiendo', label: 'Empezar a imprimir' },
  imprimiendo: { a: 'listo', label: 'Marcar listo' },
  listo: { a: 'entregado', label: 'Marcar entregado' }
};

/** Filtros de la lista. Los que no son un estado agrupan o miran el archivo. */
export type Filtro = 'activos' | QuoteEstado | 'archivados';
export const ACTIVOS: QuoteEstado[] = ['nuevo', 'revisado', 'aceptado', 'imprimiendo', 'listo'];
export const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'activos', label: 'Activos' },
  { id: 'nuevo', label: 'Por presupuestar' },
  { id: 'revisado', label: 'Esperando' },
  { id: 'aceptado', label: 'Aceptados' },
  { id: 'imprimiendo', label: 'En producción' },
  { id: 'listo', label: 'Listos' },
  { id: 'entregado', label: 'Entregados' },
  { id: 'rechazado', label: 'Descartados' },
  { id: 'archivados', label: 'Archivados' }
];

export function coincideFiltro(q: Pick<Quote, 'estado' | 'archivado'>, f: Filtro): boolean {
  if (f === 'archivados') return q.archivado;
  if (q.archivado) return false;
  return f === 'activos' ? ACTIVOS.includes(q.estado) : q.estado === f;
}

const DIA = 24 * 60 * 60 * 1000;

/** Qué se encarga: archivos del tasador o descripción del pedido de taller. */
export function piezas(q: Pick<Quote, 'archivos' | 'descripcion'>): string {
  const archivos = (q.archivos ?? [])
    .map((a) => `${a.nombre}${a.cantidad > 1 ? ` ×${a.cantidad}` : ''}`)
    .join(', ');
  return archivos || q.descripcion?.trim() || '—';
}

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** «vie 14 nov» */
export function diaCorto(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`)
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace(/\./g, '');
}

/**
 * Fecha tope en texto. En riesgo = sigue sin estar listo y vence hoy, mañana o
 * ya pasó (se escribe; el color no es la única señal).
 */
export function plazoDe(
  q: Pick<Quote, 'estado' | 'fecha_prometida'>,
  hoy = hoyMadrid()
): { texto: string; riesgo: boolean } {
  if (!q.fecha_prometida) return { texto: '—', riesgo: false };
  const f = diaCorto(q.fecha_prometida);
  if (!['aceptado', 'imprimiendo'].includes(q.estado)) return { texto: f, riesgo: false };
  // ponytail: «en riesgo» = vence en ≤ 1 día natural; afinar con la puntualidad medida.
  const d = Math.round((Date.parse(q.fecha_prometida.slice(0, 10)) - Date.parse(hoy)) / DIA);
  if (d < 0) return { texto: `${-d} día${d === -1 ? '' : 's'} tarde`, riesgo: true };
  if (d === 0) return { texto: 'vence hoy', riesgo: true };
  if (d === 1) return { texto: 'vence mañana', riesgo: true };
  return { texto: f, riesgo: false };
}
