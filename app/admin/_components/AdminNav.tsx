'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { NuevosBadge } from './NuevosBadge';
import { RebuildButton } from './RebuildButton';

// Ordenado por el trabajo que se hace, de lo diario a lo raro: pedidos cada
// día, la web de vez en cuando, los ajustes casi nunca. «Web» va plegado.
type Enlace = { href: string; label: string; badge?: ReactNode };
const GRUPOS: { titulo: string; plegado?: boolean; links: Enlace[] }[] = [
  { titulo: '', links: [{ href: '/admin', label: 'Hoy' }] },
  { titulo: 'Pedidos', links: [{ href: '/admin/presupuestos', label: 'Pedidos', badge: <NuevosBadge /> }] },
  {
    titulo: 'Taller',
    links: [
      { href: '/admin/taller', label: 'Cola de impresión' },
      { href: '/admin/filamento', label: 'Filamento gastado' }
    ]
  },
  { titulo: 'Dinero', links: [{ href: '/admin/estadisticas', label: 'Estadísticas' }] },
  {
    titulo: 'Web',
    plegado: true,
    links: [
      { href: '/admin/productos', label: 'Productos' },
      { href: '/admin/filamentos', label: 'Filamentos y colores' },
      { href: '/admin/trabajos', label: 'Trabajos' },
      { href: '/admin/resenas', label: 'Reseñas' },
      { href: '/admin/blog', label: 'Blog' },
      { href: '/admin/cupones', label: 'Códigos de descuento' },
      { href: '/admin/campanas', label: 'Campañas por email' },
      { href: '/admin/navidad', label: 'Navidad' }
    ]
  },
  {
    titulo: 'Ajustes',
    links: [
      { href: '/admin/tarifas', label: 'Precios' },
      { href: '/admin/tasador', label: 'Tasador' }
    ]
  }
];

const sinBarra = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p);

export function AdminShell({ children }: { children: ReactNode }) {
  const ruta = sinBarra(usePathname() ?? '/admin');
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const actual =
    ruta === '/admin/encargo' ? { label: 'Nuevo encargo' } : GRUPOS.flatMap((g) => g.links).find((l) => l.href === ruta);

  // Alt+N: «Nuevo encargo» desde cualquier pantalla del admin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        router.push('/admin/encargo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  // The mobile sheet closes when a link is followed and with Esc.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto]);

  async function salir() {
    await createClient().auth.signOut();
    router.push('/admin/login');
  }

  return (
    <div className={'adm' + (abierto ? ' adm-abierto' : '')}>
      <header className="adm-top">
        <span className="adm-top-titulo">3DCC · {actual?.label ?? 'Admin'}</span>
        <div className="adm-top-acciones">
        <Link href="/admin/encargo" className="adm-menu-btn" title="Alt+N">+ Encargo</Link>
        <button
          type="button"
          className="adm-menu-btn"
          aria-expanded={abierto}
          aria-controls="adm-nav"
          onClick={() => setAbierto((v) => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          Menú
        </button>
        </div>
      </header>

      <div className="adm-velo" onClick={() => setAbierto(false)} aria-hidden="true" />

      <nav id="adm-nav" className="adm-side" aria-label="Admin">
        <Link href="/admin" className="nav-logo">
          <img src="/icons/android-chrome-192x192.png" alt="" width={38} height={38} />
          <div>
            <span className="nav-logo-name">3DCC</span>
            <span className="nav-logo-sub">Admin</span>
          </div>
        </Link>
        {GRUPOS.map((g) => (
          <div key={g.titulo || 'inicio'} className="adm-grupo">
            {g.plegado ? (
              <details open={g.links.some((l) => l.href === ruta)}>
                <summary className="adm-grupo-titulo adm-grupo-plegable">{g.titulo}</summary>
              {g.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="adm-link"
                  aria-current={l.href === ruta ? 'page' : undefined}
                  onClick={() => setAbierto(false)}
                >
                  {l.label}
                  {l.badge}
                </Link>
              ))}
              </details>
            ) : (
              <>
                {g.titulo && g.links.length > 1 && <p className="adm-grupo-titulo">{g.titulo}</p>}
              {g.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="adm-link"
                  aria-current={l.href === ruta ? 'page' : undefined}
                  onClick={() => setAbierto(false)}
                >
                  {l.label}
                  {l.badge}
                </Link>
              ))}
              </>
            )}
            {!g.titulo && (
              <Link
                href="/admin/encargo"
                className="btn-primary adm-nuevo"
                title="Alt+N"
                aria-current={ruta === '/admin/encargo' ? 'page' : undefined}
                onClick={() => setAbierto(false)}
              >
                Nuevo encargo
              </Link>
            )}
          </div>
        ))}
        <div className="adm-side-pie">
          <p className="adm-publica">
            Los cambios de catálogo, trabajos, reseñas y blog salen solos en la web en unos 15&nbsp;min.
          </p>
          <div style={{ margin: '0 10px 8px' }}>
            <RebuildButton small />
          </div>
          <Link href="/" className="adm-link">Ver la web</Link>
          <button type="button" className="adm-salir" onClick={salir}>Cerrar sesión</button>
        </div>
      </nav>

      <main className="adm-main">{children}</main>
    </div>
  );
}

/** Same header on every page: title, optional actions, optional intro line. */
export function AdminCabecera({
  titulo,
  acciones,
  children
}: {
  titulo: ReactNode;
  acciones?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="adm-cab">
        <h1>{titulo}</h1>
        {acciones && <div className="adm-cab-acciones">{acciones}</div>}
      </div>
      {children && <p className="adm-intro">{children}</p>}
    </>
  );
}
