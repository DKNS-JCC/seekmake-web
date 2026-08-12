import Link from 'next/link';
import type { Metadata } from 'next';
import './impresoras.css';
import { siteUrl } from '@/lib/contacto';

export const metadata: Metadata = {
  title: 'Sobre nuestras impresoras - 3DCC Salamanca | Impresión 3D',
  description:
    'Conoce al equipo detrás de 3DCC Salamanca. Nuestras impresoras 3D trabajan sin descanso para convertir tus ideas en piezas reales con precisión profesional.',
  alternates: { canonical: siteUrl('/impresoras') },
  openGraph: {
    title: 'Sobre nuestras impresoras - 3DCC Salamanca',
    description:
      'Conoce al equipo de impresoras 3D de 3DCC Salamanca. Tecnología de precisión al servicio de tus ideas.',
    images: ['/images/main_banner.png'],
    locale: 'es_ES'
  }
};

interface Printer {
  name: string;
  brand: string;
  nick: string;
  desc: React.ReactNode;
  reverse?: boolean;
  collageClass: string;
  imgs: { main: string; close: string; sec: string; alts: [string, string, string] };
  specs: { val: string; label: string }[];
}

const PRINTERS: Printer[] = [
  {
    brand: 'Creality',
    name: 'K1 SE',
    nick: '"SE-XY"',
    desc: (
      <>
        Especialista en <strong>producción de alta velocidad</strong>. Cuando
        un pedido es urgente o necesita tiradas grandes, esta es la máquina
        que entra en acción. Su volumen de impresión y velocidad la hacen
        ideal para proyectos exigentes.
      </>
    ),
    collageClass: 'collage-a',
    imgs: {
      main: '/images/team/CrealityMain.jpg',
      close: '/images/team/CrealityCloseUp.jpg',
      sec: '/images/team/CrealitySecondary.jpg',
      alts: [
        'Creality K1 SE vista principal',
        'Creality K1 SE detalle extrusor',
        'Creality K1 SE en producción'
      ]
    },
    specs: [
      { val: '220³', label: 'Volumen (mm)' },
      { val: '600', label: 'Vel. mm/s' },
      { val: '0.08', label: 'Capa mín. mm' },
      { val: '300°', label: 'Temp. máx.' }
    ]
  },
  {
    brand: 'Anycubic',
    name: 'Kobra X',
    nick: '"La Multicolor"',
    reverse: true,
    desc: (
      <>
        Equipada con el sistema <strong>Ace Gen2 multicolor</strong>, esta
        máquina imprime hasta 4 colores/materiales en una sola pieza sin
        pausas. Ideal para proyectos que necesitan acabados llamativos y
        combinaciones de color imposibles en una impresora convencional.
      </>
    ),
    collageClass: 'collage-b',
    imgs: {
      main: '/images/team/KobraMain.jpg',
      close: '/images/team/KobraCloseUp.jpg',
      sec: '/images/team/KobraSecondary.jpg',
      alts: [
        'Anycubic Kobra X vista principal',
        'Anycubic Kobra X Ace Gen2 detalle',
        'Anycubic Kobra X extrusor'
      ]
    },
    specs: [
      { val: '220³', label: 'Volumen (mm)' },
      { val: '500', label: 'Vel. mm/s' },
      { val: '4', label: 'Colores' },
      { val: '300°', label: 'Temp. máx.' }
    ]
  },
  {
    brand: 'Prusa',
    name: 'Mini',
    nick: '"Pequeña pero matona"',
    desc: (
      <>
        Maestra del <strong>detalle fino</strong>. Cuando una pieza exige
        máxima calidad superficial y tolerancias ajustadas, la Prusa Mini es
        la elegida. Fiabilidad open-source con acabados que hablan por sí
        solos.
      </>
    ),
    collageClass: 'collage-c',
    imgs: {
      main: '/images/team/PrusaMain.jpg',
      close: '/images/team/PrusaCloseUp.jpg',
      sec: '/images/team/PrusaSecondary.jpg',
      alts: [
        'Prusa Mini vista principal',
        'Prusa Mini detalle hotend',
        'Prusa Mini en producción'
      ]
    },
    specs: [
      { val: '180³', label: 'Volumen (mm)' },
      { val: '200', label: 'Vel. mm/s' },
      { val: '0.1', label: 'Capa mín. mm' },
      { val: '280°', label: 'Temp. máx.' }
    ]
  }
];

