// Tests for the slicer-like estimator (lib/quote/estimador). Reference
// numbers come from PrusaSlicer 2.7 set up like Orca's K1 SE profile
// (0.20 mm, 2 walls, 5/3 shells, 15 % grid, 12 s minimum layer time, PLA);
// see docs/estimador-presupuestos.md for the full benchmark.
//
//   npx tsx scripts/test-estimador.ts

import { analizarPieza } from '../lib/quote/estimador/analizar';
import { evaluar } from '../lib/quote/estimador/evaluar';
import { elegirOrientacion, rotarTriangulos, rotacionHaciaAbajo, type Matriz3 } from '../lib/quote/estimador/orientar';
import { MATERIALES_K1SE, PERFIL_K1SE } from '../lib/quote/estimador/perfil';
import { copiasPorCama, estimarPieza, costeOrientacion } from '../lib/quote/estimador';
import { DEFAULT_QUOTE_SETTINGS } from '../lib/quote/pricing';
import { caja, cilindro, malla } from './_mallas';
import { check, done, section } from './_assert';

const cfg = {
  perfil: PERFIL_K1SE,
  presets: [{ alturaCapa: 0.12 }, { alturaCapa: 0.2 }, { alturaCapa: 0.28 }]
};
const PLA = MATERIALES_K1SE.PLA;
const est = (tri: Float32Array, extra: Partial<Parameters<typeof evaluar>[1]> = {}) =>
  evaluar(analizarPieza(tri, cfg), {
    perfil: PERFIL_K1SE,
    material: PLA,
    alturaCapa: 0.2,
    relleno: 0.15,
    soportes: false,
    ...extra
  });
const cerca = (label: string, got: number, ref: number, tol: number) =>
  check(`${label}: ${got.toFixed(2)} vs ${ref} (±${Math.round(tol * 100)} %)`, Math.abs(got / ref - 1) <= tol);

section('cubo 20 mm (referencia 3,51 g · 20,6 min)');
const cubo = malla(caja(0, 0, 0, 20, 20, 20));
const eCubo = est(cubo);
cerca('peso', eCubo.pesoG, 3.51, 0.1);
cerca('tiempo (min)', eCubo.tiempoS / 60, 20.6, 0.1);
check('100 capas', Math.abs(eCubo.capas - 100) <= 1, String(eCubo.capas));
check('dominado por el tiempo mínimo de capa', eCubo.desglose.enfriamiento > eCubo.tiempoS * 0.5);

section('bloque 100×100×50 (referencia 123 g · 1,99 h)');
const bloque = malla(caja(0, 0, 0, 100, 100, 50));
const eBloque = est(bloque);
cerca('peso', eBloque.pesoG, 123.35, 0.1);
cerca('tiempo (h)', eBloque.tiempoS / 3600, 1.99, 0.12);

section('placa 100×100×3 (referencia 22,9 g · 30 min)');
const placa = malla(caja(0, 0, 0, 100, 100, 3));
const ePlaca = est(placa);
cerca('peso', ePlaca.pesoG, 22.85, 0.1);
cerca('tiempo (min)', ePlaca.tiempoS / 60, 29.8, 0.12);

section('caja de pared fina 80×60×40, pared 2 mm');
// Five boxes: a floor and four walls (overlapping solids are merged).
const cajaFina = malla(
  caja(0, 0, 0, 80, 60, 2),
  caja(0, 0, 0, 2, 60, 40),
  caja(78, 0, 0, 80, 60, 40),
  caja(0, 0, 0, 80, 2, 40),
  caja(0, 58, 0, 80, 60, 40)
);
const eCaja = est(cajaFina, { relleno: 0.2 });
cerca('peso', eCaja.pesoG, 33.89, 0.12);

section('relleno y capa');
const denso = est(cubo, { relleno: 0.4 });
const macizo = est(cubo, { relleno: 1 });
check('más relleno, más peso', macizo.pesoG > denso.pesoG && denso.pesoG > eCubo.pesoG);
check('macizo ≈ volumen sólido', Math.abs(macizo.pesoG / (8 * 1.24 * 0.95) - 1) < 0.15, macizo.pesoG.toFixed(2));
const fino = est(bloque, { alturaCapa: 0.12 });
const grueso = est(bloque, { alturaCapa: 0.28 });
check('capa fina tarda más', fino.tiempoS > eBloque.tiempoS * 1.15);
// At 0.28 mm the filament's max flow caps the speed: barely faster (the
// reference slicer gives 2.31 h vs 2.36 h for this block).
check('capa gruesa, limitada por el caudal', Math.abs(grueso.tiempoS / eBloque.tiempoS - 1) < 0.1);

section('soportes');
// A "T": 10×10 stem with a 60×10 bar on top → two 25 mm overhangs.
const te = malla(caja(25, 0, 0, 35, 10, 40), caja(0, 0, 40, 60, 10, 45));
const sinSop = est(te, { relleno: 0.2 });
const conSop = est(te, { relleno: 0.2, soportes: true });
check('detecta el voladizo', conSop.soporteG > 1, conSop.soporteG.toFixed(2));
check('los soportes suman peso y tiempo', conSop.pesoG > sinSop.pesoG && conSop.tiempoS > sinSop.tiempoS);
check('un cubo no necesita soportes', est(cubo, { soportes: true }).soporteG < 0.05);

