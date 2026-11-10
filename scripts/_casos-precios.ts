// Cases for the pricing engine tests (test-motor-precios.ts). Deterministic:
// a seeded generator, so the same cases come out on every run.
//
// - serverCases(): what submit-quote receives (archivos already carrying the
//   browser's figures). Independent of the estimator, so the fixture taken
//   before phase 8 stays valid when the estimator changes (phase 1).
// - browserCases(): what the quote page feeds computeQuote (with and without
//   layer analysis), to check browser and server agree on the same order.

import type { Cupon, PiezaInput } from '../lib/quote/pricing';
import type { MeshMetrics } from '../lib/quote/geometry';
import { analizarPieza, type Analisis } from '../lib/quote/estimador/analizar';
import { configAnalisis } from '../lib/quote/estimador';
import { normalizeSettings } from '../lib/quote/pricing';
import { caja, cilindro, malla } from './_mallas';

/** mulberry32 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stored quote_settings variants (raw jsonb, as in the database). */
export const AJUSTES: [string, unknown][] = [
  ['por defecto (Calculadora)', null],
  ['precio firme para sin soportes, con soportes y lote', { tipos_precio_firme: ['sin soportes', 'con soportes', 'lote'] }],
  ['markup alto + postpro', { calculadora: { markup: 3, error: 0.5, postpro_soportes_eur: 4 } }],
  ['envío gratis desde 5 €', { envio_gratis_desde: 5 }],
  ['tarifa manual con descuentos', {
    modo_precio: 'tarifa', precio_hora: 1.1, tarifa_preparacion: 1.5, redondeo: 0,
    descuentos_cantidad: [{ min: 2, pct: 5 }, { min: 6, pct: 12 }]
  }],
  ['sin mínimo, descuentos y redondeo 0,10', {
    precio_minimo: 0, redondeo: 0.1, descuentos_cantidad: [{ min: 10, pct: 5 }, { min: 30, pct: 10 }]
  }],
  ['precios por kg y multicolor propios', {
    calculadora: { precio_kg: { PLA: 25, TPU: 30, 'PLA SILK/MARBLE': 28 }, vida_h: 5000 },
    recargo_multicolor: { base_pct: 20, por_color_extra: 2 },
    recargo_acabado_pct: { Metálico: 15 },
    envio_gratis_desde: 0,
    envio_tramos: [{ max_g: 2000, precio: 7 }, { max_g: 300, precio: 3.9 }]
  }]
];

/** Only the server reads these: numbers stored as text in the jsonb. */
export const AJUSTES_SOLO_SERVIDOR: [string, unknown][] = [
  ['números como texto', {
    calculadora: { markup: '2.3', error: '0.25', impresora_eur: '738', mantenimiento_eur: '100', vida_h: '3000',
      consumo_kw: '0.15', precio_kwh: '0.24', postpro_soportes_eur: '1.5' },
    soporte_min_g: '2', envio_gratis_desde: '40'
  }]
];

const CUPONES: (Cupon | null)[] = [
  null,
  { codigo: 'PRUEBA', tipo: 'pct', valor: 10, pedido_minimo: 0 },
  { codigo: 'FIJO', tipo: 'fijo', valor: 3, pedido_minimo: 0 },
  { codigo: 'GRANDE', tipo: 'pct', valor: 20, pedido_minimo: 50 },
  { codigo: 'TODO', tipo: 'fijo', valor: 999, pedido_minimo: 0 }
];

const COLORES = [
  { nombre: 'Negro', hex: '#000000', acabado: null },
  { nombre: 'Blanco', hex: '#ffffff', acabado: 'Mate' },
  { nombre: 'Oro', hex: '#d4af37', acabado: 'Metálico' },
  { nombre: 'Rosa', hex: '#ff66aa', acabado: 'Purpurina' },
  { nombre: 'Verde', hex: '#22aa44', acabado: 'Fluorescente' },
  { nombre: 'Flex', hex: '#333333', acabado: 'Flexible' }
];
const MATERIALES = ['PLA', 'PLA', 'PETG', 'ASA', 'TPU', 'PLA SILK/MARBLE', 'NYLON CF'];
const RESISTENCIAS = ['decorativa', 'estandar', 'estandar', 'resistente', 'maciza', 'inexistente'];
const DETALLES = ['rapido', 'estandar', 'estandar', 'fino', 'inexistente'];

export interface CasoServidor {
  nombre: string;
  ajustes: unknown;
  entrega: 'recogida' | 'envio';
  /** As the function receives it: valor as text, like validar_cupon's numeric. */
  cupon: Record<string, unknown> | null;
  archivos: Record<string, any>[];
}

