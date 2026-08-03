import { ReactNode } from 'react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { CookieBanner } from '@/components/CookieBanner';
import { BackToTop } from '@/components/BackToTop';
import { WhatsAppFAB } from '@/components/WhatsAppFAB';

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'LocalBusiness',
      '@id': 'https://impresion3dcc.com/#business',
      name: '3DCC Salamanca — Impresión 3D',
      description:
        'Servicio de impresión 3D en Salamanca. Piezas a medida, prototipos y figuras. Envíos a toda España.',
      url: 'https://impresion3dcc.com',
      telephone: '+34923793123',
      email: 'info@impresion3dcc.com',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Plza. Barrio Vidal',
        addressLocality: 'Salamanca',
        postalCode: '37006',
        addressCountry: 'ES',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 40.9701,
        longitude: -5.6635,
      },
      areaServed: { '@type': 'Country', name: 'España' },
      priceRange: '€€',
      image: 'https://impresion3dcc.com/images/main_banner.png',
      sameAs: [],
    },
    {
      '@type': 'Service',
      '@id': 'https://impresion3dcc.com/#service',
      name: 'Impresión 3D a medida',
      provider: { '@id': 'https://impresion3dcc.com/#business' },
      serviceType: 'Impresión 3D FDM',
      areaServed: { '@type': 'Country', name: 'España' },
      description:
        'Impresión 3D FDM con múltiples materiales (PLA, PETG, TPU) y más de 20 colores. Piezas técnicas, figuras y prototipos.',
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: 'https://impresion3dcc.com/instant-quote',
      },
    },
  ],
};

// Default layout for all marketing/catalog pages.
// /qr and /terminos have their own layouts (no chrome / reduced chrome).
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <a href="#inicio" className="visually-hidden">
        Ir al contenido principal
      </a>
      <Navigation />
      {children}
      <Footer />
      <CookieBanner />
      <BackToTop />
      <WhatsAppFAB />
    </>
  );
}
