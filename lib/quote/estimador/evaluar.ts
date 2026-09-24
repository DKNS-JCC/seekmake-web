// Pricing half of the estimator: turns the per-layer statistics of an
// Analisis into grams and seconds for one concrete choice of layer height,
// infill density and material. Cheap (no geometry), so the quote page can
// re-evaluate on every click while the analysis runs once per part.
//
// Time follows what a slicer's G-code estimator does: every path is
// length / speed plus the acceleration it loses at stops and corners,
// speeds are capped by the material's max volumetric flow, and layers
// faster than the material's minimum layer time are slowed down (the
// dominant effect on small parts).

import {
  BINS_ESQUINA,
  N_BINS_VOLADIZO,
  type Analisis,
  type Histograma,
  type Muestra
} from './analizar';
import { espesorParedes, type PerfilImpresora, type PerfilMaterial } from './perfil';

/**
 * Empirical corrections fitted against real slicer output (see
 * scripts/benchmark-estimador.ts). `peso` and `tiempo` are the global
 * multipliers the admin tunes from their own Orca results.
 */
export interface Calibracion {
  /** Multipliers on the extruded volume of each feature. */
  kPared: number;
  kSolido: number;
  kRelleno: number;
  /** Density-independent share of sparse infill (anchors, wall overlap). */
  cRelleno: number;
  kSoporte: number;
  /** Weight of the support outline (sheath/walls) relative to one bead. */
  kSoporteContorno: number;
  /** Multiplier on support print time. */
  kTiempoSoporte: number;
  /** Fixed seconds per layer (layer change, z-hop, wipe). */
  tCapa: number;
  /** Seconds per travel between islands/regions (retract + hop + move). */
  tViaje: number;
  /** Extra seconds per infill line (turnarounds and hops the runs imply). */
  tCuerda: number;
  /** Seconds added once per print (start G-code moves). */
  tInicio: number;
  /** Global multipliers from the shop's own slicer data. */
  peso: number;
  tiempo: number;
}

// Fitted against PrusaSlicer 2.7 configured like Orca's K1 SE profile
// (41 parts × 7 infill/layer settings: weight ±3 %, time ±4 % mean error).
// Normal (grid) supports; see SOPORTE_ARBOL for tree supports.
export const CALIBRACION_BASE: Calibracion = {
  kPared: 1.088,
  kSolido: 0.956,
  kRelleno: 0.947,
  cRelleno: 0.026,
  kSoporte: 0.7,
  kSoporteContorno: 1.3,
  kTiempoSoporte: 0.65,
  tCapa: 0.3,
  tViaje: 0.25,
  tCuerda: 0,
  tInicio: 0,
  peso: 1,
  tiempo: 1
};

/** Support factors for tree supports (Orca tree(auto) / Prusa organic). */
export const SOPORTE_ARBOL: Partial<Calibracion> = {
  kSoporte: 0.3,
  kSoporteContorno: 2.9,
  kTiempoSoporte: 0.4
};

export interface OpcionesEvaluacion {
  perfil: PerfilImpresora;
  material: PerfilMaterial;
  /** Index into analisis.presets (preferred)… */
  preset?: number;
  /** …or a layer height (closest preset is used). */
  alturaCapa?: number;
  /** Sparse infill density, 0-1. */
  relleno: number;
  /** Include support material under steep overhangs. */
  soportes: boolean;
  /** Copies printed together on one plate (results are for all of them). */
  copias?: number;
  calibracion?: Partial<Calibracion>;
}

export interface Estimacion {
  /** Totals for all `copias` on the plate. Total filament, supports included, g. */
  pesoG: number;
  soporteG: number;
  /** Estimated print time, s. */
  tiempoS: number;
  capas: number;
  /** Time share by feature, s (diagnostics / admin detail). */
  desglose: {
    paredes: number;
    solido: number;
    relleno: number;
    soporte: number;
    viajes: number;
    enfriamiento: number;
  };
  /** Extruded volume by feature, mm³ (before flow ratio). */
  volumenes: { paredes: number; solido: number; relleno: number; soporte: number };
}

// Representative angle per corner bin (15-30, 30-60, 60-90, 90-135, 135-180).
const ANG_ESQUINA = [22.5, 45, 75, 112.5, 157.5];