/** Random orders straight in submit-quote's input shape. */
export function serverCases(n = 300): CasoServidor[] {
  const r = rng(8);
  const elige = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const redondo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
  const todos = [...AJUSTES, ...AJUSTES_SOLO_SERVIDOR];
  const out: CasoServidor[] = [];
  for (let k = 0; k < n; k++) {
    const [nombreAj, ajustes] = todos[k % todos.length];
    const nArch = 1 + Math.floor(r() ** 2 * 5);
    const archivos = Array.from({ length: nArch }, (_, i) => {
      const volumen = redondo(0.3 + r() ** 2 * 250, 2);
      const capas = r() < 0.75;
      const densidad = 1.24;
      // Mostly plausible figures; a few out of range must fall back.
      const factor = r() < 0.9 ? 0.1 + r() * 1.5 : elige([0.001, 0.02, 5, 40]);
      const peso = redondo(volumen * densidad * factor, 3);
      const soporte = r() < 0.4 ? redondo(peso * r() * 0.6, 3) : 0;
      const horas = r() < 0.95 ? redondo(0.05 + r() * 30, 4) : elige([0, -1, 2500]);
      const nColores = r() < 0.7 ? 1 : 1 + Math.floor(r() * 4);
      const colores = Array.from({ length: nColores }, () => ({ ...elige(COLORES), parte: '' }));
      const lado = () => redondo(2 + r() * 250, 1);
      return {
        nombre: `pieza ${k}-${i}.stl`,
        cantidad: r() < 0.6 ? 1 : 1 + Math.floor(r() * 25),
        material: elige(MATERIALES),
        resistencia: elige(RESISTENCIAS),
        detalle: elige(DETALLES),
        colores,
        metricas: {
          volumen_cm3: volumen,
          soporte_cm3: r() < 0.4 ? redondo(r() * 40, 1) : 0,
          bbox_mm: { x: lado(), y: lado(), z: lado() },
          peso_g: capas ? peso : null,
          soporte_g: capas ? soporte : null,
          tiempo_h: capas ? horas : null,
          estimador: capas ? 'capas-v1' : 'aproximado',
          por_cama: capas ? 1 + Math.floor(r() * 6) : 1,
          con_soportes: soporte > 0
        }
      };
    });
    const entrega = r() < 0.5 ? 'recogida' : 'envio';
    const c = elige(CUPONES);
    out.push({
      nombre: `${k} · ${nombreAj}`,
      ajustes,
      entrega,
      cupon: c && { ...c, valor: String(c.valor), pedido_minimo: String(c.pedido_minimo) },
      archivos
    });
  }
  return out;
}

export interface CasoNavegador {
  nombre: string;
  ajustes: unknown;
  entrega: 'recogida' | 'envio';
  cupon: Cupon | null;
  piezas: PiezaInput[];
}

const metricas = (v: number, h: number, soporte = 0, lado = 20): MeshMetrics => ({
  volumenCm3: v, soporteCm3: soporte, areaCm2: 0, bboxMm: { x: lado, y: h, z: lado }, triangulos: 12, mallas: 1, overhangCm2: 0
});

/** What the quote page passes to computeQuote: layer-analysed and fallback pieces. */
export function browserCases(): CasoNavegador[] {
  const formas = [
    ['cubo', malla(caja(0, 0, 0, 20, 20, 20)), metricas(8, 20)],
    ['cilindro', malla(cilindro(12, 60)), metricas(27.1, 60, 0, 24)],
    ['te', malla(caja(25, 0, 0, 35, 10, 40), caja(0, 0, 40, 60, 10, 45)), metricas(7, 45, 2.3, 60)]
  ] as const;
  const r = rng(80);
  const elige = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const out: CasoNavegador[] = [];
  for (const [nombreAj, ajustes] of AJUSTES) {
    const cfg = configAnalisis(normalizeSettings(ajustes));
    const analisis = new Map<string, Analisis>(formas.map(([n, m]) => [n, analizarPieza(m, cfg)]));
    for (let k = 0; k < 12; k++) {
      const n = 1 + Math.floor(r() * 4);
      const piezas: PiezaInput[] = Array.from({ length: n }, (_, i) => {
        const conAnalisis = r() < 0.6;
        const [forma, , met] = elige(formas);
        const nColores = r() < 0.7 ? 1 : 2 + Math.floor(r() * 2);
        // Distinct colors, as piezaColors() gives them.
        const colores = [...COLORES].sort(() => r() - 0.5).slice(0, nColores).map((c) => ({ ...c }));
        return {
          nombre: `${forma}-${i}`,
          metrics: conAnalisis ? met : metricas(0.5 + r() * 120, 5 + r() * 200, r() < 0.4 ? r() * 30 : 0, 10 + r() * 230),
          analisis: conAnalisis ? analisis.get(forma)! : null,
          cantidad: r() < 0.6 ? 1 : 1 + Math.floor(r() * 15),
          material: elige(MATERIALES.slice(0, 6)),
          colores,
          resistenciaId: elige(RESISTENCIAS),
          detalleId: elige(DETALLES)
        };
      });
      out.push({
        nombre: `${nombreAj} · pedido ${k}`,
        ajustes,
        entrega: r() < 0.5 ? 'recogida' : 'envio',
        cupon: elige(CUPONES),
        piezas
      });
    }
  }
  return out;
}

/** What the quote page sends submit-quote for each piece (see fichaPieza). */
export function archivosDe(
  piezas: PiezaInput[],
  q: { piezas: { pesoG: number; soporteG: number; tiempoH: number; metodo: string; porCama: number; conSoportes: boolean }[] }
) {
  return piezas.map((p, i) => {
    const pr = q.piezas[i];
    return {
      nombre: p.nombre,
      cantidad: p.cantidad,
      material: p.material,
      resistencia: p.resistenciaId,
      detalle: p.detalleId,
      colores: p.colores.map((c) => ({ ...c, parte: '' })),
      metricas: {
        volumen_cm3: Math.round(p.metrics.volumenCm3 * 100) / 100,
        soporte_cm3: Math.round(p.metrics.soporteCm3 * 10) / 10,
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
