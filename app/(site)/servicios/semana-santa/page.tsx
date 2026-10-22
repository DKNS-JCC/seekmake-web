import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient as createServerClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';
import '@/components/faq.css';
import './semana-santa.css';
import { siteUrl } from '@/lib/contacto';
import { ColorPicker, type Combinacion } from './ColorPicker';

const IMG = '/images/semana-santa/';
const URL = siteUrl('/servicios/semana-santa/');
const TITLE = 'Figuritas de Semana Santa personalizadas en Salamanca | 3DCC';
const DESCRIPTION =
  'Figuritas de Semana Santa personalizadas en Salamanca: mini nazarenos con los colores de tu hermandad, en figura, capuchón para lápiz o boli y pin. Envío a toda España.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    images: [`${IMG}nazareno-morado-blanco-grande.webp`],
    locale: 'es_ES'
  }
};

const PRESETS: Combinacion[] = [
  { file: 'nazareno-rojo-negro', capirote: 'rojo', cingulo: 'rojo', tunica: 'negro', alt: 'Mini nazareno con capirote rojo y túnica negra' },
  { file: 'nazareno-morado-blanco', capirote: 'morado', cingulo: 'morado', tunica: 'blanco', alt: 'Figurita de Semana Santa: nazareno con capirote morado y túnica blanca' },
  { file: 'nazareno-verde-blanco', capirote: 'verde', cingulo: 'verde', tunica: 'blanco', alt: 'Nazarenito de la Esperanza con capirote verde y túnica blanca' },
  { file: 'nazareno-blanco-negro', capirote: 'blanco', cingulo: 'blanco', tunica: 'negro', alt: 'Mini cofrade con capirote blanco y túnica negra' },
  { file: 'nazareno-morado-oro', capirote: 'morado', cingulo: 'oro', tunica: 'morado', alt: 'Nazareno en miniatura morado con cíngulo dorado' },
  { file: 'nazareno-negro-oro', capirote: 'negro', cingulo: 'oro', tunica: 'negro', alt: 'Mini nazareno negro con cíngulo dorado' },
  { file: 'nazareno-azul-blanco', capirote: 'azul marino', cingulo: 'azul marino', tunica: 'blanco', alt: 'Figurita cofrade con capirote azul marino y túnica blanca' },
  { file: 'nazareno-granate-crema', capirote: 'granate', cingulo: 'granate', tunica: 'crema', alt: 'Mini nazareno con capirote granate y túnica crema' }
];

const FAQ = [
  { q: '¿Podéis hacer el nazareno con los colores de mi hermandad?', a: 'Sí. Elige arriba los colores del capirote, el cíngulo y la túnica, o mándame una foto del hábito por WhatsApp, y lo imprimo con esa combinación.' },
  { q: '¿Qué formatos hay?', a: 'Es el mismo mini nazareno en cuatro versiones: figura de pie, capuchón para lápiz, capuchón para boli y pin de solapa con aguja detrás.' },
  { q: '¿El color se desgasta?', a: 'No. Cada parte se imprime en PLA de su color, sin pintar, así que el color va en el propio plástico y no se descascarilla con el uso.' },
  { q: '¿Puedo pedir uno solo?', a: 'Sí, hago nazarenitos sueltos para regalar y también lotes para hermandades y cofradías.' },
  { q: '¿Hacéis precio para lotes de hermandad?', a: 'Sí. Cuantas más unidades, mejor sale cada uno. Escríbeme con el número de nazarenos, los colores y la fecha y te paso presupuesto.' },
  { q: '¿Cuándo tengo que pedirlos?', a: 'En Cuaresma se juntan los encargos, así que mejor con unas semanas de margen antes de Semana Santa, sobre todo si es un lote. Fuera de temporada también los hago.' },
  { q: '¿Enviáis fuera de Salamanca?', a: 'Sí, envío por mensajería a toda España: Zamora, Valladolid, León, Sevilla, Málaga, Granada, Córdoba, Murcia y cualquier otra ciudad. En Salamanca puedes recogerlos en mano en la zona del Barrio Vidal, sin gastos de envío.' }
];

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Servicios', item: siteUrl('/servicios/') },
      { '@type': 'ListItem', position: 3, name: 'Figuritas de Semana Santa personalizadas', item: URL }
    ]
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Figuritas de Semana Santa personalizadas',
    description: DESCRIPTION,
    url: URL,
    image: [
      siteUrl(`${IMG}nazareno-rojo-negro-grande.webp`),
      siteUrl(`${IMG}nazareno-morado-blanco-grande.webp`),
      siteUrl(`${IMG}mini-nazareno-procesion-salamanca.webp`),
      siteUrl(`${IMG}mini-nazareno-capuchon-lapiz.webp`)
    ],
    provider: { '@id': siteUrl('/#business') },
    areaServed: [
      { '@type': 'City', name: 'Salamanca' },
      { '@type': 'Country', name: 'España' }
    ]
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  }
];

