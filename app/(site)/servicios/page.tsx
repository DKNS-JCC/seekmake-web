import Link from 'next/link';
import type { Metadata } from 'next';
import '../impresoras/impresoras.css';
import '../impresion-3d-salamanca-provincia/zona.css';
import './servicios.css';
import { siteUrl } from '@/lib/contacto';

const TITLE = 'Servicios de impresión 3D | 3DCC';
const DESCRIPTION =
  'Litofanías, repuestos, llaveros personalizados y diseño 3D a medida en un taller de Salamanca. Recogida en persona y envío a toda España.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: siteUrl('/servicios/') },
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
    { '@type': 'ListItem', position: 2, name: 'Servicios', item: siteUrl('/servicios/') }
  ]
};

const SERVICIOS = [
  {
    href: '/servicios/litofanias-personalizadas/',
    titulo: 'Litofanías personalizadas',
    desc: 'Tu foto convertida en relieve que aparece al ponerle luz detrás.'
  },
  {
    href: '/servicios/repuestos-impresion-3d/',
    titulo: 'Repuestos y piezas descatalogadas',
    desc: 'Copio la pieza rota a partir de fotos con medidas o de la original.'
  },
  {
    href: '/servicios/llaveros-personalizados/',
    titulo: 'Llaveros personalizados',
    desc: 'Con nombre o logo, a uno o dos colores, sueltos o en lotes para empresas.'
  },
  {
    href: '/servicios/semana-santa/',
    titulo: 'Mini cofrades de Semana Santa',
    desc: 'Mini nazarenos con los colores de tu hermandad: figura, capuchón de lápiz o pin.'
  },
  {
    href: '/servicios/diseno-3d-a-medida/',
    titulo: 'Diseño 3D a medida',
    desc: 'De una foto, un boceto o unas medidas a una pieza impresa.'
  }
];

export default function ServiciosPage() {
  return (
    <main id="inicio">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <section className="about-hero">
        <div className="container-3dcc about-hero-inner">
          <div className="section-tag">Servicios</div>
          <h1>
            Servicios de{' '}<br />
            <span className="accent">impresión 3D</span>
          </h1>
          <p className="about-intro-block">
            Imprimo en FDM en mi taller de Salamanca y envío a toda España.
            Estos son los encargos que más me piden. Si el tuyo no encaja en
            ninguno, escríbeme igualmente.
          </p>
        </div>
      </section>

      <section className="values-section">
        <div className="container-3dcc">
          <div className="values-grid">
            {SERVICIOS.map((s, i) => (
              <Link key={s.href} href={s.href} className="value-card">
                <span className="value-num">{String(i + 1).padStart(2, '0')}</span>
                <h2 className="value-title">{s.titulo}</h2>
                <p className="value-desc">{s.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
