// The submit-quote Edge Function re-prices every request with its own port
// of lib/quote/pricing.ts. This test loads that port straight out of the
// function's source and checks it agrees with the browser to the cent.
//
//   npx tsx scripts/test-paridad-servidor.ts

import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { computeQuote, normalizeSettings, type PiezaInput } from '../lib/quote/pricing';
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
  computeServerQuote: (archivos: any[], entrega: string, settings: any) => any;
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

done();
