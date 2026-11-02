'use client';

import Link from 'next/link';
import { useFadeUp } from '@/components/useFadeUp';
import { TrabajosSection } from '@/components/TrabajosSection';
import { FaqSection } from '@/components/FaqSection';
import { ResenasSection } from '@/components/ResenasSection';
import type { ResenasData } from '@/lib/resenas';
import { ImpresoraNavidad } from '@/components/ImpresoraNavidad';
import type { Plazas } from '@/lib/campana-navidad';
import { ContactForm } from '@/app/(site)/contacto/ContactForm';
import '@/app/(site)/contacto/contacto.css';
import './page.css';
import { CONTACTO, mailtoUrl, whatsappUrl } from '@/lib/contacto';
import type { Trabajo } from '@/lib/types';

export function HomeClient({
  trabajos,
  resenas,
  plazas,
  hoy
}: {
  trabajos: Trabajo[];
  resenas: ResenasData;
  plazas: Plazas | null;
  hoy: string;
}) {
  useFadeUp();

  return (
    <>
      {/* Campaña de Navidad: se oculta sola después de Reyes. */}
      <ImpresoraNavidad plazas={plazas} hoy={hoy} variante="banner" />

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section id="inicio">
        <div className="hero-left">
          <p className="hero-eyebrow">Salamanca · España · Envíos nacionales</p>
          <h1 className="hero-title">
            Impresión{' '}<span className="accent">3D</span>{' '}a medida
          </h1>
          <p className="hero-desc">
            Taller de impresión 3D en Salamanca con envíos a toda España: regalos
            personalizados, repuestos imposibles y piezas técnicas, con precio al instante.
          </p>
          {/* El tasador va en azul; WhatsApp ya está siempre a mano en el botón flotante. */}
          <div className="hero-actions">
            <Link href="/instant-quote" className="btn-primary">
              <svg
                width="15"
                height="15"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>{' '}
              Calcular precio
            </Link>
            <a
              href={whatsappUrl('Hola, os mando una foto de lo que quiero imprimir.')}
              className="btn-outline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Pedir por WhatsApp
            </a>
            <Link href="#contacto" className="btn-outline">
              Contáctanos
            </Link>
          </div>
          <div className="hero-stats">
            <div>
              <span className="stat-num">+100</span>
              <span className="stat-label">Proyectos completados</span>
            </div>
            <div>
              <span className="stat-num">30+</span>
              <span className="stat-label">Colores disponibles</span>
            </div>
            <div>
              <span className="stat-num">ES</span>
              <span className="stat-label">Envíos nac.</span>
            </div>
          </div>
        </div>
        <div className="hero-right">
          <div className="hero-grid" />
          {/*
            Above the fold and the LCP element — never lazy-load this one.

            The source PNG is 952 KiB, which was the whole reason LCP sat at
            7.3s on a throttled 4G phone. AVIF gets the same frame down to
            21 KiB. Order matters: the browser takes the first <source> whose
            type it understands, so AVIF must precede WebP, and the PNG stays
            as the fallback for anything that supports neither.

            `sizes` mirrors page.css: one column below 900px, two equal columns
            above it. Without it the browser assumes 100vw and over-fetches.
          */}
          <picture>
            <source
              type="image/avif"
              sizes="(max-width: 900px) 100vw, 50vw"
              srcSet="/images/main_banner-768.avif 768w, /images/main_banner-1536.avif 1536w"
            />
            <source
              type="image/webp"
              sizes="(max-width: 900px) 100vw, 50vw"
              srcSet="/images/main_banner-768.webp 768w, /images/main_banner-1536.webp 1536w"
            />
            <img
              src="/images/main_banner.png"
              alt="Impresión 3D profesional Salamanca"
              className="hero-img"
              width={1536}
              height={1024}
              fetchPriority="high"
              decoding="async"
            />
          </picture>
          <div className="hero-img-mask" />
        </div>
        <div className="scroll-hint">
          <div className="scroll-line" />
          Imprimiendo ideas
        </div>
      </section>

      {/* ── SERVICIOS ────────────────────────────────────────── */}
      <section id="servicios">
        <div className="container-3dcc">
          <div className="section-header">
            <div className="section-tag">Qué ofrecemos</div>
            <h2 className="section-title">Nuestros Servicios</h2>
            <p className="section-desc">
              Recogida en Salamanca capital y envío a toda la provincia:{' '}
              <Link href="/impresion-3d-salamanca-provincia/" className="footer-link">impresión 3D en Salamanca y provincia</Link>.
            </p>
          </div>
          <div className="services-grid">
            {[
              {
                title: 'Regalos',
                desc: 'Figuras desde tu foto, litofanías y detalles con nombre.',
                href: '/catalogo/',
                num: '01',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1 0 9.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1 1 14.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                  />
                )
              },
              {
                title: 'Trofeos y medallas',
                desc: 'Para clubes, colegios y asociaciones, con vuestro diseño y desde pocas unidades.',
                href: whatsappUrl('Hola, queremos trofeos o medallas para un grupo.'),
                num: '02',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0"
                  />
                )
              },
              {
                title: 'Repuestos',
                desc: 'La pieza que ya no se fabrica, a partir de la rota o de unas medidas.',
                href: '/servicios/repuestos-impresion-3d/',
                num: '03',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75a4.5 4.5 0 0 1-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 1 1-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 0 1 6.336-4.486l-3.276 3.276a3.004 3.004 0 0 0 2.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852Z"
                  />
                )
              },
              {
                title: 'Diseño a medida',
                desc: 'Si no hay archivo, lo diseñamos nosotros a partir de tu idea.',
                href: '/servicios/diseno-3d-a-medida/',
                num: '04',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                  />
                )
              }
            ].map((s) => (
              <a key={s.num} href={s.href} className="service-card fade-up"
                {...(s.href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                <svg
                  className="service-icon"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  {s.icon}
                </svg>
                <h3 className="service-title">{s.title}</h3>
                <p className="service-desc">{s.desc}</p>
                <span className="service-num">{s.num}</span>
              </a>
            ))}
          </div>
          <Link href="/servicios/" className="btn-outline" style={{ marginTop: 32 }}>
            Ver servicios
          </Link>
        </div>
      </section>

      {/* ── MUESTRARIO PREVIEW ───────────────────────────────── */}
      <section id="muestrario">
        <div className="container-3dcc">
          <div className="section-header">
            <div className="section-tag">Materiales y Colores</div>
            <h2 className="section-title">Muestrario</h2>
            <p className="section-desc">
              Amplia gama de colores y acabados. Visita el muestrario completo
              para ver todas las opciones.
            </p>
          </div>
          <div className="colors-row">
            {[
              '#1a1a1a',
              '#ffffff',
              '#e74c3c',
              '#3498db',
              '#2ecc71',
              '#f39c12',
              '#9b59b6',
              '#e91e63'
            ].map((c) => (
              <div
                key={c}
                className="swatch"
                style={{
                  background: c,
                  outline: c === '#ffffff' ? '1px solid var(--border)' : undefined
                }}
              />
            ))}
          </div>
          <Link href="/muestrario" className="btn-outline">
            Ver Muestrario Completo{' '}
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── TRABAJOS ─────────────────────────────────────────── */}
      <TrabajosSection trabajos={trabajos} />

      <ResenasSection {...resenas} />

      {/* ── PRESUPUESTO CTA ─────────────────────────────────── */}
      <section id="presupuesto">
        <div className="container-3dcc" style={{ position: 'relative', zIndex: 1 }}>
          <div className="section-tag">Calculadora online</div>
          <h2 className="section-title">
            ¿Cuánto cuesta
            <br />
            tu idea?
          </h2>
          <p className="section-desc">
            Sistema automático de cotización. Sube tu archivo y recibe tu precio
            en segundos.
          </p>
          <Link href="/instant-quote" className="btn-white">
            Calcular Precio Ahora{' '}
            <svg
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      <FaqSection />

      {/* ── CONTACTO ─────────────────────────────────────────── */}
      <section id="contacto">
        <div className="container-3dcc">
          <div className="section-header">
            <div className="section-tag">Habla con nosotros</div>
            <h2 className="section-title">Contacto</h2>
          </div>
          <div className="contact-grid">
            <div className="contact-form-container">
              <ContactForm />
            </div>
            <div>
              <div className="contact-item fade-up">
                <div className="contact-icon">
                  <svg
                    width="20"
                    height="20"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="contact-label">WhatsApp / Llamadas</div>
                  <a href={`tel:${CONTACTO.telefonoTel}`} className="contact-value">
                    {CONTACTO.telefono}
                  </a>
                </div>
              </div>
              <div className="contact-item fade-up">
                <div className="contact-icon">
                  <svg
                    width="20"
                    height="20"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                    />
                  </svg>
                </div>
                <div>
                  <div className="contact-label">Email</div>
                  <a
                    href={mailtoUrl()}
                    className="contact-value"
                  >
                    {CONTACTO.email}
                  </a>
                </div>
              </div>
              <div className="contact-item fade-up">
                <div className="contact-icon">
                  <svg
                    width="20"
                    height="20"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="contact-label">Ubicación</div>
                  <span className="contact-value">
                    Plza. Barrio Vidal, Salamanca 37006
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: '2rem' }}>
                <a href={`tel:${CONTACTO.telefonoTel}`} className="cbtn cbtn-border">
                  <svg
                    width="18"
                    height="18"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                    />
                  </svg>{' '}
                  Llamar
                </a>
                <a
                  href={whatsappUrl('Hola, quiero pedir algo impreso en 3D.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cbtn cbtn-wa"
                >
                  <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>{' '}
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
