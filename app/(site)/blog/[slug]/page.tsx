import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';
import { BlogPostView } from './BlogPostView';
import '../blog.css';

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const supabase = createClient<Database>(url, key);
  const { data } = await supabase
    .from('blog_posts')
    .select('slug')
    .eq('published', true)
    .returns<{ slug: string }[]>();

  return (data ?? []).map((p) => ({ slug: p.slug }));
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  return (
    <main className="blog-page">
      <BlogPostView slug={params.slug} />
    </main>
  );
}
