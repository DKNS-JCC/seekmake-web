import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';
import type { Metadata } from 'next';
import { siteUrl } from '@/lib/contacto';
import { BlogPostView } from './BlogPostView';
import '../blog.css';

export const dynamicParams = false;

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  const alternates = { canonical: siteUrl(`/blog/${slug}/`) };
  if (!post) return { alternates, robots: { index: false } };
  const description =
    post.excerpt ||
    post.content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s*[-+]\s+/gm, '')
      .replace(/[#>*_`~|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 155);
  // Google corta hacia los 60 caracteres: el sufijo solo si cabe.
  const conMarca = `${post.title} | 3DCC`;
  return {
    title: conMarca.length <= 60 ? conMarca : post.title,
    description,
    alternates,
    openGraph: {
      title: post.title,
      description,
      type: 'article',
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      url: alternates.canonical,
      ...(post.cover_image ? { images: [post.cover_image] } : {})
    }
  };
}

// cache(): generateMetadata and the page share one fetch per slug.
const loadPost = cache(async (slug: string) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return buildSafe(async () => {
    const supabase = createClient<Database>(url, key);
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }, null);
});

export async function generateStaticParams() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [{ slug: 'placeholder' }];

  const result = await buildSafe(async () => {
    const supabase = createClient<Database>(url, key);
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug')
      .eq('published', true)
      .returns<{ slug: string }[]>();
    if (error) throw error;
    return (data ?? []).map((p) => ({ slug: p.slug }));
  }, [] as { slug: string }[]);

  return result.length > 0 ? result : [{ slug: 'placeholder' }];
}

export default async function BlogPostPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await loadPost(slug);
  return (
    <main className="blog-page">
      <BlogPostView post={post} />
    </main>
  );
}
