// Tests for the tasador pricing engine — this is the code that quotes real
// money to real customers, so the surcharges, discounts, minimum and shipping
// tiers all get pinned down here.
//
//   npx tsx scripts/test-pricing.ts

import {
  DEFAULT_QUOTE_SETTINGS,
  computeQuote,
  costeHoraMaquina,
  normalizeSettings,
  precioKgDe,
  diasPlazo,
  sumarLaborables,
  fechaTope,
  hoyMadrid,
  fechaLarga,
  esPrecioFirme,
  esConsultar,
  tipoPieza,
  cabeEnCama,
  senalPendiente,
  type PiezaInput,
  type QuoteSettings
} from '../lib/quote/pricing';
import type { MeshMetrics } from '../lib/quote/geometry';
import { analizarPieza } from '../lib/quote/estimador/analizar';
import { configAnalisis } from '../lib/quote/estimador';
import { caja, malla } from './_mallas';
import { check, done, eq, section } from './_assert';

const igual = (label: string, got: unknown, expected: unknown) =>
  check(label, got === expected, `got ${got}, expected ${expected}`);

function metrics(volumenCm3: number, alturaMm = 100, soporteCm3 = 0): MeshMetrics {
  return {
    volumenCm3,
    soporteCm3,
    bboxMm: { x: 100, y: alturaMm, z: 100 },
    areaCm2: 0,
    triangulos: 1000
  } as MeshMetrics;
}

function pieza(over: Partial<PiezaInput> = {}): PiezaInput {
  return {
    nombre: 'test',
    metrics: metrics(200),
    cantidad: 1,
    material: 'PLA',
    colores: [{ nombre: 'Negro', hex: '#000000', acabado: null }],
    resistenciaId: 'estandar',
    detalleId: 'estandar',
    ...over
  };
}

// ════════════════════════════════════════════════════════════════════════
// Hand-set tariff mode + volume heuristic (no layer analysis). Pins the
// money logic with simple numbers.
// ════════════════════════════════════════════════════════════════════════
const S: QuoteSettings = normalizeSettings({
  modo_precio: 'tarifa',
  tarifa_preparacion: 1.5,
  precio_minimo: 5,
  redondeo: 0,
  resistencia: [
    { id: 'decorativa', nombre: 'Decorativa', descripcion: '', relleno_pct: 10 },
    { id: 'estandar', nombre: 'Estándar', descripcion: '', relleno_pct: 20 },
    { id: 'resistente', nombre: 'Resistente', descripcion: '', relleno_pct: 40 },
    { id: 'maciza', nombre: 'Maciza', descripcion: '', relleno_pct: 100 }
  ],
  detalle: [
    { id: 'rapido', nombre: 'Rápido', descripcion: '', altura_capa_mm: 0.28, factor_tiempo: 0.7 },
    { id: 'estandar', nombre: 'Estándar', descripcion: '', altura_capa_mm: 0.2, factor_tiempo: 1 },
    { id: 'fino', nombre: 'Alto detalle', descripcion: '', altura_capa_mm: 0.12, factor_tiempo: 1.7 }
  ],
  descuentos_cantidad: [
    { min: 2, pct: 5 },
    { min: 6, pct: 12 },
    { min: 21, pct: 20 }
  ]
});

// ── Baseline, computed by hand ───────────────────────────────────────────
// fraccion   = 0.35 + 0.65 × 0.20        = 0.48
// pesoG      = 200 cm³ × 1.24 g/cm³ × .48 = 119.04 g
// capas      = 100 mm ÷ 0.2 mm            = 500
// tiempoH    = 119.04/18 + 500×6/3600     = 7.4467 h
// unidad     = 119.04×0.05 + 7.4467×0.3   = 8.186 €
// total      = 8.186 + 1.50 preparación   = 9.69 €
section('tarifa manual: baseline (200 cm³, PLA, estándar, recogida)');
const base = computeQuote([pieza()], S);
eq('peso', base.pesoG, 119.04);
eq('tiempo', base.tiempoH, 7.45, 0.01);
eq('total', base.total, 9.69);
check('no aplica el mínimo', base.minimoAplicado === false);
eq('envío en recogida', base.envio, 0);
check('marca la pieza como aproximada', base.piezas[0].metodo === 'aproximado');

