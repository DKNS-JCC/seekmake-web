import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import type { Database } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';
import { BlogList } from './BlogList';
import './blog.css';
import { siteUrl } from '@/lib/contacto';

export const metadata: Metadata = {
  title: 'Blog de impresión 3D en Salamanca | 3DCC',
  description:
    'Artículos sobre impresión 3D: materiales, técnicas, casos de uso y novedades de 3DCC Salamanca.',
  alternates: { canonical: siteUrl('/blog/') }
};

async function loadPosts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  return buildSafe(async () => {
    const supabase = createClient<Database>(url, key);
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('published', true)
      .order('published_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }, []);
}

export default async function BlogPage() {
  const posts = await loadPosts();
  return (
    <main className="blog-page">
      <header className="blog-hero">
        <div className="section-tag">Blog</div>
        <h1 className="section-title">Cuaderno de impresión</h1>
        <p className="section-desc">
          Materiales, técnicas y casos reales del taller. Sin tecnicismos
          innecesarios.
        </p>
      </header>
      <BlogList posts={posts} />
    </main>
  );
}
