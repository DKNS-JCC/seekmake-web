// Motor de «Nuevo encargo» (/admin/encargo): el precio de un encargo a medida.
//
// Es la fórmula de la Calculadora 7.2 (src/shared/backend.mjs,
// calculateBudget), portada sin cambiar ni un céntimo:
//   coste    = filamento + luz + desgaste de la impresora
//   precio   = coste × margen + coste × error + diseño + post-procesado × uds,
//              × (1 + urgencia), con mínimo, redondeo a 5 céntimos hacia
//              arriba, + gasto extra y otra vez redondeo.
// El diseño se cobra una vez; el post-procesado, por unidad.
// scripts/test-paridad-calculadora.ts lo compara con el original.
//
// La configuración (impresoras, €/kg, €/h, mínimo) es la de la Calculadora
// (empresa_docs 3dcc/config): la misma que usa la 7.2, para que un pedido dé
// el mismo precio en las dos. Solo la urgencia viene de quote_settings
// (urgencia_recargo_pct, 50 % como la 7.2).

export const DISENO_A_MEDIDA = 'A medida (por horas)';

/** Minutos de cada tramo de diseño (cadenas exactas de la Calculadora). */
export const DISENO_MODELADO: Record<string, number> = {
  'No necesario': 0,
  'Básica (slicer)': 9,
  'Búsqueda de modelos': 15,
  'Media (Fusion <1h)': 30,
  'Alta (Fusion >1h / Artístico)': 60,
  [DISENO_A_MEDIDA]: 0
};

/** Minutos de post-procesado por unidad. */
export const POSTPROCESADO: Record<string, number> = {
  Limpio: 0,
  'Sencillo (lijado)': 20,
  'Medio (lijado + ensamblado)': 40,
  'Avanzado (+ pintura)': 80
};

/** Margen de error. Las dos primeras solo existen en pedidos antiguos. */
export const PROBABILIDAD_ERROR: Record<string, number> = {
  'Exenta (0%)': 0,
  'Mínima (10%)': 0.1,
  'Baja (25%)': 0.25,
  'Media (50%)': 0.5,
  'Alta (100%)': 1,
  'Muy Alta (150%)': 1.5,
  'Crítica (200%)': 2
};

// Etiquetas de pedidos anteriores al tarifario de dos tramos (la 7.2 las
// pliega igual al cargar): para editar un pedido viejo sin cambiarle el precio.
const DISENO_LEGACY: Record<string, string> = {
  'Chorrada - En Slicer': 'Básica (slicer)',
  "Fácil - Fusión 30'": 'Media (Fusion <1h)',
  "Medio - Fusión 60'": 'Media (Fusion <1h)',
  'Avanzado - AI + Remesh': 'Alta (Fusion >1h / Artístico)'
};
const POSTPROC_LEGACY: Record<string, string> = {
  No: 'Limpio',
  'Sencillo (Lijado ligero)': 'Sencillo (lijado)',
  'Medio (Lijado + Ensamblado)': 'Medio (lijado + ensamblado)',
  'Complejo (Lijado + Pintura)': 'Avanzado (+ pintura)'
};
const SOPORTES_A_POSTPROC: Record<string, string> = {
  'Pocos / Baja dificultad': 'Sencillo (lijado)',
  'Muchos / Elevada dificultad': 'Medio (lijado + ensamblado)'
};

export function migrarDiseno(diseno: unknown, busqueda?: unknown): string {
  const d = String(diseno ?? '');
  if (DISENO_MODELADO[d] !== undefined) {
    return d === 'No necesario' && busqueda === 'Sí' ? 'Búsqueda de modelos' : d;
  }
  return DISENO_LEGACY[d] ?? (busqueda === 'Sí' ? 'Búsqueda de modelos' : 'No necesario');
}

export function migrarPostpro(postpro: unknown, soportes?: unknown): string {
  const p = String(postpro ?? '');
  const base = POSTPROCESADO[p] !== undefined ? p : POSTPROC_LEGACY[p] || 'Limpio';
  const porSoportes = SOPORTES_A_POSTPROC[String(soportes ?? '')];
  if (!porSoportes) return base;
  const orden = Object.keys(POSTPROCESADO);
  return orden.indexOf(porSoportes) > orden.indexOf(base) ? porSoportes : base;
}

