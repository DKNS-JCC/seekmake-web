import { ReactNode } from 'react';
import Link from 'next/link';
import { NuevosBadge } from './_components/NuevosBadge';

// Standalone admin chrome — does not share the public nav.
// Auth gate is enforced client-side inside each page (acceptable for the
// static-export model). When we move to Vercel SSR we can swap this to a
// server-side `redirect()` via Supabase server client.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header
        style={{
          height: 'var(--nav-h)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 16
        }}
      >
        <Link href="/admin" className="nav-logo" style={{ marginRight: 'auto' }}>
          <img src="/icons/android-chrome-192x192.png" alt="" />
          <div>
            <span className="nav-logo-name">3DCC</span>
            <span className="nav-logo-sub">Admin</span>
          </div>
        </Link>
        <Link href="/admin/productos" className="nav-link">Productos</Link>
        <Link href="/admin/filamentos" className="nav-link">Filamentos</Link>
        <Link href="/admin/trabajos" className="nav-link">Trabajos</Link>
        <Link href="/admin/blog" className="nav-link">Blog</Link>
        <Link href="/admin/presupuestos" className="nav-link">
          Presupuestos<NuevosBadge />
        </Link>
        <Link href="/admin/tarifas" className="nav-link">Tarifas</Link>
        <Link href="/" className="nav-link">Ver sitio</Link>
      </header>
      <main style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}
