import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import { Bebas_Neue, Barlow, IBM_Plex_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';
import { CONTACTO, siteUrl } from '@/lib/contacto';

// Fonts are downloaded at build time and served from our own origin.
//
// These used to be pulled in with `@import url(fonts.googleapis.com...)` at the
// top of globals.css, which serialised four round trips before the first paint:
// HTML -> our CSS -> Google's CSS -> the font files on gstatic. Lighthouse put
// that chain at ~2.3s of render blocking. next/font inlines the @font-face
// rules and emits a <link rel=preload>, so there are no external requests left.
//
// Each font exposes a CSS variable; the stylesheets reference those instead of
// family names. Weights must match what the CSS actually uses — adding unused
// ones costs bytes for nothing.
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans'
});

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-display'
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  display: 'swap',
  variable: '--font-mono'
});

const fontVariables = `${barlow.variable} ${bebasNeue.variable} ${ibmPlexMono.variable}`;

// Default metadata — pages override what they need.
export const metadata: Metadata = {
  metadataBase: new URL(CONTACTO.sitio),
  title: 'Impresión 3D en Salamanca y envío a toda España | 3DCC',
  description:
    'Taller de impresión 3D en Salamanca: regalos personalizados, repuestos y piezas técnicas. Precio al instante, recogida en mano o envío a toda España.',
  authors: [{ name: '3DCC Salamanca' }],
  alternates: { canonical: siteUrl('/') },
  // Pages without their own openGraph inherit this, so every shared link gets a preview image.
  openGraph: {
    type: 'website',
    siteName: CONTACTO.nombre,
    locale: 'es_ES',
    images: ['/images/og.jpg']
  },
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
const noFlashScript = `(function(){
  try {
    var v = localStorage.getItem('theme');
    if (v === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={fontVariables}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} suppressHydrationWarning />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