/** Los cinco niveles que ofrece la pantalla (los de la Calculadora). */
export const RIESGOS = ['Baja (25%)', 'Media (50%)', 'Alta (100%)', 'Muy Alta (150%)', 'Crítica (200%)'];

export const MARKUP_LABEL = 'Normal (230%)';
export const MARKUP = 2.3;

export interface ImpresoraCalc {
  name: string;
  price_eur: number;
  depreciation_time_h: number;
  service_costs_life_eur: number;
  energy_consumption_kwh: number;
}

/** empresa_docs (3dcc, config) de la Calculadora: lo que usa este motor. */
export interface ConfigCalculadora {
  printers: ImpresoraCalc[];
  filament_types: { name: string; price_per_kg: number }[];
  global_config: {
    energy_cost_kwh?: number;
    labor_cost_h?: number;
    postproc_cost_h?: number;
    precio_minimo?: number;
  };
}

export interface LineaMaterial {
  material: string;
  color: string;
  gramos: number;
}

export interface EncargoInput {
  impresora: string;
  /** 1 línea = un color; 2 o más = multicolor (la purga va como una línea más). */
  lineas: LineaMaterial[];
  horas: number;
  cantidad: number;
  diseno: string;
  /** Solo con «A medida (por horas)». */
  disenoHoras: number;
  postprocesado: string;
  riesgo: string;
  urgente: boolean;
  gastoExtra: number;
  /** € por unidad acordados con el cliente: sustituye al precio de la tarifa. */
  precioPactado?: number;
}

export interface Desglose {
  filamento: number;
  electricidad: number;
  deterioro_impresora: number;
  diseno_modelado: number;
  postprocesado: number;
  gasto_misc: number;
}

export interface EncargoResultado {
  desglose: Desglose;
  /** Filamento + luz + desgaste (coste_bruto de la Calculadora), sin redondear. */
  costeImpresion: number;
  /** Lo que sale del bolsillo: impresión + gasto extra. */
  costeReal: number;
  precio: number;
  precioUnitario: number;
  /** Beneficio como lo guarda la Calculadora: precio − coste de impresión. */
  beneficioNeto: number;
  /** Precio − coste real. */
  beneficioReal: number;
  margen: number;
  errorRate: number;
  urgenciaRate: number;
  recargoUrgencia: number;
  /** Antes de urgencia y extra (precio_base de la Calculadora). */
  precioBase: number;
  precioMinimo: number;
  minimoAplicado: boolean;
  /** Céntimos que sube el redondeo a 0,05 €. */
  redondeo: number;
  /** El precio de la tarifa; con precio pactado, el precio es otro. */
  precioTarifa: number;
  pactado: boolean;
  pesoG: number;
  precioKg: number;
  /** «PLA», «PLA + TPU». */
  filamento: string;
  /** Color de la única línea, o «Multicolor». */
  filamentoColor: string;
  multicolor: boolean;
}

const round4 = (v: number) => Math.round(Number(v || 0) * 10000) / 10000;
export const roundMoney = (v: number) => Math.round(Math.max(0, Number(v || 0)) * 100) / 100;
const roundUpToNickel = (v: number) =>
  Math.round(Math.ceil((Math.max(0, Number(v || 0)) + Number.EPSILON) / 0.05) * 0.05 * 100) / 100;

/** €/h de diseño y de post-procesado (este hereda el de diseño si no hay). */
export function costesHora(cfg: ConfigCalculadora): { diseno: number; postproc: number } {
  const diseno = Math.max(0, Number(cfg.global_config?.labor_cost_h) || 0);
  const propio = Number(cfg.global_config?.postproc_cost_h);
  return { diseno, postproc: Number.isFinite(propio) && propio > 0 ? propio : diseno };
}

export function precioMinimoEncargo(cfg: ConfigCalculadora): number {
  return Number(cfg.global_config?.precio_minimo || 3);
}

