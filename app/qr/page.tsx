import type { Metadata } from 'next';
import Link from 'next/link';
import { QrFadeOnScroll } from './QrFadeOnScroll';
import { QrPedidoBanner } from './QrPedidoBanner';
import './qr.css';
import { CONTACTO, mailtoUrl, whatsappUrl } from '@/lib/contacto';

export const metadata: Metadata = {
  title: '3DCC Salamanca',
  description: 'Enlaces rápidos a 3DCC Salamanca.',
  robots: { index: false, follow: false }
};

const WA_QR =
  whatsappUrl('Hola! Acabo de escanear vuestro QR y me gustaría información sobre impresión 3D');
const WA_FAB =
  whatsappUrl('Hola! Acabo de escanear vuestro QR');
const REVIEW_URL = 'https://reviewthis.biz/3dcc';

// Filled-star path used many times.
const STAR_PATH =
  'M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z';

// Chevron used as a trailing affordance.
function Chevron({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      width={size}
      height={size}
      className="qr-chevron"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

export default function QrPage() {
  return (
    <>
      <QrFadeOnScroll />
      <main className="qr-page">
        <div className="qr-content">
          {/* Profile */}
          <section className="qr-profile qr-fade">
            <img
              src="/icons/android-chrome-512x512.png"
              alt="Logotipo de 3DCC, taller de impresión 3D en Salamanca"
              className="qr-avatar"
              width={512}
              height={512}
            />
            <h1 className="qr-name">3DCC Salamanca</h1>
            <p className="qr-tagline">Impresión 3D Profesional</p>
            <p className="qr-location">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                width={13}
                height={13}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              Salamanca, España
            </p>

            <div className="qr-stats">
              <div className="qr-stat">
                <div className="qr-stat-value">+100</div>
                <div className="qr-stat-label">Proyectos</div>
              </div>
              <div className="qr-stat">
                <div className="qr-stat-value">
                  5.0{' '}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={12} height={12}>
                    <path fillRule="evenodd" d={STAR_PATH} clipRule="evenodd" />
                  </svg>
                </div>
                <div className="qr-stat-label">Valoración</div>
              </div>
              <div className="qr-stat">
                <div className="qr-stat-value">&lt;24h</div>
                <div className="qr-stat-label">Respuesta</div>
              </div>
            </div>
          </section>

          {/* Order-scan greeting (only with ?de=pedido or ?codigo=...) */}
          <QrPedidoBanner />

          {/* Primary actions — what a scanner actually came to do */}
          <div className="qr-cta-row">
            <Link href="/instant-quote" className="qr-cta qr-cta--primary qr-fade">
              <div className="qr-cta-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={22} height={22}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              </div>
              <div className="qr-cta-body">
                <div className="qr-cta-title">Calcula tu precio al instante</div>
                <div className="qr-cta-sub">Sube tu pieza 3D y mira cuánto cuesta — sin registros</div>
              </div>
              <Chevron size={18} />
            </Link>
            <Link href="/presupuesto" className="qr-cta qr-fade">
              <div className="qr-cta-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={22} height={22}>
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
                </svg>
              </div>
              <div className="qr-cta-body">
                <div className="qr-cta-title">Seguir mi pedido</div>
                <div className="qr-cta-sub">Consulta el estado con tu código Q-…</div>
              </div>
              <Chevron size={18} />
            </Link>
          </div>

          {/* Review CTA */}
          <a
            href={REVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="qr-review-cta qr-fade"
          >
            <div className="qr-review-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={22} height={22}>
                <path fillRule="evenodd" d={STAR_PATH} clipRule="evenodd" />
              </svg>
            </div>
            <div className="qr-review-text">
              <div className="qr-review-title">Déjanos tu Reseña</div>
              <div className="qr-review-sub">Tu opinión nos ayuda a mejorar</div>
              <div className="qr-review-stars">
                {[0, 1, 2, 3, 4].map((i) => (
                  <svg key={i} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d={STAR_PATH} clipRule="evenodd" />
                  </svg>
                ))}
              </div>
            </div>
            <Chevron size={18} />
          </a>

          {/* Contact */}
          <div className="qr-label qr-fade">Contacto</div>
          <div className="qr-links">
            <a
              href={CONTACTO.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="qr-link qr-fade"
            >
              <div className="qr-link-icon qr-link-icon--ig">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
                </svg>
              </div>
              <div className="qr-link-body">
                <div className="qr-link-title">Instagram</div>
                <div className="qr-link-desc">@impresion3dcc</div>
              </div>
              <Chevron />
            </a>

            <a
              href={WA_QR}
              target="_blank"
              rel="noopener noreferrer"
              className="qr-link qr-fade"
            >
              <div className="qr-link-icon qr-link-icon--wa">
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div className="qr-link-body">
                <div className="qr-link-title">WhatsApp</div>
                <div className="qr-link-desc">Escríbenos directamente</div>
              </div>
              <Chevron />
            </a>

            <Link href="/" className="qr-link qr-fade">
              <div className="qr-link-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
              </div>
              <div className="qr-link-body">
                <div className="qr-link-title">Nuestra Web</div>
                <div className="qr-link-desc">{CONTACTO.dominio}</div>
              </div>
              <Chevron />
            </Link>

            <a href={`tel:${CONTACTO.telefonoTel}`} className="qr-link qr-fade">
              <div className="qr-link-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                </svg>
              </div>
              <div className="qr-link-body">
                <div className="qr-link-title">Llamar</div>
                <div className="qr-link-desc">{CONTACTO.telefono}</div>
              </div>
              <Chevron />
            </a>

            <a
              href={mailtoUrl('Consulta desde QR')}
              className="qr-link qr-fade"
            >
              <div className="qr-link-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              <div className="qr-link-body">
                <div className="qr-link-title">Email</div>
                <div className="qr-link-desc">{CONTACTO.email}</div>
              </div>
              <Chevron />
            </a>

            <a href="/3dcc.vcf" download="3DCC-Salamanca.vcf" className="qr-link qr-fade">
              <div className="qr-link-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                </svg>
              </div>
              <div className="qr-link-body">
                <div className="qr-link-title">Guardar contacto</div>
                <div className="qr-link-desc">Añade 3DCC a tu agenda en un toque</div>
              </div>
              <Chevron />
            </a>
          </div>

          {/* Gallery */}
          <div className="qr-label qr-fade">Trabajos</div>
          <div className="qr-gallery qr-fade">
            <div className="qr-gallery-item">
              <img
                src="/images/examples/corporativa.jpg"
                alt="Productos corporativos personalizados impresos en 3D"
                loading="lazy"
                decoding="async"
                width={2784}
                height={2784}
              />
            </div>
            <div className="qr-gallery-item">
              <img
                src="/images/examples/Decoracion.jpeg"
                alt="Pieza decorativa impresa en 3D"
                loading="lazy"
                decoding="async"
                width={2160}
                height={3840}
              />
            </div>
            <div className="qr-gallery-item">
              <img
                src="/images/examples/repuesto.png"
                alt="Pieza de repuesto fabricada con impresión 3D"
                loading="lazy"
                decoding="async"
                width={1059}
                height={847}
              />
            </div>
          </div>
          <Link href="/#trabajos" className="qr-gallery-more qr-fade">
            Ver todos los trabajos
            <Chevron size={14} />
          </Link>

          {/* Location */}
          <div className="qr-label qr-fade">Ubicación</div>
          <div className="qr-fade">
            <div className="qr-map-wrap">
              <iframe
                title="Mapa de 3DCC Salamanca"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1791.1667378222312!2d-5.667723599970071!3d40.973348043146466!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd3f2732fe5c056d%3A0x45e94ea09ec7db5a!2s3DCC%20%7C%20Impresi%C3%B3n%203D!5e0!3m2!1ses!2ses!4v1766766131244!5m2!1ses!2ses"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <a
              href={CONTACTO.googleMaps}
              target="_blank"
              rel="noopener noreferrer"
              className="qr-map-link"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
              </svg>
              Abrir en Google Maps
            </a>
          </div>

          {/* Bottom review CTA */}
          <div className="qr-review-bottom qr-fade">
            <p>¿Te hemos ayudado con tu proyecto?</p>
            <a
              href={REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="qr-review-btn"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d={STAR_PATH} clipRule="evenodd" />
              </svg>
              Dejar Reseña en Google
            </a>
          </div>

          <footer className="qr-footer">
            <p className="qr-footer-copy">&copy; 2026 3DCC Salamanca</p>
          </footer>
        </div>
      </main>

      <a
        href={WA_FAB}
        target="_blank"
        rel="noopener noreferrer"
        className="qr-wa-fab"
        aria-label="WhatsApp"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
    </>
  );
}
