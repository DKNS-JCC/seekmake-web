// The submit-quote Edge Function re-prices every request with its own port
// of lib/quote/pricing.ts. This test loads that port straight out of the
// function's source and checks it agrees with the browser to the cent.
//
//   npx tsx scripts/test-paridad-servidor.ts

import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { computeQuote, normalizeSettings, type Cupon, type PiezaInput } from '../lib/quote/pricing';
import { analizarPieza } from '../lib/quote/estimador/analizar';
import { configAnalisis } from '../lib/quote/estimador';
import { caja, cilindro, malla } from './_mallas';
import { check, done, eq, section } from './_assert';

const src = readFileSync('supabase/functions/submit-quote/index.ts', 'utf8');
const ini = src.indexOf('const COSTES_CALCULADORA');
const fin = src.indexOf('Deno.serve(');
if (ini < 0 || fin < 0) throw new Error('no encuentro el bloque de precios en submit-quote');
const js = transformSync(src.slice(ini, fin), { loader: 'ts' }).code;
const servidor = new Function(`${js}; return { normalizeServerSettings, computeServerQuote };`)() as {
  normalizeServerSettings: (raw: unknown) => any;
  computeServerQuote: (archivos: any[], entrega: string, settings: any, cupon?: any) => any;
};

/** What the quote page sends for each piece (see QuoteClient submit()). */
function archivos(piezas: PiezaInput[], q: ReturnType<typeof computeQuote>) {
  return piezas.map((p, i) => {
    const pr = q.piezas[i];
    return {
      nombre: p.nombre,
      cantidad: p.cantidad,
      material: p.material,
      resistencia: p.resistenciaId,
      detalle: p.detalleId,
      colores: p.colores,
      metricas: {
        volumen_cm3: p.metrics.volumenCm3,
        soporte_cm3: p.metrics.soporteCm3,
        bbox_mm: p.metrics.bboxMm,
        peso_g: pr.pesoG,
        soporte_g: pr.soporteG,
        tiempo_h: pr.tiempoH,
        estimador: pr.metodo === 'capas' ? 'capas-v1' : 'aproximado',
        por_cama: pr.porCama,
        con_soportes: pr.conSoportes
      }
    };
  });
}

const casos: [string, unknown][] = [
  ['por defecto (Calculadora)', null],
  ['markup alto + postpro', { calculadora: { markup: 3, error: 0.5, postpro_soportes_eur: 4 } }],
  ['envío gratis desde 5 €', { envio_gratis_desde: 5 }],
  ['tarifa manual con descuentos', {
    modo_precio: 'tarifa', precio_hora: 1.1, tarifa_preparacion: 1.5, redondeo: 0,
    descuentos_cantidad: [{ min: 2, pct: 5 }, { min: 6, pct: 12 }]
  }]
];

const cubo = malla(caja(0, 0, 0, 20, 20, 20));
const cil = malla(cilindro(12, 60));
const te = malla(caja(25, 0, 0, 35, 10, 40), caja(0, 0, 40, 60, 10, 45));

