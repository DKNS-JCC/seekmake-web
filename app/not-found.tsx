import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';

// Con `output: 'export'` esta página se publica como 404.html.
export default function NotFound() {
  return (
    <>
      <Navigation />
      <main
        id="inicio"
        className="container-3dcc"
        style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 'var(--nav-h)' }}
      >
        <div className="section-tag">Error 404</div>
        <h1 className="section-title">Esta página no existe</h1>
        <p style={{ color: 'var(--muted)', maxWidth: 480, lineHeight: 1.7, margin: '16px 0 32px' }}>
          Puede que el enlace esté mal escrito o que la página se haya movido. Prueba con alguna de estas:
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/" className="btn-primary">Ir al inicio</Link>
          <Link href="/catalogo/" className="btn-outline">Ver catálogo</Link>
          <Link href="/instant-quote/" className="btn-outline">Calcular precio</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
