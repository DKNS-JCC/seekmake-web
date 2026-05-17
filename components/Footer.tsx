import Link from 'next/link';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <span className="footer-copy">
          &copy; {year} Impresión 3DCC Salamanca. Todos los derechos reservados.
        </span>
        <span className="footer-copy">
          <Link href="/blog" className="footer-link">
            Blog
          </Link>
          <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
          <Link href="/terminos" className="footer-link">
            Términos y Condiciones
          </Link>
          <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
          Servicio ofrecido como hobby sin ánimo de lucro
        </span>
      </div>
    </footer>
  );
}