for (const [nombre, raw] of casos) {
  section(nombre);
  const s = normalizeSettings(raw);
  const cfg = configAnalisis(s);
  const met = (v: number, h: number) => ({
    volumenCm3: v, soporteCm3: 0, areaCm2: 0, bboxMm: { x: 20, y: h, z: 20 }, triangulos: 12, mallas: 1, overhangCm2: 0
  });
  const piezas: PiezaInput[] = [
    { nombre: 'cubo', metrics: met(8, 20), analisis: analizarPieza(cubo, cfg), cantidad: 12, material: 'PLA',
      colores: [{ nombre: 'N', hex: '#000', acabado: null }], resistenciaId: 'estandar', detalleId: 'estandar' },
    { nombre: 'cilindro', metrics: met(27.1, 60), analisis: analizarPieza(cil, cfg), cantidad: 1, material: 'PETG',
      colores: [{ nombre: 'O', hex: '#d4af37', acabado: 'Metálico' }, { nombre: 'N', hex: '#000', acabado: null }],
      resistenciaId: 'resistente', detalleId: 'fino' },
    { nombre: 'te', metrics: met(7, 45), analisis: analizarPieza(te, cfg), cantidad: 2, material: 'PLA SILK/MARBLE',
      colores: [{ nombre: 'B', hex: '#fff', acabado: null }], resistenciaId: 'estandar', detalleId: 'rapido' },
    { nombre: 'sin análisis', metrics: met(15, 30), analisis: null, cantidad: 3, material: 'ASA',
      colores: [{ nombre: 'G', hex: '#888', acabado: null }], resistenciaId: 'estandar', detalleId: 'estandar' }
  ];
  for (const entrega of ['recogida', 'envio'] as const) {
    const cli = computeQuote(piezas, s, entrega);
    const srv = servidor.computeServerQuote(archivos(piezas, cli), entrega, servidor.normalizeServerSettings(raw));
    eq(`${entrega}: total servidor = cliente (${cli.total} €)`, srv.total, cli.total, 0.001);
    check(`${entrega}: mismas líneas`, JSON.stringify(srv.lineas) === JSON.stringify(cli.lineas),
      JSON.stringify(srv.lineas) + ' vs ' + JSON.stringify(cli.lineas));
    check(`${entrega}: acepta las cifras del análisis`,
      srv.piezas.slice(0, 3).every((p: any) => p.metodo === 'capas'));
  }
  // Tampered weights fall back to the volume heuristic instead of being trusted.
  const cli = computeQuote(piezas.slice(0, 1), s);
  const trampa = archivos(piezas.slice(0, 1), cli);
  trampa[0].metricas.peso_g = 0.001;
  const srv = servidor.computeServerQuote(trampa, 'recogida', servidor.normalizeServerSettings(raw));
  check('rechaza un peso imposible', srv.piezas[0].metodo === 'aproximado');
}

