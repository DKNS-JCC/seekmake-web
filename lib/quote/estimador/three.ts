// three.js ↔ estimator glue. The viewer is Y-up; the estimator works in
// print coordinates (Z up, like the slicer). World (X, Y, Z) maps to print
// (X, −Z, Y).

import { Vector3, type BufferGeometry, type Mesh, type Object3D } from 'three';

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
