import Link from 'next/link';
import type { Metadata } from 'next';
import '../impresoras/impresoras.css';
import './zona.css';
import { siteUrl, whatsappUrl } from '@/lib/contacto';

const TITLE = 'Impresión 3D en Salamanca y provincia: recogida y envío | 3DCC';
const DESCRIPTION =
  'Impresión 3D en Salamanca: recogida en persona en la capital y envío a Béjar, Ciudad Rodrigo, Guijuelo y el resto de la provincia.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: siteUrl('/impresion-3d-salamanca-provincia/') },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    images: ['/images/og.jpg'],
    locale: 'es_ES'
  }
};

const breadcrumbLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl('/') },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Impresión 3D en Salamanca y provincia',
      item: siteUrl('/impresion-3d-salamanca-provincia/')
    }
  ]
};

const AREA_METRO = [
  'Santa Marta de Tormes',
  'Carbajosa de la Sagrada',
  'Villamayor',
  'Villares de la Reina',
  'Cabrerizos',
  'Doñinos',
  'Castellanos de Moriscos',
  'Terradillos'
];

const PROVINCIA = [
  'Béjar',
  'Ciudad Rodrigo',
  'Peñaranda de Bracamonte',
  'Guijuelo',
  'Alba de Tormes',
  'Ledesma',
  'Vitigudino'
];

const WA = whatsappUrl(
  'Hola, os escribo desde la web. Quería consultar una pieza en impresión 3D.'
);

export default function ZonaSalamancaPage() {
  return (
    <main id="inicio">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <section className="about-hero">
        <div className="container-3dcc about-hero-inner">
          <div className="section-tag">Zona de servicio</div>
          <h1>
            Impresión 3D en{' '}<br />
            <span className="accent">Salamanca y alrededores</span>
          </h1>
          <p className="about-intro-block">
            3DCC es un taller pequeño en Salamanca que atiende cada pedido de
            tú a tú. Imprimimos en <strong>FDM</strong> con PLA, PETG, ASA, TPU
            y Nylon, y trabajamos igual para alguien del barrio que para
            alguien de la otra punta de la provincia. Lo único que cambia es
            cómo te llega la pieza.
          </p>
        </div>
      </section>

      <section className="zona-section">
        <div className="container-3dcc zona-prose">
          <h2>Salamanca capital: recogida en persona</h2>
          <p>
            Si vives o trabajas en Salamanca, lo más cómodo suele ser recoger
            la pieza en persona en la zona del Barrio Vidal. Quedamos por
            WhatsApp, la ves en mano y, si algo no encaja, lo hablamos ahí
            mismo. También es la mejor opción cuando quieres
            comprobar una medida o un color antes de encargar más unidades.
          </p>
          <p>
            Puedes pagar en efectivo, por Bizum o por transferencia. El plazo
            depende de la pieza (tamaño, material, cantidad) y te lo confirmamos
            al hacer el pedido, sin prometer fechas que luego no se cumplen.
          </p>

          <h2>Área metropolitana</h2>
          <p>
            Para los municipios pegados a la capital, la recogida en Salamanca
            sigue siendo lo habitual, porque estás a pocos minutos. Si te viene
            mejor, también podemos enviártelo. Esto aplica, entre otros, a:
          </p>
          <ul className="zona-towns">
            {AREA_METRO.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>

          <h2>Resto de la provincia: envío a domicilio</h2>
          <p>
            Si estás más lejos, enviamos la pieza bien protegida a tu casa o a
            tu trabajo. Todo se gestiona a distancia: nos mandas el archivo o
            unas fotos, te pasamos precio y plazo, pagas por Bizum o
            transferencia y te llega por mensajería. Enviamos a toda la
            provincia, por ejemplo a:
          </p>
          <ul className="zona-towns">
            {PROVINCIA.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>
            Y si no estás en Salamanca, también enviamos al resto de España.
          </p>
        </div>
      </section>

      <section className="values-section">
        <div className="container-3dcc">
          <div className="section-header">
            <div className="section-tag">Qué podemos hacer por ti</div>
            <h2 className="section-title">Piezas que se piden de verdad</h2>
          </div>
          <div className="values-grid">
            <div className="value-card">
              <span className="value-num">01</span>
              <h3 className="value-title">Regalos personalizados</h3>
              <p className="value-desc">
                Llaveros con nombre, litofanías con tus fotos y placas
                personalizadas. Detalles hechos a mano para alguien concreto.
              </p>
            </div>
            <div className="value-card">
              <span className="value-num">02</span>
              <h3 className="value-title">Repuestos difíciles de encontrar</h3>
              <p className="value-desc">
                Esa pestaña rota del electrodoméstico, el clip de la persiana o
                la pieza que el fabricante ya no vende. Mándanos fotos con
                medidas y vemos si se puede reproducir.
              </p>
            </div>
            <div className="value-card">
              <span className="value-num">03</span>
              <h3 className="value-title">Piezas técnicas y organizadores</h3>
              <p className="value-desc">
                Soportes, adaptadores, carcasas y organizadores a medida para
                el taller, la oficina o el cajón de casa.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="zona-section">
        <div className="container-3dcc zona-prose">
          <h2>Cómo empezar</h2>
          <p>
            Si ya tienes el archivo en STL, 3MF u OBJ, súbelo a la{' '}
            <Link href="/instant-quote/">calculadora de presupuesto</Link> y
            verás el precio al momento. Si prefieres partir de algo ya hecho,
            echa un vistazo al <Link href="/catalogo/">catálogo</Link>. Para
            elegir color, en el <Link href="/muestrario/">muestrario</Link>{' '}
            tienes más de 30, y si quieres te mandamos una foto real del
            filamento antes de imprimir.
          </p>
          <p>
            ¿No tienes archivo o no sabes qué material elegir? Escríbenos por
            WhatsApp con una foto o una idea y te decimos cómo lo haríamos.
          </p>
          <div className="zona-actions">
            <Link href="/instant-quote/" className="btn-primary">
              Calcular precio
            </Link>
            <a
              href={WA}
              className="btn-outline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Escribir por WhatsApp
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
