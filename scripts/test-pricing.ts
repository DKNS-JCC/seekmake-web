// Tests for the tasador pricing engine — this is the code that quotes real
// money to real customers, so the surcharges, discounts, minimum and shipping
// tiers all get pinned down here.
//
//   npx tsx scripts/test-pricing.ts

import {
  DEFAULT_QUOTE_SETTINGS,
  computeQuote,
  normalizeSettings,
  type PiezaInput,
  type QuoteSettings
} from '../lib/quote/pricing';
import type { MeshMetrics } from '../lib/quote/geometry';
import { check, done, eq, section } from './_assert';

const S = DEFAULT_QUOTE_SETTINGS;

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

// ── Baseline, computed by hand ───────────────────────────────────────────
// fraccion   = 0.35 + 0.65 × 0.20        = 0.48
// pesoG      = 200 cm³ × 1.24 g/cm³ × .48 = 119.04 g
// capas      = 100 mm ÷ 0.2 mm            = 500
// tiempoH    = 119.04/18 + 500×6/3600     = 7.4467 h
// unidad     = 119.04×0.05 + 7.4467×0.3   = 8.186 €
// total      = 8.186 + 1.50 preparación   = 9.69 €
section('baseline (200 cm³, PLA, estándar, recogida)');
const base = computeQuote([pieza()], S);
eq('peso', base.pesoG, 119.04);
eq('tiempo', base.tiempoH, 7.45, 0.01);
eq('total', base.total, 9.69);
check('no aplica el mínimo', base.minimoAplicado === false);
eq('envío en recogida', base.envio, 0);

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
  tarifa_preparacion: 0
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
  const objetivo = r.minimoAplicado ? r.total : suma;
  eq(`${nombre}: Σ líneas = total`, r.minimoAplicado ? objetivo : suma, r.total, 0.02);
}

section('plazo');
check('incluye el margen de días', base.diasEstimados >= S.plazo_dias_margen + 1,
  `${base.diasEstimados} días`);
const grande = computeQuote([pieza({ cantidad: 10 })], S);
check('más unidades, más plazo', grande.diasEstimados > base.diasEstimados);

section('normalizeSettings');
check('basura → defaults', normalizeSettings(null).precio_hora === S.precio_hora);
check('string → defaults', normalizeSettings('nope' as unknown).precio_minimo === S.precio_minimo);
const parcial = normalizeSettings({ precio_hora: 0.9 });
eq('respeta lo que le pasas', parcial.precio_hora, 0.9);
eq('rellena lo que falta', parcial.precio_minimo, S.precio_minimo);
check('conserva los materiales por defecto', !!parcial.materiales.PLA);

const desordenado = normalizeSettings({
  envio_tramos: [{ max_g: 9999, precio: 9.9 }, { max_g: 100, precio: 3 }],
  descuentos_cantidad: [{ min: 20, pct: 20 }, { min: 2, pct: 5 }]
});
check('ordena los tramos de envío',
  desordenado.envio_tramos[0].max_g === 100, JSON.stringify(desordenado.envio_tramos));
check('ordena los descuentos',
  desordenado.descuentos_cantidad[0].min === 2);
const vacios = normalizeSettings({ resistencia: [], detalle: [] });
check('listas vacías caen a los defaults',
  vacios.resistencia.length > 0 && vacios.detalle.length > 0);

section('soportes');
const conSoporte = computeQuote([pieza({ metrics: metrics(200, 100, 100) })], S);
check('el soporte suma peso', conSoporte.pesoG > base.pesoG,
  `${conSoporte.pesoG} vs ${base.pesoG}`);
eq('soporte = volumen × densidad de relleno × densidad',
  conSoporte.piezas[0].soporteG, 100 * S.soporte_relleno * 1.24, 0.01);

section('pedido vacío');
const vacio = computeQuote([], S);
check('no revienta', vacio.unidades === 0 && vacio.piezas.length === 0);
eq('cobra al menos el mínimo', vacio.total, S.precio_minimo);

done();
