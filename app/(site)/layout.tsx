import { ReactNode } from 'react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { CookieBanner } from '@/components/CookieBanner';
import { BackToTop } from '@/components/BackToTop';
import { WhatsAppFAB } from '@/components/WhatsAppFAB';

// Default layout for all marketing/catalog pages.
// /qr and /terminos have their own layouts (no chrome / reduced chrome).
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
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
