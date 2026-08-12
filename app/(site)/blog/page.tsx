import type { Metadata } from 'next';
import { BlogList } from './BlogList';
import './blog.css';
import { siteUrl } from '@/lib/contacto';

export const metadata: Metadata = {
  title: 'Blog | 3DCC Salamanca',
  description:
    'Artículos sobre impresión 3D: materiales, técnicas, casos de uso y novedades de 3DCC Salamanca.',
  alternates: { canonical: siteUrl('/blog') }
};

export default function BlogPage() {
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
      <BlogList />
    </main>
  );
}
