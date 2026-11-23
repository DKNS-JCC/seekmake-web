import type { Metadata } from 'next';
import '../impresoras/impresoras.css';
import { siteUrl } from '@/lib/contacto';
import { loadTrabajos } from '@/lib/trabajos';
import { Album } from './Album';

const TITLE = 'Trabajos de impresión 3D hechos en Salamanca | 3DCC';
const DESCRIPTION =
  'Figuras desde foto, mascotas, trofeos, regalos, miniaturas de rol y repuestos que hemos impreso en nuestro taller de Salamanca. Pide uno parecido por WhatsApp.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: siteUrl('/trabajos/') },
  openGraph: { title: TITLE, description: DESCRIPTION, images: ['/images/og.jpg'], locale: 'es_ES' }
};

export default async function TrabajosPage() {
  // Orden aleatorio en cada build (cada 15 min): un álbum, no un catálogo.
  const trabajos = await loadTrabajos();
  for (let i = trabajos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [trabajos[i], trabajos[j]] = [trabajos[j], trabajos[i]];
  }
  return (
    <main id="inicio">
      <section className="about-hero">
        <div className="container-3dcc about-hero-inner">
          <div className="section-tag">Hecho en nuestro taller</div>
          <h1>
            Nuestros <span className="accent">trabajos</span>
          </h1>
          <p className="about-intro-block">Una parte de lo que ha salido del taller. Toca una foto para verla en grande.</p>
        </div>
      </section>
      <Album trabajos={trabajos} />
    </main>
  );
}
