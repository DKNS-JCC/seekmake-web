// Tipos del justificante de pago para el lado Next.
//
// La plantilla del PDF y su payload viven en
// supabase/functions/_shared/recibo/ porque corren en Deno; tsconfig excluye
// esa carpeta. Aquí solo está lo que necesita la interfaz.

export type ReciboMetodo =
  | 'efectivo'
  | 'bizum'
  | 'transferencia'
  | 'tarjeta'
  | 'otro';

export const METODO_LABEL: Record<ReciboMetodo, string> = {
  efectivo: 'Efectivo',
  bizum: 'Bizum',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  otro: 'Otro'
};

export const METODO_OPCIONES: { id: ReciboMetodo; label: string }[] = [
  { id: 'bizum', label: 'Bizum' },
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'otro', label: 'Otro' }
];

/** Fila de `recibos` tal y como la lee el panel de admin. */
export type Recibo = {
  id: string;
  codigo: string;
  quote_id: string;
  importe: number;
  metodo: ReciboMetodo;
  /** YYYY-MM-DD */
  fecha_pago: string;
  concepto: string;
  es_adelanto: boolean;
  pdf_path: string | null;
  /** Cobro del libro que documenta (0028). null = justificante antiguo sin casar. */
  cobro_id: string | null;
  anulado_at: string | null;
  anulado_motivo: string;
  created_at: string;
  updated_at: string;
};

/** Lo que ve el cliente en /presupuesto (RPC get_recibos_cliente). */
export type ReciboCliente = {
  codigo: string;
  importe: number;
  metodo: ReciboMetodo;
  fecha_pago: string;
  concepto: string;
  es_adelanto: boolean;
  emitido_at: string;
};

/** Resultado de la verificación por QR (RPC verificar_recibo). */
export type ReciboVerificado = {
  codigo: string;
  pedido: string;
  importe: number;
  metodo: ReciboMetodo;
  fecha_pago: string;
  concepto: string;
  emitido_at: string;
  anulado: boolean;
};

/** 1234.5 → "1.234,50 €". Mismo formato que el PDF. */
export function euros(n: number | null | undefined): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [ent, dec] = Math.abs(v).toFixed(2).split('.');
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${v < 0 ? '-' : ''}${miles},${dec} €`;
}

/** "2026-08-12" → "12/08/2026", sin pasar por Date (ni zonas horarias). */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? '');
}
