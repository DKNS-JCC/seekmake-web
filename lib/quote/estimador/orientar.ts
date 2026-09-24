// Auto-orientation: the customer's file comes in whatever orientation their
// CAD exported it, but the shop lays it on the bed the cheap way (flat face
// down, fewest supports, fewest layers) before slicing. Quoting the file
// as-is is what made the old estimate swing by tens of euros.
//
// Candidates are the directions of the biggest flat areas of the mesh
// (a flat face resting on the bed) plus the six axes and the uploaded
// orientation. Each one gets a light analysis and is priced with the real
// evaluator; the cheapest wins, and the customer's own orientation is kept
// when it is (almost) as good.

import { analizarPieza, type Analisis, type ConfigAnalisis } from './analizar';

/** Row-major 3×3 rotation matrix. */
export type Matriz3 = [number, number, number, number, number, number, number, number, number];

export const IDENTIDAD: Matriz3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export interface Candidata {
  /** Rotation applied to the uploaded mesh (print frame, Z up). */
  R: Matriz3;
  /** Direction (in the uploaded frame) that ends up facing the bed. */
  abajo: [number, number, number];
  original: boolean;
}

function volumenFirmadoLocal(tri: Float32Array): number {
  let v = 0;
  for (let i = 0; i < tri.length; i += 9) {
    v +=
      tri[i] * (tri[i + 4] * tri[i + 8] - tri[i + 5] * tri[i + 7]) +
      tri[i + 1] * (tri[i + 5] * tri[i + 6] - tri[i + 3] * tri[i + 8]) +
      tri[i + 2] * (tri[i + 3] * tri[i + 7] - tri[i + 4] * tri[i + 6]);
  }
  return v / 6;
}

export function rotarTriangulos(tri: Float32Array, R: Matriz3): Float32Array {
  const out = new Float32Array(tri.length);
  for (let i = 0; i < tri.length; i += 3) {
    const x = tri[i], y = tri[i + 1], z = tri[i + 2];
    out[i] = R[0] * x + R[1] * y + R[2] * z;
    out[i + 1] = R[3] * x + R[4] * y + R[5] * z;
    out[i + 2] = R[6] * x + R[7] * y + R[8] * z;
  }
  return out;
}

export function multiplicar(A: Matriz3, B: Matriz3): Matriz3 {
  const o = new Array(9).fill(0) as Matriz3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
  }
  return o;
}

/** Rotation taking unit vector d onto (0, 0, -1) — "d faces the bed". */
export function rotacionHaciaAbajo(d: [number, number, number]): Matriz3 {
  const [x, y, z] = d;
  const c = -z; // cos of the angle between d and -Z
  if (c > 1 - 1e-9) return [...IDENTIDAD] as Matriz3;
  if (c < -1 + 1e-9) return [1, 0, 0, 0, -1, 0, 0, 0, -1]; // 180° about X
  // Axis k = d × (-Z) normalised, Rodrigues' formula.
  let kx = -y, ky = x;
  const s = Math.sqrt(kx * kx + ky * ky);
  kx /= s;
  ky /= s;
  const t = 1 - c;
  return [
    t * kx * kx + c, t * kx * ky, s * ky,
    t * kx * ky, t * ky * ky + c, -s * kx,
    -s * ky, s * kx, c
  ];
}

/**
 * Candidate orientations: uploaded one, largest flat regions face-down,
 * then the six axes. Directions closer than ~8° are merged.
 */
