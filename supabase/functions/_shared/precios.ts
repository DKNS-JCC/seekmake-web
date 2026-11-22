// Motor de precios del tasador: el MISMO código en la página (vía
// lib/quote/pricing.ts, que lo reexporta) y en la función submit-quote.
// Sin imports y sin APIs de Deno ni del navegador, para que lo carguen Next,
// tsx y Deno tal cual.
//
// Dos entradas, un cálculo:
// - Navegador (lib/quote/pricing.ts → computeQuote): gramos y horas salen del
//   estimador por capas, o de estimacionAproximada si aún no hay análisis.
// - Servidor (computeServerQuote): no lamina; acepta las cifras del
//   navegador solo si son verosímiles para el volumen (figurasCliente) y si
//   no, usa estimacionAproximada.
// Las dos acaban en cotizar(), que pone el dinero como la Calculadora:
// (material + máquina) × (markup + error), diseño sin cobrar, pedido mínimo
// y redondeo hacia arriba a 5 céntimos.

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

/** `P`: slicer overrides (lib/quote/estimador/perfil, Partial<PerfilImpresora>). */
export interface DetallePreset<P extends object = object> {
  id: string;
  nombre: string;
  descripcion: string;
  altura_capa_mm: number;
  /** Fallback heuristic only: print-time multiplier vs the standard profile. */
  factor_tiempo: number;
  /** Wall loops for this quality (Orca's "0.12mm Fine" prints 3). */
  paredes?: number;
  /** Any other slicer overrides for this quality (speeds, shells…). */
  perfil?: P;
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

/** Benchmark piece types (public.tasador_tipos, phase 1); the hardest wins. */
export type TipoPieza = 'sin soportes' | 'con soportes' | 'multicolor' | 'lote';

/**
 * The jsonb in public.quote_settings. `P` / `C`: the estimator's profile and
 * calibration types (lib/quote/pricing.ts fills them in; this file does not
 * read them).
 */
export interface QuoteSettings<P extends object = object, C extends object = object> {
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
  perfil: P;
  /** Estimator calibration; `peso` / `tiempo` are the shop's own factors. */
  calibracion: C;
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
  /** Shipping is free once the order (before shipping) reaches this, €. 0 = never. */
  envio_gratis_desde: number;
  /** Printing hours available per working day (for the lead-time estimate). */
  plazo_horas_dia: number;
  /** Working days of slack added to every deadline, so it is always met. */
  plazo_holgura_dias: number;
  /** Rush surcharge, % (admin only: the public tasador has no rush option). */
  urgencia_recargo_pct: number;
  /**
   * Piece types (tipoPieza) validated by the real benchmark (phase 1) that
   * get a firm price. Empty = no firm prices: the tasador works as before.
   */
  tipos_precio_firme: TipoPieza[];
  /**
   * Big orders show no price ("a consultar"): the automatic figure overshoots
   * on long prints and the shop prices them by hand. From this total (€) or
   * these print hours. 0 = that rule off. Size alone does not count: an
   * oversized file is usually a unit mistake or parts laid far apart.
   */
  consultar_desde_eur: number;
  consultar_desde_h: number;
  recargo_acabado_pct: Record<string, number>;
  recargo_multicolor: { base_pct: number; por_color_extra: number };
  resistencia: ResistenciaPreset[];
  detalle: DetallePreset<P>[];
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
  envio_gratis_desde: 30,
  fraccion_pared: 0.35,
  plazo_horas_dia: 4,
  plazo_holgura_dias: 2,
  urgencia_recargo_pct: 50,
  tipos_precio_firme: [],
  consultar_desde_eur: 100,
  consultar_desde_h: 40,
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

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
/** jsonb numbers can arrive as text (numeric columns, hand-edited config). */
const num = (v: unknown) => Number(v) || 0;

// ─── Plazo (fecha tope) ──────────────────────────────────────────────────
// Same count as public.fecha_tope() in SQL (20261110170000_pedido_estandar):
// keep the two in step.

/** Working days to have it ready: queue + this order at plazo_horas_dia, + extra days + slack. */
export function diasPlazo(horas: number, settings: Pick<QuoteSettings, 'plazo_horas_dia' | 'plazo_holgura_dias'>, colaH = 0, diasExtra = 0): number {
  return (
    Math.ceil(Math.max(0, colaH + horas) / Math.max(num(settings.plazo_horas_dia), 1)) +
    Math.max(0, Math.round(diasExtra)) +
    Math.max(0, Math.round(num(settings.plazo_holgura_dias)))
  );
}

/** `n` working days (Mon–Fri) after `desde` (YYYY-MM-DD). A weekend start counts from Monday. */
export function sumarLaborables(desde: string, n: number): string {
  const d = new Date(`${desde}T00:00:00Z`);
  const laborable = () => d.getUTCDay() % 6 !== 0;
  while (!laborable()) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = Math.max(0, Math.round(n)); i > 0; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (laborable()) i--;
  }
  return d.toISOString().slice(0, 10);
}

/** Today in Spain, YYYY-MM-DD (the browser or server clock may be elsewhere). */
export function hoyMadrid(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

/** Deadline date: today + diasPlazo working days. */
export function fechaTope(horas: number, settings: Pick<QuoteSettings, 'plazo_horas_dia' | 'plazo_holgura_dias'>, colaH = 0, hoy = hoyMadrid()): string {
  return sumarLaborables(hoy, diasPlazo(horas, settings, colaH));
}

/** «viernes 14 de noviembre» for a YYYY-MM-DD date. */
export function fechaLarga(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
  });
}

