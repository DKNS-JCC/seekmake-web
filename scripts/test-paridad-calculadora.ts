// Paridad del motor de «Nuevo encargo» (lib/quote/encargo.ts) con la
// Calculadora 7.2: mismo precio, coste, beneficio y recargo al céntimo, y los
// mismos campos guardados en el pedido.
//
//   npx tsx scripts/test-paridad-calculadora.ts
//
// La referencia es una copia literal de src/shared/backend.mjs y formatos.mjs
// de la Calculadora 7.2.0 (commit 8e77319, congelada) en scripts/calculadora-7.2/.
// Casos: los 72 pedidos reales de 3DCC con gramos y horas (casos-pedidos.json,
// sin datos personales) con tres configuraciones, más una rejilla sintética
// que recorre mínimos, redondeo, riesgo, diseño, post-procesado, urgencia,
// gasto extra, multicolor y cantidades.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — módulo JS sin tipos (copia de la Calculadora)
import { calculateBudget, migrateDiseno, migratePostprocesado, saveOrderFromResult } from './calculadora-7.2/backend.mjs';
import {
  calcularEncargo,
  camposPedido,
  DISENO_A_MEDIDA,
  DISENO_MODELADO,
  migrarDiseno,
  migrarPostpro,
  POSTPROCESADO,
  PROBABILIDAD_ERROR,
  type ConfigCalculadora,
  type EncargoInput
} from '../lib/quote/encargo';
import { check, done, section } from './_assert';

const fixture = JSON.parse(readFileSync(join(__dirname, 'calculadora-7.2', 'casos-pedidos.json'), 'utf8')) as {
  config: ConfigCalculadora;
  casos: EncargoInput[];
};

const cent = (v: number) => Math.round(Number(v) * 100);

/** El payload que arma Calculator.vue con el formulario. */
function payload(e: EncargoInput) {
  const multi = e.lineas.length > 1;
  return {
    empresa: '3DCC',
    cliente: 'x',
    descripcion: 'x',
    fecha: '2026-11-10',
    impresora: e.impresora,
    filamento_tipo: e.lineas[0].material,
    filamento_color: e.lineas[0].color,
    is_multimaterial: multi,
    material_breakdown: multi ? e.lineas.map((l) => ({ material: l.material, color: l.color, grams: l.gramos })) : [],
    peso_g: String(e.lineas.reduce((s, l) => s + l.gramos, 0)),
    tiempo_h: String(e.horas),
    cantidad: e.cantidad,
    diseno_modelado: e.diseno,
    diseno_horas: e.disenoHoras,
    postprocesado: e.postprocesado,
    probabilidad_error: e.riesgo,
    markup: 'Normal (230%)',
    urgencia_nivel: e.urgente ? 'Urgente' : 'Normal',
    gasto_misc: e.gastoExtra
  };
}

let casos = 0;
let fallos = 0;
const CAMPOS = [
  'impresora', 'filamento', 'filamento_color', 'peso_g', 'horas', 'cantidad', 'precio_final', 'coste_bruto',
  'beneficio_neto', 'markup', 'error_rate', 'urgencia_nivel', 'urgencia_rate', 'recargo_urgencia',
  'is_multimaterial', 'material_breakdown', 'diseno_modelado', 'diseno_horas', 'postprocesado_label',
  'probabilidad_error_label', 'markup_label', 'gasto_misc'
] as const;

function comparar(nombre: string, e: EncargoInput, cfg: ConfigCalculadora) {
  casos++;
  const data = { printers: cfg.printers, filament_types: cfg.filament_types, global_config: cfg.global_config, orders: [] as unknown[] };
  const ref = calculateBudget(data, payload(e));
  const pedidoRef = saveOrderFromResult(data, ref) as Record<string, unknown>;
  const nuevo = calcularEncargo(e, cfg);
  const campos = camposPedido(e, nuevo) as Record<string, unknown>;

  const dinero: [string, number, number][] = [
    ['precio', nuevo.precio, ref.info.precio_final],
    ['coste', nuevo.costeImpresion, ref.info.coste_bruto_impresion],
    ['beneficio', nuevo.beneficioNeto, ref.info.beneficio_neto],
    ['recargo urgencia', nuevo.recargoUrgencia, ref.info.recargo_urgencia],
    ['precio base', nuevo.precioBase, ref.info.precio_base],
    ['precio unitario', nuevo.precioUnitario, ref.info.precio_unitario],
    ['filamento', nuevo.desglose.filamento, ref.breakdown.filamento],
    ['luz', nuevo.desglose.electricidad, ref.breakdown.electricidad],
    ['desgaste', nuevo.desglose.deterioro_impresora, ref.breakdown.deterioro_impresora],
    ['diseño', nuevo.desglose.diseno_modelado, ref.breakdown.diseno_modelado],
    ['post-procesado', nuevo.desglose.postprocesado, ref.breakdown.postprocesado]
  ];
  const malos = dinero.filter(([, a, b]) => cent(a) !== cent(b)).map(([k, a, b]) => `${k} ${a} ≠ ${b}`);
  for (const k of CAMPOS) {
    if (JSON.stringify(campos[k]) !== JSON.stringify(pedidoRef[k])) {
      malos.push(`${k} ${JSON.stringify(campos[k])} ≠ ${JSON.stringify(pedidoRef[k])}`);
    }
  }
  if (malos.length) {
    fallos++;
    check(nombre, false, malos.join(' · '));
  }
}

