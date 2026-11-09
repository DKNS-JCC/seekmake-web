// Pricing engine for the tasador. Pure functions over QuoteSettings (the
// jsonb stored in public.quote_settings) so the same math runs in the quote
// page, the admin preview and — as a port — the submit-quote Edge Function.
//
// Grams and hours come from the slicer-like estimator (lib/quote/estimador)
// when the part's layer analysis is available; the old volume heuristic is
// kept only as a fallback (analysis still running, failed, or server side).
// Money follows the shop's Calculadora: (material + machine cost) ×
// (markup + error margin), design not charged, minimum order, rounded up to
// 5 cents.

import type { MeshMetrics } from './geometry';
import type { Analisis } from './estimador/analizar';
import type { Calibracion } from './estimador/evaluar';
import type { PerfilImpresora } from './estimador/perfil';
import { estimarPieza } from './estimador';

export interface MaterialPricing {
  /** € per gram of printed material (derived in 'calculadora' mode). */
  precio_g: number;
  /** Filament density in g/cm³ (PLA ≈ 1.24). */
  densidad: number;
  /** Fallback heuristic only: print-speed factor relative to PLA. */
  factor_velocidad?: number;
  // Filament behaviour for the estimator (Orca filament profile). Missing
  // values fall back to the material family's K1 SE preset.
  /** filament_max_volumetric_speed, mm³/s. */
  vol_max?: number;
  /** slow_down_layer_time, s. */
  tiempo_min_capa?: number;
  /** slow_down_min_speed, mm/s. */
  v_min?: number;
  /** filament_flow_ratio. */
  flujo?: number;
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
  /** Fallback heuristic only: print-time multiplier vs the standard profile. */
  factor_tiempo: number;
  /** Wall loops for this quality (Orca's "0.12mm Fine" prints 3). */
  paredes?: number;
  /** Any other slicer overrides for this quality (speeds, shells…). */
  perfil?: Partial<PerfilImpresora>;
}

/**
 * The Calculadora's cost model (src/shared/backend.mjs): material at cost
 * per kg plus machine hours (electricity + wear), all multiplied by
 * markup + error margin. Design is never charged for web orders (the
 * customer brings the file).
 */
export interface CostesCalculadora {
  /** Printer price, service costs over its life, life in hours, power (kW). */
  impresora_eur: number;
  mantenimiento_eur: number;
  vida_h: number;
  consumo_kw: number;
  precio_kwh: number;
  /** € per kg by material name (as in the muestrario). */
  precio_kg: Record<string, number>;
  /** "Normal (230 %)" → 2.3. */
  markup: number;
  /** Probabilidad de error: "Baja (25 %)" → 0.25. */
  error: number;
  /** Post-processing per unit when the part needs supports, €. */
  postpro_soportes_eur: number;
  /**
   * Set by the database when these costs were copied from the Calculadora's
   * own config (trigger on empresa_docs, migration 0024): the printer name
   * and when. The web then shows them read-only.
   */
  impresora?: string;
  sincronizado?: string;
}

export interface QuoteSettings {
  version: number;
  /**
   * 'calculadora': €/g and €/h are derived from `calculadora` (same money as
   * the desktop app). 'tarifa': the hand-set precio_g / precio_hora.
   */
  modo_precio: 'calculadora' | 'tarifa';
  calculadora: CostesCalculadora;
  /** Keyed by `filamentos.material` (PLA, PETG, ASA, TPU…). */
  materiales: Record<string, MaterialPricing>;
  precio_hora: number;
  /** Flat fee per order (slicing/design). 0 = not charged. */
  tarifa_preparacion: number;
  precio_minimo: number;
  /** Round piece prices up to a multiple of this (€); 0 = off. */
  redondeo: number;

  // ── estimator ──
  /** Printer profile overrides over Orca's K1 SE preset. */
  perfil: Partial<PerfilImpresora>;
  /** Estimator calibration; `peso` / `tiempo` are the shop's own factors. */
  calibracion: Partial<Calibracion>;
  /** Support style the shop uses when a part needs them. */
  soporte_tipo: 'normal' | 'arbol';
  /** Supports lighter than this (g per unit) are not worth enabling. */
  soporte_min_g: number;
  /** Lay parts on the bed the cheap way instead of as uploaded. */
  orientacion_auto: boolean;
  /** Keep the customer's orientation when within this % of the best. */
  orientacion_tolerancia_pct: number;

