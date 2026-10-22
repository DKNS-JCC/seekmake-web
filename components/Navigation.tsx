'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDarkMode } from '@/app/providers';

interface NavItem {
  href: string;
  label: string;
  // When true, the link points to a section on the home page (#fragment).
  // The active state for those links is driven by the IntersectionObserver
  // on the home page itself, not by route matching.
  isHomeAnchor?: boolean;
}

// Servicios e Impresoras viven en el Footer. Inicio va explícito: el logo solo no basta.
const ITEMS: NavItem[] = [
  { href: '/#inicio',    label: 'Inicio',     isHomeAnchor: true },
  { href: '/catalogo',   label: 'Catálogo' },
  { href: '/muestrario', label: 'Muestrario' },
  { href: '/#trabajos',  label: 'Trabajos',   isHomeAnchor: true },
  { href: '/#contacto',  label: 'Contacto',   isHomeAnchor: true }
];

export function Navigation() {
  const pathname = usePathname();
  const { isDark, toggle } = useDarkMode();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Add `.scrolled` to #navbar after 50px of scroll (matches legacy).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu when navigating to a new route.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <nav id="navbar" className={scrolled ? 'scrolled' : ''}>
      <div className="nav-inner">
        <Link href="/#inicio" className="nav-logo" aria-label="3DCC, ir al inicio" title="Ir al inicio">
          <img src="/icons/android-chrome-192x192.png" alt="" width={192} height={192} />
          <div>
            <span className="nav-logo-name">3DCC</span>
            <span className="nav-logo-sub">Impresión 3D</span>
          </div>
        </Link>

        <ul className="nav-links" id="navMenu">
          {ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={
                  'nav-link' +
                  // Static active state for top-level routes.
                  (!item.isHomeAnchor &&
                  pathname.replace(/\/$/, '') === item.href
                    ? ' active'
                    : '')
                }
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              className="nav-theme"
              aria-label="Cambiar tema"
              onClick={toggle}
              type="button"
            >
              {isDark ? (
                <svg
                  width="18"
                  height="18"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </li>
          <li>
            <Link href="/instant-quote" className="nav-cta">
              Obtener Precio
            </Link>
          </li>
        </ul>

        <button
          className={'hamburger' + (mobileOpen ? ' open' : '')}
          aria-label="Abrir menú"
          onClick={() => setMobileOpen((v) => !v)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div
        className={'nav-mobile' + (mobileOpen ? ' open' : '')}
        id="navMenuMobile"
      >
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
        <Link href="/instant-quote">→ Obtener Precio</Link>
      </div>
    </nav>
  );
}
