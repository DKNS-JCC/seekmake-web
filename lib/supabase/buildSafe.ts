// Fetch resiliente para tiempo de BUILD (export estático en CI cada 15 min).
//
// Los server-components hacen fetch a Supabase al construir. Un corte de red /
// timeout / 5xx transitorio en el runner hace que `await` lance y el build
// falle (exit 1) de forma intermitente. Este helper reintenta unas cuantas
// veces y, solo si todas fallan, devuelve `fallback` para que el build NO
// falle. La mayoría de páginas además re-piden los datos en cliente, así que
// el fallback rara vez se nota y se auto-corrige en el siguiente rebuild.
export async function buildSafe<T>(
  fn: () => Promise<T>,
  fallback: T,
  tries = 3
): Promise<T> {
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[build] fetch falló (intento ${i + 1}/${tries}): ${msg}`);
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  console.warn('[build] reintentos agotados — usando fallback (no se rompe el build)');
  return fallback;
}