/** Importe de un tramo (para enseñarlo junto a su píldora). */
export function importeDiseno(cfg: ConfigCalculadora, tramo: string, horas = 0): number {
  const min = tramo === DISENO_A_MEDIDA ? Math.max(0, horas) * 60 : DISENO_MODELADO[tramo] || 0;
  return (min / 60) * costesHora(cfg).diseno;
}

export function importePostpro(cfg: ConfigCalculadora, tramo: string): number {
  return ((POSTPROCESADO[tramo] || 0) / 60) * costesHora(cfg).postproc;
}

/** Riesgo por defecto: el nivel cuyo % es el `error` de Ajustes → Precios. */
export function riesgoDe(error: number): string {
  return RIESGOS.find((r) => Math.abs(PROBABILIDAD_ERROR[r] - error) < 1e-9) ?? 'Baja (25%)';
}

/**
 * Precio del encargo. Lanza un Error con mensaje para el usuario si falta la
 * impresora o un material no tiene €/kg (como calculateBudget).
 */
export function calcularEncargo(e: EncargoInput, cfg: ConfigCalculadora, urgenciaPct = 50): EncargoResultado {
  const gc = cfg.global_config ?? {};
  const printer = cfg.printers.find((p) => p.name === e.impresora);
  if (!printer) throw new Error('Elige la impresora.');
  if (!(e.horas >= 0) || !e.lineas.length) throw new Error('Faltan gramos u horas.');

  const precioKg = (material: string, i: number) => {
    const f = cfg.filament_types.find((t) => t.name === material);
    if (!f) throw new Error(`Línea ${i + 1}: el material «${material}» no tiene precio en la Calculadora.`);
    return Number(f.price_per_kg || 0);
  };

  const multicolor = e.lineas.length > 1;
  let peso: number;
  let kg: number;
  let filamentoOverride: number | null = null;
  let filamento: string;
  if (multicolor) {
    let w = 0;
    let c = 0;
    const usados: string[] = [];
    e.lineas.forEach((l, i) => {
      const k = precioKg(l.material, i);
      w += l.gramos;
      c += (l.gramos * k) / 1000;
      if (!usados.includes(l.material)) usados.push(l.material);
    });
    if (!(w > 0)) throw new Error('Faltan los gramos.');
    peso = Math.round(w * 100) / 100;
    filamentoOverride = round4(c);
    kg = (c * 1000) / w;
    filamento = usados.join(' + ');
  } else {
    peso = e.lineas[0].gramos;
    kg = precioKg(e.lineas[0].material, 0);
    filamento = e.lineas[0].material;
  }

  const horas = e.horas;
  const unidades = Math.max(1, Math.floor(Number(e.cantidad) || 1));
  const vida = Number(printer.depreciation_time_h || 0);
  const desgasteH = vida > 0 ? (Number(printer.price_eur || 0) + Number(printer.service_costs_life_eur || 0)) / vida : 0;
  const disenoH = e.diseno === DISENO_A_MEDIDA ? Math.max(0, Number(e.disenoHoras) || 0) : 0;

  const bd: Desglose = {
    filamento: filamentoOverride ?? round4((peso * kg) / 1000),
    electricidad: round4(horas * Number(printer.energy_consumption_kwh || 0) * Number(gc.energy_cost_kwh || 0)),
    diseno_modelado: round4(importeDiseno(cfg, e.diseno, disenoH)),
    deterioro_impresora: round4(horas * desgasteH),
    postprocesado: round4(importePostpro(cfg, e.postprocesado) * unidades),
    gasto_misc: round4(Math.max(0, Number(e.gastoExtra || 0)))
  };

  const errorRate = PROBABILIDAD_ERROR[e.riesgo] ?? 0.25;
  const urgenciaRate = e.urgente ? Math.max(0, urgenciaPct) / 100 : 0;
  const minimo = precioMinimoEncargo(cfg);

  const bruto = bd.filamento + bd.electricidad + bd.deterioro_impresora;
  const resto = bd.diseno_modelado + bd.postprocesado;
  const trasMargen = bruto * MARKUP + bruto * errorRate + resto;
  const conUrgencia = trasMargen * (1 + urgenciaRate);
  const sinExtra = roundUpToNickel(Math.max(conUrgencia, minimo));
  const tarifa = roundUpToNickel(sinExtra + bd.gasto_misc);
  const pactado = Number(e.precioPactado) > 0;
  // Pactado: tal cual × unidades, sin mínimo, urgencia ni redondeo.
  const precio = pactado ? roundMoney(Number(e.precioPactado) * unidades) : tarifa;
  const costeReal = bruto + bd.gasto_misc;

  return {
    desglose: bd,
    costeImpresion: bruto,
    costeReal,
    precio,
    precioUnitario: roundMoney(precio / unidades),
    beneficioNeto: precio - bruto,
    beneficioReal: precio - costeReal,
    margen: precio > 0 ? (precio - costeReal) / precio : 0,
    errorRate,
    urgenciaRate,
    recargoUrgencia: pactado ? 0 : trasMargen * urgenciaRate,
    precioBase: roundUpToNickel(Math.max(trasMargen, minimo)),
    precioMinimo: minimo,
    minimoAplicado: !pactado && sinExtra > conUrgencia && conUrgencia < minimo,
    redondeo: pactado ? 0 : Math.max(0, precio - (Math.max(conUrgencia, minimo) + bd.gasto_misc)),
    precioTarifa: tarifa,
    pactado,
    pesoG: peso,
    precioKg: kg,
    filamento,
    filamentoColor: multicolor ? 'Multicolor' : e.lineas[0].color || 'Negro',
    multicolor
  };
}

