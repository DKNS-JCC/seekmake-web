import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '3DCC Salamanca',
  description: 'Enlaces rápidos a 3DCC Salamanca.',
  robots: { index: false, follow: false }
};

// Standalone "link-in-bio" page (REQUIREMENTS §9.8). No nav/footer chrome.
// Full visual port (animated gradient, Inter font, custom cards) is the
// next pass; this stub gives the route a usable rendering meanwhile.
export default function QrPage() {
  const links = [
    { href: 'https://impresion3dcc.com', label: 'Web principal' },
    {
      href: 'https://wa.me/34665148956?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20impresi%C3%B3n%203D',
      label: 'WhatsApp'
    },
    { href: 'mailto:impresion3dslmc@gmail.com', label: 'Email' },
    { href: '/catalogo', label: 'Catálogo' },
    { href: '/muestrario', label: 'Muestrario' },
    { href: '/instant-quote', label: 'Calcular precio' }
  ];
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background:
          'linear-gradient(135deg, #0EA5E9 0%, #34495e 50%, #2c3e50 100%)',
        color: '#fff',
        fontFamily: "'Inter', system-ui, sans-serif"
      }}
    >
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <img
          src="/icons/android-chrome-512x512.png"
          alt=""
          style={{ width: 96, height: 96, borderRadius: 18, marginBottom: 20 }}
        />
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 42,
            letterSpacing: '0.04em',
            marginBottom: 4
          }}
        >
          3DCC
        </h1>
        <p style={{ opacity: 0.8, marginBottom: 32, fontSize: 14 }}>
          Impresión 3D · Salamanca
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {links.map((l) => {
            const isExternal = l.href.startsWith('http') || l.href.startsWith('mailto:');
            const inner = (
              <span
                style={{
                  display: 'block',
                  padding: '14px 20px',
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  color: '#fff',
                  backdropFilter: 'blur(8px)'
                }}
              >
                {l.label}
              </span>
            );
            return isExternal ? (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                {inner}
              </a>
            ) : (
              <Link key={l.href} href={l.href} style={{ textDecoration: 'none' }}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