section('precio mínimo');
const tiny = computeQuote([pieza({ metrics: metrics(10, 20) })], S);
eq('sube al mínimo', tiny.total, S.precio_minimo);
check('lo señala', tiny.minimoAplicado === true);

section('resistencia (relleno)');
const decor = computeQuote([pieza({ resistenciaId: 'decorativa' })], S);
const maciza = computeQuote([pieza({ resistenciaId: 'maciza' })], S);
check('maciza pesa más que decorativa', maciza.pesoG > decor.pesoG,
  `${maciza.pesoG} vs ${decor.pesoG}`);
eq('maciza = volumen íntegro', maciza.pesoG, 200 * 1.24);
check('maciza cuesta más', maciza.total > decor.total);

section('detalle (altura de capa)');
const rapido = computeQuote([pieza({ detalleId: 'rapido' })], S);
const fino = computeQuote([pieza({ detalleId: 'fino' })], S);
check('alto detalle tarda más', fino.tiempoH > rapido.tiempoH,
  `${fino.tiempoH} vs ${rapido.tiempoH}`);
check('mismo peso con distinto detalle', Math.abs(fino.pesoG - rapido.pesoG) < 0.01);
check('alto detalle cuesta más', fino.total > rapido.total);

section('material');
const tpu = computeQuote([pieza({ material: 'TPU' })], S);
check('TPU tarda más que PLA (factor_velocidad 0.4)', tpu.tiempoH > base.tiempoH);
const desconocido = computeQuote([pieza({ material: 'UNOBTANIO' })], S);
eq('material desconocido cae a PLA', desconocido.total, base.total);

section('recargo por acabado');
const metalico = computeQuote([
  pieza({ colores: [{ nombre: 'Oro', hex: '#d4af37', acabado: 'Metálico' }] })
], S);
eq('Metálico +10% sobre la unidad', metalico.total, 8.186 * 1.1 + 1.5, 0.01);
const mate = computeQuote([
  pieza({ colores: [{ nombre: 'Negro', hex: '#000', acabado: 'Mate' }] })
], S);
eq('Mate no recarga', mate.total, base.total);

section('multicolor');
const dos = computeQuote([
  pieza({
    colores: [
      { nombre: 'Negro', hex: '#000', acabado: null },
      { nombre: 'Azul', hex: '#00f', acabado: null }
    ]
  })
], S);
eq('+15% y +1 € por color extra', dos.total, 8.186 * 1.15 + 1 + 1.5, 0.01);

const mezcla = computeQuote([
  pieza({
    colores: [
      { nombre: 'Oro', hex: '#d4af37', acabado: 'Metálico' },
      { nombre: 'Mate', hex: '#000', acabado: 'Mate' }
    ]
  })
], S);
eq('gana el acabado más caro, luego multicolor',
  mezcla.total, (8.186 * 1.1) * 1.15 + 1 + 1.5, 0.01);

section('descuento por cantidad');
for (const [cantidad, pct] of [[1, 0], [2, 5], [5, 5], [6, 12], [20, 12], [21, 20]] as const) {
  const r = computeQuote([pieza({ cantidad })], S);
  check(`${cantidad} ud → -${pct}%`, r.descuentoPct === pct, `dio ${r.descuentoPct}%`);
}
const seis = computeQuote([pieza({ cantidad: 6 })], S);
eq('total con 6 uds y -12%', seis.total, 8.186 * 6 * 0.88 + 1.5, 0.02);
check('cuenta las unidades', seis.unidades === 6);

const cero = computeQuote([pieza({ cantidad: 0 })], S);
check('cantidad 0 se trata como 1', cero.unidades === 1);
const negativa = computeQuote([pieza({ cantidad: -3 })], S);
check('cantidad negativa se trata como 1', negativa.unidades === 1);

