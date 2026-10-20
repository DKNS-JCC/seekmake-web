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

export { slugify } from './slug';
