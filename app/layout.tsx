import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

// Default metadata — pages override what they need.
export const metadata: Metadata = {
  metadataBase: new URL('https://impresion3dcc.com'),
  title: '3DCC Salamanca | Impresión 3D',
  description:
    'Servicio de impresión 3D en Salamanca. Diseño, prototipado y figuras a medida. Calculadora de precio online y envío nacional.',
  authors: [{ name: '3DCC Salamanca' }],
  keywords: ['impresión 3D', 'Salamanca', 'prototipado', '3D printing', 'PLA', 'PETG'],
  alternates: { canonical: 'https://impresion3dcc.com/' },
  icons: {
    icon: [
      { url: '/icons/favicon.ico' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' }
    ],
    apple: '/icons/apple-touch-icon.png'
  },
  manifest: '/icons/site.webmanifest'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2c3e50'
};

// Inline FOUC-prevention script. Must run before the body renders.
// Mirrors the legacy contract: localStorage('theme') === 'dark'.
const noFlashScript = `
(function(){
  try {
    var v = localStorage.getItem('theme');
    if (v === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