section('envío por tramos');
// Settings where 1 cm³ = 1 g exactly, so the tier boundaries are testable.
const SIMPLE: QuoteSettings = normalizeSettings({
  ...S,
  materiales: { PLA: { precio_g: 0.01, densidad: 1, factor_velocidad: 1 } },
  fraccion_pared: 1,
  precio_minimo: 0,
  tarifa_preparacion: 0,
  envio_gratis_desde: 0
});
for (const [gramos, esperado] of [[499, 4.5], [500, 4.5], [501, 6.9], [2000, 6.9], [2001, 9.9]] as const) {
  const r = computeQuote(
    [pieza({ metrics: metrics(gramos), resistenciaId: 'maciza' })],
    SIMPLE,
    'envio'
  );
  eq(`${gramos} g → ${esperado} €`, r.envio, esperado);
}
const recogida = computeQuote([pieza()], S, 'recogida');
eq('recogida no cobra envío', recogida.envio, 0);

// A tiny order must still pay shipping on top of the minimum, not have the
// minimum swallow it.
const minMasEnvio = computeQuote([pieza({ metrics: metrics(10, 20) })], S, 'envio');
eq('el mínimo no absorbe el envío', minMasEnvio.total, S.precio_minimo + 4.5);
eq('falta para envío gratis', minMasEnvio.faltaEnvioGratis, S.envio_gratis_desde - S.precio_minimo);
eq('margen libre = mínimo − precio real de la pieza', minMasEnvio.margenMinimo,
  S.precio_minimo - computeQuote([pieza({ metrics: metrics(10, 20) })], normalizeSettings({ ...S, precio_minimo: 0 })).total, 0.001);
{
  const gratis = normalizeSettings({ ...S, envio_gratis_desde: S.precio_minimo });
  const r = computeQuote([pieza({ metrics: metrics(10, 20) })], gratis, 'envio');
  eq('desde el umbral el envío es gratis', r.envio, 0);
  eq('y el total no lo incluye', r.total, S.precio_minimo);
  check('la línea dice gratis', r.lineas.some((l) => l.concepto.endsWith('— gratis') && l.importe === 0));
  const off = computeQuote([pieza({ metrics: metrics(10, 20) })], normalizeSettings({ ...S, envio_gratis_desde: 0 }), 'envio');
  check('umbral 0 = nunca gratis', off.envio === 4.5 && off.faltaEnvioGratis === 0);
}

section('varias piezas');
const multi = computeQuote([
  pieza({ nombre: 'a' }),
  pieza({ nombre: 'b', cantidad: 2 })
], S);
check('suma unidades', multi.unidades === 3);
eq('suma pesos', multi.pesoG, 119.04 * 3, 0.02);
check('una línea por pieza más preparación y descuento',
  multi.lineas.length === 4, `${multi.lineas.length} líneas`);

section('las líneas cuadran con el total');
for (const [nombre, r] of [
  ['baseline', base], ['multicolor', dos], ['6 uds', seis], ['con envío', recogida]
] as const) {
  const suma = r.lineas.reduce((a, l) => a + l.importe, 0);
  eq(`${nombre}: Σ líneas = total`, suma, r.total, 0.02);
}

section('plazo');
check('incluye la holgura', base.diasEstimados >= S.plazo_holgura_dias + 1,
  `${base.diasEstimados} días`);
const grande = computeQuote([pieza({ cantidad: 10 })], S);
check('más unidades, más plazo', grande.diasEstimados > base.diasEstimados);
igual('por defecto: 4 h/día y 2 días de holgura', [S.plazo_horas_dia, S.plazo_holgura_dias].join(), '4,2');
// Mismos casos que la prueba de public.sumar_laborables (test-migraciones.mjs).
for (const [desde, n, esperado] of [
  ['2026-11-10', 2, '2026-11-12'],
  ['2026-11-13', 1, '2026-11-16'],
  ['2026-11-12', 3, '2026-11-17'],
  ['2026-11-14', 0, '2026-11-16'],
  ['2026-11-15', 2, '2026-11-18']
] as const) {
  igual(`sumarLaborables(${desde}, ${n})`, sumarLaborables(desde, n), esperado);
}
// Mismos casos que public.fecha_tope: ceil((cola + h) / 4) + extra + 2.
eq('6 h sin cola: 2 + 2 días', diasPlazo(6, S), 4);
eq('6 h con 13 h de cola: 5 + 2', diasPlazo(6, S, 13), 7);
eq('6 h + 3 días de diseño', diasPlazo(6, S, 0, 3), 7);
eq('0 h: solo la holgura', diasPlazo(0, S), 2);
igual('fechaTope = hoy + diasPlazo laborables', fechaTope(6, S, 13, '2026-11-13'), '2026-11-24');
igual('hoy en Madrid, no en UTC', hoyMadrid(new Date('2026-11-10T23:30:00Z')), '2026-11-11');
igual('fecha larga', fechaLarga('2026-11-14'), 'sábado, 14 de noviembre');

