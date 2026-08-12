'use client';

import Link from 'next/link';
import { useFadeUp } from '@/components/useFadeUp';
import { WA_LINK } from '@/components/WhatsAppFAB';
import { TrabajosSection } from '@/components/TrabajosSection';
import { AdSlot } from '@/components/AdSlot';
import { ContactForm } from '@/app/(site)/contacto/ContactForm';
import '@/app/(site)/contacto/contacto.css';
import './page.css';
import { CONTACTO, mailtoUrl } from '@/lib/contacto';

export default function HomePage() {
  useFadeUp();

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section id="inicio">
        <div className="hero-left">
          <p className="hero-eyebrow">Salamanca · España · Envíos nacionales</p>
          <h1 className="hero-title">
            Impresión<span className="accent">3D</span>Profesional
          </h1>
          <p className="hero-desc">
            Convertimos tus ideas en realidad con precisión excepcional. Piezas a
            medida, prototipos y productos únicos para cualquier proyecto.
          </p>
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
              Calcular Precio
            </Link>
            <Link href="#contacto" className="btn-outline">
              Contactar
            </Link>
          </div>
          <div className="hero-stats">
            <div>
              <span className="stat-num">+100</span>
              <span className="stat-label">Proyectos completados</span>
            </div>
            <div>
              <span className="stat-num">20+</span>
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
          </div>
          <div className="services-grid">
            {[
              {
                title: 'Impresión Rápida',
                desc:
                  'Entrega express disponible para proyectos urgentes en Salamanca y alrededores',
                num: '01',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"
                  />
                )
              },
              {
                title: 'Amplia Variedad',
                desc:
                  'Múltiples colores y materiales para adaptarnos a tu proyecto específico',
                num: '02',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42"
                  />
                )
              },
              {
                title: 'Envío Nacional',
                desc:
                  'Servicio de envío seguro a toda España con seguimiento completo',
                num: '03',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1 0 9.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1 1 14.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                  />
                )
              },
              {
                title: 'Precio Instantáneo',
                desc:
                  'Sistema automático de cotización para conocer tu precio al instante',
                num: '04',
                icon: (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"
                  />
                )
              }
            ].map((s) => (
              <div key={s.num} className="service-card fade-up">
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
              </div>
            ))}
          </div>
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
      <TrabajosSection />

      {/* ── RESEÑAS ──────────────────────────────────────────── */}
      <section id="resenas">
        <div className="container-3dcc">
          <div className="section-header">
            <div className="section-tag">Opiniones</div>
            <h2 className="section-title">Lo que dicen nuestros clientes</h2>
            <p className="section-desc">
              Opiniones reales de quienes ya han confiado en nosotros.
            </p>
          </div>
          <div className="reviews-grid">
            {[
              {
                initial: 'M',
                name: 'Miguel R.',
                text:
                  '"Excelente calidad y rapidez. Las piezas quedaron perfectas, con gran nivel de detalle. Muy recomendable para cualquier proyecto de impresión 3D."'
              },
              {
                initial: 'L',
                name: 'Laura G.',
                text:
                  '"Muy contenta con el resultado. El trato fue muy cercano y me ayudó a elegir el mejor material para mi proyecto. Repetiré seguro."'
              },
              {
                initial: 'D',
                name: 'David P.',
                text:
                  '"Le pedí unos keycaps personalizados y quedaron increíbles. Envío rápido y bien embalado. Servicio 10/10."'
              }
            ].map((r) => (
              <div key={r.name} className="review-card fade-up">
                <div className="review-stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg
                      key={i}
                      width="16"
                      height="16"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  ))}
                </div>
                <p className="review-text">{r.text}</p>
                <div className="review-author">
                  <div className="review-avatar">{r.initial}</div>
                  <div>
                    <div className="review-name">{r.name}</div>
                    <div className="review-source">Google</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AD SLOT ─────────────────────────────────────────── */}
      <div className="container-3dcc" style={{ padding: '16px var(--container-px)' }}>
        <AdSlot slot="home-between-sections" format="horizontal" />
      </div>

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
                  href={WA_LINK}
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