  // ── fallback heuristic (no layer analysis) ──
  /** Average machine throughput in grams/hour at the standard profile. */
  caudal_g_h: number;
  /** Fixed per-layer overhead in seconds. */
  tiempo_capa_s: number;
  /** Sparse density of support structures (0-1). */
  soporte_relleno: number;
  /** Fraction of the solid volume that is walls/top/bottom. */
  fraccion_pared: number;

  /** Largest printable axis in mm (warn above this). */
  max_bed_mm: number;
  /** Days the estimate stays valid (shown to the customer + accept window). */
  validez_dias: number;
  /** Shipping tiers by total order weight, sorted ascending by max_g. */
  envio_tramos: EnvioTramo[];
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

/** Calculadora defaults (createDefaultData in the desktop app). */
export const COSTES_CALCULADORA: CostesCalculadora = {
  impresora_eur: 738,
  mantenimiento_eur: 100,
  vida_h: 3000,
  consumo_kw: 0.15,
  precio_kwh: 0.24,
  precio_kg: { PLA: 20, PETG: 18, 'PLA SILK/MARBLE': 23, ASA: 24, TPU: 21 },
  markup: 2.3,
  error: 0.25,
  postpro_soportes_eur: 0
};

const BASE_SETTINGS: QuoteSettings = {
  version: 2,
  modo_precio: 'calculadora',
  calculadora: COSTES_CALCULADORA,
  materiales: {
    PLA: { precio_g: 0.05, densidad: 1.24, factor_velocidad: 1 },
    PETG: { precio_g: 0.06, densidad: 1.27, factor_velocidad: 0.9 },
    ASA: { precio_g: 0.07, densidad: 1.07, factor_velocidad: 0.85 },
    TPU: { precio_g: 0.08, densidad: 1.21, factor_velocidad: 0.4 }
  },
  precio_hora: 0.3,
  tarifa_preparacion: 0,
  precio_minimo: 7,
  redondeo: 0.05,
  perfil: {},
  calibracion: {},
  soporte_tipo: 'normal',
  soporte_min_g: 1,
  orientacion_auto: true,
  orientacion_tolerancia_pct: 3,
  caudal_g_h: 18,
  tiempo_capa_s: 6,
  soporte_relleno: 0.15,
  max_bed_mm: 220,
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
    { id: 'estandar', nombre: 'Estándar', descripcion: 'Uso diario normal', relleno_pct: 15 },
    { id: 'resistente', nombre: 'Resistente', descripcion: 'Soportará golpes o carga', relleno_pct: 40 },
    { id: 'maciza', nombre: 'Maciza', descripcion: 'Máxima dureza, pieza casi sólida', relleno_pct: 100 }
  ],
  // Mirrors Orca's K1 SE presets: 0.24 Draft, 0.20 Standard, 0.12 Fine.
  detalle: [
    { id: 'rapido', nombre: 'Rápido', descripcion: 'Capas visibles, más económico', altura_capa_mm: 0.24, factor_tiempo: 0.8 },
    { id: 'estandar', nombre: 'Estándar', descripcion: 'Buen equilibrio calidad/precio', altura_capa_mm: 0.2, factor_tiempo: 1 },
    {
      id: 'fino',
      nombre: 'Alto detalle',
      descripcion: 'Superficie fina, ideal figuras',
      altura_capa_mm: 0.12,
      factor_tiempo: 1.7,
      paredes: 3,
      perfil: {
        espesorSuperiorMin: 0.6,
        vRelleno: 500,
        vSolido: 300,
        vSuperior: 200,
        aSuperior: 5000,
        aRelleno: 12000,
        aSolido: 12000
      }
    }
  ],
  // Batches are priced by plate (copies share layers), like the slicer does,
  // so no extra quantity discount by default.
  descuentos_cantidad: []
};

// ─── Calculadora-derived tariff ──────────────────────────────────────────

/** Machine cost per print hour: electricity + wear. */
export function costeHoraMaquina(c: CostesCalculadora): number {
  const vida = c.vida_h > 0 ? c.vida_h : 1;
  return c.consumo_kw * c.precio_kwh + (c.impresora_eur + c.mantenimiento_eur) / vida;
}

