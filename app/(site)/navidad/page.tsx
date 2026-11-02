import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';
import { siteUrl, whatsappUrl } from '@/lib/contacto';
import { loadResenas } from '@/lib/resenas';
import { ResenasSection } from '@/components/ResenasSection';
import { FECHAS, PRODUCTOS, fechaCorta, hoyMadrid, loadPlazas, proximaFecha } from '@/lib/campana-navidad';
import '@/components/faq.css';
import './navidad.css';

const TITLE = 'Regalos de Navidad impresos en 3D en Salamanca | 3DCC';
const DESCRIPTION =
  'Figuras desde tu foto, litofanías y detalles con nombre, hechos a mano en Salamanca. Plazas limitadas por semana y fechas límite para Nochebuena y Reyes.';
const URL = siteUrl('/navidad/');

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESCRIPTION, images: ['/images/og.jpg'], locale: 'es_ES' }
};

const FAQ = [
  {
    q: '¿Llega antes de Nochebuena?',
    a: 'Si lo pides antes de la fecha límite de cada producto, sí. Las fechas ya tienen un día de margen por si una impresión sale mal y hay que repetirla.'
  },
  {
    q: '¿Qué foto necesitáis para una figura?',
    a: 'Una foto de cuerpo entero, con buena luz y sin nada delante. Si la tuya no sirve, te lo decimos antes de empezar y no pagas nada.'
  },
  {
    q: '¿Podéis hacer personajes de películas o videojuegos?',
    a: 'No. No imprimimos personajes ni marcas de otros. Sí hacemos figuras de personas, mascotas y diseños propios.'
  },
  {
    q: '¿Cómo se paga?',
    a: 'En efectivo, por Bizum o por transferencia. Te confirmamos el precio antes de imprimir.'
  }
];

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Navidad', item: URL }
    ]
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  }
];

/** Foto de cada trabajo real, por título. */
async function loadFotos(): Promise<Record<string, string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return {};
  return buildSafe(async () => {
    const { data, error } = await createClient<Database>(url, key).from('trabajos').select('titulo, imagen');
    if (error) throw error;
    return Object.fromEntries((data ?? []).filter((t) => t.imagen).map((t) => [t.titulo, t.imagen]));
  }, {});
}

