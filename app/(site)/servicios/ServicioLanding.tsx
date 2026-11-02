import Link from 'next/link';
import type { Metadata } from 'next';
import '../impresoras/impresoras.css';
import '../impresion-3d-salamanca-provincia/zona.css';
import './servicios.css';
import { siteUrl, whatsappUrl } from '@/lib/contacto';
import { loadResenas } from '@/lib/resenas';
import { ResenasSection } from '@/components/ResenasSection';

export type Servicio = {
  slug: string;
  /** Title tag, <=60 chars, ends in "| 3DCC". */
  title: string;
  description: string;
  /** Short name for breadcrumb and Service schema. */
  nombre: string;
  h1: string;
  h1Accent: string;
  intro: string;
  pasos: string[];
  enviar: string[];
  materiales: string[];
  usos: string[];
  faq: { q: string; a: string }[];
  waMensaje: string;
  hermano: { href: string; texto: string };
};

export function servicioMetadata(s: Servicio): Metadata {
  return {
    title: s.title,
    description: s.description,
    alternates: { canonical: siteUrl(`/servicios/${s.slug}/`) },
    openGraph: {
      title: s.title,
      description: s.description,
      images: ['/images/og.jpg'],
      locale: 'es_ES'
    }
  };
}

export default async function ServicioLanding({ s }: { s: Servicio }) {
  const resenas = await loadResenas();
  const url = siteUrl(`/servicios/${s.slug}/`);
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Servicios', item: siteUrl('/servicios/') },
        { '@type': 'ListItem', position: 3, name: s.nombre, item: url }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: s.nombre,
      description: s.description,
      url,
      provider: { '@id': siteUrl('/#business') },
      areaServed: [
        { '@type': 'City', name: 'Salamanca' },
        { '@type': 'Country', name: 'España' }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: s.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    }
  ];
  const wa = whatsappUrl(s.waMensaje);

  return (
    <main id="inicio">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="about-hero">
        <div className="container-3dcc about-hero-inner">
          <div className="section-tag">Servicios</div>
          <h1>
            {s.h1}{' '}<br />
            <span className="accent">{s.h1Accent}</span>
          </h1>
          <p className="about-intro-block">{s.intro}</p>
        </div>
      </section>

      <ResenasSection {...resenas} />

      <section className="zona-section">
        <div className="container-3dcc zona-prose">
          <h2>Cómo funciona</h2>
          <ol className="servicio-list">
            {s.pasos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>

          <h2>Qué necesitamos que nos mandes</h2>
          <ul className="servicio-list">
            {s.enviar.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>

          <h2>Qué material elegir</h2>
          {s.materiales.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p>
            Tienes todos los colores en el{' '}
            <Link href="/muestrario/">muestrario</Link>, y si dudas entre dos te
            mandamos una foto real del filamento antes de imprimir.
          </p>

          <h2>Para qué se suele pedir</h2>
          <ul className="servicio-list">
            {s.usos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>

          <h2>Preguntas frecuentes</h2>
          <div className="servicio-faq">
            {s.faq.map((f) => (
              <div key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>

          <h2>Recogida en Salamanca o envío a toda España</h2>
          <p>
            Puedes recoger la pieza en persona en Salamanca, por la zona del
            Barrio Vidal, o te la enviamos por mensajería a cualquier punto de
            España. Más detalles en{' '}
            <Link href="/impresion-3d-salamanca-provincia/">
              impresión 3D en Salamanca y provincia
            </Link>
            . Pagas en efectivo, por Bizum o por transferencia, y el plazo te
            lo confirmamos al hacer el pedido.
          </p>
          <p>
            Si buscas ideas ya hechas, pásate por el{' '}
            <Link href="/catalogo/">catálogo</Link>. Y quizá también te
            interese <Link href={s.hermano.href}>{s.hermano.texto}</Link>.
          </p>
          <div className="zona-actions">
            <Link href="/instant-quote/" className="btn-primary">
              Calcular precio
            </Link>
            <a href={wa} className="btn-outline" target="_blank" rel="noopener noreferrer">
              Escribir por WhatsApp
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
