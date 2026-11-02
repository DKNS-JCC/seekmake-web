// Sube contenido/blog/*.md a blog_posts como BORRADORES (published = false).
//
//   node scripts/importar-blog.mjs
//
// Un artículo cuyo slug ya existe no se toca: así no pisa uno publicado ni
// los cambios hechos desde /admin/blog. La portada se sube desde el panel.
// Necesita NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');

const DIR = 'contenido/blog';
const posts = readdirSync(DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const raw = readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error(`${f}: sin cabecera YAML`);
    const meta = yaml.load(m[1]);
    // La cabecera trae una nota "(sube una foto...)" en vez de una URL.
    const cover = /^https?:\/\//.test(meta.cover_image ?? '') ? meta.cover_image : '';
    return { slug: meta.slug, title: meta.title, excerpt: meta.excerpt ?? '', content: m[2].trim(), cover_image: cover, published: false };
  });

const res = await fetch(`${URL}/rest/v1/blog_posts?on_conflict=slug`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=ignore-duplicates,return=representation'
  },
  body: JSON.stringify(posts)
});
if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
const nuevos = await res.json();
console.log(`${posts.length} artículos leídos, ${nuevos.length} nuevos como borrador:`);
for (const p of nuevos) console.log(`  - ${p.slug}`);
