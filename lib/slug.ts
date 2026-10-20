// Kept apart from lib/markdown.ts so client components can slugify without bundling `marked`.

/**
 * Generate a URL-safe slug from a title. Lowercases, strips diacritics,
 * collapses non-alphanumerics into single dashes.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
    .slice(0, 96);
}

/** Stable product URL slug: name + legacy_id (or uuid) so it is always unique. */
export function productoSlug(p: { nombre: string; legacy_id: number | null; id: string }): string {
  return `${slugify(p.nombre)}-${p.legacy_id ?? p.id}`;
}
