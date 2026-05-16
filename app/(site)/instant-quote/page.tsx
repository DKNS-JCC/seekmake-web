import Script from 'next/script';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calculadora de Precio | 3DCC Salamanca',
  description: 'Obtén el precio de tu pieza 3D al instante.'
};

// SeekMake iframe embed (REQUIREMENTS §9.4).
export default function InstantQuotePage() {
  return (
    <div className="page-content">
      <Script src="https://seekmake.com/assets/public/iq-api-latest.js" strategy="afterInteractive" />
      <iframe
        sandbox="allow-downloads allow-scripts allow-same-origin allow-forms allow-popups"
        id="seekmake-embed-iq"
        src="https://seekmake.com/instant-quote/?isEmbed=true&manufacturer=68dc31e8d996e3f4cdd284c2"
        style={{ width: '100%', height: 'calc(100vh - var(--nav-h))', border: 0 }}
        scrolling="no"
        title="Calculadora de precio instantánea"
      />
    </div>
  );
}