/**
 * Campos del pedido (orders.data, forma de normalizeOrder de la Calculadora)
 * que salen del cálculo: lo mismo que escribe saveOrderFromResult. Se funde
 * sobre el pedido existente al editar; al crear, se añaden id, estado, etc.
 */
export function camposPedido(e: EncargoInput, r: EncargoResultado) {
  return {
    impresora: e.impresora,
    filamento: r.filamento,
    filamento_color: r.filamentoColor,
    peso_g: String(r.pesoG),
    horas: String(e.horas),
    cantidad: Math.max(1, Math.floor(Number(e.cantidad) || 1)),
    precio_final: roundMoney(r.precio),
    coste_bruto: roundMoney(r.costeImpresion),
    beneficio_neto: roundMoney(r.beneficioNeto),
    markup: MARKUP,
    // `|| 0.5` como la Calculadora (un 0 % se guardaba como 0,5).
    error_rate: Number(r.errorRate || 0.5),
    urgencia_nivel: e.urgente ? 'Urgente' : 'Normal',
    urgencia_rate: Number(r.urgenciaRate || 0),
    recargo_urgencia: roundMoney(r.recargoUrgencia),
    is_multimaterial: r.multicolor,
    material_breakdown: r.multicolor
      ? e.lineas.map((l) => ({ material: l.material, color: l.color, grams: l.gramos }))
      : [],
    diseno_modelado: e.diseno || 'No necesario',
    diseno_horas: e.diseno === DISENO_A_MEDIDA ? Math.max(0, Number(e.disenoHoras) || 0) : 0,
    postprocesado_label: e.postprocesado || 'Limpio',
    probabilidad_error_label: e.riesgo || 'Baja (25%)',
    markup_label: MARKUP_LABEL,
    gasto_misc: roundMoney(r.desglose.gasto_misc),
    // Solo la web lo lee; la 7.2 lo conserva y, si se recalcula allí, vuelve a la tarifa.
    precio_pactado_ud: r.pactado ? roundMoney(Number(e.precioPactado)) : null
  };
}

/** Días de diseño y post-procesado para la fecha tope (dias_extra_pedido en SQL). */
export function diasExtraEncargo(diseno: string, disenoHoras: number, postprocesado: string): number {
  const d = diseno.startsWith('A medida')
    ? Math.max(1, Math.ceil(Math.max(0, disenoHoras) / 8))
    : diseno.startsWith('Media') || diseno.startsWith('Alta') ? 1 : 0;
  return d + (!postprocesado || postprocesado === 'Limpio' ? 0 : 1);
}
