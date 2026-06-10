// Mesh analysis for the tasador. Pure math over BufferGeometry — no scene,
// no DOM — so it stays unit-testable and reusable from any component.

import type { BufferGeometry, Object3D, Mesh } from 'three';
import { Box3, Vector3, Matrix4 } from 'three';

export interface MeshMetrics {
  /** Solid volume in cm³ (model units assumed mm, the 3D-print standard). */
  volumenCm3: number;
  /** Surface area in cm². */
  areaCm2: number;
  /** Axis-aligned bounding box in mm. */
  bboxMm: { x: number; y: number; z: number };
  triangulos: number;
  /** Number of independent meshes (>1 only for multi-part 3MF). */
  mallas: number;
  /**
   * Overhang surface (faces steeper than 45° pointing down) in cm².
   * Used to warn about supports and feed the support estimate.
   */
  overhangCm2: number;
  /**
   * Estimated FULL prism volume under overhanging faces in cm³ (projected
   * area × height above the bed). Pricing multiplies this by the sparse
   * support-infill factor from settings, so the raw geometry stays neutral.
   */
  soporteCm3: number;
}

// Signed volume of the tetrahedron (origin, a, b, c). Summed over all
// triangles of a closed mesh this yields the enclosed volume regardless of
// where the origin sits.
function signedTetraVolume(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number
): number {
  return (
    (ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx)) / 6
  );
}

function triangleArea(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number
): number {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
}

// cos(45°) — faces whose downward tilt exceeds this need support material.
const OVERHANG_NY = -Math.SQRT1_2;
// Faces this close to the bed (mm) rest on it and never need supports.
const BED_EPS_MM = 0.5;

/**
 * Volume (mm³), area (mm²) and overhang/support estimate of a single
 * geometry, applying an optional world transform (3MF parts often carry
 * their own matrices). Assumes the world is Y-up with the part resting on
 * y = 0, which is how the quote viewer places every model.
 */
export function analyzeGeometry(
  geometry: BufferGeometry,
  matrixWorld?: Matrix4
): {
  volumeMm3: number;
  areaMm2: number;
  triangles: number;
  overhangMm2: number;
  soporteMm3: number;
} {
  const pos = geometry.attributes.position;
  if (!pos) return { volumeMm3: 0, areaMm2: 0, triangles: 0, overhangMm2: 0, soporteMm3: 0 };

  const index = geometry.index;
  const triCount = index ? index.count / 3 : pos.count / 3;

  const vA = new Vector3();
  const vB = new Vector3();
  const vC = new Vector3();
  const e1 = new Vector3();
  const e2 = new Vector3();
  const n = new Vector3();

  let volume = 0;
  let area = 0;
  // Accumulated for both winding orientations; the signed volume tells us
  // at the end which one has outward-facing normals.
  let overhangPos = 0;
  let soportePos = 0;
  let overhangNeg = 0;
  let soporteNeg = 0;

  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    vA.fromBufferAttribute(pos, i0);
    vB.fromBufferAttribute(pos, i1);
    vC.fromBufferAttribute(pos, i2);
    if (matrixWorld) {
      vA.applyMatrix4(matrixWorld);
      vB.applyMatrix4(matrixWorld);
      vC.applyMatrix4(matrixWorld);
    }

    volume += signedTetraVolume(vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z);
    const triArea = triangleArea(vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z);
    area += triArea;

    // Overhang detection: face normal pointing down past 45°, above the bed.
    if (triArea > 0) {
      e1.subVectors(vB, vA);
      e2.subVectors(vC, vA);
      n.crossVectors(e1, e2).normalize();
      const cy = (vA.y + vB.y + vC.y) / 3;
      if (cy > BED_EPS_MM) {
        const projected = triArea * Math.abs(n.y); // footprint on the bed
        if (n.y < OVERHANG_NY) {
          overhangPos += projected;
          soportePos += projected * cy; // prism from the face down to the bed
        } else if (-n.y < OVERHANG_NY) {
          overhangNeg += projected;
          soporteNeg += projected * cy;
        }
      }
    }
  }

  // Sign depends on winding order; the magnitude is the volume. Outward
  // normals ⇔ positive signed volume, which picks the overhang orientation.
  const outward = volume >= 0;
  return {
    volumeMm3: Math.abs(volume),
    areaMm2: area,
    triangles: triCount,
    overhangMm2: outward ? overhangPos : overhangNeg,
    soporteMm3: outward ? soportePos : soporteNeg
  };
}

/**
 * Aggregate metrics over an object tree (a lone STL mesh or a 3MF group).
 * Volumes of separate parts are summed; the bbox covers everything.
 */
export function analyzeObject(root: Object3D): MeshMetrics {
  let volumeMm3 = 0;
  let areaMm2 = 0;
  let triangles = 0;
  let meshes = 0;
  let overhangMm2 = 0;
  let soporteMm3 = 0;

  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshes++;
    const r = analyzeGeometry(mesh.geometry as BufferGeometry, mesh.matrixWorld);
    volumeMm3 += r.volumeMm3;
    areaMm2 += r.areaMm2;
    triangles += r.triangles;
    overhangMm2 += r.overhangMm2;
    soporteMm3 += r.soporteMm3;
  });

  const bbox = new Box3().setFromObject(root);
  const size = new Vector3();
  if (!bbox.isEmpty()) bbox.getSize(size);

  return {
    volumenCm3: volumeMm3 / 1000,
    areaCm2: areaMm2 / 100,
    bboxMm: {
      x: Math.round(size.x * 10) / 10,
      y: Math.round(size.y * 10) / 10,
      z: Math.round(size.z * 10) / 10
    },
    triangulos: triangles,
    mallas: meshes,
    overhangCm2: Math.round(overhangMm2) / 100,
    soporteCm3: Math.round(soporteMm3 / 100) / 10
  };
}

export interface ScaleSuggestion {
  /** Multiply the model by this to get millimetres. */
  factor: number;
  /** Short customer-facing label, e.g. "pulgadas". */
  unidad: string;
}

/**
 * STL/OBJ carry no units; mm is the 3D-print convention but CAD exports in
 * inches (×25.4) or metres (×1000) show up as absurdly small models. If the
 * largest axis is implausibly tiny we offer conversions instead of quoting
 * a part the size of a grain of rice.
 */
export function suggestScales(m: MeshMetrics): ScaleSuggestion[] {
  const maxDim = Math.max(m.bboxMm.x, m.bboxMm.y, m.bboxMm.z);
  if (maxDim <= 0 || maxDim >= 10) return [];
  const out: ScaleSuggestion[] = [{ factor: 25.4, unidad: 'pulgadas' }];
  // Metre-unit exports are typically < 0.5 model units across.
  if (maxDim < 0.6) out.push({ factor: 1000, unidad: 'metros' });
  return out;
}

/**
 * Heuristic sanity check: a watertight mesh has volume comparable to its
 * bbox. Extremely thin results usually mean an open/broken surface scan —
 * the quote is still produced but we warn the customer.
 */
export function looksDegenerate(m: MeshMetrics): boolean {
  const bboxCm3 = (m.bboxMm.x * m.bboxMm.y * m.bboxMm.z) / 1000;
  if (bboxCm3 <= 0) return true;
  return m.volumenCm3 < bboxCm3 * 0.001;
}