// ─── Precio firme ────────────────────────────────────────────────────────

/**
 * `separados`: several bodies, one color each, that do not touch
 * (objetosSeparados in lib/quote/tresmf.ts). They print without color
 * changes, so they are not a multicolor piece (phase 1, part D).
 */
export function tipoPieza(numColores: number, cantidad: number, conSoportes: boolean, separados = false): TipoPieza {
  if (numColores > 1 && !separados) return 'multicolor';
  if (cantidad > 1) return 'lote';
  return conSoportes ? 'con soportes' : 'sin soportes';
}

export function cabeEnCama(bbox: { x: number; y: number; z: number } | undefined | null, settings: Pick<QuoteSettings, 'max_bed_mm'>): boolean {
  return !!bbox && Math.max(num(bbox.x), num(bbox.y), num(bbox.z)) <= Number(settings.max_bed_mm);
}

/**
 * Firm only with measured confidence: layer analysis, fits the bed and a
 * validated type. A multicolor piece is never firm (the workshop prices it).
 */
export function esPrecioFirme(
  piezas: { tipo: TipoPieza; metodo: 'capas' | 'aproximado'; cabe: boolean }[],
  settings: Pick<QuoteSettings, 'tipos_precio_firme'>
): boolean {
  const validos = settings.tipos_precio_firme ?? [];
  return (
    validos.length > 0 &&
    piezas.length > 0 &&
    piezas.every((p) => p.metodo === 'capas' && p.cabe && p.tipo !== 'multicolor' && validos.includes(p.tipo))
  );
}

/** A big order: no price shown or emailed, the shop answers with one (see consultar_desde_*). */
export function esConsultar(
  q: { total: number; tiempoH: number },
  settings: Pick<QuoteSettings, 'consultar_desde_eur' | 'consultar_desde_h'>
): boolean {
  const eur = num(settings.consultar_desde_eur);
  const h = num(settings.consultar_desde_h);
  return (eur > 0 && q.total >= eur) || (h > 0 && q.tiempoH >= h);
}

/** Deposit to start: half the price (decision 13). */
export function senalPendiente(precio: number, cobrado: number): boolean {
  return Number(cobrado || 0) + 0.005 < Number(precio || 0) / 2;
}

// ─── Calculadora-derived tariff ──────────────────────────────────────────

/** Machine cost per print hour: electricity + wear. */
export function costeHoraMaquina(c: CostesCalculadora): number {
  const vida = num(c.vida_h) > 0 ? num(c.vida_h) : 1;
  return num(c.consumo_kw) * num(c.precio_kwh) + (num(c.impresora_eur) + num(c.mantenimiento_eur)) / vida;
}

/** Markup + error margin — what every euro of cost is multiplied by. */
export function factorCalculadora(c: CostesCalculadora): number {
  return Math.max(0, num(c.markup)) + Math.max(0, num(c.error));
}

