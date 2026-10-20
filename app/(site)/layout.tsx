import { ReactNode } from 'react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { BackToTop } from '@/components/BackToTop';
import { WhatsAppFAB } from '@/components/WhatsAppFAB';
import { CONTACTO, siteUrl } from '@/lib/contacto';

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'LocalBusiness',
      '@id': siteUrl('/#business'),
      name: '3DCC Salamanca — Impresión 3D',
      description:
        'Taller de impresión 3D en Salamanca. Regalos personalizados, repuestos y piezas técnicas a medida. Recogida en mano en Salamanca y envíos a toda España.',
      url: CONTACTO.sitio,
      telephone: CONTACTO.telefonoTel,
      email: CONTACTO.email,
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
      areaServed: [
        { '@type': 'City', name: 'Salamanca' },
        { '@type': 'AdministrativeArea', name: 'Provincia de Salamanca' },
        { '@type': 'Country', name: 'España' },
      ],
      priceRange: '€',
      image: siteUrl('/images/og.jpg'),
      hasMap: CONTACTO.googleMaps,
      sameAs: [CONTACTO.instagram, CONTACTO.googleMaps],
    },
    {
      '@type': 'Service',
      '@id': siteUrl('/#service'),
      name: 'Impresión 3D a medida',
      provider: { '@id': siteUrl('/#business') },
      serviceType: 'Impresión 3D FDM',
      areaServed: { '@type': 'Country', name: 'España' },
      description:
        'Impresión 3D FDM con múltiples materiales (PLA, PETG, TPU) y más de 20 colores. Piezas técnicas, figuras y prototipos.',
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: siteUrl('/instant-quote/'),
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
      <BackToTop />
      <WhatsAppFAB />
    </>
  );
}
