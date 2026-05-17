'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { BlogPost } from '@/lib/types';

// Fetch published posts client-side so new posts appear without rebuilding.
export function BlogList() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      setPosts([]);
      return;
    }
    const supabase = createClient();
    supabase
      .from('blog_posts')
      .select('*')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .then(({ data }) => setPosts(data ?? []));
  }, []);

  if (posts === null) {
    return <div className="blog-loading">Cargando…</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="blog-empty">
        <p>Aún no hay artículos publicados. ¡Vuelve pronto!</p>
      </div>
    );
  }

  return (
    <div className="blog-grid">
      {posts.map((p) => (
        <Link
          key={p.id}
          href={`/blog/${p.slug}`}
          className="blog-card"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          {p.cover_image && (
            <div className="blog-card-cover">
              <img src={p.cover_image} alt="" loading="lazy" />
            </div>
          )}
          <div className="blog-card-body">
            {p.published_at && (
              <div className="blog-card-date">{formatDate(p.published_at)}</div>
            )}
            <h2 className="blog-card-title">{p.title}</h2>
            {p.excerpt && <p className="blog-card-excerpt">{p.excerpt}</p>}
          </div>
        </Link>
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}
