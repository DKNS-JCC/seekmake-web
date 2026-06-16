// Pricing engine for the tasador. Pure functions over QuoteSettings (the
// jsonb stored in public.quote_settings) so the same math runs in the quote
// page, the admin preview and — if ever needed — server side.

import type { MeshMetrics } from './geometry';

export interface MaterialPricing {
  /** € per gram of printed material. */
  precio_g: number;
  /** Filament density in g/cm³ (PLA ≈ 1.24). */
  densidad: number;
  /**
   * Print-speed factor relative to PLA (1 = PLA, TPU ≈ 0.4). Scales the
   * mass-deposition rate `caudal_g_h` for this material.
   */
  factor_velocidad?: number;
}

export interface EnvioTramo {
  /** Tier applies up to this many grams (total order weight). */
  max_g: number;
  precio: number;
}

export interface ResistenciaPreset {
  id: string;
  nombre: string;
  descripcion: string;
  relleno_pct: number;
}

export interface DetallePreset {
  id: string;
  nombre: string;
  descripcion: string;
  altura_capa_mm: number;
  /** Print-time multiplier relative to the standard profile. */
  factor_tiempo: number;
}

export interface QuoteSettings {
  version: number;
  /** Keyed by `filamentos.material` (PLA, PETG, ASA, TPU…). */
  materiales: Record<string, MaterialPricing>;
  precio_hora: number;
  tarifa_preparacion: number;
  precio_minimo: number;
  /** Average machine throughput in grams/hour at the standard profile. */
  caudal_g_h: number;
  /**
   * Fixed per-layer overhead in seconds (Z-hop, perimeter starts, travel).
   * Layer count = part height ÷ layer height, so thin layers honestly cost
   * more time instead of relying only on the flat `factor_tiempo`.
   */
  tiempo_capa_s: number;
  /**
   * Sparse density of support structures (0-1, slicers default ~0.15).
   * Multiplies the raw prism volume estimated by the geometry analysis.
   */
  soporte_relleno: number;
  /** Largest printable axis in mm (warn above this). */
  max_bed_mm: number;
  /** Days the estimate stays valid (shown to the customer + accept window). */
  validez_dias: number;
  /** Shipping tiers by total order weight, sorted ascending by max_g. */
  envio_tramos: EnvioTramo[];
  /**
   * Fraction of the solid volume that is walls/top/bottom and prints solid
   * regardless of infill. effective = pared + (1 - pared) × relleno.
   */
  fraccion_pared: number;
  /** Printing hours available per working day (for the lead-time estimate). */
  plazo_horas_dia: number;
  /** Extra working days for preparation/queue added to every estimate. */
  plazo_dias_margen: number;
  recargo_acabado_pct: Record<string, number>;
  recargo_multicolor: { base_pct: number; por_color_extra: number };
  resistencia: ResistenciaPreset[];
  detalle: DetallePreset[];
  /** Sorted ascending by `min`. The highest matching tier wins. */
  descuentos_cantidad: { min: number; pct: number }[];
}

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  version: 1,
  materiales: {
    PLA: { precio_g: 0.05, densidad: 1.24, factor_velocidad: 1 },
    PETG: { precio_g: 0.06, densidad: 1.27, factor_velocidad: 0.9 },
    ASA: { precio_g: 0.07, densidad: 1.07, factor_velocidad: 0.85 },
    TPU: { precio_g: 0.08, densidad: 1.21, factor_velocidad: 0.4 }
  },
  precio_hora: 0.3,
  tarifa_preparacion: 1.5,
  precio_minimo: 5,
  caudal_g_h: 18,
  tiempo_capa_s: 6,
  soporte_relleno: 0.15,
  max_bed_mm: 256,
  validez_dias: 15,
  envio_tramos: [
    { max_g: 500, precio: 4.5 },
    { max_g: 2000, precio: 6.9 },
    { max_g: 999999, precio: 9.9 }
  ],
  fraccion_pared: 0.35,
  plazo_horas_dia: 8,
  plazo_dias_margen: 1,
  recargo_acabado_pct: {
    'Metálico': 10,
    'Fluorescente': 10,
    'Translucido': 5,
    'Textura': 10,
    'Brillante': 5,
    'Purpurina': 10,
    'Mate': 0,
    'Flexible': 15
  },
  recargo_multicolor: { base_pct: 15, por_color_extra: 1 },
  resistencia: [
    { id: 'decorativa', nombre: 'Decorativa', descripcion: 'Para exponer o piezas sin esfuerzo', relleno_pct: 10 },
    { id: 'estandar', nombre: 'Estándar', descripcion: 'Uso diario normal', relleno_pct: 20 },
    { id: 'resistente', nombre: 'Resistente', descripcion: 'Soportará golpes o carga', relleno_pct: 40 },
    { id: 'maciza', nombre: 'Maciza', descripcion: 'Máxima dureza, pieza casi sólida', relleno_pct: 100 }
  ],
  detalle: [
    { id: 'rapido', nombre: 'Rápido', descripcion: 'Capas visibles, más económico', altura_capa_mm: 0.28, factor_tiempo: 0.7 },
    { id: 'estandar', nombre: 'Estándar', descripcion: 'Buen equilibrio calidad/precio', altura_capa_mm: 0.2, factor_tiempo: 1 },
    { id: 'fino', nombre: 'Alto detalle', descripcion: 'Superficie fina, ideal figuras', altura_capa_mm: 0.12, factor_tiempo: 1.7 }
  ],
  descuentos_cantidad: [
    { min: 2, pct: 5 },
    { min: 6, pct: 12 },
    { min: 21, pct: 20 }
  ]
};

