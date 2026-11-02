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
const TITLE = 'Mini cofrades de Semana Santa personalizados en Salamanca | 3DCC';
const DESCRIPTION =
  'Mini cofrades de Semana Santa en Salamanca: mini nazarenos impresos en 3D con los colores de tu hermandad, en figura, capuchón para lápiz o boli y pin. Envío a toda España.';

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

// Habits of the Semana Santa de Salamanca brotherhoods (semanasantasa.com, semanasantasalamanca.info, 2026),
// mapped to the nearest picker colour: lienzo crudo/esparto/lana natural → crema, eminencia → morado.
// Jesús Amigo de los Niños (la Borriquilla) is left out: turbante, no capirote.
const PRESETS: Combinacion[] = [
  { nombre: 'Vera Cruz', capirote: 'celeste', cingulo: 'azul', tunica: 'blanco' },
  { nombre: 'Soledad', capirote: 'negro', cingulo: 'negro', tunica: 'negro' },
  { nombre: 'Jesús Rescatado', capirote: 'morado', cingulo: 'oro', tunica: 'morado' },
  { nombre: 'Jesús Nazareno', capirote: 'morado', cingulo: 'crema', tunica: 'morado' },
  { nombre: 'Cristo de la Agonía', capirote: 'morado', cingulo: 'morado', tunica: 'blanco' },
  { nombre: 'Dominicana', capirote: 'negro', cingulo: 'negro', tunica: 'crema' },
  { nombre: 'Dominicana · Piedad', capirote: 'rojo', cingulo: 'rojo', tunica: 'crema' },
  { nombre: 'Dominicana · Esperanza', capirote: 'verde', cingulo: 'verde', tunica: 'crema' },
  { nombre: 'Jesús del Perdón', capirote: 'rojo', cingulo: 'rojo', tunica: 'blanco' },
  { nombre: 'Universitaria', capirote: 'negro', cingulo: 'blanco', tunica: 'negro' },
  { nombre: 'Jesús Flagelado', capirote: 'morado', cingulo: 'morado', tunica: 'negro' },
  { nombre: 'Oración en el Huerto', capirote: 'verde', cingulo: 'verde', tunica: 'blanco' },
  { nombre: 'Amor y Paz', capirote: 'blanco', cingulo: 'crema', tunica: 'blanco' },
  { nombre: 'Cristo Yacente', capirote: 'blanco', cingulo: 'rojo', tunica: 'blanco' },
  { nombre: 'Silencio', capirote: 'rojo', cingulo: 'rojo', tunica: 'negro' },
  { nombre: 'Vía Crucis', capirote: 'blanco', cingulo: 'marrón', tunica: 'blanco' },
  { nombre: 'Jesús Despojado', capirote: 'granate', cingulo: 'granate', tunica: 'crema' },
  { nombre: 'Franciscana', capirote: 'marrón', cingulo: 'crema', tunica: 'marrón' },
  { nombre: 'Rosario', capirote: 'blanco', cingulo: 'blanco', tunica: 'blanco' }
];

// real photos of printed ones: examples of each format, and a bit of decoration under the picker
const FOTOS = [
  { file: 'mini-nazareno-figura', pie: 'Figura de pie', alt: 'Mini nazareno impreso en 3D con capirote morado y túnica negra sobre la mesa' },
  { file: 'mini-nazareno-capuchon-lapiz', pie: 'Capuchón de lápiz', alt: 'Capuchón de lápiz con forma de nazareno verde y negro' },
  { file: 'mini-nazarenos-lote-hermandad', pie: 'Lote para hermandad', alt: 'Lote de mini nazarenos impresos en 3D con capirotes de muchos colores' },
  { file: 'mini-nazareno-procesion-salamanca', pie: 'En la procesión', alt: 'Mini nazareno en la mano durante una procesión de Semana Santa en Salamanca' }
];

