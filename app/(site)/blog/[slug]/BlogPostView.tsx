import Link from 'next/link';
import { renderMarkdown } from '@/lib/markdown';
import type { BlogPost } from '@/lib/types';
import { CONTACTO, siteUrl } from '@/lib/contacto';

// Server-rendered: the post is fetched at build time in page.tsx.
export function BlogPostView({ post }: { post: BlogPost | null }) {
  if (!post) {
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
    mainEntityOfPage: siteUrl(`/blog/${post.slug}/`),
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
            fontSize: 14,
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
          <img src={post.cover_image} alt={post.title} fetchPriority="high" decoding="async" />
        </div>
      )}

      <div
        className="blog-content"
        // The markdown comes from our admin only and we trust the input.
        dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
      />

      <Link href="/blog" className="blog-back">
        ← Volver al blog
      </Link>
    </article>
  );
}
