'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { renderMarkdown } from '@/lib/markdown';
import { AdSlot } from '@/components/AdSlot';
import type { BlogPost } from '@/lib/types';
import { CONTACTO, siteUrl } from '@/lib/contacto';

export function BlogPostView({ slug }: { slug: string }) {
  const [post, setPost] = useState<BlogPost | null | 'missing'>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      setPost('missing');
      return;
    }
    const supabase = createClient();
    supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('published', true)
      .single()
      .then(({ data }) => setPost(data ?? 'missing'));
  }, [slug]);

  if (post === null) {
    return <div className="blog-loading">Cargando…</div>;
  }

  if (post === 'missing') {
    return (
      <div className="blog-article">
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48 }}>
          Artículo no encontrado
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 16 }}>
          El post que buscas no existe o aún no está publicado.
        </p>
        <Link href="/blog" className="blog-back">
          ← Volver al blog
        </Link>
      </div>
    );
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: post.cover_image || undefined,
    datePublished: post.published_at ?? post.created_at,
    dateModified: post.updated_at,
    author: { '@type': 'Organization', name: CONTACTO.nombre, url: CONTACTO.sitio },
    publisher: { '@type': 'Organization', name: CONTACTO.nombre, url: CONTACTO.sitio },
    mainEntityOfPage: siteUrl(`/blog/${post.slug}`),
  };

  return (
    <article className="blog-article">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header>
        <Link
          href="/blog"
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            textDecoration: 'none'
          }}
        >
          ← Blog
        </Link>
        <h1>{post.title}</h1>
        {post.published_at && (
          <div className="blog-article-date">
            {new Date(post.published_at).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
          </div>
        )}
      </header>

      {post.cover_image && (
        <div className="blog-article-cover">
          <img src={post.cover_image} alt="" loading="lazy" decoding="async" />
        </div>
      )}

      <div
        className="blog-content"
        // The markdown comes from our admin only and we trust the input.
        dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
      />

      <AdSlot slot="blog-post-bottom" format="rectangle" style={{ marginTop: 32 }} />

      <Link href="/blog" className="blog-back">
        ← Volver al blog
      </Link>
    </article>
  );
}