// ── Discount codes ──────────────────────────────────────────────────────
section('códigos de descuento');
{
  // No minimum order, so the discounts show in the totals.
  const raw = { descuentos_cantidad: [{ min: 10, pct: 5 }], precio_minimo: 0 };
  const s = normalizeSettings(raw);
  const ss = servidor.normalizeServerSettings(raw);
  const met = { volumenCm3: 8, soporteCm3: 0, areaCm2: 0, bboxMm: { x: 20, y: 20, z: 20 }, triangulos: 12, mallas: 1, overhangCm2: 0 };
  const pieza = (cantidad: number): PiezaInput[] => [{
    nombre: 'cubo', metrics: met, analisis: analizarPieza(cubo, configAnalisis(s)), cantidad, material: 'PLA',
    colores: [{ nombre: 'N', hex: '#000', acabado: null }], resistenciaId: 'estandar', detalleId: 'estandar'
  }];
  const pct = (valor: number, pedido_minimo = 0): Cupon => ({ codigo: 'PRUEBA', tipo: 'pct', valor, pedido_minimo });
  const fijo = (valor: number, pedido_minimo = 0): Cupon => ({ codigo: 'FIJO', tipo: 'fijo', valor, pedido_minimo });

  const casosCupon: [string, PiezaInput[], Cupon, 'recogida' | 'envio'][] = [
    ['-10 % con envío', pieza(6), pct(10), 'envio'],
    ['-3 € fijo', pieza(6), fijo(3), 'recogida'],
    ['mínimo de piezas sin alcanzar', pieza(1), pct(10, 500), 'recogida'],
    ['-2 % pierde frente al 5 % por cantidad', pieza(12), pct(2), 'recogida'],
    ['-20 % gana al 5 % por cantidad', pieza(12), pct(20), 'recogida'],
    ['fijo mayor que las piezas', pieza(1), fijo(999), 'envio']
  ];
  for (const [nombre, piezas, cupon, entrega] of casosCupon) {
    const cli = computeQuote(piezas, s, entrega, cupon);
    const srv = servidor.computeServerQuote(archivos(piezas, cli), entrega, ss, { ...cupon, valor: String(cupon.valor) });
    eq(`${nombre}: total servidor = cliente (${cli.total} €)`, srv.total, cli.total, 0.001);
    check(`${nombre}: mismas líneas`, JSON.stringify(srv.lineas) === JSON.stringify(cli.lineas),
      JSON.stringify(srv.lineas) + ' vs ' + JSON.stringify(cli.lineas));
    check(`${nombre}: mismo cupón aplicado`, srv.cupon === cli.cupon && srv.cuponDescuento === cli.cuponDescuento);
  }

  // The rules themselves.
  const sin = computeQuote(pieza(6), s, 'envio');
  const con = computeQuote(pieza(6), s, 'envio', pct(10));
  const piezasSin = sin.total - sin.envio;
  eq('-10 % descuenta el 10 % de las piezas (a 5 cts)', con.cuponDescuento,
    Math.floor((piezasSin * 0.1) / 0.05 + 1e-9) * 0.05, 0.001);
  eq('el envío no se descuenta', con.envio, sin.envio, 0.001);
  check('bajo el mínimo de piezas no aplica', computeQuote(pieza(1), s, 'recogida', pct(10, 500)).cupon === null);
  const gana = computeQuote(pieza(12), s, 'recogida', pct(20));
  check('no se acumula con el de cantidad', gana.cupon === 'PRUEBA' && gana.descuentoPct === 0 &&
    !gana.lineas.some((l) => l.concepto.startsWith('Descuento por cantidad')));
  const pierde = computeQuote(pieza(12), s, 'recogida', pct(2));
  check('si el de cantidad es mayor, gana ese', pierde.cupon === null && pierde.descuentoPct === 5);
  eq('un fijo mayor que las piezas las deja a 0', computeQuote(pieza(1), s, 'recogida', fijo(999)).total, 0, 0.001);

  // Minimum order: spread over the pieces (never a visible line) and the code
  // applies after it, so a percentage can take the price below the minimum.
  const conMinimo = normalizeSettings(null);
  const ssMin = servidor.normalizeServerSettings(null);
  const suma = (q: ReturnType<typeof computeQuote>) => Math.round(q.lineas.reduce((t, l) => t + l.importe, 0) * 100) / 100;
  const pequena = computeQuote(pieza(1), conMinimo, 'recogida');
  check('sin código, una pieza pequeña paga el mínimo', pequena.minimoAplicado && pequena.total === conMinimo.precio_minimo);
  eq('las líneas suman el total (mínimo repartido en la pieza)', suma(pequena), pequena.total, 0.001);
  check('ninguna línea habla del mínimo', !pequena.lineas.some((l) => /mínimo/i.test(l.concepto)));
  const bajo = computeQuote(pieza(1), conMinimo, 'envio', pct(10));
  eq('-10 % baja del pedido mínimo', bajo.total - bajo.envio, conMinimo.precio_minimo * 0.9, 0.001);
  eq('con código y envío, las líneas suman el total', suma(bajo), bajo.total, 0.001);
  const dos: PiezaInput[] = [...pieza(1), { ...pieza(1)[0], nombre: 'otra', material: 'PETG' }];
  const reparto = computeQuote(dos, conMinimo, 'recogida');
  eq('con dos piezas el mínimo se reparte y cuadra', suma(reparto), conMinimo.precio_minimo, 0.001);
  for (const [nombre, piezas, cupon, entrega] of [
    ['mínimo sin código', pieza(1), null, 'recogida'],
    ['mínimo con -10 %', pieza(1), pct(10), 'envio'],
    ['mínimo con dos piezas', dos, null, 'envio'],
    ['mínimo con -3 € fijo', pieza(1), fijo(3), 'recogida']
  ] as [string, PiezaInput[], Cupon | null, 'recogida' | 'envio'][]) {
    const cli = computeQuote(piezas, conMinimo, entrega, cupon);
    const srv = servidor.computeServerQuote(archivos(piezas, cli), entrega, ssMin, cupon && { ...cupon, valor: String(cupon.valor) });
    eq(`${nombre}: total servidor = cliente (${cli.total} €)`, srv.total, cli.total, 0.001);
    check(`${nombre}: mismas líneas`, JSON.stringify(srv.lineas) === JSON.stringify(cli.lineas),
      JSON.stringify(srv.lineas) + ' vs ' + JSON.stringify(cli.lineas));
  }
}

done();