export function candidatasOrientacion(tri: Float32Array, max = 10): Candidata[] {
  const bins = new Map<string, { a: number; x: number; y: number; z: number }>();
  let areaTotal = 0;
  for (let i = 0; i < tri.length; i += 9) {
    const ux = tri[i + 3] - tri[i], uy = tri[i + 4] - tri[i + 1], uz = tri[i + 5] - tri[i + 2];
    const vx = tri[i + 6] - tri[i], vy = tri[i + 7] - tri[i + 1], vz = tri[i + 8] - tri[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-12) continue;
    const a = l / 2;
    areaTotal += a;
    const key = `${Math.round((nx / l) * 12)},${Math.round((ny / l) * 12)},${Math.round((nz / l) * 12)}`;
    const b = bins.get(key);
    if (b) {
      b.a += a;
      b.x += (nx / l) * a;
      b.y += (ny / l) * a;
      b.z += (nz / l) * a;
    } else bins.set(key, { a, x: (nx / l) * a, y: (ny / l) * a, z: (nz / l) * a });
  }
  // Outward normals: flip if the mesh is inside-out.
  let vol = 0;
  for (let i = 0; i < tri.length; i += 9) {
    vol +=
      tri[i] * (tri[i + 4] * tri[i + 8] - tri[i + 5] * tri[i + 7]) +
      tri[i + 1] * (tri[i + 5] * tri[i + 6] - tri[i + 3] * tri[i + 8]) +
      tri[i + 2] * (tri[i + 3] * tri[i + 7] - tri[i + 4] * tri[i + 6]);
  }
  const signo = vol < 0 ? -1 : 1;

  const dirs: { d: [number, number, number]; original: boolean }[] = [
    { d: [0, 0, -1], original: true }
  ];
  const planas = [...bins.values()]
    .filter((b) => b.a > areaTotal * 0.01)
    .sort((a, b) => b.a - a.a);
  for (const b of planas) {
    const l = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z) || 1;
    dirs.push({ d: [(b.x / l) * signo, (b.y / l) * signo, (b.z / l) * signo], original: false });
  }
  const ejes: [number, number, number][] = [
    [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]
  ];
  for (const d of ejes) dirs.push({ d, original: false });

  const out: Candidata[] = [];
  const cosMin = Math.cos((8 * Math.PI) / 180);
  for (const { d, original } of dirs) {
    if (out.length >= max) break;
    if (out.some((c) => c.abajo[0] * d[0] + c.abajo[1] * d[1] + c.abajo[2] * d[2] > cosMin)) continue;
    out.push({ R: rotacionHaciaAbajo(d), abajo: d, original });
  }
  return out;
}

/**
 * Cheap geometric score for an orientation (lower is better): part height
 * (layers, and the minimum layer time that comes with them) and the prism
 * volume under faces that would need support. O(triangles), no slicing —
 * only used to decide which candidates deserve a real analysis.
 */
export function puntuacionRapida(
  tri: Float32Array,
  abajo: [number, number, number],
  cosSoporte: number
): { altura: number; soporte: number } {
  const ux = -abajo[0], uy = -abajo[1], uz = -abajo[2]; // "up" after rotation
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < tri.length; i += 3) {
    const z = tri[i] * ux + tri[i + 1] * uy + tri[i + 2] * uz;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const signo = volumenFirmadoLocal(tri) < 0 ? -1 : 1; // outward normals
  let soporte = 0;
  for (let i = 0; i < tri.length; i += 9) {
    const ax = tri[i + 3] - tri[i], ay = tri[i + 4] - tri[i + 1], az = tri[i + 5] - tri[i + 2];
    const bx = tri[i + 6] - tri[i], by = tri[i + 7] - tri[i + 1], bz = tri[i + 8] - tri[i + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-12) continue;
    const nArriba = (signo * (nx * ux + ny * uy + nz * uz)) / l;
    if (nArriba > -cosSoporte) continue; // not a steep downward face
    const zc =
      ((tri[i] + tri[i + 3] + tri[i + 6]) * ux +
        (tri[i + 1] + tri[i + 4] + tri[i + 7]) * uy +
        (tri[i + 2] + tri[i + 5] + tri[i + 8]) * uz) / 3 - zMin;
    if (zc > 0.3) soporte += (l / 2) * -nArriba * zc; // footprint × height
  }
  return { altura: zMax - zMin, soporte };
}

