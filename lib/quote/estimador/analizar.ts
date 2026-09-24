// Layer analysis — the geometric half of the estimator. Everything a slicer
// needs to know about a part in a given orientation, reduced to per-layer
// statistics that are cheap to price for any infill / material afterwards:
//
//  * Column (dexel) model: a vertical ray through every cell of an XY grid,
//    intersected with the mesh, gives the solid intervals of that column.
//    From them, per sampled height: cross-section area, distance to the
//    nearest top/bottom surface (→ solid shells, bridges, top surfaces) and
//    the unsupported gaps under steep overhangs (→ support material).
//  * A distance transform of each cross-section peels the wall ring off, so
//    thin features print as solid walls exactly like in the slicer.
//  * An exact planar slice of the triangles gives the contour: loop count
//    and lengths, corner angles (acceleration losses) and how much of it
//    overhangs (slowed-down walls).
//
// Pure math over a triangle soup in print coordinates (mm, Z up, bed at
// z = 0). No three.js, no DOM: runs in a Web Worker and in Node tests.

import { espesorParedes, espesoresPiel, type PerfilImpresora } from './perfil';

/** Upper edges (mm) of the path-length histogram bins; the last bin is open. */
export const BINS_LONGITUD = [1, 2, 4, 8, 16, 32, 64, 128];
/** Upper edges (deg) of the corner turning-angle bins, starting at 15°. */
export const BINS_ESQUINA = [30, 60, 90, 135, 181];
/** Tilt bins (deg from vertical) for overhanging contour: 10 bins of 9°. */
export const N_BINS_VOLADIZO = 10;

const NB_LONG = BINS_LONGITUD.length + 1;

export interface Histograma {
  /** Count per bin. */
  n: number[];
  /** Summed length per bin, mm. */
  l: number[];
}

export interface PielMuestra {
  /** Area inside this preset's wall ring, mm² per layer. */
  interior: number;
  /** Mean solid-infill area per layer (shells + narrow regions), mm². */
  solido: number;
  /** Mean sparse-infill area per layer, mm². */
  disperso: number;
  /** Mean top-surface area per layer (topmost layer of each top), mm². */
  superior: number;
  /** Mean area per layer bridging over air (bottom surfaces off the bed), mm². */
  puente: number;
  /** Mean area per layer of the first solid layer over sparse infill, mm². */
  puenteInterno: number;
  /** Mean support body / interface area per layer, mm². */
  soporte: number;
  soporteInterfaz: number;
}

export interface Muestra {
  /** Sampled height and the slab of the part it stands for, mm. */
  z: number;
  dz: number;
  /** Cross-section area, mm². */
  area: number;
  /** Cross-section area inside the wall ring, mm². */
  interior: number;
  /** Area the infill covers: interior plus its overlap into the walls, mm². */
  relleno: number;
  /** Gaps between walls too narrow for infill lines (gap fill), mm² per layer. */
  hueco: number;
  /** Outline length of the support regions (sheath/walls), mm per layer. */
  soporteContorno: number;
  /** Disconnected interior regions (each costs travel + retraction). */
  regiones: number;
  /** Contour loops by length (walls are printed once per loop per wall). */
  lazos: Histograma;
  /** Contour corners by turning angle (bins of BINS_ESQUINA, ≥15°). */
  esquinas: number[];
  /** Contour length by overhang tilt (downward faces only), mm. */
  voladizo: number[];
  /** Per quality preset, same order as ConfigAnalisis.presets. */
  pieles: PielMuestra[];
  /**
   * Straight infill runs per mm² of region, from the grid rows/columns:
   * n = runs, l = run length. Scaled by each preset's own area later.
   */
  cuerdasSolido: Histograma;
  cuerdasDisperso: Histograma;
  /** Same for the whole infill area (fallback when a preset differs a lot). */
  cuerdasRelleno: Histograma;
}

export interface Analisis {
  version: 1;
  /** Quality presets the shells were computed for (evaluate by index). */
  presets: PresetCapa[];
  alturaPrimeraCapa: number;
  /** Part height and bounding box in print orientation, mm. */
  alturaMm: number;
  bboxMm: { x: number; y: number; z: number };
  /** Solid volume from the column model, mm³. */
  volumenMm3: number;
  /** Area touching the bed, mm². */
  areaBaseMm2: number;
  /** Grid cell size used, mm. */
  resolucion: number;
  /** Index of the preset whose solid/sparse split drove the run statistics. */
  presetRef: number;
  muestras: Muestra[];
}

/** One quality preset: its layer height plus any profile overrides. */
export interface PresetCapa {
  alturaCapa: number;
  /** e.g. Orca's "0.12mm Fine" prints 3 walls and faster infill. */
  perfil?: Partial<PerfilImpresora>;
}

export interface ConfigAnalisis {
  perfil: PerfilImpresora;
  /** Quality presets to precompute shells for. */
  presets: PresetCapa[];
  /** Grid cells per layer budget (resolution adapts to the part). */
  maxCeldas?: number;
  /** Maximum sampled heights (tall parts are sampled, not sliced fully). */
  maxMuestras?: number;
  /** Finest grid allowed, mm. */
  resolucionMin?: number;
}

function vacioHist(nb: number): Histograma {
  return { n: new Array(nb).fill(0), l: new Array(nb).fill(0) };
}

function binLongitud(s: number): number {
  let b = 0;
  while (b < BINS_LONGITUD.length && s >= BINS_LONGITUD[b]) b++;
  return b;
}