/** Time for one straight path starting and ending at corner speed `j`. */
function tramo(L: number, v: number, a: number, j: number): number {
  if (L <= 0) return 0;
  const v0 = Math.min(j, v);
  const dAcel = (v * v - v0 * v0) / a;
  if (L >= dAcel) return L / v + ((v - v0) * (v - v0)) / (a * v);
  const vp = Math.sqrt(v0 * v0 + a * L);
  return (2 * (vp - v0)) / a;
}

/** Sum of tramo() over a length histogram scaled by `mult` paths per entry. */
function tiempoHist(h: Histograma, mult: number, v: number, a: number, j: number): number {
  let t = 0;
  for (let b = 0; b < h.n.length; b++) {
    const n = h.n[b] * mult;
    if (n <= 0) continue;
    const L = h.l[b] / h.n[b];
    t += n * tramo(L, v, a, j);
  }
  return t;
}

function cuentaHist(h: Histograma, mult: number): number {
  let n = 0;
  for (let b = 0; b < h.n.length; b++) n += h.n[b] * mult;
  return n;
}

function largoHist(h: Histograma, mult: number): number {
  let l = 0;
  for (let b = 0; b < h.l.length; b++) l += h.l[b] * mult;
  return l;
}

/** Acceleration time lost at one corner of angle `ang` (deg). */
function perdidaEsquina(ang: number, v: number, a: number, j: number): number {
  const s = 2 * Math.sin(((ang / 2) * Math.PI) / 180);
  const vj = Math.min(v, s > 0 ? j / s : v);
  return ((v - vj) * (v - vj)) / (a * v);
}

function indicePreset(an: Analisis, o: OpcionesEvaluacion): number {
  if (o.preset !== undefined && an.presets[o.preset]) return o.preset;
  const h = o.alturaCapa ?? 0.2;
  let k = 0;
  for (let i = 1; i < an.presets.length; i++) {
    if (Math.abs(an.presets[i].alturaCapa - h) < Math.abs(an.presets[k].alturaCapa - h)) k = i;
  }
  return k;
}