export interface ResultadoOrientacion {
  /** Winning rotation and its full analysis. */
  R: Matriz3;
  original: boolean;
  analisis: Analisis;
  /** Cost of every candidate, relative to the winner (1 = best). */
  ranking: { abajo: [number, number, number]; original: boolean; coste: number }[];
}

/**
 * Pick the cheapest orientation. `coste` prices an analysis (weight + time
 * in money, supports included) — the caller passes the real evaluator so
 * the ranking uses exactly the numbers the customer will be quoted.
 */
export function elegirOrientacion(
  tri: Float32Array,
  cfg: ConfigAnalisis,
  coste: (an: Analisis) => number,
  opciones: {
    auto?: boolean;
    /** Keep the uploaded orientation when it costs at most this much more (0.05 = 5 %). */
    tolerancia?: number;
    progreso?: (fraccion: number) => void;
  } = {}
): ResultadoOrientacion {
  const progreso = opciones.progreso ?? (() => undefined);
  if (opciones.auto === false) {
    const an = analizarPieza(tri, cfg);
    progreso(1);
    return { R: [...IDENTIDAD] as Matriz3, original: true, analisis: an, ranking: [] };
  }
  // Pre-rank every candidate with the O(n) score, then give the slicing
  // treatment only to the most promising ones (plus the uploaded one).
  const todas = candidatasOrientacion(tri);
  const cosSop = Math.cos((cfg.perfil.soporteAngulo * Math.PI) / 180);
  const rapidas = todas.map((c) => ({ c, ...puntuacionRapida(tri, c.abajo, cosSop) }));
  const hMin = Math.min(...rapidas.map((x) => x.altura)) || 1;
  const vol = Math.abs(volumenFirmadoLocal(tri)) || 1;
  const nota = (x: { altura: number; soporte: number }) => x.altura / hMin + (2 * x.soporte) / vol;
  const ordenadas = [...rapidas].sort((a, b) => nota(a) - nota(b));
  const cands = ordenadas.slice(0, 3).map((x) => x.c);
  if (!cands.some((c) => c.original)) cands.push(todas[0]);
  const ligera: ConfigAnalisis = { ...cfg, maxCeldas: 15_000, maxMuestras: 60, resolucionMin: 0.4 };
  const evals = cands.map((c, i) => {
    const an = analizarPieza(c.original ? tri : rotarTriangulos(tri, c.R), ligera);
    progreso(((i + 1) / cands.length) * 0.6);
    // Balancing on a point or an edge is not an option on the real bed.
    const inestable = an.areaBaseMm2 < Math.min(20, an.volumenMm3 / Math.max(an.alturaMm, 1) * 0.05);
    return { c, coste: coste(an) * (inestable ? 1.15 : 1) };
  });
  evals.sort((a, b) => a.coste - b.coste);
  const orig = evals.find((e) => e.c.original)!;
  // Respect the customer's orientation when it is (almost) as good.
  const tolerancia = Math.max(0, opciones.tolerancia ?? 0.03);
  let finalistas = orig.coste <= evals[0].coste * (1 + tolerancia) ? [orig] : evals.slice(0, 2);
  // The light pass is coarse: re-check the runner-up when it is close.
  if (finalistas.length === 2 && finalistas[1].coste > finalistas[0].coste * 1.05) {
    finalistas = [finalistas[0]];
  }
  let m: { c: Candidata; an: Analisis; coste: number } | undefined;
  for (let i = 0; i < finalistas.length; i++) {
    const f = finalistas[i];
    const an = analizarPieza(f.c.original ? tri : rotarTriangulos(tri, f.c.R), cfg);
    const cst = coste(an);
    if (!m || cst < m.coste) m = { c: f.c, an, coste: cst };
    progreso(0.6 + ((i + 1) / finalistas.length) * 0.4);
  }
  if (!m) throw new Error('sin orientaciones');
  const base = evals[0].coste || 1;
  return {
    R: m.c.R,
    original: m.c.original,
    analisis: m.an,
    ranking: evals.map((e) => ({ abajo: e.c.abajo, original: e.c.original, coste: e.coste / base }))
  };
}