section('copias en la misma cama');
const an = analizarPieza(cubo, cfg);
const una = evaluar(an, { perfil: PERFIL_K1SE, material: PLA, alturaCapa: 0.2, relleno: 0.2, soportes: false });
const diez = evaluar(an, { perfil: PERFIL_K1SE, material: PLA, alturaCapa: 0.2, relleno: 0.2, soportes: false, copias: 10 });
check('10 copias pesan 10 veces', Math.abs(diez.pesoG / una.pesoG - 10) < 0.01);
check('pero tardan mucho menos de 10 veces (referencia 55 min)', diez.tiempoS < una.tiempoS * 4, `${(diez.tiempoS / 60).toFixed(1)} min`);
check('caben 64 cubos de 20 mm en 220×220', copiasPorCama({ x: 20, y: 20 }, { x: 220, y: 220 }) === 64);
check('una pieza enorme ocupa su cama', copiasPorCama({ x: 200, y: 150 }, { x: 220, y: 220 }) === 1);

section('orientación automática');
// A 100×100×3 plate uploaded standing on its edge.
const deCanto = rotarTriangulos(placa, rotacionHaciaAbajo([0, 1, 0]));
const coste = costeOrientacion(DEFAULT_QUOTE_SETTINGS, { material: 'PLA', resistenciaId: 'estandar', detalleId: 'estandar' });
const res = elegirOrientacion(deCanto, { ...cfg, presets: [{ alturaCapa: 0.24 }, { alturaCapa: 0.2 }, { alturaCapa: 0.12 }] }, coste);
check('la tumba en la cama', res.analisis.alturaMm < 4, `altura ${res.analisis.alturaMm.toFixed(1)} mm`);
check('no conserva la orientación de canto', !res.original);
const tumbada = elegirOrientacion(placa, { ...cfg, presets: [{ alturaCapa: 0.24 }, { alturaCapa: 0.2 }, { alturaCapa: 0.12 }] }, coste);
check('respeta una orientación ya buena', tumbada.original);
const R: Matriz3 = res.R;
check('la rotación es ortonormal', Math.abs(R[0] * R[0] + R[3] * R[3] + R[6] * R[6] - 1) < 1e-9);

section('estimarPieza (ajustes de la web)');
const s = DEFAULT_QUOTE_SETTINGS;
const cil = analizarPieza(malla(cilindro(15, 40)), { perfil: PERFIL_K1SE, presets: s.detalle.map((d) => ({ alturaCapa: d.altura_capa_mm, perfil: { ...(d.perfil ?? {}), ...(d.paredes ? { paredes: d.paredes } : {}) } })) });
const e1 = estimarPieza(cil, s, { material: 'PLA', resistenciaId: 'estandar', detalleId: 'estandar' });
const e20 = estimarPieza(cil, s, { material: 'PLA', resistenciaId: 'estandar', detalleId: 'estandar', cantidad: 20 });
check('sin soportes en un cilindro de pie', !e1.conSoportes);
check('20 unidades van en una sola cama', e20.camas === 1 && e20.porCama === 20, `${e20.camas} camas × ${e20.porCama}`);
check('tiempo por unidad baja al agruparlas', e20.tiempoH < e1.tiempoH * 0.6);
const fino3 = estimarPieza(cil, s, { material: 'PLA', resistenciaId: 'estandar', detalleId: 'fino' });
check('"alto detalle" (3 paredes, 0,12 mm) pesa y tarda más', fino3.pesoG > e1.pesoG && fino3.tiempoH > e1.tiempoH);
const petg = estimarPieza(cil, s, { material: 'PETG', resistenciaId: 'estandar', detalleId: 'estandar' });
// Small part: PETG's shorter minimum layer time (8 s vs 12 s) wins…
check('PETG, pieza pequeña: menos espera por capa', petg.tiempoH < e1.tiempoH);
// …big part: its 9 mm³/s max flow (vs 18) makes it slower.
const bloqueWeb = analizarPieza(bloque, { perfil: PERFIL_K1SE, presets: [{ alturaCapa: 0.2 }] });
const tPla = evaluar(bloqueWeb, { perfil: PERFIL_K1SE, material: PLA, alturaCapa: 0.2, relleno: 0.15, soportes: false });
const tPetg = evaluar(bloqueWeb, { perfil: PERFIL_K1SE, material: MATERIALES_K1SE.PETG, alturaCapa: 0.2, relleno: 0.15, soportes: false });
check('PETG, pieza grande: más lento por caudal', tPetg.tiempoS > tPla.tiempoS * 1.15);

section('mallas raras');
const vacia = analizarPieza(new Float32Array(0), cfg);
check('malla vacía no revienta', vacia.muestras.length === 0);
const abierta = malla(caja(0, 0, 0, 20, 20, 20).slice(0, 9 * 10)); // two faces missing
const eAb = est(abierta);
check('malla abierta da números finitos', Number.isFinite(eAb.pesoG) && Number.isFinite(eAb.tiempoS));
const invertida = new Float32Array(cubo);
for (let i = 0; i < invertida.length; i += 9) {
  for (let k = 0; k < 3; k++) {
    const t = invertida[i + 3 + k];
    invertida[i + 3 + k] = invertida[i + 6 + k];
    invertida[i + 6 + k] = t;
  }
}
check('normales invertidas → mismo peso', Math.abs(est(invertida).pesoG / eCubo.pesoG - 1) < 0.01);

done();
