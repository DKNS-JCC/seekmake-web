import { marked } from 'marked';

// Configure once: GFM, no header IDs (we don't need anchor links), sanitize
// happens later via dompurify if we accept user-submitted content. For our
// admin-only flow we trust the input.
marked.setOptions({
  gfm: true,
  breaks: true
});

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

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
