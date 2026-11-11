// Números y duraciones escritos a mano en «Nuevo encargo». Portado de la
// Calculadora (src/shared/formatos.mjs), con un cambio pedido por el taller:
// un entero suelto es MINUTOS («91» = 1 h 31 min), porque se copia del
// laminador; con decimales son horas («1,5» = 1 h 30 min).
//
// Coma y punto valen como separador decimal, así que no hay separador de
// miles: «1.250» es 1,25.

const NUMERO = /^-?(\d+([.,]\d*)?|[.,]\d+)$/;

/** «12,5» / «12.5» / «12,5 g» → 12.5 · vacío → null · no numérico → NaN */
export function parseNumero(texto: unknown): number | null {
  // Lo pegado trae a veces la unidad o espacios («12,5 g»): se limpian.
  const t = String(texto ?? '').replace(/\s+/g, '').replace(/(?:g|€|%|uds?\.?)$/i, '');
  if (!t) return null;
  if (!NUMERO.test(t)) return NaN;
  return Number(t.replace(',', '.'));
}

export function formatNumero(valor: number | null | undefined, maxDecimales = 2, minDecimales = 0): string {
  if (valor == null || !Number.isFinite(valor)) return '';
  return new Intl.NumberFormat('es-ES', {
    useGrouping: false,
    minimumFractionDigits: minDecimales,
    maximumFractionDigits: Math.max(minDecimales, maxDecimales)
  }).format(valor);
}

const UNIDAD: Record<string, number> = {
  d: 24, dia: 24, dias: 24, día: 24, días: 24,
  h: 1, hr: 1, hrs: 1, hora: 1, horas: 1,
  m: 1 / 60, min: 1 / 60, mins: 1 / 60, minuto: 1 / 60, minutos: 1 / 60,
  s: 1 / 3600, seg: 1 / 3600, segundo: 1 / 3600, segundos: 1 / 3600
};

/**
 * Horas a partir de lo que se teclea o se copia del laminador:
 * «1,5» · «1.5» (horas) · «91» (minutos) · «1:31» · «1:31:20» · «1h31» ·
 * «1h 31m 20s» · «150 min» · «1d 2h». Vacío → null · no reconocido → NaN.
 */
export function parseHoras(texto: unknown): number | null {
  const t = String(texto ?? '').trim().toLowerCase();
  if (!t) return null;

  if (/^\d+$/.test(t)) return Number(t) / 60;
  const n = parseNumero(t);
  if (n !== null && !Number.isNaN(n)) return n;

  const reloj = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(t);
  if (reloj) return Number(reloj[1]) + Number(reloj[2]) / 60 + Number(reloj[3] || 0) / 3600;

  const token = /\s*(\d+(?:[.,]\d+)?)\s*([a-záéíóú]*)\s*/y;
  let total = 0;
  let anterior: number | null = null;
  let pos = 0;
  while (pos < t.length) {
    token.lastIndex = pos;
    const m = token.exec(t);
    if (!m) return NaN;
    pos = token.lastIndex;
    let factor: number | undefined = UNIDAD[m[2]];
    // «1h31»: el número suelto del final, detrás de las horas, son minutos.
    if (!m[2] && anterior === 1 && pos >= t.length) factor = 1 / 60;
    if (factor == null) return NaN;
    total += Number(m[1].replace(',', '.')) * factor;
    anterior = factor;
  }
  return total;
}

/** 1.5 → «1 h 30 min» · 0.75 → «45 min» · 3 → «3 h» (al minuto). */
export function formatHoras(horas: number | null | undefined): string {
  if (horas == null || !Number.isFinite(horas)) return '';
  const totalMin = Math.round(horas * 60);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (!min) return `${h} h`;
  return h ? `${h} h ${min} min` : `${min} min`;
}

/** Gramos para leer: «14,4 g» hasta 999 g, «1,25 kg» desde 1.000. */
export function formatGramos(g: number): string {
  return g >= 1000 ? `${formatNumero(g / 1000, 2)} kg` : `${formatNumero(g, 1)} g`;
}