section(`pedidos reales (${fixture.casos.length}) × 3 configuraciones`);
const configs: [string, ConfigCalculadora][] = [
  ['config real', fixture.config],
  ['mínimo 3 €', { ...fixture.config, global_config: { ...fixture.config.global_config, precio_minimo: 3 } }],
  ['post-procesado a 20 €/h', { ...fixture.config, global_config: { ...fixture.config.global_config, postproc_cost_h: 20, labor_cost_h: 17.5 } }]
];
for (const [nc, cfg] of configs) {
  const antes = fallos;
  fixture.casos.forEach((c, i) => comparar(`${nc} · pedido ${i + 1}`, c, cfg));
  check(`${nc}: ${fixture.casos.length} pedidos al céntimo`, fallos === antes);
}

section('rejilla sintética');
{
  const cfg = { ...fixture.config, global_config: { ...fixture.config.global_config, precio_minimo: 3 } };
  const impresoras = cfg.printers.map((p) => p.name);
  const lineas = [
    [{ material: 'PLA', color: 'Negro', gramos: 0.4 }], // por debajo del mínimo
    [{ material: 'PLA', color: 'Blanco', gramos: 12.8 }],
    [{ material: 'PETG', color: 'Negro', gramos: 137.33 }],
    [{ material: 'Nylon', color: 'Natural', gramos: 1503.7 }],
    [
      { material: 'PLA', color: 'Blanco', gramos: 12.8 },
      { material: 'PLA', color: 'Negro', gramos: 1.61 }
    ],
    [
      { material: 'PLA', color: 'Rojo', gramos: 7 },
      { material: 'TPU', color: 'Negro', gramos: 43.25 },
      { material: 'PLA SILK/MARBLE', color: 'Oro', gramos: 18 },
      { material: 'PLA', color: 'Purga', gramos: 9.3 }
    ]
  ];
  const horas = [0.05, 1.5167, 7.25, 48];
  const cantidades = [1, 3, 50];
  const disenos = Object.keys(DISENO_MODELADO);
  const postpros = Object.keys(POSTPROCESADO);
  const riesgos = Object.keys(PROBABILIDAD_ERROR);
  let i = 0;
  const antes = fallos;
  // Producto completo de lo que mueve el precio; el resto rota con el índice.
  for (const imp of impresoras)
    for (const ls of lineas)
      for (const h of horas)
        for (const n of cantidades)
          for (const d of disenos) {
            i++;
            comparar(`sintético ${i}`, {
              impresora: imp,
              lineas: ls,
              horas: h,
              cantidad: n,
              diseno: d,
              disenoHoras: d === DISENO_A_MEDIDA ? [0, 0.5, 2.75][i % 3] : 0,
              postprocesado: postpros[i % postpros.length],
              riesgo: riesgos[i % riesgos.length],
              urgente: i % 4 === 0,
              gastoExtra: [0, 0.3, 4.99, 12][i % 4]
            }, cfg);
          }
  check(`${i} combinaciones al céntimo`, fallos === antes);
}

section('etiquetas antiguas');
{
  const disenos = [undefined, '', 'No necesario', 'Chorrada - En Slicer', "Fácil - Fusión 30'", "Medio - Fusión 60'",
    'Avanzado - AI + Remesh', 'Media (Fusion <1h)', 'Búsqueda de modelos', 'raro'];
  const postpros = [undefined, '', 'No', 'Limpio', 'Sencillo (Lijado ligero)', 'Medio (Lijado + Ensamblado)',
    'Complejo (Lijado + Pintura)', 'Sencillo (lijado)', 'Avanzado (+ pintura)', 'raro'];
  let iguales = true;
  for (const d of disenos) for (const b of [undefined, 'No', 'Sí']) iguales &&= migrarDiseno(d, b) === migrateDiseno(d, b);
  for (const p of postpros) for (const s of [undefined, 'No', 'Pocos / Baja dificultad', 'Muchos / Elevada dificultad'])
    iguales &&= migrarPostpro(p, s) === migratePostprocesado(p, s);
  check('diseño y post-procesado se pliegan igual que la 7.2', iguales);
}

section('el mínimo actúa');
{
  const cfg = { ...fixture.config, global_config: { ...fixture.config.global_config, precio_minimo: 3 } };
  const r = calcularEncargo({
    impresora: 'Kobra X', lineas: [{ material: 'PLA', color: 'Negro', gramos: 1 }], horas: 0.1, cantidad: 1,
    diseno: 'No necesario', disenoHoras: 0, postprocesado: 'Limpio', riesgo: 'Baja (25%)', urgente: false, gastoExtra: 0
  }, cfg);
  check('1 g y 6 min → 3,00 € con mínimo aplicado', r.precio === 3 && r.minimoAplicado);
}

console.log(`\n${casos} casos comparados, ${fallos} distintos.`);
done();