export default function ImpresorasPage() {
  return (
    <>
      {/* HERO */}
      <section className="about-hero">
        <div className="container-3dcc about-hero-inner">
          <div className="section-tag">Sobre nosotros</div>
          <h1>
            Nuestro<br />
            <span className="accent">Equipo</span>
          </h1>
          <div className="slogan">Capa a capa, idea a realidad</div>
          <p className="about-intro-block">
            Aquí no hay oficinas ni cubículos — solo{' '}
            <strong>máquinas de precisión</strong> trabajando sin descanso.
            Nuestro taller en Salamanca combina velocidad y detalle para
            convertir cualquier archivo en una pieza real. Cada impresora
            tiene su personalidad, su especialidad y sus horas de vuelo.
          </p>
        </div>
      </section>

      {/* PRINTERS */}
      {PRINTERS.map((p) => (
        <section key={p.brand + p.name} className="printer-section">
          <div className="container-3dcc">
            <div
              className={'printer-layout' + (p.reverse ? ' reverse' : '')}
            >
              <div className={'printer-collage ' + p.collageClass}>
                <div className="collage-corner collage-corner-tl" />
                <div className="collage-corner collage-corner-br" />
                <div className="pc-img pc-main">
                  <img src={p.imgs.main} alt={p.imgs.alts[0]} loading="lazy" />
                </div>
                <div className="pc-img pc-close">
                  <img src={p.imgs.close} alt={p.imgs.alts[1]} loading="lazy" />
                </div>
                <div className="pc-img pc-sec">
                  <img src={p.imgs.sec} alt={p.imgs.alts[2]} loading="lazy" />
                </div>
              </div>
              <div className="printer-text">
                <div className="printer-eyebrow" />
                <div className="printer-name">
                  {p.brand}
                  <br />
                  {p.name}
                </div>
                <div className="printer-nick">{p.nick}</div>
                <p className="printer-desc">{p.desc}</p>
                <div className="spec-strip">
                  {p.specs.map((s) => (
                    <div key={s.label} className="spec-item">
                      <span className="spec-val">{s.val}</span>
                      <span className="spec-label">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* VALUES */}
      <section className="values-section">
        <div className="container-3dcc">
          <div className="section-header">
            <div className="section-tag">Cómo trabajamos</div>
            <h2 className="section-title">Nuestra Filosofía</h2>
          </div>
          <div className="values-grid">
            <div className="value-card">
              <span className="value-num">01</span>
              <svg className="value-icon" width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
              </svg>
              <h3 className="value-title">Precisión</h3>
              <p className="value-desc">
                Cada capa cuenta. Calibración constante y control de calidad
                en cada pieza que sale de nuestro taller.
              </p>
            </div>
            <div className="value-card">
              <span className="value-num">02</span>
              <svg className="value-icon" width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
              </svg>
              <h3 className="value-title">Rapidez</h3>
              <p className="value-desc">
                Optimizamos cada proceso para entregar tus piezas en el menor
                tiempo posible, sin sacrificar calidad.
              </p>
            </div>
            <div className="value-card">
              <span className="value-num">03</span>
              <svg className="value-icon" width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
              <h3 className="value-title">Cercanía</h3>
              <p className="value-desc">
                Trato directo y personalizado. Te asesoramos en cada paso,
                desde la elección del material hasta el acabado final.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="about-cta">
        <div className="container-3dcc">
          <div className="section-tag">¿Tienes un proyecto?</div>
          <h2>
            Ponemos nuestras<br />
            máquinas a trabajar
          </h2>
          <p>
            Sube tu archivo y recibe un presupuesto instantáneo. Sin
            compromiso.
          </p>
          <Link href="/instant-quote" className="btn-white">
            Calcular Precio{' '}
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>
    </>
  );
}
