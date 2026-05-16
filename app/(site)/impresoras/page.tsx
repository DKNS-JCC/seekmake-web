import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Impresoras | 3DCC Salamanca',
  description: 'Equipo de impresoras 3D que utilizamos en 3DCC Salamanca.'
};

// TODO: full port of legacy/impresoras.html.
// The legacy file lists each printer with its specs; this stub keeps the
// route alive so the navigation doesn't 404 while we work on the migration.
export default function ImpresorasPage() {
  return (
    <main className="page-content">
      <div className="container-3dcc" style={{ paddingTop: 56, paddingBottom: 96 }}>
        <div className="section-tag">Equipo</div>
        <h1 className="section-title">Nuestras Impresoras</h1>
        <p className="section-desc" style={{ marginTop: 18 }}>
          Esta página está pendiente de migración. El contenido original sigue
          disponible en el sitio actual.
        </p>
        <Link
          href="/"
          className="btn-outline"
          style={{ marginTop: 32, display: 'inline-flex' }}
        >
          ← Volver al inicio
        </Link>
      </div>
    </main>
  );
}
