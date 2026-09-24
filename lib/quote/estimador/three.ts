// three.js ↔ estimator glue. The viewer is Y-up; the estimator works in
// print coordinates (Z up, like the slicer). World (X, Y, Z) maps to print
// (X, −Z, Y).

import { Box3, Matrix4, Quaternion, Vector3, type BufferGeometry, type Mesh, type Object3D } from 'three';
import type { Matriz3 } from './orientar';

/** Every mesh under `root`, world-transformed, as a print-frame triangle soup. */
export function triangulosImpresion(root: Object3D): Float32Array {
  root.updateMatrixWorld(true);
  const mallas: Mesh[] = [];
  let n = 0;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.geometry) return;
    const g = m.geometry as BufferGeometry;
    const pos = g.attributes.position;
    if (!pos) return;
    mallas.push(m);
    n += g.index ? g.index.count / 3 : pos.count / 3;
  });
  const out = new Float32Array(Math.floor(n) * 9);
  const v = new Vector3();
  let k = 0;
  for (const m of mallas) {
    const g = m.geometry as BufferGeometry;
    const pos = g.attributes.position;
    const idx = g.index;
    const cuenta = idx ? idx.count : pos.count - (pos.count % 3);
    for (let i = 0; i < cuenta; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
      out[k++] = v.x;
      out[k++] = -v.z;
      out[k++] = v.y;
    }
  }
  return k === out.length ? out : out.slice(0, k);
}

/** Print-frame rotation expressed in the viewer's Y-up world. */
function matrizMundo(R: Matriz3): Matrix4 {
  // A = Mᵀ · R · M with M = world → print = [[1,0,0],[0,0,-1],[0,1,0]].
  const M = [1, 0, 0, 0, 0, -1, 0, 1, 0];
  const Mt = [1, 0, 0, 0, 0, 1, 0, -1, 0];
  const mul = (A: number[], B: number[]) => {
    const o = new Array(9).fill(0);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        for (let q = 0; q < 3; q++) o[i * 3 + j] += A[i * 3 + q] * B[q * 3 + j];
    return o;
  };
  const A = mul(mul(Mt, R), M);
  return new Matrix4().set(A[0], A[1], A[2], 0, A[3], A[4], A[5], 0, A[6], A[7], A[8], 0, 0, 0, 0, 1);
}

/** Centre on the plate: x/z centred, base resting on y = 0. */
export function apoyarEnCama(root: Object3D): void {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const c = new Vector3();
  box.getCenter(c);
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
}

/** Rotate the displayed model by a print-frame rotation, then re-seat it. */
export function rotarModelo(root: Object3D, R: Matriz3): void {
  const A = matrizMundo(R);
  root.position.applyMatrix4(A);
  root.quaternion.premultiply(new Quaternion().setFromRotationMatrix(A));
  apoyarEnCama(root);
}

export function transpuesta(R: Matriz3): Matriz3 {
  return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
}