export function evaluar(an: Analisis, o: OpcionesEvaluacion): Estimacion {
  const cal: Calibracion = { ...CALIBRACION_BASE, ...(o.calibracion ?? {}) };
  const mat = o.material;
  const k = indicePreset(an, o);
  const p: PerfilImpresora = { ...o.perfil, ...(an.presets[k]?.perfil ?? {}) };
  const h = an.presets[k]?.alturaCapa ?? 0.2;
  const h0 = an.alturaPrimeraCapa;
  const d = Math.max(0, Math.min(1, o.relleno));
  const copias = Math.max(1, Math.floor(o.copias ?? 1));
  // Effective sparse density: nominal lines plus anchors/overlap.
  const dEf = d > 0 ? Math.min(1, d * cal.kRelleno + cal.cRelleno) : 0;
  const r = an.resolucion;

  // Extrusion spacing (slicer's rounded-rectangle bead) and flow-capped speed.
  const sp = (w: number, hh: number) => w - hh * (1 - Math.PI / 4);
  const vCap = (v: number, w: number, hh: number) => Math.min(v, mat.volMax / (sp(w, hh) * hh));
  const spExt = sp(p.anchoParedExt, h);
  const spInt = sp(p.anchoParedInt, h);

  const des = { paredes: 0, solido: 0, relleno: 0, soporte: 0, viajes: 0, enfriamiento: 0 };
  const vol = { paredes: 0, solido: 0, relleno: 0, soporte: 0 };
  let volumen = 0; // mm³ of part
  let volSoporte = 0; // mm³ of support
  let tiempo = 0;
  let capas = 0;
  const j = p.jerk;

  an.muestras.forEach((m: Muestra, si: number) => {
    const primera = si === 0;
    const hh = primera ? h0 : h;
    const nCapas = primera ? 1 : m.dz / h;
    if (nCapas <= 0) return;
    capas += nCapas;
    if (m.area <= 0 && m.pieles[k].soporte <= 0) return;
    const pk = m.pieles[k];
    const pr = m.pieles[an.presetRef] ?? pk;
    // Run statistics were taken on the reference preset's split; when this
    // preset's solid/sparse areas differ a lot, use the whole-infill runs.
    const parecido = (a: number, b: number) => b > 0 && a <= b * 1.5 && a >= b / 1.5;
    const cSol = parecido(pk.solido, pr.solido) ? m.cuerdasSolido : m.cuerdasRelleno;
    const cDis = parecido(pk.disperso, pr.disperso) ? m.cuerdasDisperso : m.cuerdasRelleno;

    // ── walls ──
    const vOut = primera ? p.vPrimeraCapa : vCap(p.vParedExt, p.anchoParedExt, hh);
    const vIn = primera ? p.vPrimeraCapa : vCap(p.vParedInt, p.anchoParedInt, hh);
    const aOut = primera ? p.aPrimeraCapa : p.aParedExt;
    const aIn = primera ? p.aPrimeraCapa : p.aParedInt;
    const P = largoHist(m.lazos, 1);
    // Wall ring: the loops' own footprint (exact contour length × ring
    // thickness), capped by the raster ring where the part is too thin.
    const anilloPared = Math.max(0, Math.min(m.area - pk.interior, P * espesorParedes(p, hh)));
    // Inner walls that actually fit (thin features only get the outer one).
    let internas = 0;
    if (P > 0 && p.paredes > 1) {
      internas = Math.max(0, Math.min(p.paredes - 1, (anilloPared / P - spExt) / spInt));
    }
    let tPared = tiempoHist(m.lazos, 1, vOut, aOut, j) + tiempoHist(m.lazos, internas, vIn, aIn, j);
    let nEsq = 0;
    for (let b = 0; b < BINS_ESQUINA.length; b++) {
      const n = m.esquinas[b];
      if (!n) continue;
      nEsq += n;
      tPared += n * perdidaEsquina(ANG_ESQUINA[b], vOut, aOut, j);
      tPared += n * internas * perdidaEsquina(ANG_ESQUINA[b], vIn, aIn, j);
    }
    // Overhanging walls slow down by how far they stick out per layer.
    if (!primera) {
      for (let b = 0; b < N_BINS_VOLADIZO; b++) {
        const L = m.voladizo[b];
        if (!L) continue;
        const beta = ((b + 0.5) / N_BINS_VOLADIZO) * (Math.PI / 2);
        const sale = (hh * Math.tan(beta)) / p.anchoParedExt;
        const vOv = sale < 0.25 ? 0 : sale < 0.5 ? p.vVoladizo[0] : sale < 0.75 ? p.vVoladizo[1] : p.vVoladizo[2];
        if (vOv > 0) {
          tPared += L * Math.max(0, 1 / vOv - 1 / vOut);
          tPared += L * internas * Math.max(0, 1 / vOv - 1 / vIn);
        }
      }
    }
    const lPared = P * (1 + internas);

    // ── solid infill (top surfaces, bridges, shells) ──
    const spSol = sp(p.anchoSolido, hh);
    const multSol = r / spSol;
    const aSol = pk.solido;
    const aTop = Math.min(aSol, pk.superior);
    const aPue = Math.min(aSol - aTop, pk.puente);
    const aPin = Math.min(aSol - aTop - aPue, pk.puenteInterno);
    const aResto = Math.max(0, aSol - aTop - aPue - aPin);
    let tSol = 0;
    if (aSol > 0) {
      if (primera) {
        tSol += tiempoHist(cSol, aSol * multSol, p.vPrimeraCapa, p.aPrimeraCapa, j);
      } else {
        tSol += tiempoHist(cSol, aTop * multSol, vCap(p.vSuperior, p.anchoSolido, hh), p.aSuperior, j);
        tSol += tiempoHist(cSol, aPue * multSol, p.vPuente, p.aParedExt / 2, j);
        tSol += tiempoHist(cSol, aPin * multSol, vCap(p.vPuenteInterno, p.anchoSolido, hh), p.aSolido, j);
        tSol += tiempoHist(cSol, aResto * multSol, vCap(p.vSolido, p.anchoSolido, hh), p.aSolido, j);
      }
    }
    // Gap fill: one bead down the middle of narrow gaps between walls.
    const aHueco = m.hueco;
    if (aHueco > 0) {
      const vH = primera ? p.vPrimeraCapa : vCap(p.vSolido, p.anchoSolido, hh);
      tSol += aHueco / spSol / vH;
    }
    const lSol = (aSol + aHueco) / spSol;
    let nCuerdas = cuentaHist(cSol, aSol * multSol);

    // ── sparse infill ──
    let tRel = 0;
    let lRel = 0;
    if (pk.disperso > 0 && d > 0) {
      if (d >= 0.99) {
        // 100 % infill prints as solid infill.
        const mult = pk.disperso * (r / spSol);
        tRel = tiempoHist(cDis, mult, vCap(p.vSolido, p.anchoSolido, hh), p.aSolido, j);
        nCuerdas += cuentaHist(cDis, mult);
        lRel = pk.disperso / spSol;
      } else {
        const spRel = sp(p.anchoRelleno, hh);
        const mult = (pk.disperso * r * dEf) / spRel;
        tRel = tiempoHist(cDis, mult, vCap(p.vRelleno, p.anchoRelleno, hh), p.aRelleno, j);
        nCuerdas += cuentaHist(cDis, mult);
        lRel = (pk.disperso * dEf) / spRel;
      }
    }

    // ── supports ──
    let tSop = 0;
    let lSop = 0;
    let vSop = 0;
    if (o.soportes && (pk.soporte > 0 || pk.soporteInterfaz > 0)) {
      const spS = sp(p.anchoSolido, hh);
      const lBase = (pk.soporte * p.soporteDensidad) / spS + m.soporteContorno * cal.kSoporteContorno;
      const lIf = (pk.soporteInterfaz * p.soporteInterfazDensidad) / spS;
      lSop = lBase + lIf;
      // Support lines are short and broken: charge the acceleration of a
      // typical 5 mm run on top of the cruise time.
      const vS = vCap(p.vSoporte, p.anchoSolido, hh);
      const vSI = vCap(p.vSoporteInterfaz, p.anchoSolido, hh);
      tSop =
        ((lBase / 5) * tramo(5, vS, p.aRelleno, j) + (lIf / 5) * tramo(5, vSI, p.aRelleno, j)) *
        cal.kTiempoSoporte;
      vSop =
        (pk.soporte * p.soporteDensidad +
          pk.soporteInterfaz * p.soporteInterfazDensidad +
          m.soporteContorno * cal.kSoporteContorno * spS) *
        hh;
    }

    // ── travel ──
    const nLazos = m.lazos.n.reduce((s, x) => s + x, 0);
    const viajes = nLazos + 2 * m.regiones + (lSop > 0 ? 1 : 0);
    const tViaje = (viajes * cal.tViaje + nCuerdas * cal.tCuerda) * copias + cal.tCapa;

    // ── minimum layer time (cooling slowdown) ──
    // Copies on the same plate share every layer, so a batch of small parts
    // rarely hits the cooling floor that dominates a single one.
    const tExtr = (tPared + tSol + tRel + tSop) * copias;
    let tCapa = tExtr + tViaje;
    let tEnf = 0;
    if (tCapa < mat.tiempoMinCapa) {
      const lExtr = (lPared + lSol + lRel + lSop) * copias;
      const tLento = tViaje + lExtr / Math.max(mat.vMin, 1);
      const objetivo = Math.min(mat.tiempoMinCapa, tLento);
      if (objetivo > tCapa) {
        tEnf = objetivo - tCapa;
        tCapa = objetivo;
      }
    }

    tiempo += tCapa * nCapas;
    des.paredes += tPared * copias * nCapas;
    des.solido += tSol * copias * nCapas;
    des.relleno += tRel * copias * nCapas;
    des.soporte += tSop * copias * nCapas;
    des.viajes += tViaje * nCapas;
    des.enfriamiento += tEnf * nCapas;

    // ── volume ──
    const aDisp = d >= 0.99 ? pk.disperso * cal.kSolido : pk.disperso * dEf;
    vol.paredes += hh * nCapas * anilloPared * cal.kPared;
    const extraPuente = primera ? 0 : aPin * Math.max(0, p.espesorPuenteInterno - hh);
    vol.solido += nCapas * (hh * (aSol + aHueco) + extraPuente) * cal.kSolido;
    vol.relleno += hh * nCapas * aDisp;
    vol.soporte += vSop * nCapas * cal.kSoporte;
    volumen +=
      nCapas *
      (hh * (anilloPared * cal.kPared + (aSol + aHueco) * cal.kSolido + aDisp) + extraPuente * cal.kSolido);
    volSoporte += vSop * nCapas * cal.kSoporte;
  });

  for (const key of Object.keys(vol) as (keyof typeof vol)[]) vol[key] *= copias;
  volumen *= copias;
  volSoporte *= copias;
  const gramos = (v: number) => (v * mat.densidad * mat.flujo) / 1000;
  const soporteG = gramos(volSoporte) * cal.peso;
  const pesoG = gramos(volumen) * cal.peso + soporteG;
  const tiempoS = (tiempo + cal.tInicio) * cal.tiempo;
  for (const key of Object.keys(des) as (keyof typeof des)[]) des[key] *= cal.tiempo;

  return { pesoG, soporteG, tiempoS, capas: Math.round(capas), desglose: des, volumenes: vol };
}