// Static export: the muestrario's colours are fetched at build time (same as /muestrario/);
// ColorPicker refreshes them live. Without Supabase env the picker keeps the cofradía set only.
async function loadData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { filamentos: [], colores: [] };
  }
  return buildSafe(async () => {
    const supabase = createServerClient<Database>(url, key);
    const [{ data: filamentos, error: e1 }, { data: colores, error: e2 }] = await Promise.all([
      supabase.from('filamentos').select('*').order('orden'),
      supabase.from('colores').select('*').order('orden')
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    return { filamentos: filamentos ?? [], colores: colores ?? [] };
  }, { filamentos: [], colores: [] });
}

export default async function SemanaSantaPage() {
  const { filamentos, colores } = await loadData();
  return (
    <main id="inicio">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="ss-hero">
        <div className="container-3dcc">
          <div className="section-tag">Figuritas cofrades · Salamanca</div>
          <h1 className="ss-h1">
            Mini nazarenos de Semana Santa <span className="accent">con tus colores</span>
          </h1>
          <p className="ss-lead">
            Toca un color para el capirote, el cíngulo y la túnica. Cuando te guste,
            pulsa <strong>Pedir esta combinación</strong> y me llega por WhatsApp.
            Hechos en Salamanca, con envío a toda España.
          </p>
          <ColorPicker presets={PRESETS} filamentos={filamentos} colores={colores} />
          <p className="ss-picker-note">
            Los colores de la pantalla son orientativos. Antes de imprimir te mando una foto real.
          </p>

          {/* SEO copy, folded: indexed by Google but out of the way of the picker */}
          <details className="ss-info">
            <summary>Más información: formatos, envíos y preguntas frecuentes</summary>
            <h2>Figuritas de Semana Santa personalizadas en Salamanca</h2>
            <p>
              Imprimo en 3D mini nazarenos con los colores de tu hermandad o cofradía en mi taller de
              Salamanca capital: capirote, cíngulo y túnica, cada parte en PLA de su color, sin pintar.
              Los hago como figura de pie para la estantería o la vitrina, como capuchón de lápiz o de
              boli, y como pin de solapa para llevarlo toda la Semana Santa.
            </p>
            <p>
              Valen tanto para regalar uno suelto como para lotes de hermandades y cofradías de la
              Semana Santa de Salamanca, declarada de Interés Turístico Internacional, y de los pueblos
              de la provincia. Si eres de aquí los recoges en mano; si no, te los envío a toda España.
              Si el color de tu hermandad no está arriba, búscalo en el{' '}
              <Link href="/muestrario/">muestrario de colores</Link>.
            </p>
            <h2>Preguntas frecuentes</h2>
            <div className="faq-list">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="faq-item">
                  <summary className="faq-q">{q}</summary>
                  <p className="faq-a">{a}</p>
                </details>
              ))}
            </div>
          </details>
        </div>
      </section>
    </main>
  );
}
