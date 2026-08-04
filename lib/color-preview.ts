// Single source of truth for painting a filament colour as a CSS swatch.
// Used by the muestrario, the tasador and both admin screens so a colour
// looks identical everywhere it appears.

import type { CSSProperties } from 'react';

/** How a colour's palette is rendered. */
export type MuestraTipo = 'solido' | 'bandas' | 'degradado';

/** Minimal shape needed to paint a swatch — Color and QuoteColorSnapshot both fit. */
export type ColorMuestra = {
  hex: string;
  muestra_colores?: string[] | null;
  muestra_tipo?: MuestraTipo | null;
};

export const MUESTRA_TIPOS: { id: MuestraTipo; label: string; hint: string }[] = [
  { id: 'solido', label: 'Sólido', hint: 'Un único color' },
  { id: 'bandas', label: 'Bandas', hint: 'Bicolor coextruido, p. ej. negro y azul' },
  { id: 'degradado', label: 'Degradado', hint: 'Transición suave, p. ej. rainbow o silk' }
];

/**
 * The tones actually used to paint the swatch. Falls back to `[hex]` so
 * callers never have to special-case empty or legacy rows.
 */
export function paleta(c: ColorMuestra): string[] {
  const tones = (c.muestra_colores ?? []).filter(Boolean);
  return tones.length > 0 ? tones : [c.hex];
}

/**
 * Effective render mode. Quote snapshots saved before `muestra_tipo` existed
 * carry a palette but no mode — those were drawn as bands, so keep them that way.
 */
export function tipoDe(c: ColorMuestra): MuestraTipo {
  if (c.muestra_tipo) return c.muestra_tipo;
  return (c.muestra_colores ?? []).filter(Boolean).length > 1 ? 'bandas' : 'solido';
}

/** True when the colour needs more than a flat fill. */
export function esMulticolor(c: ColorMuestra): boolean {
  return tipoDe(c) !== 'solido' && paleta(c).length > 1;
}

/**
 * Background style for a swatch. Bands are hard-edged and vertical (that is
 * how a co-extruded filament reads); gradients blend diagonally and loop back
 * to the first tone so the strip has no visible seam.
 */
export function colorPreviewStyle(c: ColorMuestra): CSSProperties {
  const tones = paleta(c);
  const tipo = tipoDe(c);

  if (tipo === 'solido' || tones.length <= 1) {
    return { backgroundColor: c.hex };
  }

  if (tipo === 'degradado') {
    const loop = [...tones, tones[0]];
    const last = loop.length - 1;
    const stops = loop
      .map((hex, i) => `${hex} ${((i / last) * 100).toFixed(2)}%`)
      .join(', ');
    return {
      backgroundColor: c.hex,
      backgroundImage: `linear-gradient(135deg, ${stops})`
    };
  }

  const step = 100 / tones.length;
  const stops = tones
    .map((hex, i) => `${hex} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`)
    .join(', ');
  return {
    backgroundColor: c.hex,
    backgroundImage: `linear-gradient(90deg, ${stops})`
  };
}
