import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';

const BASE = 'https://impresion3dcc.com';

const STATIC: MetadataRoute.Sitemap = [
  { url: BASE,                      priority: 1.0,  changeFrequency: 'weekly'  },
  { url: `${BASE}/catalogo`,        priority: 0.8,  changeFrequency: 'weekly'  },
  { url: `${BASE}/muestrario`,      priority: 0.7,  changeFrequency: 'monthly' },
  { url: `${BASE}/blog`,            priority: 0.7,  changeFrequency: 'weekly'  },
  { url: `${BASE}/instant-quote`,   priority: 0.6,  changeFrequency: 'monthly' },
  { url: `${BASE}/impresoras`,      priority: 0.5,  changeFrequency: 'monthly' },
  { url: `${BASE}/terminos`,        priority: 0.2,  changeFrequency: 'yearly'  },
  { url: `${BASE}/privacidad`,      priority: 0.2,  changeFrequency: 'yearly'  },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return STATIC;

  const supabase = createClient<Database>(url, key);
  const { data } = await supabase
    .from('blog_posts')
    .select('slug, updated_at')
    .eq('published', true);

  const posts: MetadataRoute.Sitemap = (data ?? []).map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: p.updated_at,
    priority: 0.6,
    changeFrequency: 'monthly',
  }));

  return [...STATIC, ...posts];
}
