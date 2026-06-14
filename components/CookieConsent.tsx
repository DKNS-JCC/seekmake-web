'use client';

import { useEffect, useState } from 'react';

// Consent gate for non-essential (advertising) cookies.
// LSSI art. 22.2 + RGPD: Google AdSense must NOT load until the user accepts.
// Stored choice: localStorage('cookie-consent') === 'accepted' | 'rejected'.
const CONSENT_KEY = 'cookie-consent';

declare global {
  interface Window {
    __adsenseLoaded?: boolean;
  }
}

function loadAdSense() {
  if (typeof window === 'undefined' || window.__adsenseLoaded) return;
  const client =
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-2879714749440744';
  window.__adsenseLoaded = true;
  const script = document.createElement('script');
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  script.async = true;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

const css = `
.cookie-consent {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 9999;
  width: calc(100% - 32px);
  max-width: 760px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 14px;
  background: #ffffff;
  color: #1a1a1a;
  border: 1px solid #e2e2e2;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18);
  font-size: 13.5px;
  line-height: 1.5;
}
.cookie-consent__text { margin: 0; flex: 1 1 320px; }
.cookie-consent__text a { color: inherit; text-decoration: underline; }
.cookie-consent__actions { display: flex; gap: 10px; flex: 0 0 auto; }
.cookie-consent__btn {
  cursor: pointer;
  border-radius: 9px;
  padding: 9px 18px;
  font-size: 13.5px;
  font-weight: 600;
  border: 1px solid transparent;
  transition: opacity 0.15s ease;
}
.cookie-consent__btn:hover { opacity: 0.85; }
.cookie-consent__btn--accept { background: #2c3e50; color: #ffffff; }
.cookie-consent__btn--reject {
  background: transparent;
  color: inherit;
  border-color: #c9c9c9;
}
.dark .cookie-consent {
  background: #1e2733;
  color: #e8eaed;
  border-color: #33414f;
}
.dark .cookie-consent__btn--accept { background: #4a90d9; }
.dark .cookie-consent__btn--reject { border-color: #4a5a6a; }
@media (max-width: 540px) {
  .cookie-consent { flex-direction: column; align-items: stretch; }
  .cookie-consent__actions { justify-content: flex-end; }
}
`;

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let choice: string | null = null;
    try {
      choice = localStorage.getItem(CONSENT_KEY);
    } catch {
      /* navegador en modo privado — ignorar */
    }
    if (choice === 'accepted') {
      loadAdSense();
    } else if (choice !== 'rejected') {
      setVisible(true);
    }
  }, []);

  const decide = (accepted: boolean) => {
    try {
      localStorage.setItem(CONSENT_KEY, accepted ? 'accepted' : 'rejected');
    } catch {
      /* ignorar */
    }
    setVisible(false);
    if (accepted) loadAdSense();
  };

  if (!visible) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div
        className="cookie-consent"
        role="dialog"
        aria-live="polite"
        aria-label="Aviso de cookies"
      >
        <p className="cookie-consent__text">
          Usamos cookies propias necesarias y cookies de Google AdSense
          (publicidad) que ayudan a financiar este proyecto. Las cookies
          publicitarias solo se activan si las aceptas. Más información en la{' '}
          <a href="/privacidad">Política de Privacidad</a>.
        </p>
        <div className="cookie-consent__actions">
          <button
            type="button"
            className="cookie-consent__btn cookie-consent__btn--reject"
            onClick={() => decide(false)}
          >
            Rechazar
          </button>
          <button
            type="button"
            className="cookie-consent__btn cookie-consent__btn--accept"
            onClick={() => decide(true)}
          >
            Aceptar
          </button>
        </div>
      </div>
    </>
  );
}