/** Bounding box of a triangle soup. */
export function limites(tri: Float32Array): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tri.length; i += 3) {
    const x = tri[i], y = tri[i + 1], z = tri[i + 2];
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }
  return { min, max };
}

/** Signed volume (mm³); negative means inward-facing normals. */
export function volumenFirmado(tri: Float32Array): number {
  let v = 0;
  for (let i = 0; i < tri.length; i += 9) {
    const ax = tri[i], ay = tri[i + 1], az = tri[i + 2];
    const bx = tri[i + 3], by = tri[i + 4], bz = tri[i + 5];
    const cx = tri[i + 6], cy = tri[i + 7], cz = tri[i + 8];
    v += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

// ─── column model ─────────────────────────────────────────────────────────

interface Columnas {
  W: number;
  H: number;
  ox: number;
  oy: number;
  r: number;
  /** CSR offsets into the interval arrays, length W·H + 1. */
  off: Uint32Array;
  /** Interval bottom / top z and the bottom face's normal z. */
  zb: Float32Array;
  zt: Float32Array;
  nzb: Float32Array;
}

function construirColumnas(
  tri: Float32Array,
  signo: number,
  ox: number,
  oy: number,
  r: number,
  W: number,
  H: number
): Columnas {
  const C = W * H;
  const nTri = tri.length / 9;
  const cnt = new Uint32Array(C + 1);

  // Visits every cell centre covered by a triangle's XY projection. XY is
  // snapped to 1/1024 of a cell so the edge functions are exact integers:
  // with the top-left fill rule a centre on an edge shared by two triangles
  // is then counted by exactly one of them and closed surfaces stay closed.
  const S = 1024;
  const qx = new Float64Array(nTri * 3);
  const qy = new Float64Array(nTri * 3);
  for (let v = 0; v < nTri * 3; v++) {
    qx[v] = Math.round(((tri[v * 3] - ox) * S) / r);
    qy[v] = Math.round(((tri[v * 3 + 1] - oy) * S) / r);
  }
  const recorrer = (fill: boolean, zs: Float32Array | null, nzs: Float32Array | null, pos: Uint32Array | null) => {
    for (let t = 0; t < nTri; t++) {
      const o = t * 9;
      const v = t * 3;
      let ax = qx[v], ay = qy[v];
      let bx = qx[v + 1], by = qy[v + 1];
      let cx = qx[v + 2], cy = qy[v + 2];
      const az = tri[o + 2];
      let bz = tri[o + 5], cz = tri[o + 8];
      let area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (area2 === 0) continue;
      // Face normal z (unit), sign-corrected for inside-out meshes.
      const ux = tri[o + 3] - tri[o], uy = tri[o + 4] - tri[o + 1], uz = tri[o + 5] - tri[o + 2];
      const vx = tri[o + 6] - tri[o], vy = tri[o + 7] - tri[o + 1], vz = tri[o + 8] - tri[o + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nzr = ux * vy - uy * vx;
      const nl = Math.sqrt(nx * nx + ny * ny + nzr * nzr) || 1;
      const nz = (nzr / nl) * signo;
      if (area2 < 0) {
        // Make the projected triangle counter-clockwise.
        let tx = bx; bx = cx; cx = tx;
        tx = by; by = cy; cy = tx;
        tx = bz; bz = cz; cz = tx;
        area2 = -area2;
      }
      const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx);
      const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
      // Centre of cell i sits at i·S + S/2.
      const i0 = Math.max(0, Math.ceil((minX - S / 2) / S));
      const i1 = Math.min(W - 1, Math.floor((maxX - S / 2) / S));
      const j0 = Math.max(0, Math.ceil((minY - S / 2) / S));
      const j1 = Math.min(H - 1, Math.floor((maxY - S / 2) / S));
      if (i0 > i1 || j0 > j1) continue;
      // Edge a→b, b→c, c→a; inclusive when the edge is "top-left".
      const e0x = bx - ax, e0y = by - ay;
      const e1x = cx - bx, e1y = cy - by;
      const e2x = ax - cx, e2y = ay - cy;
      const tl0 = e0y < 0 || (e0y === 0 && e0x < 0);
      const tl1 = e1y < 0 || (e1y === 0 && e1x < 0);
      const tl2 = e2y < 0 || (e2y === 0 && e2x < 0);
      const invA = 1 / area2;
      for (let j = j0; j <= j1; j++) {
        const py = j * S + S / 2;
        for (let i = i0; i <= i1; i++) {
          const px = i * S + S / 2;
          const w0 = e0x * (py - ay) - e0y * (px - ax); // opposite c
          if (w0 < 0 || (w0 === 0 && !tl0)) continue;
          const w1 = e1x * (py - by) - e1y * (px - bx); // opposite a
          if (w1 < 0 || (w1 === 0 && !tl1)) continue;
          const w2 = e2x * (py - cy) - e2y * (px - cx); // opposite b
          if (w2 < 0 || (w2 === 0 && !tl2)) continue;
          const c = j * W + i;
          if (!fill) {
            cnt[c]++;
          } else {
            const k = pos![c]++;
            zs![k] = (w1 * az + w2 * bz + w0 * cz) * invA;
            nzs![k] = nz;
          }
        }
      }
    }
  };

  recorrer(false, null, null, null);
  const off0 = new Uint32Array(C + 1);
  for (let c = 0; c < C; c++) off0[c + 1] = off0[c] + cnt[c];
  const total = off0[C];
  const zs = new Float32Array(total);
  const nzs = new Float32Array(total);
  const pos = off0.slice(0, C);
  recorrer(true, zs, nzs, pos);

  // Per column: sort crossings by z, then turn them into solid intervals
  // with a winding count (entering through a downward face, leaving through
  // an upward one). Nonzero rule → overlapping bodies merge cleanly.
  const off = new Uint32Array(C + 1);
  const zbT = new Float32Array(total);
  const ztT = new Float32Array(total);
  const nzT = new Float32Array(total);
  let n = 0;
  for (let c = 0; c < C; c++) {
    off[c] = n;
    const s = off0[c], e = off0[c + 1];
    if (e - s < 2) continue;
    for (let a = s + 1; a < e; a++) {
      const z = zs[a], q = nzs[a];
      let b = a - 1;
      while (b >= s && zs[b] > z) {
        zs[b + 1] = zs[b];
        nzs[b + 1] = nzs[b];
        b--;
      }
      zs[b + 1] = z;
      nzs[b + 1] = q;
    }
    let w = 0;
    let zIni = 0, nzIni = 0;
    const n0 = n;
    for (let k = s; k < e; k++) {
      const prev = w;
      w += nzs[k] < 0 ? 1 : -1;
      if (prev <= 0 && w > 0) {
        zIni = zs[k];
        nzIni = nzs[k];
      } else if (prev > 0 && w <= 0) {
        const zFin = zs[k];
        if (n > n0 && zIni - ztT[n - 1] < 1e-3) {
          ztT[n - 1] = zFin; // merge touching intervals
        } else if (zFin - zIni > 1e-4) {
          zbT[n] = zIni;
          ztT[n] = zFin;
          nzT[n] = nzIni;
          n++;
        }
      }
    }
    if (w > 0) {
      // Open surface: winding never closed. Fall back to pairing crossings.
      n = n0;
      for (let k = s; k + 1 < e; k += 2) {
        if (zs[k + 1] - zs[k] > 1e-4) {
          zbT[n] = zs[k];
          ztT[n] = zs[k + 1];
          nzT[n] = nzs[k];
          n++;
        }
      }
    }
  }
  off[C] = n;
  return { W, H, ox, oy, r, off, zb: zbT.slice(0, n), zt: ztT.slice(0, n), nzb: nzT.slice(0, n) };
}

// ─── planar contour at one height ─────────────────────────────────────────

interface Contorno {
  perimetro: number;
  lazos: Histograma;
  esquinas: number[];
  voladizo: number[];
}

/**
 * Slice the active triangles at height z and chain the segments into loops.
 * Segment endpoints are interpolated along each edge in a canonical vertex
 * order, so the two triangles sharing an edge produce identical points.
 */
function contornoEn(
  tri: Float32Array,
  activos: Int32Array,
  nActivos: number,
  z: number,
  signo: number
): Contorno {
  const out: Contorno = {
    perimetro: 0,
    lazos: vacioHist(NB_LONG),
    esquinas: new Array(BINS_ESQUINA.length).fill(0),
    voladizo: new Array(N_BINS_VOLADIZO).fill(0)
  };
  const segs: number[] = []; // x0,y0,x1,y1,len
  const pts: number[] = [];
  const cut = (o1: number, o2: number) => {
    // Canonical order: lower z first, then lexicographic.
    let p = o1, q = o2;
    if (
      tri[p + 2] > tri[q + 2] ||
      (tri[p + 2] === tri[q + 2] && (tri[p] > tri[q] || (tri[p] === tri[q] && tri[p + 1] > tri[q + 1])))
    ) {
      p = o2;
      q = o1;
    }
    const t = (z - tri[p + 2]) / (tri[q + 2] - tri[p + 2]);
    pts.push(tri[p] + (tri[q] - tri[p]) * t, tri[p + 1] + (tri[q + 1] - tri[p + 1]) * t);
  };
  for (let a = 0; a < nActivos; a++) {
    const o = activos[a] * 9;
    const za = tri[o + 2], zb = tri[o + 5], zc = tri[o + 8];
    const sa = za > z, sb = zb > z, sc = zc > z;
    if (sa === sb && sb === sc) continue;
    pts.length = 0;
    if (sa !== sb) cut(o, o + 3);
    if (sb !== sc) cut(o + 3, o + 6);
    if (sc !== sa) cut(o + 6, o);
    if (pts.length !== 4) continue;
    // Outward normal decides the direction (solid on the left, CCW).
    const ux = tri[o + 3] - tri[o], uy = tri[o + 4] - tri[o + 1], uz = tri[o + 5] - tri[o + 2];
    const vx = tri[o + 6] - tri[o], vy = tri[o + 7] - tri[o + 1], vz = tri[o + 8] - tri[o + 2];
    const nx = (uy * vz - uz * vy) * signo;
    const ny = (uz * vx - ux * vz) * signo;
    const nz = (ux * vy - uy * vx) * signo;
    let x0 = pts[0], y0 = pts[1], x1 = pts[2], y1 = pts[3];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) continue;
    if (dx * ny - dy * nx > 0) {
      x0 = pts[2]; y0 = pts[3]; x1 = pts[0]; y1 = pts[1];
    }
    segs.push(x0, y0, x1, y1, len);
    out.perimetro += len;
    // Overhang: tilt of a downward face, measured from vertical.
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    const down = -nz / nl;
    if (down > 0.05) {
      const beta = Math.asin(Math.min(1, down)); // 0 = vertical wall
      const b = Math.min(N_BINS_VOLADIZO - 1, Math.floor((beta / (Math.PI / 2)) * N_BINS_VOLADIZO));
      out.voladizo[b] += len;
    }
  }

  const nSeg = segs.length / 5;
  if (!nSeg) return out;

  // Start points indexed on a µm grid. Lookups check the 3×3 neighbourhood
  // so float noise and sliver triangles don't break a loop in two.
  const Q = 1000, K = 4194304;
  const inicio = new Map<number, number[]>();
  for (let s = 0; s < nSeg; s++) {
    const key = Math.round(segs[s * 5] * Q) * K + Math.round(segs[s * 5 + 1] * Q);
    const l = inicio.get(key);
    if (l) l.push(s);
    else inicio.set(key, [s]);
  }
  const visto = new Uint8Array(nSeg);
  const siguiente = (x: number, y: number): number => {
    const kx = Math.round(x * Q), ky = Math.round(y * Q);
    let best = -1, bd = Infinity;
    for (let ix = -1; ix <= 1; ix++) {
      for (let iy = -1; iy <= 1; iy++) {
        const l = inicio.get((kx + ix) * K + ky + iy);
        if (!l) continue;
        for (const s of l) {
          if (visto[s]) continue;
          const ddx = segs[s * 5] - x, ddy = segs[s * 5 + 1] - y;
          const dd = ddx * ddx + ddy * ddy;
          if (dd < bd) {
            bd = dd;
            best = s;
          }
        }
      }
    }
    return best;
  };

  // Chains: follow segments head to tail. Turning angles are measured
  // between "significant" segments only (≥ 0.05 mm) so slivers don't fake
  // corners; runs of similar small turns are arcs (the slicer fits G2/G3
  // there) and cost nothing.
  const MIN_DIR = 0.05;
  const cadenas: { L: number; x0: number; y0: number; x1: number; y1: number; cerrada: boolean }[] = [];
  const giros: number[] = [];
  for (let s0 = 0; s0 < nSeg; s0++) {
    if (visto[s0]) continue;
    giros.length = 0;
    let s = s0;
    let L = 0;
    let dirX = 0, dirY = 0, tieneDir = false;
    let dir0X = 0, dir0Y = 0;
    let fin = s0;
    while (s >= 0) {
      visto[s] = 1;
      const b = s * 5;
      const len = segs[b + 4];
      L += len;
      fin = s;
      if (len >= MIN_DIR) {
        const ux = (segs[b + 2] - segs[b]) / len, uy = (segs[b + 3] - segs[b + 1]) / len;
        if (tieneDir) giros.push(Math.atan2(dirX * uy - dirY * ux, dirX * ux + dirY * uy));
        else {
          dir0X = ux;
          dir0Y = uy;
        }
        dirX = ux;
        dirY = uy;
        tieneDir = true;
      }
      s = siguiente(segs[b + 2], segs[b + 3]);
    }
    const x0 = segs[s0 * 5], y0 = segs[s0 * 5 + 1];
    const x1 = segs[fin * 5 + 2], y1 = segs[fin * 5 + 3];
    const cerrada = (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0) < 1e-6;
    if (cerrada && tieneDir && giros.length) {
      giros.push(Math.atan2(dirX * dir0Y - dirY * dir0X, dirX * dir0X + dirY * dir0Y));
    }
    const nG = giros.length;
    for (let g = 0; g < nG; g++) {
      const a = giros[g];
      const mag = Math.abs(a);
      const grados = (mag * 180) / Math.PI;
      if (grados < 15) continue;
      if (grados < 45) {
        // Part of an arc if a neighbour turns the same way by a similar amount.
        const prev = g > 0 ? giros[g - 1] : cerrada ? giros[nG - 1] : 0;
        const next = g < nG - 1 ? giros[g + 1] : cerrada ? giros[0] : 0;
        const similar = (o: number) => o * a > 0 && Math.abs(o) > mag * 0.5 && Math.abs(o) < mag * 2;
        if (similar(prev) || similar(next)) continue;
      }
      let k = 0;
      while (k < BINS_ESQUINA.length - 1 && grados >= BINS_ESQUINA[k]) k++;
      out.esquinas[k]++;
    }
    cadenas.push({ L, x0, y0, x1, y1, cerrada });
  }

  // Stitch open chains whose ends meet within 0.1 mm (broken meshes).
  const nC = cadenas.length;
  const grupo = new Int32Array(nC);
  for (let c = 0; c < nC; c++) grupo[c] = c;
  const raizG = (a: number) => {
    while (grupo[a] !== a) {
      grupo[a] = grupo[grupo[a]];
      a = grupo[a];
    }
    return a;
  };
  const abiertas = cadenas.map((c, i) => (c.cerrada ? -1 : i)).filter((i) => i >= 0);
  if (abiertas.length > 1) {
    const T = 0.1;
    const celda = new Map<number, number[]>();
    const kc = (x: number, y: number) => Math.floor(x / T) * K + Math.floor(y / T);
    for (const i of abiertas) {
      const key = kc(cadenas[i].x0, cadenas[i].y0);
      const l = celda.get(key);
      if (l) l.push(i);
      else celda.set(key, [i]);
    }
    const usado = new Uint8Array(nC);
    for (const i of abiertas) {
      const { x1, y1 } = cadenas[i];
      const bx = Math.floor(x1 / T), by = Math.floor(y1 / T);
      let best = -1, bd = T * T;
      for (let ix = -1; ix <= 1; ix++) {
        for (let iy = -1; iy <= 1; iy++) {
          const l = celda.get((bx + ix) * K + by + iy);
          if (!l) continue;
          for (const jj of l) {
            if (usado[jj]) continue;
            const dx = cadenas[jj].x0 - x1, dy = cadenas[jj].y0 - y1;
            const dd = dx * dx + dy * dy;
            if (dd <= bd) {
              bd = dd;
              best = jj;
            }
          }
        }
      }
      if (best >= 0) {
        usado[best] = 1;
        const ra = raizG(i), rb = raizG(best);
        if (ra !== rb) grupo[Math.max(ra, rb)] = Math.min(ra, rb);
      }
    }
  }
  const largoGrupo = new Float64Array(nC);
  for (let c = 0; c < nC; c++) largoGrupo[raizG(c)] += cadenas[c].L;
  for (let c = 0; c < nC; c++) {
    if (grupo[c] !== c) continue;
    const L = largoGrupo[c];
    if (L < 0.5) continue; // slivers: length already in the perimeter
    const bin = binLongitud(L);
    out.lazos.n[bin]++;
    out.lazos.l[bin] += L;
  }
  return out;
}

// ─── main entry ───────────────────────────────────────────────────────────

/**
 * Analyse a triangle soup already placed in print orientation (Z up).
 * The part is dropped onto the bed (min z → 0) internally.
 */
export function analizarPieza(triIn: Float32Array, cfg: ConfigAnalisis): Analisis {
  const p = cfg.perfil;
  const maxCeldas = cfg.maxCeldas ?? 160_000;
  const maxMuestras = cfg.maxMuestras ?? 320;
  const rMin = cfg.resolucionMin ?? 0.2;
  const presets: PresetCapa[] = cfg.presets.length ? cfg.presets : [{ alturaCapa: 0.2 }];
  const alturas = presets.map((x) => x.alturaCapa);
  const h0 = p.alturaPrimeraCapa;

  const { min, max } = limites(triIn);
  // Drop on the bed and shift into positive XY (numerically friendlier).
  const tri = new Float32Array(triIn.length);
  for (let i = 0; i < triIn.length; i += 3) {
    tri[i] = triIn[i] - min[0];
    tri[i + 1] = triIn[i + 1] - min[1];
    tri[i + 2] = triIn[i + 2] - min[2];
  }
  const sx = max[0] - min[0], sy = max[1] - min[1], sz = max[2] - min[2];
  const vFirm = volumenFirmado(tri);
  const signo = vFirm < 0 ? -1 : 1;

  const vacio: Analisis = {
    version: 1,
    presets,
    alturaPrimeraCapa: h0,
    alturaMm: sz,
    bboxMm: { x: sx, y: sy, z: sz },
    volumenMm3: Math.abs(vFirm),
    areaBaseMm2: 0,
    resolucion: 0,
    presetRef: 0,
    muestras: []
  };
  if (!(sz > 0) || !(sx > 0) || !(sy > 0) || !isFinite(sx + sy + sz)) return vacio;

  // Grid: fine enough for 2-3 cells across the wall ring, capped by budget.
  const r = Math.max(rMin, Math.sqrt(((sx + 2) * (sy + 2)) / maxCeldas));
  const W = Math.ceil((sx + 2 * r) / r) + 2;
  const H = Math.ceil((sy + 2 * r) / r) + 2;
  const ox = -1.5 * r, oy = -1.5 * r;
  const col = construirColumnas(tri, signo, ox, oy, r, W, H);
  const C = W * H;
  const cell = r * r;

  let volumen = 0;
  for (let k = 0; k < col.zb.length; k++) volumen += col.zt[k] - col.zb[k];
  volumen *= cell;

  // Heights to sample: the first layer on its own, then even slabs.
  const hMin = Math.min(...alturas);
  const resto = Math.max(0, sz - h0);
  const nMuestras = resto > 0 ? Math.max(1, Math.min(maxMuestras - 1, Math.ceil(resto / hMin))) : 0;
  const dzM = nMuestras ? resto / nMuestras : 0;
  const planos: { z: number; dz: number }[] = [{ z: h0 / 2, dz: Math.min(h0, sz) }];
  for (let s = 0; s < nMuestras; s++) planos.push({ z: h0 + (s + 0.5) * dzM, dz: dzM });

  // Per-preset shell thicknesses; the preset closest to 0.2 mm drives the
  // run-length statistics (shared by all presets, rescaled by area).
  const pieles = presets.map((pr) => {
    const pp = { ...p, ...(pr.perfil ?? {}) };
    const h = pr.alturaCapa;
    const dW = espesorParedes(pp, h);
    return {
      h,
      ...espesoresPiel(pp, h),
      // Distance thresholds in cells: walls own the ring, infill overlaps it.
      umbralPared: dW / r + 0.5,
      umbralRelleno: Math.max(0, dW - pp.solapeRelleno) / r + 0.5
    };
  });
  let ref = 0;
  for (let k = 1; k < alturas.length; k++) {
    if (Math.abs(alturas[k] - 0.2) < Math.abs(alturas[ref] - 0.2)) ref = k;
  }
  const dParedMm = espesorParedes({ ...p, ...(presets[ref].perfil ?? {}) }, alturas[ref]);
  const pH = Float64Array.from(pieles, (x) => x.h);
  const pSup = Float64Array.from(pieles, (x) => x.sup);
  const pInf = Float64Array.from(pieles, (x) => x.inf);
  const pInfCama = Float64Array.from(pieles, (x) => x.infCama);
  const pUmbralPared = Float64Array.from(pieles, (x) => x.umbralPared);
  const pUmbralRelleno = Float64Array.from(pieles, (x) => x.umbralRelleno);
  // Regions are found once, on the thinnest wall ring of all presets.
  const umbralRegion = Math.min(...pieles.map((x) => x.umbralRelleno));
  const umbralParedRef = pieles[ref].umbralPared;
  const cosSoporte = Math.cos((p.soporteAngulo * Math.PI) / 180);

  // Triangles sorted by lowest z for the contour sweep.
  const nTri = tri.length / 9;
  const orden = new Int32Array(nTri);
  const zMinT = new Float32Array(nTri);
  const zMaxT = new Float32Array(nTri);
  for (let t = 0; t < nTri; t++) {
    const o = t * 9;
    zMinT[t] = Math.min(tri[o + 2], tri[o + 5], tri[o + 8]);
    zMaxT[t] = Math.max(tri[o + 2], tri[o + 5], tri[o + 8]);
    orden[t] = t;
  }
  orden.sort((a, b) => zMinT[a] - zMinT[b]);
  let activos = new Int32Array(1024);
  let nAct = 0;
  let sig = 0;

  // Scratch buffers reused for every sample.
  const ptr = new Uint32Array(C);
  for (let c = 0; c < C; c++) ptr[c] = col.off[c];
  const dentro = new Uint8Array(C);
  const dTop = new Float32Array(C);
  const dBot = new Float32Array(C);
  const enCama = new Uint8Array(C);
  const sop = new Uint8Array(C); // 1 = support body, 2 = interface
  const listaSop = new Int32Array(C);
  const dist = new Float32Array(C);
  const padre = new Int32Array(C);
  const tamReg = new Float32Array(C);
  const maxReg = new Float32Array(C);
  const factorHueco = new Float32Array(C);
  const nucleo = new Uint8Array(C); // 0 none, 1 gap fill, 2 infill
  const cat = new Uint8Array(C); // 0 out/wall, 2 solid, 3 sparse (ref preset)
  const SQ2 = Math.SQRT2;

  const muestras: Muestra[] = [];
  let areaBase = 0;

  const raiz = (a: number) => {
    while (padre[a] !== a) {
      padre[a] = padre[padre[a]];
      a = padre[a];
    }
    return a;
  };

  for (let si = 0; si < planos.length; si++) {
    const { z: zs0, dz } = planos[si];
    // Nudge off exact vertex heights (degenerate slices).
    const zs = zs0 + 1.37e-5;
    const primera = si === 0;

    // ── pass A: column state at zs ──────────────────────────────────────
    let iMin = W, iMax = -1, jMin = H, jMax = -1;
    let nDentro = 0;
    let nSop = 0, nSopI = 0;
    let nLista = 0;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        const e = col.off[c + 1];
        let k = ptr[c];
        while (k < e && col.zt[k] <= zs) k++;
        ptr[c] = k;
        dentro[c] = 0;
        sop[c] = 0;
        if (k < e && col.zb[k] <= zs) {
          dentro[c] = 1;
          nDentro++;
          dTop[c] = col.zt[k] - zs;
          dBot[c] = zs - col.zb[k];
          enCama[c] = col.zb[k] < h0 * 0.5 ? 1 : 0;
          if (i < iMin) iMin = i;
          if (i > iMax) iMax = i;
          if (j < jMin) jMin = j;
          if (j > jMax) jMax = j;
        } else if (k < e) {
          // In a gap under interval k: support if its bottom face is flat
          // enough and we are clear of the z-gap below it.
          if (-col.nzb[k] > cosSoporte && col.zb[k] > h0) {
            const hasta = col.zb[k] - p.soporteDistZ;
            const desde = k > col.off[c] ? col.zt[k - 1] + p.soporteDistZ : 0;
            if (zs < hasta && zs >= desde) {
              const iface = hasta - zs < p.soporteInterfazCapas * alturas[ref];
              sop[c] = iface ? 2 : 1;
              if (iface) nSopI++;
              else nSop++;
              listaSop[nLista++] = c;
            }
          }
        }
      }
    }

    const pielesM: PielMuestra[] = pieles.map(() => ({
      interior: 0,
      solido: 0,
      disperso: 0,
      superior: 0,
      puente: 0,
      puenteInterno: 0,
      soporte: nSop * cell * p.soporteFactor,
      soporteInterfaz: nSopI * cell * p.soporteFactor
    }));
    const m: Muestra = {
      z: zs0,
      dz,
      area: nDentro * cell,
      interior: 0,
      relleno: 0,
      hueco: 0,
      soporteContorno: 0,
      regiones: 0,
      lazos: vacioHist(NB_LONG),
      esquinas: new Array(BINS_ESQUINA.length).fill(0),
      voladizo: new Array(N_BINS_VOLADIZO).fill(0),
      pieles: pielesM,
      cuerdasSolido: vacioHist(NB_LONG),
      cuerdasDisperso: vacioHist(NB_LONG),
      cuerdasRelleno: vacioHist(NB_LONG)
    };
    if (primera) areaBase = m.area;
    if (nLista) {
      // Support region outline: exposed cell edges, staircase-corrected.
      let bordes = 0;
      for (let q = 0; q < nLista; q++) {
        const c = listaSop[q];
        if (!sop[c - 1]) bordes++;
        if (!sop[c + 1]) bordes++;
        if (!sop[c - W]) bordes++;
        if (!sop[c + W]) bordes++;
      }
      m.soporteContorno = bordes * r * (Math.PI / 4) * p.soporteFactor;
    }

    // ── contour at zs ───────────────────────────────────────────────────
    while (sig < nTri && zMinT[orden[sig]] <= zs) {
      if (nAct === activos.length) {
        const a2 = new Int32Array(activos.length * 2);
        a2.set(activos);
        activos = a2;
      }
      activos[nAct++] = orden[sig++];
    }
    let w = 0;
    for (let a = 0; a < nAct; a++) if (zMaxT[activos[a]] > zs) activos[w++] = activos[a];
    nAct = w;
    const cont = contornoEn(tri, activos, nAct, zs, signo);
    m.lazos = cont.lazos;
    m.esquinas = cont.esquinas;
    m.voladizo = cont.voladizo;

    if (nDentro === 0) {
      muestras.push(m);
      continue;
    }

    // Work only inside the active window (+1 cell of margin).
    iMin = Math.max(0, iMin - 1);
    jMin = Math.max(0, jMin - 1);
    iMax = Math.min(W - 1, iMax + 1);
    jMax = Math.min(H - 1, jMax + 1);

    // ── pass B: distance to the outside (chamfer 3×3) ───────────────────
    // The window keeps a margin of empty cells, so an inside cell's
    // neighbours are always in range and already zeroed when outside.
    for (let j = jMin; j <= jMax; j++) {
      let c = j * W + iMin;
      for (let i = iMin; i <= iMax; i++, c++) {
        if (!dentro[c]) {
          dist[c] = 0;
          continue;
        }
        let d = dist[c - 1] + 1;
        const u = dist[c - W] + 1;
        if (u < d) d = u;
        const ul = dist[c - W - 1] + SQ2;
        if (ul < d) d = ul;
        const ur = dist[c - W + 1] + SQ2;
        if (ur < d) d = ur;
        dist[c] = d;
      }
    }
    for (let j = jMax; j >= jMin; j--) {
      let c = j * W + iMax;
      for (let i = iMax; i >= iMin; i--, c--) {
        if (!dentro[c]) continue;
        let d = dist[c];
        const rr = dist[c + 1] + 1;
        if (rr < d) d = rr;
        const dn = dist[c + W] + 1;
        if (dn < d) d = dn;
        const dr = dist[c + W + 1] + SQ2;
        if (dr < d) d = dr;
        const dl = dist[c + W - 1] + SQ2;
        if (dl < d) d = dl;
        dist[c] = d;
      }
    }

    // ── pass C: interior regions (4-connected union-find) ──────────────
    // After the union pass every label is flattened to its root, so later
    // passes read padre[c] directly (-1 = wall ring or outside).
    // Walls own everything closer than the ring thickness; infill starts a
    // little earlier because it overlaps the innermost wall.
    let nInt = 0, nRel = 0;
    for (let j = jMin; j <= jMax; j++) {
      let c = j * W + iMin;
      for (let i = iMin; i <= iMax; i++, c++) {
        if (!dentro[c] || dist[c] < umbralRegion) {
          padre[c] = -1;
          continue;
        }
        nRel++;
        if (dist[c] >= umbralParedRef) nInt++;
        const izq = padre[c - 1];
        const arr = padre[c - W];
        if (izq >= 0) {
          padre[c] = izq;
          if (arr >= 0) {
            const ra = raiz(arr), rb = raiz(izq);
            if (ra !== rb) padre[ra > rb ? ra : rb] = ra < rb ? ra : rb;
          }
        } else if (arr >= 0) padre[c] = arr;
        else padre[c] = c;
      }
    }
    m.interior = nInt * cell;
    if (nRel) {
      for (let j = jMin; j <= jMax; j++) {
        let c = j * W + iMin;
        for (let i = iMin; i <= iMax; i++, c++) {
          if (padre[c] < 0) continue;
          const rt = raiz(c);
          padre[c] = rt;
          if (rt === c) {
            tamReg[c] = 0;
            maxReg[c] = 0;
          }
        }
      }
      for (let j = jMin; j <= jMax; j++) {
        let c = j * W + iMin;
        for (let i = iMin; i <= iMax; i++, c++) {
          const rt = padre[c];
          if (rt < 0) continue;
          tamReg[rt] += cell;
          if (dist[c] > maxReg[rt]) maxReg[rt] = dist[c];
        }
      }
      // Width of each region beyond the walls decides how it prints:
      // nothing (walls already met), gap fill (one bead), or real infill.
      const minReg = Math.max(1, 4 * cell);
      for (let j = jMin; j <= jMax; j++) {
        let c = j * W + iMin;
        for (let i = iMin; i <= iMax; i++, c++) {
          if (padre[c] !== c) continue;
          const ancho = 2 * ((maxReg[c] - 0.5) * r - dParedMm);
          if (ancho < 0.5 * p.anchoSolido) nucleo[c] = 0;
          else if (ancho < 1.5 * p.anchoSolido) {
            nucleo[c] = 1;
            // Area without the overlap band, as one bead of that width.
            factorHueco[c] = ancho / (ancho + 2 * p.solapeRelleno);
          } else {
            nucleo[c] = 2;
            if (tamReg[c] >= minReg) m.regiones++;
          }
        }
      }
    }

    // ── pass D: classify interior cells per preset ─────────────────────
    const nP = pieles.length;
    const cSol = new Float64Array(nP), cDis = new Float64Array(nP), cSup = new Float64Array(nP);
    const cPue = new Float64Array(nP), cPin = new Float64Array(nP);
    const cInt = new Float64Array(nP);
    let nRelleno = 0;
    let hueco = 0;
    for (let j = jMin; j <= jMax; j++) {
      let c = j * W + iMin;
      for (let i = iMin; i <= iMax; i++, c++) {
        cat[c] = 0;
        const rt = padre[c];
        if (rt < 0 || !nucleo[rt]) continue;
        if (nucleo[rt] === 1) {
          hueco += factorHueco[rt];
          continue;
        }
        nRelleno++;
        const forzado = primera || tamReg[rt] < p.areaMinRelleno;
        const dt = dTop[c], db = dBot[c];
        const cama = enCama[c] === 1;
        const dc = dist[c];
        for (let k = 0; k < nP; k++) {
          if (dc >= pUmbralPared[k]) cInt[k]++;
          if (dc < pUmbralRelleno[k]) continue; // a wall for this preset
          const h = pH[k];
          let solido = forzado;
          if (dt < h) {
            cSup[k]++;
            solido = true;
          } else if (dt < pSup[k]) {
            solido = true;
            if (dt >= pSup[k] - h && dt + db > pSup[k] + pInf[k]) cPin[k]++;
          }
          if (!cama && db < h) {
            cPue[k]++;
            solido = true;
          } else if (db < (cama ? pInfCama[k] : pInf[k])) solido = true;
          if (solido) cSol[k]++;
          else cDis[k]++;
          if (k === ref) cat[c] = solido ? 2 : 3;
        }
      }
    }
    m.relleno = nRelleno * cell;
    m.hueco = hueco * cell;
    for (let k = 0; k < nP; k++) {
      const pk = pielesM[k];
      pk.interior = cInt[k] * cell;
      pk.solido = cSol[k] * cell;
      pk.disperso = cDis[k] * cell;
      pk.superior = cSup[k] * cell;
      pk.puente = cPue[k] * cell;
      pk.puenteInterno = cPin[k] * cell;
    }

    // ── pass E: straight runs (rows and columns) per region type ───────
    const hs = m.cuerdasSolido, hd = m.cuerdasDisperso, ht = m.cuerdasRelleno;
    const anadir = (tipo: number, cells: number) => {
      if (!cells) return;
      const s = cells * r;
      const b = binLongitud(s);
      const h = tipo === 2 ? hs : tipo === 3 ? hd : ht;
      h.n[b] += 0.5; // rows and columns each count half
      h.l[b] += 0.5 * s;
    };
    for (let j = jMin; j <= jMax; j++) {
      let run = 0, tipo = 0;
      for (let i = iMin; i <= iMax + 1; i++) {
        const t = i <= iMax ? cat[j * W + i] : 0;
        if (t === tipo && t) run++;
        else {
          if (tipo) anadir(tipo, run);
          tipo = t;
          run = t ? 1 : 0;
        }
      }
    }
    for (let i = iMin; i <= iMax; i++) {
      let run = 0, tipo = 0;
      for (let j = jMin; j <= jMax + 1; j++) {
        const t = j <= jMax ? cat[j * W + i] : 0;
        if (t === tipo && t) run++;
        else {
          if (tipo) anadir(tipo, run);
          tipo = t;
          run = t ? 1 : 0;
        }
      }
    }
    // Whole infill area (solid ∪ sparse) as one region type.
    for (let j = jMin; j <= jMax; j++) {
      let run = 0;
      for (let i = iMin; i <= iMax + 1; i++) {
        if (i <= iMax && cat[j * W + i]) run++;
        else if (run) {
          anadir(4, run);
          run = 0;
        }
      }
    }
    for (let i = iMin; i <= iMax; i++) {
      let run = 0;
      for (let j = jMin; j <= jMax + 1; j++) {
        if (j <= jMax && cat[j * W + i]) run++;
        else if (run) {
          anadir(4, run);
          run = 0;
        }
      }
    }
    // Normalise to "per mm² of region" so each preset rescales by its area.
    const aS = pielesM[ref].solido, aD = pielesM[ref].disperso, aT = aS + aD;
    for (let b = 0; b < NB_LONG; b++) {
      hs.n[b] = aS > 0 ? hs.n[b] / aS : 0;
      hs.l[b] = aS > 0 ? hs.l[b] / aS : 0;
      hd.n[b] = aD > 0 ? hd.n[b] / aD : 0;
      hd.l[b] = aD > 0 ? hd.l[b] / aD : 0;
      ht.n[b] = aT > 0 ? ht.n[b] / aT : 0;
      ht.l[b] = aT > 0 ? ht.l[b] / aT : 0;
    }

    muestras.push(m);
  }

  return {
    version: 1,
    presets,
    alturaPrimeraCapa: h0,
    alturaMm: sz,
    bboxMm: { x: sx, y: sy, z: sz },
    volumenMm3: volumen,
    areaBaseMm2: areaBase,
    resolucion: r,
    presetRef: ref,
    muestras
  };
}
