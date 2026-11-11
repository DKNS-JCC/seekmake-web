/** Percentil con interpolación lineal (igual que percentile_cont de SQL). p=0.5 es la mediana. */
export function percentil(xs: number[], p: number): number {
  const o = [...xs].sort((a, b) => a - b);
  const i = (o.length - 1) * p;
  const lo = Math.floor(i);
  return o[lo] + (o[Math.min(lo + 1, o.length - 1)] - o[lo]) * (i - lo);
}