/** Merge a stored config over the defaults so missing keys never crash. */
export function normalizeSettings(raw: unknown): QuoteSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_QUOTE_SETTINGS;
  const r = raw as Partial<QuoteSettings>;
  return {
    ...DEFAULT_QUOTE_SETTINGS,
    ...r,
    materiales: { ...DEFAULT_QUOTE_SETTINGS.materiales, ...(r.materiales ?? {}) },
    recargo_acabado_pct: {
      ...DEFAULT_QUOTE_SETTINGS.recargo_acabado_pct,
      ...(r.recargo_acabado_pct ?? {})
    },
    recargo_multicolor: {
      ...DEFAULT_QUOTE_SETTINGS.recargo_multicolor,
      ...(r.recargo_multicolor ?? {})
    },
    resistencia: r.resistencia?.length ? r.resistencia : DEFAULT_QUOTE_SETTINGS.resistencia,
    detalle: r.detalle?.length ? r.detalle : DEFAULT_QUOTE_SETTINGS.detalle,
    descuentos_cantidad: r.descuentos_cantidad?.length
      ? [...r.descuentos_cantidad].sort((a, b) => a.min - b.min)
      : DEFAULT_QUOTE_SETTINGS.descuentos_cantidad,
    envio_tramos: r.envio_tramos?.length
      ? [...r.envio_tramos].sort((a, b) => a.max_g - b.max_g)
      : DEFAULT_QUOTE_SETTINGS.envio_tramos
  };
}

export interface PiezaInput {
  nombre: string;
  metrics: MeshMetrics;
  cantidad: number;
  /** Each piece carries its own full configuration. */
  material: string;
  /** Distinct muestrario colors applied to this piece (1 = single color). */
  colores: { nombre: string; hex: string; acabado: string | null }[];
  resistenciaId: string;
  detalleId: string;
}

export interface PiezaResult {
  nombre: string;
  material: string;
  rellenoPct: number;
  /** Per unit, support material included. */
  pesoG: number;
  /** Estimated support material per unit (already in pesoG). */
  soporteG: number;
  /** Per unit. */
  tiempoH: number;
  cantidad: number;
  /** All units of this piece, surcharges included. */
  subtotal: number;
}

export interface QuoteLine {
  concepto: string;
  importe: number;
}

