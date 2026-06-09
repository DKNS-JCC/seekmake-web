import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pedido cancelado | 3DCC Salamanca',
  robots: { index: false, follow: false }
};

export default function CancelPage() {
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
            background: 'var(--surface-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="section-title" style={{ marginBottom: 14 }}>
          Pedido cancelado
        </h1>
        <p className="section-desc" style={{ margin: '0 auto 40px' }}>
          Has cancelado el proceso. Si fue un error, puedes volver a intentarlo
          cuando quieras o contactarnos por WhatsApp.
        </p>
        <div style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/" className="btn-primary">
            Volver al inicio
          </Link>
          <Link href="/instant-quote" className="btn-outline">
            Calcular precio
          </Link>
        </div>
      </div>
    </div>
  );
}
