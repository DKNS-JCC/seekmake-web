import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';
import { CONTACTO } from '@/lib/contacto';
import { productoSlug } from '@/lib/slug';

export const dynamic = 'force-static';

const BASE = CONTACTO.sitio;

const STATIC: MetadataRoute.Sitemap = [
  { url: `${BASE}/`,                      priority: 1.0,  changeFrequency: 'weekly'  },
  { url: `${BASE}/impresion-3d-salamanca-provincia/`, priority: 0.9, changeFrequency: 'monthly' },
  { url: `${BASE}/servicios/`, priority: 0.8,  changeFrequency: 'monthly' },
  { url: `${BASE}/servicios/litofanias-personalizadas/`, priority: 0.8,  changeFrequency: 'monthly' },
  { url: `${BASE}/servicios/repuestos-impresion-3d/`, priority: 0.8,  changeFrequency: 'monthly' },
  { url: `${BASE}/servicios/llaveros-personalizados/`, priority: 0.8,  changeFrequency: 'monthly' },
  { url: `${BASE}/servicios/semana-santa/`, priority: 0.8,  changeFrequency: 'monthly' },
  { url: `${BASE}/servicios/diseno-3d-a-medida/`, priority: 0.8,  changeFrequency: 'monthly' },
  { url: `${BASE}/catalogo/`,        priority: 0.8,  changeFrequency: 'weekly'  },
  { url: `${BASE}/muestrario/`,      priority: 0.7,  changeFrequency: 'monthly' },
  { url: `${BASE}/blog/`,            priority: 0.7,  changeFrequency: 'weekly'  },
  { url: `${BASE}/instant-quote/`,   priority: 0.6,  changeFrequency: 'monthly' },
  { url: `${BASE}/contacto/`,        priority: 0.6,  changeFrequency: 'monthly' },
  { url: `${BASE}/impresoras/`,      priority: 0.5,  changeFrequency: 'monthly' },
  { url: `${BASE}/terminos/`,        priority: 0.2,  changeFrequency: 'yearly'  },
  { url: `${BASE}/privacidad/`,      priority: 0.2,  changeFrequency: 'yearly'  },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return STATIC;

  const supabase = createClient<Database>(url, key);
  const [{ data }, { data: productos }] = await Promise.all([
    supabase.from('blog_posts').select('slug, updated_at').eq('published', true),
    supabase.from('productos').select('id, legacy_id, nombre'),
  ]);

  const posts: MetadataRoute.Sitemap = (data ?? []).map((p) => ({
    url: `${BASE}/blog/${p.slug}/`,
    lastModified: p.updated_at,
    priority: 0.6,
    changeFrequency: 'monthly',
  }));

  const fichas: MetadataRoute.Sitemap = (productos ?? []).map((p) => ({
    url: `${BASE}/catalogo/${productoSlug(p)}/`,
    priority: 0.6,
    changeFrequency: 'monthly',
  }));

  return [...STATIC, ...posts, ...fichas];
}
