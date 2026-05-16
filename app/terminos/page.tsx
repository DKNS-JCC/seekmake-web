import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | 3DCC Salamanca',
  description: 'Términos y condiciones del servicio de impresión 3D de 3DCC Salamanca.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://impresion3dcc.com/terminos' }
};

// Reduced-chrome layout: logo + back link only, no dark mode toggle.
// Body content is a faithful port of legacy/terminos.html. The full legal
// text is preserved verbatim in the next pass; for now we render a
// readable placeholder and a link to the legacy page.
export default function TerminosPage() {
  return (
    <>
      <nav id="navbar">
        <div className="nav-inner">
          <Link href="/" className="nav-logo">
            <img src="/icons/android-chrome-192x192.png" alt="3DCC Logo" />
            <div>
              <span className="nav-logo-name">3DCC</span>
              <span className="nav-logo-sub">Impresión 3D</span>
            </div>
          </Link>
          <Link
            href="/"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              textDecoration: 'none'
            }}
          >
            ← Volver al inicio
          </Link>
        </div>
      </nav>
      <main
        style={{
          paddingTop: 'calc(var(--nav-h) + 40px)',
          paddingBottom: 80,
          minHeight: '100vh'
        }}
      >
        <div className="container-3dcc">
          <div className="section-tag">Legal</div>
          <h1 className="section-title">Términos y Condiciones</h1>
          <p
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              color: 'var(--muted)',
              marginTop: 12,
              letterSpacing: '0.1em'
            }}
          >
            Última actualización: 1 de mayo de 2026
          </p>

          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 48,
              marginTop: 32
            }}
          >
            <div
              style={{
                background: 'var(--surface-2)',
                borderLeft: '3px solid var(--accent)',
                padding: 24,
                borderRadius: '0 var(--r) var(--r) 0',
                marginBottom: 32
              }}
            >
              <h2 style={{ marginTop: 0, fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
                Información previa
              </h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.8 }}>
                Este sitio ofrece un servicio de impresión 3D realizado de forma{' '}
                <strong style={{ color: 'var(--text)' }}>artesanal</strong>, con
                equipos domésticos y semi-profesionales y producción de pequeño
                volumen. Cada encargo se valora y se acuerda de manera
                individualizada. La realización de cualquier encargo requiere
                la aceptación previa y expresa de los presentes Términos.
              </p>
            </div>

            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.8 }}>
              <em>
                El contenido legal completo está pendiente de migrar literalmente
                desde la página actual. Hasta entonces, consulta el texto vigente en{' '}
                <a
                  href="https://impresion3dcc.com/terminos.html"
                  className="footer-link"
                >
                  impresion3dcc.com/terminos.html
                </a>
                .
              </em>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