/** € per kg for a muestrario material: exact name, then family, then PLA. */
export function precioKgDe(c: CostesCalculadora, material: string): number | undefined {
  const tabla = c?.precio_kg ?? {};
  const key = String(material).trim().toUpperCase();
  for (const [k, v] of Object.entries(tabla)) if (k.toUpperCase() === key) return Number(v);
  const familias = ['PETG', 'ASA', 'ABS', 'TPU', 'NYLON', 'PLA'];
  const fam = familias.find((f) => key.includes(f));
  if (fam) {
    for (const [k, v] of Object.entries(tabla)) if (k.toUpperCase() === fam) return Number(v);
  }
  return undefined;
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
      : base.envio_tramos,
    tipos_precio_firme: Array.isArray(r.tipos_precio_firme) ? [...r.tipos_precio_firme] : []
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

/** Defaults with the Calculadora-derived €/g and €/h already filled in. */
export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = normalizeSettings(null);

// ─── Cotización ──────────────────────────────────────────────────────────

/** Material, strength and detail of a piece; unknown ids fall back to the first. */
export function presetsDe(settings: QuoteSettings, material: string, resistenciaId: string, detalleId: string) {
  const mat: MaterialPricing = settings.materiales[material] ?? settings.materiales['PLA'] ?? {
    precio_g: 0.05,
    densidad: 1.24
  };
  const res = settings.resistencia.find((r) => r.id === resistenciaId) ?? settings.resistencia[0];
  const det = settings.detalle.find((d) => d.id === detalleId) ?? settings.detalle[0];
  return { mat, res, det };
}

/** Grams and hours from the volume alone, for when there is no layer analysis. */
export function estimacionAproximada(
  volumenCm3: number,
  soporteCm3: number,
  alturaMm: number,
  settings: QuoteSettings,
  mat: MaterialPricing,
  rellenoPct: number,
  det: DetallePreset
): { pesoG: number; soporteG: number; tiempoH: number; conSoportes: boolean } {
  const fraccion = settings.fraccion_pared + (1 - settings.fraccion_pared) * (rellenoPct / 100);
  const soporteG = soporteCm3 * settings.soporte_relleno * mat.densidad;
  const pesoG = volumenCm3 * mat.densidad * fraccion + soporteG;
  const caudal = Math.max(settings.caudal_g_h, 1) * Math.max(mat.factor_velocidad ?? 1, 0.05);
  const capas = det.altura_capa_mm > 0 ? alturaMm / det.altura_capa_mm : 0;
  const tiempoH = (pesoG / caudal) * det.factor_tiempo + (capas * settings.tiempo_capa_s) / 3600;
  return { pesoG, soporteG, tiempoH, conSoportes: soporteG >= Math.max(1, num(settings.soporte_min_g)) };
}

export interface ColorPieza {
  nombre: string;
  hex: string;
  acabado: string | null;
}

/** One piece with its grams and hours already estimated (per unit). */
export interface PiezaCotizable {
  nombre: string;
  material: string;
  cantidad: number;
  colores: ColorPieza[];
  resistenciaId: string;
  detalleId: string;
  bboxMm?: { x: number; y: number; z: number } | null;
  /** Several bodies of one color each that do not touch (tipoPieza). */
  separados?: boolean;
  pesoG: number;
  soporteG: number;
  tiempoH: number;
  metodo: 'capas' | 'aproximado';
  /** Copies per plate and plates needed. */
  porCama: number;
  camas: number;
  conSoportes: boolean;
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
  /** Working days until ready, without the queue (see diasPlazo). */
  diasEstimados: number;
  /**
   * Every piece is of a validated type, layer-analysed, single-color and
   * fits the bed: what the customer sees is what they pay. Always false
   * while tipos_precio_firme is empty.
   */
  precioFirme: boolean;
  /** Shipping line included in the total (0 for pickup or free shipping). */
  envio: number;
  /** € more in pieces before shipping is free (0: already free, or no threshold). */
  faltaEnvioGratis: number;
  /** € of pieces that still fit in the minimum order at no extra cost. */
  margenMinimo: number;
}

/** Round a price up to the configured multiple (the Calculadora's 5 cents). */
function redondear(n: number, paso: number): number {
  if (!(paso > 0)) return round2(n);
  return round2(Math.ceil(round2(n) / paso - 1e-9) * paso);
}

/** Distinct colors of a piece (a multi-part 3MF repeats them per part). */
export function numColores(colores: ColorPieza[]): number {
  return new Set(colores.map((c) => `${c.nombre}|${c.hex}`)).size;
}

/** Type of each piece for the firm-price rule. */
export function tipoDe(p: PiezaCotizable): TipoPieza {
  return tipoPieza(numColores(p.colores), Math.max(1, Math.floor(p.cantidad)), p.conSoportes, !!p.separados);
}

/** The money: pieces with their figures → lines, discounts, minimum, shipping. */
export function cotizar(
  piezas: PiezaCotizable[],
  settings: QuoteSettings,
  entrega: 'recogida' | 'envio' | string = 'recogida',
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
    const { mat, res } = presetsDe(settings, p.material, p.resistenciaId, p.detalleId);
    const cantidad = Math.max(1, Math.floor(p.cantidad));

    // Priced from the same rounded figures the server receives, so both
    // sides agree to the cent.
    const pesoG = round3(p.pesoG);
    const soporteG = round3(p.soporteG);
    const tiempoH = round4(p.tiempoH);
    let unidad = pesoG * mat.precio_g + tiempoH * settings.precio_hora;

    const extras: string[] = [];
    if (soporteG >= 1) extras.push(`soportes ~${Math.round(soporteG)} g`);
    const postpro = num(settings.calculadora?.postpro_soportes_eur);
    if (calculadora && p.conSoportes && postpro > 0) {
      unidad += postpro;
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
    const colores = numColores(p.colores);
    if (colores > 1) {
      unidad =
        unidad * (1 + settings.recargo_multicolor.base_pct / 100) +
        settings.recargo_multicolor.por_color_extra * (colores - 1);
      extras.push(`${colores} colores`);
    }
    if (p.metodo === 'capas' && cantidad > 1 && p.porCama > 1) {
      extras.push(`${p.porCama} por cama`);
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
      metodo: p.metodo,
      porCama: p.porCama,
      camas: p.camas,
      conSoportes: p.conSoportes
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
  if (cupon && subtotal >= Number(cupon.pedido_minimo)) {
    const valor = Number(cupon.valor);
    dtoCupon = aPaso(Math.min(sinCupon, cupon.tipo === 'pct' ? sinCupon * (valor / 100) : valor));
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
  const margenMinimo = minimoAplicado ? round2(minimo - previo) : 0;
  if (minimoAplicado) {
    const falta = margenMinimo;
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
    const valor = Number(cupon!.valor);
    lineas.push({
      concepto:
        `Código ${cupon!.codigo} (` +
        (cupon!.tipo === 'pct' ? `-${valor}%` : `-${valor.toFixed(2)} €`) +
        ')',
      importe: -dtoCupon
    });
    total -= dtoCupon;
  }

  // Shipping estimate by total weight — applied after the minimum so pickup
  // and shipping orders share the same base price.
  let envio = 0;
  let faltaEnvioGratis = 0;
  if (entrega === 'envio') {
    const tramo =
      settings.envio_tramos.find((t) => pesoTotal <= t.max_g) ??
      settings.envio_tramos[settings.envio_tramos.length - 1];
    envio = tramo?.precio ?? 0;
    const gratisDesde = num(settings.envio_gratis_desde);
    const gratis = gratisDesde > 0 && round2(total) >= gratisDesde;
    if (gratis) envio = 0;
    else if (gratisDesde > 0) faltaEnvioGratis = round2(gratisDesde - total);
    if (envio > 0 || gratis) {
      lineas.push({
        concepto: `Envío nacional (≈${Math.round(pesoTotal)} g)${gratis ? ' — gratis' : ''}`,
        importe: round2(envio)
      });
      total += envio;
    }
  }

  const precioFirme = esPrecioFirme(
    piezas.map((p, i) => ({
      tipo: tipoDe(p),
      metodo: piezasOut[i].metodo,
      cabe: cabeEnCama(p.bboxMm, settings)
    })),
    settings
  );

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
    diasEstimados: diasPlazo(tiempoTotal, settings),
    precioFirme,
    envio: round2(envio),
    faltaEnvioGratis,
    margenMinimo
  };
}

// ─── Entrada del servidor (submit-quote) ─────────────────────────────────
// The client total is NEVER trusted: the server recomputes the money from
// the per-piece figures and the quote_settings row.

/**
 * Grams/hours per unit from the browser's layer analysis, if plausible for
 * the part's volume (supports can outweigh a part, a hollow shell can be
 * light, but not by orders of magnitude).
 */
export function figurasCliente(am: any, densidad: number): { pesoG: number; soporteG: number; tiempoH: number } | null {
  if (am?.estimador !== 'capas-v1') return null;
  const pesoG = Number(am.peso_g), tiempoH = Number(am.tiempo_h);
  const soporteG = Math.max(0, Number(am.soporte_g) || 0);
  const solido = Math.max(0, Number(am.volumen_cm3) || 0) * densidad;
  if (!Number.isFinite(pesoG) || !Number.isFinite(tiempoH)) return null;
  if (pesoG <= 0 || tiempoH <= 0 || tiempoH > 2000) return null;
  if (pesoG > solido * 3 + 5 || pesoG < solido * 0.05) return null;
  return { pesoG, soporteG: Math.min(soporteG, pesoG), tiempoH };
}

/** What the server stores per piece (quotes.archivos[i].metricas). */
export interface PiezaServidor {
  peso_g: number;
  soporte_g: number;
  tiempo_h: number;
  relleno_pct: number;
  metodo: 'capas' | 'aproximado';
  tipo: TipoPieza;
  cabe: boolean;
}

/** Recompute the quote from sanitized `archivos` + settings (+ a valid code). */
export function computeServerQuote(archivos: any[], entrega: string, settings: QuoteSettings, cupon: any = null) {
  const piezas: PiezaCotizable[] = archivos.map((a) => {
    const am = a.metricas ?? {};
    const { mat, res, det } = presetsDe(settings, a.material, a.resistencia, a.detalle);
    const cantidad = Math.max(1, Math.floor(a.cantidad));
    const cli = figurasCliente(am, mat.densidad);
    const fig = cli
      ? { ...cli, metodo: 'capas' as const, conSoportes: Boolean(am.con_soportes) }
      : {
          ...estimacionAproximada(
            Math.max(0, Number(am.volumen_cm3) || 0),
            Math.max(0, Number(am.soporte_cm3) || 0),
            Math.max(0, Number(am.bbox_mm?.y) || 0),
            settings,
            mat,
            res.relleno_pct,
            det
          ),
          metodo: 'aproximado' as const
        };
    const porCama = Math.max(1, Math.floor(Number(am.por_cama) || 1));
    return {
      nombre: a.nombre,
      material: a.material,
      cantidad,
      colores: a.colores,
      resistenciaId: a.resistencia,
      detalleId: a.detalle,
      bboxMm: am.bbox_mm,
      separados: am.objetos_separados === true,
      ...fig,
      porCama,
      camas: Math.ceil(cantidad / porCama)
    };
  });
  const q = cotizar(
    piezas,
    settings,
    entrega,
    cupon && { ...cupon, valor: Number(cupon.valor), pedido_minimo: Number(cupon.pedido_minimo) }
  );
  return {
    total: q.total,
    lineas: q.lineas,
    descuentoPct: q.descuentoPct,
    cupon: q.cupon,
    cuponDescuento: q.cuponDescuento,
    minimoAplicado: q.minimoAplicado,
    envio: q.envio,
    pesoG: q.pesoG,
    tiempoH: q.tiempoH,
    unidades: q.unidades,
    diasEstimados: q.diasEstimados,
    precioFirme: q.precioFirme,
    piezas: q.piezas.map(
      (r, i): PiezaServidor => ({
        peso_g: r.pesoG,
        soporte_g: r.soporteG,
        tiempo_h: r.tiempoH,
        relleno_pct: r.rellenoPct,
        metodo: r.metodo,
        tipo: tipoDe(piezas[i]),
        cabe: cabeEnCama(piezas[i].bboxMm, settings)
      })
    )
  };
}
