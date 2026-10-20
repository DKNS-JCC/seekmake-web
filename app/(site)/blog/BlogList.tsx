'use client';

import Link from 'next/link';
import type { BlogPost } from '@/lib/types';

// Posts are fetched at build time in page.tsx (admin rebuild publishes new ones).
export function BlogList({ posts }: { posts: BlogPost[] }) {
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
              <img src={p.cover_image} alt="" loading="lazy" decoding="async" />
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
