'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { campanaActiva } from '@/lib/campana-navidad';

type Enlace = { href: string; label: string };
type Item = Enlace & {
  /** Qué hay dentro, en palabras del cliente. Se ve en el menú del móvil. */
  sub: string;
  /** Con hijos, el enlace es un desplegable (<details>: sin JS para abrir). */
  hijos?: Enlace[];
};

// El menú responde a «¿qué necesitas?»; Trabajos y Contacto son los fijos de
// cualquier web seria. «Inicio» no hace falta: el logo lleva a la portada.
// El CTA azul sigue siendo el tasador; WhatsApp ya tiene su botón flotante.
const NAVIDAD: Enlace = { href: '/navidad/', label: 'Figuras para Navidad' };
const REGALOS: Enlace[] = [
  { href: '/servicios/figuras-desde-foto/', label: 'Figuras desde tu foto' },
  { href: '/servicios/litofanias-personalizadas/', label: 'Litofanías' },
  { href: '/servicios/llaveros-personalizados/', label: 'Llaveros' },
  { href: '/servicios/diseno-3d-a-medida/', label: 'Diseño a medida' },
  { href: '/catalogo/', label: 'Catálogo de regalos' }
];

function items(): Item[] {
  return [
    {
      href: '/catalogo/',
      label: 'Regalos',
      sub: 'Figuras desde tu foto, litofanías, llaveros',
      // Navidad entra en Regalos durante la campaña y sale sola tras Reyes.
      hijos: campanaActiva() ? [NAVIDAD, ...REGALOS] : REGALOS
    },
    {
      href: '/servicios/repuestos-impresion-3d/',
      label: 'Repuestos',
      sub: 'Una pieza rota o que ya no se vende'
    },
    {
      href: '/servicios/grupos/',
      label: 'Clubes y grupos',
      sub: 'Trofeos, medallas, cofradías y empresas',
      hijos: [
        { href: '/servicios/trofeos-y-medallas/', label: 'Trofeos y medallas' },
        { href: '/servicios/grupos/', label: 'Pedidos para grupos' },
        { href: '/servicios/semana-santa/', label: 'Semana Santa' }
      ]
    },
    { href: '/trabajos/', label: 'Trabajos', sub: 'Lo que hemos hecho, con fotos' },
    { href: '/contacto/', label: 'Contacto', sub: 'WhatsApp, teléfono y dónde estamos' }
  ];
}

const limpia = (p: string) => p.replace(/\/$/, '');

export function Navigation() {
  const pathname = usePathname();
  const ITEMS = items();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const activo = (it: Item) =>
    [it, ...(it.hijos ?? [])].some((e) => limpia(e.href) === limpia(pathname));

  // Add `.scrolled` to #navbar after 50px of scroll (matches legacy).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menus when navigating to a new route.
  useEffect(() => {
    setMobileOpen(false);
    navRef.current?.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'));
  }, [pathname]);

  // Desplegables de escritorio: se cierran al pulsar fuera o con Escape.
  useEffect(() => {
    const cerrar = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      navRef.current?.querySelectorAll('.nav-links details[open]').forEach((d) => {
        if (e instanceof KeyboardEvent || !d.contains(e.target as Node)) d.removeAttribute('open');
      });
    };
    document.addEventListener('click', cerrar);
    document.addEventListener('keydown', cerrar);
    return () => {
      document.removeEventListener('click', cerrar);
      document.removeEventListener('keydown', cerrar);
    };
  }, []);

  return (
    <nav id="navbar" className={scrolled ? 'scrolled' : ''} ref={navRef}>
      <div className="nav-inner">
        <Link href="/" className="nav-logo" aria-label="3DCC, ir al inicio" title="Ir al inicio">
          <img src="/icons/android-chrome-192x192.png" alt="" width={192} height={192} />
          <div>
            <span className="nav-logo-name">3DCC</span>
            <span className="nav-logo-sub">Impresión 3D</span>
          </div>
        </Link>

        <ul className="nav-links" id="navMenu">
          {ITEMS.map((it) => (
            <li key={it.label}>
              {it.hijos ? (
                <details className="nav-drop">
                  <summary className={'nav-link' + (activo(it) ? ' active' : '')}>
                    {it.label}
                    <svg className="nav-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </summary>
                  <div className="nav-drop-panel">
                    {it.hijos.map((h) => (
                      <Link key={h.href + h.label} href={h.href}>{h.label}</Link>
                    ))}
                  </div>
                </details>
              ) : (
                <Link href={it.href} className={'nav-link' + (activo(it) ? ' active' : '')}>
                  {it.label}
                </Link>
              )}
            </li>
          ))}
          <li>
            <Link href="/instant-quote/" className="nav-cta">
              Calcular precio
            </Link>
          </li>
        </ul>

        <button
          className={'hamburger' + (mobileOpen ? ' open' : '')}
          aria-expanded={mobileOpen}
          aria-controls="navMenuMobile"
          onClick={() => setMobileOpen((v) => !v)}
          type="button"
        >
          <span className="hamburger-rayas" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {mobileOpen ? 'Cerrar' : 'Menú'}
        </button>
      </div>

      <div className={'nav-mobile' + (mobileOpen ? ' open' : '')} id="navMenuMobile">
        {ITEMS.map((it) =>
          it.hijos ? (
            <details key={it.label} className="nav-m-grupo">
              <summary className="nav-m-fila">
                <span>
                  {it.label}
                  <small>{it.sub}</small>
                </span>
                <svg className="nav-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </summary>
              {it.hijos.map((h) => (
                <Link key={h.href + h.label} href={h.href} className="nav-m-hijo">{h.label}</Link>
              ))}
            </details>
          ) : (
            <Link key={it.label} href={it.href} className="nav-m-fila">
              <span>
                {it.label}
                <small>{it.sub}</small>
              </span>
            </Link>
          )
        )}
        <Link href="/instant-quote/" className="btn-primary nav-m-cta">Calcular precio</Link>
      </div>
    </nav>
  );
}