export default async function NavidadPage() {
  const [fotos, plazas, resenas] = await Promise.all([loadFotos(), loadPlazas(), loadResenas()]);
  const hoy = hoyMadrid();
  const portada = fotos['Litofanía personalizada'];
  const prox = proximaFecha(hoy);
  const libres = plazas ? Math.max(0, plazas.semana - plazas.ocupadas) : null;

  return (
    <main id="inicio" className="nv-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="nv-hero">
        <div className="container-3dcc nv-hero-grid">
          <div>
            <div className="section-tag">Navidad 2026 · Salamanca</div>
            <h1 className="nv-h1">
              Regalos de Navidad <span className="accent">hechos para alguien</span>
            </h1>
            <p className="nv-intro">
              Una figura de tu perro, la foto de los abuelos que se enciende, un llavero con un nombre.
              Lo imprimimos en nuestro taller de Salamanca, con plazas limitadas cada semana para llegar a tiempo.
            </p>
            {prox && (
              <p className="nv-proximo">
                <strong>{prox.texto}:</strong> pide hasta el {fechaCorta(prox.fecha)}.
                {libres !== null && <> Quedan {libres} {libres === 1 ? 'plaza' : 'plazas'} esta semana.</>}
              </p>
            )}
            <div className="nv-acciones">
              <a href={whatsappUrl('Hola, quiero un regalo de Navidad.')} className="btn-primary" target="_blank" rel="noopener noreferrer">
                Pedir por WhatsApp
              </a>
              <a href="#fechas" className="btn-outline">Ver fechas límite</a>
            </div>
          </div>
          {portada && (
            <figure className="nv-hero-foto">
              <img src={portada} alt="Litofanía en forma de cubo, encendida, con fotos de familia" width={737} height={800} fetchPriority="high" />
              <figcaption>Litofanía impresa en el taller</figcaption>
            </figure>
          )}
        </div>
      </section>

      <section className="nv-productos" aria-labelledby="nv-productos-titulo">
        <div className="container-3dcc">
          <h2 id="nv-productos-titulo" className="section-title">Qué imprimimos esta Navidad</h2>
          <ol className="nv-lista">
            {PRODUCTOS.map((p) => {
              const foto = p.fotoTrabajo ? fotos[p.fotoTrabajo] : undefined;
              return (
                <li key={p.id} className="nv-producto" id={p.id}>
                  <div className="nv-producto-foto">
                    {foto ? (
                      <figure>
                        <img src={foto} alt={p.fotoTrabajo} loading="lazy" decoding="async" />
                        <figcaption>{p.fotoTrabajo}</figcaption>
                      </figure>
                    ) : (
                      <div className="nv-capas" aria-hidden="true">
                        <span>Sin foto todavía:<br />la tuya puede ser la primera</span>
                      </div>
                    )}
                  </div>
                  <div className="nv-producto-texto">
                    <h3>{p.nombre}</h3>
                    <p className="nv-precio">{p.precio}</p>
                    <dl className="nv-ficha">
                      <div><dt>Tamaño</dt><dd>{p.tamano}</dd></div>
                      <div><dt>Plazo</dt><dd>{p.plazo}</dd></div>
                    </dl>
                    <p>{p.descripcion}</p>
                    <p className="nv-necesitamos"><strong>Qué necesitamos:</strong> {p.necesitamos}</p>
                    <a href={whatsappUrl(p.waMensaje)} className="btn-primary" target="_blank" rel="noopener noreferrer">
                      Pedir por WhatsApp
                    </a>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="nv-fechas" id="fechas" aria-labelledby="nv-fechas-titulo">
        <div className="container-3dcc">
          <h2 id="nv-fechas-titulo" className="section-title">Cola de impresión</h2>
          <p className="section-desc">Último día para pedir cada cosa. Llevan un día de margen por si una pieza hay que repetirla.</p>
          <ol className="nv-cola">
            {FECHAS.map((f, i) => {
              const cerrada = f.fecha < hoy;
              return (
                <li key={f.fecha} className={cerrada ? 'cerrada' : ''}>
                  <span className="nv-job">#{String(i + 1).padStart(2, '0')}</span>
                  <span className="nv-dia">{fechaCorta(f.fecha)}</span>
                  <span className="nv-que">{f.texto}</span>
                  <span className="nv-estado">{cerrada ? 'Cerrada' : 'En cola'}</span>
                </li>
              );
            })}
          </ol>
          <p className="nv-regaliz">
            En cada pedido va un rollo de <strong>filamento comestible</strong>: regaliz, en su envase original. Revisa los
            alérgenos de la etiqueta.
          </p>
        </div>
      </section>

      <ResenasSection {...resenas} />

      <section className="faq-section" aria-labelledby="nv-faq-titulo">
        <div className="container-3dcc">
          <div className="section-header">
            <div className="section-tag">Preguntas frecuentes</div>
            <h2 id="nv-faq-titulo" className="section-title">Antes de pedir</h2>
          </div>
          <div className="faq-list">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="faq-item">
                <summary className="faq-q">{q}</summary>
                <p className="faq-a">{a}</p>
              </details>
            ))}
          </div>
          <div className="nv-acciones">
            <a href={whatsappUrl('Hola, quiero un regalo de Navidad.')} className="btn-primary" target="_blank" rel="noopener noreferrer">
              Pedir por WhatsApp
            </a>
            <Link href="/contacto/" className="btn-outline">Escribir por el formulario</Link>
            <Link href="/instant-quote/" className="btn-outline">Calcular precio con mi archivo</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