const FAQ = [
  { q: '¿Podéis hacer el nazareno con los colores de mi hermandad?', a: 'Sí. Las hermandades de Salamanca ya están arriba con su hábito; si es otra, elige los colores del capirote, el cíngulo y la túnica o mándanos una foto del hábito por WhatsApp, y lo imprimimos con esa combinación.' },
  { q: '¿Qué formatos hay?', a: 'Es el mismo mini nazareno en cuatro versiones: figura de pie, capuchón para lápiz, capuchón para boli y pin de solapa con aguja detrás.' },
  { q: '¿El color se desgasta?', a: 'No. Cada parte se imprime en PLA de su color, sin pintar, así que el color va en el propio plástico y no se descascarilla con el uso.' },
  { q: '¿Puedo pedir un solo mini cofrade?', a: 'Sí, hacemos mini cofrades sueltos para regalar y también lotes para hermandades y cofradías.' },
  { q: '¿Hacéis precio para lotes de hermandad?', a: 'Sí. Cuantas más unidades, mejor sale cada uno. Escríbenos con el número de nazarenos, los colores y la fecha y te pasamos presupuesto.' },
  { q: '¿Cuándo tengo que pedirlos?', a: 'En Cuaresma se juntan los encargos, así que mejor con unas semanas de margen antes de Semana Santa, sobre todo si es un lote. Fuera de temporada también los hacemos.' },
  { q: '¿Enviáis fuera de Salamanca?', a: 'Sí, enviamos por mensajería a toda España: Zamora, Valladolid, León, Sevilla, Málaga, Granada, Córdoba, Murcia y cualquier otra ciudad. En Salamanca puedes recogerlos en mano en la zona del Barrio Vidal, sin gastos de envío.' }
];

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Servicios', item: siteUrl('/servicios/') },
      { '@type': 'ListItem', position: 3, name: 'Mini cofrades de Semana Santa', item: URL }
    ]
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Mini cofrades de Semana Santa personalizados',
    description: DESCRIPTION,
    url: URL,
    image: [
      siteUrl(`${IMG}nazareno-rojo-negro-grande.webp`),
      siteUrl(`${IMG}nazareno-morado-blanco-grande.webp`),
      ...FOTOS.map((f) => siteUrl(`${IMG}${f.file}.webp`))
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
          <div className="section-tag">Mini cofrades · Salamanca</div>
          <h1 className="ss-h1">
            Mini cofrades de Semana Santa <span className="accent">con tus colores</span>
          </h1>
          <p className="ss-lead">
            Toca un color para el capirote, el cíngulo y la túnica. Cuando te guste,
            pulsa <strong>Pedir esta combinación</strong> y nos llega por WhatsApp.
            Hechos en Salamanca, con envío a toda España.
          </p>
          <ColorPicker presets={PRESETS} filamentos={filamentos} colores={colores} />
          <p className="ss-picker-note">
            Los colores de la pantalla son orientativos. Antes de imprimir te mandamos una foto real.
          </p>

          <section className="ss-galeria" aria-labelledby="ss-galeria-titulo">
            <p id="ss-galeria-titulo" className="ss-row-title">Así quedan impresos</p>
            <div className="ss-fotos">
              {FOTOS.map((f) => (
                <figure key={f.file} className="ss-foto">
                  <img src={`${IMG}${f.file}.webp`} alt={f.alt} width={800} height={1000} loading="lazy" decoding="async" />
                  <figcaption>{f.pie}</figcaption>
                </figure>
              ))}
            </div>
          </section>

          {/* SEO copy, folded: indexed by Google but out of the way of the picker */}
          <details className="ss-info">
            <summary>Más información: formatos, envíos y preguntas frecuentes</summary>
            <h2>Mini cofrades y figuritas de Semana Santa personalizadas en Salamanca</h2>
            <p>
              Imprimimos en 3D mini cofrades, mini nazarenos con los colores de tu hermandad o cofradía en nuestro taller de
              Salamanca capital: capirote, cíngulo y túnica, cada parte en PLA de su color, sin pintar.
              Los hacemos como figura de pie para la estantería o la vitrina, como capuchón de lápiz o de
              boli, y como pin de solapa para llevarlo toda la Semana Santa.
            </p>
            <p>
              Valen tanto para regalar uno suelto como para lotes de hermandades y cofradías de la
              Semana Santa de Salamanca, declarada de Interés Turístico Internacional, y de los pueblos
              de la provincia. Si eres de aquí los recoges en mano; si no, te los enviamos a toda España.
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
