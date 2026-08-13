// Payload del justificante de pago. Es EXACTAMENTE lo que se guarda en
// `recibos.datos`: un snapshot inmutable con el que se puede reconstruir el
// PDF byte a byte años después, aunque cambien los datos del negocio.
//
// Los tipos que necesita la UI (métodos de pago, fila de recibo) viven en
// lib/recibo/types.ts — este fichero es Deno, aquel es Next.

export type ReciboMetodo =
  | 'efectivo'
  | 'bizum'
  | 'transferencia'
  | 'tarjeta'
  | 'otro';

export type ReciboDatos = {
  /** R-2026-0001 */
  codigo: string;
  /** ISO. Fija la fecha de creación del PDF → el documento es determinista. */
  emitido_at: string;

  emisor: {
    nombre: string;
    dominio: string;
    email: string;
    telefono: string;
  };

  cliente: {
    nombre: string;
  };

  pedido: {
    codigo: string;
    /** precio_final ?? precio_total en el momento de emitir. null si no hay. */
    total: number | null;
  };

  cobro: {
    importe: number;
    metodo: ReciboMetodo;
    /** YYYY-MM-DD */
    fecha_pago: string;
    concepto: string;
    es_adelanto: boolean;
  };

  /** Contexto del saldo en el momento de emitir. null si no se conoce el total. */
  acumulado: {
    /** Suma de todos los recibos emitidos, incluido este. */
    pagado: number;
    /** total - pagado, nunca negativo. null si no hay total. */
    pendiente: number | null;
  };

  /** URL con token que valida el documento. null = PDF sin QR. */
  verificacion_url: string | null;
};

export const METODO_LABEL: Record<ReciboMetodo, string> = {
  efectivo: 'Efectivo',
  bizum: 'Bizum',
  transferencia: 'Transferencia bancaria',
  tarjeta: 'Tarjeta',
  otro: 'Otro'
};
