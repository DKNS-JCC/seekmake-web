import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pedido confirmado | 3DCC Salamanca',
  robots: { index: false, follow: false }
};

export default function SuccessPage() {
  return (
    <div
      className="page-content"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div className="container-3dcc" style={{ textAlign: 'center', maxWidth: 600 }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            marginBottom: 32
          }}
        >
          <svg
            width="36"
            height="36"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="section-title" style={{ marginBottom: 14 }}>
          ¡Pedido confirmado!
        </h1>
        <p className="section-desc" style={{ margin: '0 auto 40px' }}>
          Gracias por confiar en 3DCC. Hemos recibido tu pedido y nos
          pondremos en contacto contigo en breve.
        </p>
        <div style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/" className="btn-primary">
            Volver al inicio
          </Link>
          <Link href="/catalogo" className="btn-outline">
            Ver catálogo
          </Link>
        </div>
      </div>
    </div>
  );
}
