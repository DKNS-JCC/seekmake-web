import { marked } from 'marked';

// Configure once: GFM, no header IDs (we don't need anchor links), sanitize
// happens later via dompurify if we accept user-submitted content. For our
// admin-only flow we trust the input.
marked.setOptions({
  gfm: true,
  breaks: true
});

// The page already owns the <h1> (the post title): a `# ` in the content
// would be a second one, so it renders as <h2>.
marked.use({
  walkTokens(token) {
    if (token.type === 'heading' && token.depth === 1) token.depth = 2;
  }
});

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

export { slugify } from './slug';