/** Markup + error margin — what every euro of cost is multiplied by. */
export function factorCalculadora(c: CostesCalculadora): number {
  return Math.max(0, c.markup) + Math.max(0, c.error);
}

/** € per kg for a muestrario material: exact name, then family, then PLA. */
export function precioKgDe(c: CostesCalculadora, material: string): number | undefined {
  const tabla = c.precio_kg ?? {};
  const key = material.trim().toUpperCase();
  for (const [k, v] of Object.entries(tabla)) if (k.toUpperCase() === key) return v;
  const familias = ['PETG', 'ASA', 'ABS', 'TPU', 'NYLON', 'PLA'];
  const fam = familias.find((f) => key.includes(f));
  if (fam) {
    for (const [k, v] of Object.entries(tabla)) if (k.toUpperCase() === fam) return v;
  }
  return undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Merge a stored config over the defaults so missing keys never crash. */
export function normalizeSettings(raw: unknown): QuoteSettings {
  const base = BASE_SETTINGS;
  const r = raw && typeof raw === 'object' ? (raw as Partial<QuoteSettings>) : {};
  const s: QuoteSettings = {
    ...base,
    ...r,
    calculadora: {
      ...base.calculadora,
      ...(r.calculadora ?? {}),
      precio_kg: { ...base.calculadora.precio_kg, ...(r.calculadora?.precio_kg ?? {}) }
    },
    materiales: Object.fromEntries(
      Object.entries({ ...base.materiales, ...(r.materiales ?? {}) }).map(([k, v]) => [k, { ...v }])
    ),
    perfil: { ...(r.perfil ?? {}) },
    calibracion: { ...(r.calibracion ?? {}) },
    recargo_acabado_pct: { ...base.recargo_acabado_pct, ...(r.recargo_acabado_pct ?? {}) },
    recargo_multicolor: { ...base.recargo_multicolor, ...(r.recargo_multicolor ?? {}) },
    resistencia: r.resistencia?.length ? r.resistencia : base.resistencia,
    detalle: r.detalle?.length ? r.detalle : base.detalle,
    // An explicit empty list means "no quantity discounts".
    descuentos_cantidad: Array.isArray(r.descuentos_cantidad)
      ? [...r.descuentos_cantidad].sort((a, b) => a.min - b.min)
      : base.descuentos_cantidad,
    envio_tramos: r.envio_tramos?.length
      ? [...r.envio_tramos].sort((a, b) => a.max_g - b.max_g)
      : base.envio_tramos
  };
  if (s.modo_precio !== 'tarifa') s.modo_precio = 'calculadora';
  if (s.modo_precio === 'calculadora') {
    // Same money as the desktop app: cost × (markup + error).
    const f = factorCalculadora(s.calculadora);
    s.precio_hora = round4(costeHoraMaquina(s.calculadora) * f);
    for (const [k, m] of Object.entries(s.materiales)) {
      const kg = precioKgDe(s.calculadora, k);
      if (kg !== undefined) m.precio_g = round4((kg / 1000) * f);
    }
  }
  return s;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Defaults with the Calculadora-derived €/g and €/h already filled in. */
export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = normalizeSettings(null);

export interface PiezaInput {
  nombre: string;
  metrics: MeshMetrics;
  /** Layer analysis in print orientation; absent → volume heuristic. */
  analisis?: Analisis | null;
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
  /** Per unit, support material included (g, 3 decimals). */
  pesoG: number;
  /** Estimated support material per unit (already in pesoG). */
  soporteG: number;
  /** Per unit (batch time ÷ quantity when copies share plates), 4 decimals. */
  tiempoH: number;
  cantidad: number;
  /** All units of this piece, surcharges included. */
  subtotal: number;
  /** 'capas' = layer analysis; 'aproximado' = volume heuristic. */
  metodo: 'capas' | 'aproximado';
  /** Copies per plate and plates needed. */
  porCama: number;
  camas: number;
  conSoportes: boolean;
}

/** A discount code as validar_cupon() returns it. */
export interface Cupon {
  codigo: string;
  tipo: 'pct' | 'fijo';
  valor: number;
  /** Pieces must add up to this (€) before the code applies. */
  pedido_minimo: number;
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
  /** The discount code that took effect (null: none, or below its minimum). */
  cupon: string | null;
  /** € taken off by the code (0 when it did not apply). */
  cuponDescuento: number;
  total: number;
  /** True when precio_minimo kicked in (already spread over the pieces). */
  minimoAplicado: boolean;
  /** Estimated working days until the order is ready for pickup/shipping. */
  diasEstimados: number;
  /** Shipping line included in the total (0 for pickup). */
  envio: number;
}

/** Round a price up to the configured multiple (the Calculadora's 5 cents). */
function redondear(n: number, paso: number): number {
  if (!(paso > 0)) return round2(n);
  return round2(Math.ceil(round2(n) / paso - 1e-9) * paso);
}

/** Old volume-based guess, kept for when no layer analysis is available. */
function estimacionAproximada(
  p: PiezaInput,
  settings: QuoteSettings,
  mat: MaterialPricing,
  rellenoPct: number,
  det: DetallePreset
): { pesoG: number; soporteG: number; tiempoH: number } {
  // Same precision the quote page sends to the server (see submit()).
  const volumen = Math.round(p.metrics.volumenCm3 * 100) / 100;
  const soporteCm3 = Math.round((p.metrics.soporteCm3 ?? 0) * 10) / 10;
  const fraccion = settings.fraccion_pared + (1 - settings.fraccion_pared) * (rellenoPct / 100);
  const pesoPieza = volumen * mat.densidad * fraccion;
  const soporteG = soporteCm3 * settings.soporte_relleno * mat.densidad;
  const pesoG = pesoPieza + soporteG;
  const caudal = Math.max(settings.caudal_g_h, 1) * Math.max(mat.factor_velocidad ?? 1, 0.05);
  const capas = det.altura_capa_mm > 0 ? p.metrics.bboxMm.y / det.altura_capa_mm : 0;
  const tiempoH = (pesoG / caudal) * det.factor_tiempo + (capas * settings.tiempo_capa_s) / 3600;
  return { pesoG, soporteG, tiempoH };
}

export function computeQuote(
  piezas: PiezaInput[],
  settings: QuoteSettings,
  entrega: 'recogida' | 'envio' = 'recogida',
  cupon: Cupon | null = null
): QuoteResult {
  const lineas: QuoteLine[] = [];
  const piezasOut: PiezaResult[] = [];
  let base = 0;
  let pesoTotal = 0;
  let tiempoTotal = 0;
  let unidades = 0;
  const calculadora = settings.modo_precio === 'calculadora';

  for (const p of piezas) {
    const mat = settings.materiales[p.material] ?? settings.materiales['PLA'] ?? {
      precio_g: 0.05,
      densidad: 1.24
    };
    const res =
      settings.resistencia.find((r) => r.id === p.resistenciaId) ?? settings.resistencia[0];
    const det = settings.detalle.find((d) => d.id === p.detalleId) ?? settings.detalle[0];
    const cantidad = Math.max(1, Math.floor(p.cantidad));

    let pesoG: number, soporteG: number, tiempoH: number;
    let metodo: PiezaResult['metodo'] = 'aproximado';
    let porCama = 1, camas = cantidad;
    let conSoportes = false;
    if (p.analisis && p.analisis.muestras.length) {
      const e = estimarPieza(p.analisis, settings, {
        material: p.material,
        resistenciaId: res.id,
        detalleId: det.id,
        cantidad
      });
      pesoG = e.pesoG;
      soporteG = e.soporteG;
      tiempoH = e.tiempoH;
      porCama = e.porCama;
      camas = e.camas;
      conSoportes = e.conSoportes;
      metodo = 'capas';
    } else {
      ({ pesoG, soporteG, tiempoH } = estimacionAproximada(p, settings, mat, res.relleno_pct, det));
      conSoportes = soporteG >= Math.max(1, settings.soporte_min_g);
    }

    // Priced from the same rounded figures the server receives, so both
    // sides agree to the cent.
    pesoG = round3(pesoG);
    soporteG = round3(soporteG);
    tiempoH = round4(tiempoH);
    let unidad = pesoG * mat.precio_g + tiempoH * settings.precio_hora;

    const extras: string[] = [];
    if (soporteG >= 1) extras.push(`soportes ~${Math.round(soporteG)} g`);
    if (calculadora && conSoportes && settings.calculadora.postpro_soportes_eur > 0) {
      unidad += settings.calculadora.postpro_soportes_eur;
      extras.push('retirada de soportes');
    }

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
    if (cantidad > 1 && porCama > 1) {
      extras.push(`${porCama} por cama`);
    }

    const subtotal = redondear(unidad * cantidad, settings.redondeo);

    piezasOut.push({
      nombre: p.nombre,
      material: p.material,
      rellenoPct: res.relleno_pct,
      pesoG,
      soporteG,
      tiempoH,
      cantidad,
      subtotal,
      metodo,
      porCama,
      camas,
      conSoportes
    });
    lineas.push({
      concepto:
        `${p.nombre}${cantidad > 1 ? ` × ${cantidad}` : ''} — ${p.material} ` +
        `(~${Math.round(pesoG)} g, ~${tiempoH.toFixed(1)} h${cantidad > 1 ? ' c/u' : ''}` +
        (extras.length ? `, ${extras.join(', ')}` : '') +
        ')',
      importe: subtotal
    });

    base += subtotal;
    pesoTotal += pesoG * cantidad;
    tiempoTotal += tiempoH * cantidad;
    unidades += cantidad;
  }

  const subtotal = base;

  // Quantity discount — highest tier met by the total unit count.
  let descuentoPct = 0;
  for (const tier of settings.descuentos_cantidad) {
    if (unidades >= tier.min) descuentoPct = tier.pct;
  }
  // Rounded down to the price step so the lines still add up.
  const paso = settings.redondeo > 0 ? settings.redondeo : 0.01;
  const aPaso = (n: number) => round2(Math.floor(round2(n) / paso + 1e-9) * paso);
  const dtoCantidad = descuentoPct > 0 ? aPaso(subtotal * (descuentoPct / 100)) : 0;
  const prep = settings.tarifa_preparacion > 0 ? round2(settings.tarifa_preparacion) : 0;
  const minimo = settings.precio_minimo;

  // Discount code: on the order once the minimum is met, so it can take the
  // price below the minimum. Never stacked with the quantity discount:
  // whichever leaves less to pay wins (the code on a tie).
  const sinCupon = Math.max(minimo, subtotal + prep);
  let dtoCupon = 0;
  if (cupon && subtotal >= cupon.pedido_minimo) {
    dtoCupon = aPaso(
      Math.min(sinCupon, cupon.tipo === 'pct' ? sinCupon * (cupon.valor / 100) : cupon.valor)
    );
  }
  const conCantidad = Math.max(minimo, subtotal - dtoCantidad + prep);
  if (dtoCupon > 0 && sinCupon - dtoCupon <= conCantidad) descuentoPct = 0;
  else dtoCupon = 0;
  const dtoAntes = dtoCupon > 0 ? 0 : dtoCantidad;

  // Minimum order: never shown to the customer as such. The shortfall goes
  // into the piece prices (in proportion to each one), so the lines always
  // add up to the total.
  const previo = round2(subtotal - dtoAntes + prep);
  const minimoAplicado = previo < minimo && piezasOut.length > 0;
  if (minimoAplicado) {
    const falta = round2(minimo - previo);
    let repartido = 0;
    piezasOut.forEach((p, i) => {
      const extra =
        i === piezasOut.length - 1
          ? round2(falta - repartido)
          : aPaso(subtotal > 0 ? falta * (p.subtotal / subtotal) : 0);
      repartido = round2(repartido + extra);
      p.subtotal = round2(p.subtotal + extra);
      lineas[i].importe = p.subtotal;
    });
  }

  if (dtoAntes > 0) {
    lineas.push({ concepto: `Descuento por cantidad (-${descuentoPct}%)`, importe: -dtoAntes });
  }
  if (prep > 0) lineas.push({ concepto: 'Preparación y laminado', importe: prep });
  let total = Math.max(minimo, previo);
  if (dtoCupon > 0) {
    lineas.push({
      concepto:
        `Código ${cupon!.codigo} (` +
        (cupon!.tipo === 'pct' ? `-${cupon!.valor}%` : `-${cupon!.valor.toFixed(2)} €`) +
        ')',
      importe: -dtoCupon
    });
    total -= dtoCupon;
  }

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
    cupon: dtoCupon > 0 ? cupon!.codigo : null,
    cuponDescuento: dtoCupon,
    total: round2(total),
    minimoAplicado,
    diasEstimados,
    envio: round2(envio)
  };
}
