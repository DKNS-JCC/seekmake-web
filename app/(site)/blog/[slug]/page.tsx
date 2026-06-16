import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';
import { BlogPostView } from './BlogPostView';
import '../blog.css';

export const dynamicParams = false;

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
  const resolvedParams = await params;
  return (
    <main className="blog-page">
      <BlogPostView slug={resolvedParams.slug} />
    </main>
  );
}