export interface QuoteResult {
  /** Across every unit of every piece. */
  pesoG: number;
  tiempoH: number;
  unidades: number;
  piezas: PiezaResult[];
  lineas: QuoteLine[];
  descuentoPct: number;
  total: number;
  /** True when precio_minimo kicked in. */
  minimoAplicado: boolean;
  /** Estimated working days until the order is ready for pickup/shipping. */
  diasEstimados: number;
  /** Shipping line included in the total (0 for pickup). */
  envio: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeQuote(
  piezas: PiezaInput[],
  settings: QuoteSettings,
  entrega: 'recogida' | 'envio' = 'recogida'
): QuoteResult {
  const lineas: QuoteLine[] = [];
  const piezasOut: PiezaResult[] = [];
  let base = 0;
  let pesoTotal = 0;
  let tiempoTotal = 0;
  let unidades = 0;

  for (const p of piezas) {
    const mat = settings.materiales[p.material] ?? settings.materiales['PLA'] ?? {
      precio_g: 0.05,
      densidad: 1.24
    };
    const res =
      settings.resistencia.find((r) => r.id === p.resistenciaId) ?? settings.resistencia[0];
    const det = settings.detalle.find((d) => d.id === p.detalleId) ?? settings.detalle[0];

    // Effective printed weight: walls print solid, the interior at infill %.
    const fraccion =
      settings.fraccion_pared + (1 - settings.fraccion_pared) * (res.relleno_pct / 100);
    const cantidad = Math.max(1, Math.floor(p.cantidad));
    const pesoPieza = p.metrics.volumenCm3 * mat.densidad * fraccion;
    // Support material: raw prism volume × sparse support infill.
    const soporteG =
      (p.metrics.soporteCm3 ?? 0) * settings.soporte_relleno * mat.densidad;
    const pesoG = pesoPieza + soporteG;

    // Time model: mass deposition (material-speed adjusted, quality factor)
    // plus a fixed per-layer overhead so layer height truly matters.
    const caudal =
      Math.max(settings.caudal_g_h, 1) * Math.max(mat.factor_velocidad ?? 1, 0.05);
    const capas = det.altura_capa_mm > 0 ? p.metrics.bboxMm.y / det.altura_capa_mm : 0;
    const tiempoH =
      (pesoG / caudal) * det.factor_tiempo + (capas * settings.tiempo_capa_s) / 3600;

    let unidad = pesoG * mat.precio_g + tiempoH * settings.precio_hora;

    const extras: string[] = [];
    if (soporteG >= 1) extras.push(`soportes ~${Math.round(soporteG)} g`);

    // Specialty finish surcharge — the priciest finish among this piece's colors.
    const acabadoPct = Math.max(
      0,
      ...p.colores.map((c) => (c.acabado ? settings.recargo_acabado_pct[c.acabado] ?? 0 : 0))
    );
    if (acabadoPct > 0) {
      unidad *= 1 + acabadoPct / 100;
      extras.push(`acabado +${acabadoPct}%`);
    }

    // Multicolor surcharge on this piece: % + flat per extra color.
    const numColores = p.colores.length;
    if (numColores > 1) {
      unidad =
        unidad * (1 + settings.recargo_multicolor.base_pct / 100) +
        settings.recargo_multicolor.por_color_extra * (numColores - 1);
      extras.push(`${numColores} colores`);
    }

    const subtotal = unidad * cantidad;

    piezasOut.push({
      nombre: p.nombre,
      material: p.material,
      rellenoPct: res.relleno_pct,
      pesoG: round2(pesoG),
      soporteG: round2(soporteG),
      tiempoH: round2(tiempoH),
      cantidad,
      subtotal: round2(subtotal)
    });
    lineas.push({
      concepto:
        `${p.nombre}${cantidad > 1 ? ` × ${cantidad}` : ''} — ${p.material} ` +
        `(~${Math.round(pesoG)} g, ~${tiempoH.toFixed(1)} h${cantidad > 1 ? ' c/u' : ''}` +
        (extras.length ? `, ${extras.join(', ')}` : '') +
        ')',
      importe: round2(subtotal)
    });

    base += subtotal;
    pesoTotal += pesoG * cantidad;
    tiempoTotal += tiempoH * cantidad;
    unidades += cantidad;
  }

  let subtotal = base;

  // Quantity discount — highest tier met by the total unit count.
  let descuentoPct = 0;
  for (const tier of settings.descuentos_cantidad) {
    if (unidades >= tier.min) descuentoPct = tier.pct;
  }
  if (descuentoPct > 0) {
    const dto = subtotal * (descuentoPct / 100);
    lineas.push({
      concepto: `Descuento por cantidad (-${descuentoPct}%)`,
      importe: round2(-dto)
    });
    subtotal -= dto;
  }

  lineas.push({ concepto: 'Preparación y laminado', importe: round2(settings.tarifa_preparacion) });
  let total = subtotal + settings.tarifa_preparacion;

  const minimoAplicado = total < settings.precio_minimo;
  if (minimoAplicado) total = settings.precio_minimo;

  // Shipping estimate by total weight — applied after the minimum so pickup
  // and shipping orders share the same base price.
  let envio = 0;
  if (entrega === 'envio') {
    const tramo =
      settings.envio_tramos.find((t) => pesoTotal <= t.max_g) ??
      settings.envio_tramos[settings.envio_tramos.length - 1];
    envio = tramo?.precio ?? 0;
    if (envio > 0) {
      lineas.push({
        concepto: `Envío nacional (≈${Math.round(pesoTotal)} g)`,
        importe: round2(envio)
      });
      total += envio;
    }
  }

  const diasEstimados =
    Math.ceil(tiempoTotal / Math.max(settings.plazo_horas_dia, 1)) +
    Math.max(0, Math.round(settings.plazo_dias_margen));

  return {
    pesoG: round2(pesoTotal),
    tiempoH: round2(tiempoTotal),
    unidades,
    piezas: piezasOut,
    lineas,
    descuentoPct,
    total: round2(total),
    minimoAplicado,
    diasEstimados,
    envio: round2(envio)
  };
}
