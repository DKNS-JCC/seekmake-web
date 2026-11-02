import Link from 'next/link';
import type { Metadata } from 'next';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { WhatsAppFAB } from '@/components/WhatsAppFAB';
import { whatsappUrl } from '@/lib/contacto';
import { campanaActiva } from '@/lib/campana-navidad';
import './not-found.css';

export const metadata: Metadata = {
  title: 'Página no encontrada | 3DCC',
  robots: { index: false, follow: true }
};

// Un fallo de impresión clásico: las capas se desplazan a partir de cierta
// altura. Cada número es el desplazamiento de esa capa, de abajo arriba.
const CAPAS = [0, 0, 0, 0, 0, 0, 14, 14, 28, 28, 28, 46];

// Con `output: 'export'` esta página se publica como 404.html.
export default function NotFound() {
  return (
    <>
      <Navigation />
      <main id="inicio" className="container-3dcc nf-main">
        <div className="nf-pieza" aria-hidden="true">
          {CAPAS.slice().reverse().map((x, i) => (
            <span key={i} style={{ transform: `translateX(${x}px)` }} />
          ))}
        </div>
        <div>
          <p className="nf-error">Error · impresión detenida en la capa 404</p>
          <h1 className="section-title">Esta página se ha despegado de la cama</h1>
          <p className="nf-texto">
            El enlace está mal escrito o la página ya no existe. Pasa en las mejores impresoras.
            Prueba por aquí:
          </p>
          <div className="nf-acciones">
            {campanaActiva() && <Link href="/navidad/" className="btn-primary">Regalos de Navidad</Link>}
            <Link href="/catalogo/" className="btn-outline">Ver regalos</Link>
            <a href={whatsappUrl('Hola, buscaba una página de la web y no la encuentro.')} className="btn-outline" target="_blank" rel="noopener noreferrer">
              Pedir por WhatsApp
            </a>
            <Link href="/" className="btn-outline">Ir al inicio</Link>
          </div>
        </div>
      </main>
      <Footer />
      <WhatsAppFAB />
    </>
  );
}
