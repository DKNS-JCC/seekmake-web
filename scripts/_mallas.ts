// Synthetic meshes for the estimator tests: closed, outward-facing triangle
// soups in print coordinates (mm, Z up).

/** Axis-aligned box [x0,x1]×[y0,y1]×[z0,z1]. */
export function caja(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
  ];
  const f = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]
  ];
  return f.flatMap((t) => t.flatMap((i) => v[i]));
}

export function malla(...partes: number[][]): Float32Array {
  return new Float32Array(partes.flat());
}

/** Closed cylinder along Z. */
export function cilindro(r: number, h: number, lados = 64): number[] {
  const out: number[] = [];
  for (let i = 0; i < lados; i++) {
    const a0 = (i / lados) * 2 * Math.PI, a1 = ((i + 1) / lados) * 2 * Math.PI;
    const p0 = [r * Math.cos(a0), r * Math.sin(a0)], p1 = [r * Math.cos(a1), r * Math.sin(a1)];
    out.push(0, 0, 0, p1[0], p1[1], 0, p0[0], p0[1], 0); // bottom (down)
    out.push(0, 0, h, p0[0], p0[1], h, p1[0], p1[1], h); // top (up)
    out.push(p0[0], p0[1], 0, p1[0], p1[1], 0, p1[0], p1[1], h);
    out.push(p0[0], p0[1], 0, p1[0], p1[1], h, p0[0], p0[1], h);
  }
  return out;
}
