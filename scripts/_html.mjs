// one-off: HTML del tasador vacío
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = join(process.cwd(), 'node_modules', '.cache', 'html-tmp'); mkdirSync(dir, { recursive: true });
const plug = (name, filter, contents) => ({ name, setup(b) { b.onResolve({ filter }, (a) => ({ path: a.path, namespace: name })); b.onLoad({ filter: /.*/, namespace: name }, () => ({ contents, loader: 'js' })); } });
await build({ entryPoints: ['app/(site)/instant-quote/QuoteClient.tsx'], outfile: join(dir, 'q.mjs'), bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', target: 'node20',
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'], alias: { '@': process.cwd() }, logLevel: 'silent',
  plugins: [plug('css', /\.css$/, ''), plug('nav', /^next\/navigation$/, "export const usePathname=()=>'/instant-quote/';")] });
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://ejemplo.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'x';
const { QuoteClient } = await import(pathToFileURL(join(dir, 'q.mjs')).href);
const { renderToStaticMarkup } = await import('react-dom/server'); const { createElement } = await import('react');
const filamentos = [{ id: 'f1', material: 'PLA', descripcion: 'x', orden: 1 }];
writeFileSync(process.argv[2], renderToStaticMarkup(createElement(QuoteClient, { filamentos, colores: [], resenas: { total: 3, media: 4.5 } })));
