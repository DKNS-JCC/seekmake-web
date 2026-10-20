import Link from 'next/link';
import { CONTACTO } from '@/lib/contacto';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <span className="footer-copy">
          &copy; {year} Impresión 3DCC Salamanca. Todos los derechos reservados.
        </span>
        <span className="footer-copy">
          <a href={CONTACTO.instagram} className="footer-link" target="_blank" rel="noopener noreferrer">
            Instagram
          </a>
          <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
          <a href={CONTACTO.googleMaps} className="footer-link" target="_blank" rel="noopener noreferrer">
            Google Maps
          </a>
          <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
          <Link href="/impresion-3d-salamanca-provincia" className="footer-link">
            Salamanca y provincia
          </Link>
          <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
          <Link href="/blog" className="footer-link">
            Blog
          </Link>
          <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
          <Link href="/terminos" className="footer-link">
            Términos y Condiciones
          </Link>
          <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
          <Link href="/privacidad" className="footer-link">
            Política de Privacidad
          </Link>
          <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
          Servicio ofrecido como hobby sin ánimo de lucro
        </span>
      </div>
    </footer>
  );
}
