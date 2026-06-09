'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Term-acceptance banner. Hidden by default; slides up 500 ms after mount if
// localStorage('termsAccepted') is not 'true'. Matches REQUIREMENTS §7.
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem('termsAccepted') !== 'true') {
        const t = setTimeout(() => setVisible(true), 500);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem('termsAccepted', 'true');
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  return (
    <div id="cookieBanner" className={visible ? 'visible' : ''}>
      <div className="cookie-inner">
        <p className="cookie-text">
          Al navegar por esta web, aceptas nuestros{' '}
          <Link href="/terminos">Términos y Condiciones</Link>. Usamos tu
          información únicamente para procesar solicitudes de impresión 3D.
        </p>
        <div className="cookie-actions">
          <button
            id="acceptTerms"
            className="cookie-accept"
            onClick={accept}
            type="button"
          >
            Aceptar
          </button>
          <button
            id="closeTerms"
            className="cookie-close"
            aria-label="Cerrar"
            onClick={() => setVisible(false)}
            type="button"
          >
            <svg
              width="13"
              height="13"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