section('precio firme');
check('con la lista vacía nunca es firme', !base.precioFirme && S.tipos_precio_firme.length === 0);
const firmeS = normalizeSettings({ tipos_precio_firme: ['sin soportes', 'lote'] });
const p1 = { tipo: 'sin soportes' as const, metodo: 'capas' as const, cabe: true };
check('tipo validado, por capas y cabe: firme', esPrecioFirme([p1], firmeS));
check('aproximada: no', !esPrecioFirme([{ ...p1, metodo: 'aproximado' }], firmeS));
check('no cabe en la cama: no', !esPrecioFirme([{ ...p1, cabe: false }], firmeS));
check('tipo sin validar: no', !esPrecioFirme([{ ...p1, tipo: 'con soportes' }], firmeS));
check('multicolor nunca, aunque esté en la lista',
  !esPrecioFirme([{ ...p1, tipo: 'multicolor' }], normalizeSettings({ tipos_precio_firme: ['multicolor'] })));
check('una pieza no firme tumba el pedido', !esPrecioFirme([p1, { ...p1, tipo: 'con soportes' }], firmeS));
igual('tipos', [tipoPieza(2, 1, false), tipoPieza(1, 3, true), tipoPieza(1, 1, true), tipoPieza(1, 1, false)].join(),
  'multicolor,lote,con soportes,sin soportes');
check('cabe en la cama', cabeEnCama({ x: 220, y: 10, z: 10 }, S) && !cabeEnCama({ x: 221, y: 10, z: 10 }, S));
check('señal: pendiente bajo la mitad', senalPendiente(30, 14.99) && !senalPendiente(30, 15));

section('soportes (aproximación)');
const conSoporte = computeQuote([pieza({ metrics: metrics(200, 100, 100) })], S);
check('el soporte suma peso', conSoporte.pesoG > base.pesoG,
  `${conSoporte.pesoG} vs ${base.pesoG}`);
eq('soporte = volumen × densidad de relleno × densidad',
  conSoporte.piezas[0].soporteG, 100 * S.soporte_relleno * 1.24, 0.01);

section('pedido vacío');
const vacio = computeQuote([], S);
check('no revienta', vacio.unidades === 0 && vacio.piezas.length === 0);
eq('cobra al menos el mínimo', vacio.total, S.precio_minimo);

// ════════════════════════════════════════════════════════════════════════
// Calculadora mode (the default): same money as the desktop app.
// ════════════════════════════════════════════════════════════════════════
const C = DEFAULT_QUOTE_SETTINGS;

section('modo Calculadora: tarifas derivadas');
// K1SE Combo: 0.15 kW × 0.24 €/kWh + (738 + 100) € / 3000 h = 0.3153 €/h
eq('coste hora de máquina', costeHoraMaquina(C.calculadora), 0.036 + 838 / 3000, 1e-6);
// × (markup 2.3 + error 0.25) = 2.55
eq('€/hora que se cobra', C.precio_hora, 0.8041, 1e-4);
eq('PLA: 20 €/kg × 2.55', C.materiales.PLA.precio_g, 0.051, 1e-6);
eq('PETG: 18 €/kg × 2.55', C.materiales.PETG.precio_g, 0.0459, 1e-6);
eq('"PLA SILK/MARBLE" exacto', precioKgDe(C.calculadora, 'pla silk/marble') ?? 0, 23);
eq('"PETG CF" cae a la familia PETG', precioKgDe(C.calculadora, 'PETG CF') ?? 0, 18);
check('mínimo 7 €', C.precio_minimo === 7);
check('sin cargo de diseño/preparación', C.tarifa_preparacion === 0);
const cambiado = normalizeSettings({ calculadora: { markup: 3, error: 0.5 } });
eq('cambiar el markup mueve €/g', cambiado.materiales.PLA.precio_g, 0.02 * 3.5, 1e-6);
eq('…y €/h', cambiado.precio_hora, 0.3153 * 3.5, 1e-3);
const tarifa = normalizeSettings({ modo_precio: 'tarifa', precio_hora: 1.23 });
eq('en modo tarifa se respeta el €/h manual', tarifa.precio_hora, 1.23);

section('modo Calculadora: redondeo y mínimo');
// Heuristic with the default 15 % infill: 110.98 g, 6.999 h →
// 110.98 × 0.051 + 6.999 × 0.8041 = 11.288 → sube a 11.30
const cBase = computeQuote([pieza()], C);
eq('redondea al alza a 5 céntimos', cBase.total, 11.3);
check('sin línea de preparación', cBase.lineas.length === 1);
const cTiny = computeQuote([pieza({ metrics: metrics(5, 10) })], C);
eq('pedido mínimo 7 €', cTiny.total, 7);
check('descuentos vacíos se respetan',
  normalizeSettings({ descuentos_cantidad: [] }).descuentos_cantidad.length === 0);
const postpro = normalizeSettings({ calculadora: { postpro_soportes_eur: 5 } });
const conPost = computeQuote([pieza({ metrics: metrics(200, 100, 100) })], postpro);
const sinPost = computeQuote([pieza({ metrics: metrics(200, 100, 100) })], C);
eq('post-procesado de soportes por unidad', conPost.total - sinPost.total, 5, 0.06);

section('con análisis por capas');
const cubo20 = analizarPieza(malla(caja(0, 0, 0, 20, 20, 20)), configAnalisis(C));
const capas1 = computeQuote([pieza({ metrics: metrics(8, 20), analisis: cubo20 })], C);
check('usa el análisis', capas1.piezas[0].metodo === 'capas');
check('peso realista (~3.5 g)', capas1.pesoG > 3 && capas1.pesoG < 4.2, String(capas1.pesoG));
check('tiempo realista (~20 min)', capas1.tiempoH > 0.28 && capas1.tiempoH < 0.4, String(capas1.tiempoH));
const capas30 = computeQuote([pieza({ metrics: metrics(8, 20), analisis: cubo20, cantidad: 30 })], C);
check('30 cubos en una cama', capas30.piezas[0].camas === 1 && capas30.piezas[0].porCama === 30);
check('el precio unitario baja al agrupar',
  capas30.piezas[0].subtotal / 30 < capas1.piezas[0].subtotal * 0.7,
  `${(capas30.piezas[0].subtotal / 30).toFixed(2)} vs ${capas1.piezas[0].subtotal}`);
check('lo explica en la línea', capas30.lineas[0].concepto.includes('30 por cama'));
const multiplo = Math.round(capas30.total * 100) % 5 === 0;
check('el total es múltiplo de 5 céntimos', multiplo, String(capas30.total));

section('pedido grande: precio a consultar');
const SG = DEFAULT_QUOTE_SETTINGS;
check('pedido normal: con precio', !esConsultar({ total: 40, tiempoH: 10 }, SG));
check('99,95 € y 39,9 h: todavía con precio', !esConsultar({ total: 99.95, tiempoH: 39.9 }, SG));
check('desde 100 € (por defecto): a consultar', esConsultar({ total: 100, tiempoH: 10 }, SG));
check('desde 40 h (por defecto): a consultar', esConsultar({ total: 60, tiempoH: 40 }, SG));
check('0 = regla apagada',
  !esConsultar({ total: 500, tiempoH: 90 }, normalizeSettings({ consultar_desde_eur: 0, consultar_desde_h: 0 })));
check('ajustes antiguos sin la clave usan los valores por defecto',
  normalizeSettings({}).consultar_desde_eur === 100 && normalizeSettings({}).consultar_desde_h === 40);

done();
