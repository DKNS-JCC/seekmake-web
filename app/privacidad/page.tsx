import Link from 'next/link';
import type { Metadata } from 'next';
import '../terminos/terminos.css';
import { CONTACTO, mailtoUrl, siteUrl } from '@/lib/contacto';

export const metadata: Metadata = {
  title: 'Política de Privacidad - 3DCC Salamanca',
  description:
    'Política de privacidad y uso de cookies de 3DCC Salamanca, incluida la información sobre publicidad de Google AdSense.',
  robots: { index: true, follow: true },
  alternates: { canonical: siteUrl('/privacidad') }
};

export default function PrivacidadPage() {
  return (
    <>
      <nav id="navbar">
        <div className="nav-inner">
          <Link href="/" className="nav-logo">
            <img src="/icons/android-chrome-192x192.png" alt="3DCC Logo" width={192} height={192} />
            <div>
              <span className="nav-logo-name">3DCC</span>
              <span className="nav-logo-sub">Impresión 3D</span>
            </div>
          </Link>
          <Link href="/" className="back-link">
            ← Volver al inicio
          </Link>
        </div>
      </nav>

      <main id="main" className="terms-page">
        <div className="container-3dcc">
          <div className="section-tag">Legal</div>
          <h1 className="section-title">Política de Privacidad</h1>
          <p
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              color: 'var(--muted)',
              marginTop: 12,
              letterSpacing: '0.1em'
            }}
          >
            Última actualización: 14 de junio de 2026
          </p>

          <div className="terms-card">
            <h2>1. Responsable del tratamiento</h2>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              <li><strong>Titular:</strong> Jorge Cuadrado Criado</li>
              <li>
                <strong>Email:</strong>{' '}
                <a href={mailtoUrl()}>{CONTACTO.email}</a>
              </li>
              <li><strong>Ubicación:</strong> Salamanca, España</li>
            </ul>

            <h2>2. Datos que recogemos</h2>
            <p>
              Este sitio web recoge los siguientes tipos de información:
            </p>
            <ul>
              <li>
                <strong>Datos que tú nos facilitas</strong> al solicitar un presupuesto
                o contactar con nosotros: nombre, email, teléfono y dirección de envío.
              </li>
              <li>
                <strong>Datos de uso y navegación</strong> recogidos automáticamente
                por los servicios de terceros descritos en esta política (cookies
                analíticas y publicitarias).
              </li>
            </ul>

            <h2>3. Cookies</h2>
            <p>
              Una cookie es un pequeño archivo de texto que un sitio web almacena en
              tu navegador. Este sitio utiliza los siguientes tipos de cookies:
            </p>
            <ul>
              <li>
                <strong>Cookies estrictamente necesarias:</strong> permiten funciones
                básicas del sitio (p. ej., recuerdan tus votos en la galería de trabajos
                sin necesidad de cuenta). No requieren consentimiento.
              </li>
              <li>
                <strong>Cookies analíticas:</strong> usadas por Google para medir el
                tráfico y el comportamiento de los visitantes de forma agregada y
                anonimizada.
              </li>
              <li>
                <strong>Cookies publicitarias:</strong> usadas por Google AdSense para
                mostrar anuncios relevantes según tus intereses. Se describen en
                detalle en el apartado 5.
              </li>
            </ul>
            <p>
              Puedes gestionar o desactivar las cookies desde la configuración de tu
              navegador. Ten en cuenta que deshabilitar ciertas cookies puede afectar
              al funcionamiento del sitio.
            </p>

            <h2>4. Finalidades y base jurídica</h2>
            <ul>
              <li>
                <strong>Gestión de encargos y contacto</strong> — base: ejecución del
                contrato o medidas precontractuales (art. 6.1.b RGPD).
              </li>
              <li>
                <strong>Análisis de tráfico y mejora del sitio</strong> — base:
                interés legítimo (art. 6.1.f RGPD), siempre que los datos se traten
                de forma anonimizada y agregada.
              </li>
              <li>
                <strong>Publicidad personalizada (AdSense)</strong> — base:
                consentimiento del interesado (art. 6.1.a RGPD), gestionado a través
                del banner de cookies que aparece en la primera visita.
              </li>
            </ul>

            <h2>5. Publicidad de Google AdSense</h2>
            <p>
              Este sitio utiliza <strong>Google AdSense</strong>, un servicio de
              publicidad de Google LLC. Google puede usar cookies (incluida la cookie
              DoubleClick DART) para mostrar anuncios basados en tus visitas anteriores
              a este sitio y a otros sitios web.
            </p>
            <p>
              Google, como proveedor externo, utiliza cookies para publicar anuncios.
              El uso de la cookie DART permite a Google publicar anuncios a los usuarios
              en función de su visita a este sitio y a otros sitios de Internet.
            </p>
            <p>
              Puedes inhabilitar el uso de la cookie DART visitando la{' '}
              <a
                href="https://policies.google.com/technologies/ads"
                target="_blank"
                rel="noopener noreferrer"
              >
                Política de privacidad de la red de publicidad y contenido de Google
              </a>
              . También puedes gestionar tus preferencias publicitarias en{' '}
              <a
                href="https://adssettings.google.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                adssettings.google.com
              </a>
              .
            </p>
            <p>
              Los proveedores externos, incluido Google, usan cookies para publicar
              anuncios basándose en visitas anteriores de un usuario a este sitio web.
              Los usuarios pueden inhabilitar la publicidad personalizada accediendo a{' '}
              <a
                href="https://www.aboutads.info/choices/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Preferencias de anuncios
              </a>
              .
            </p>

            <h2>6. Destinatarios y transferencias internacionales</h2>
            <p>
              Los datos personales que nos facilitas directamente no se ceden a
              terceros salvo a las empresas de mensajería y pasarelas de pago
              estrictamente necesarias para la prestación del servicio.
            </p>
            <p>
              Google AdSense puede transferir datos fuera del Espacio Económico
              Europeo. Estas transferencias se amparan en las Cláusulas Contractuales
              Tipo aprobadas por la Comisión Europea y en el marco EU-US Data Privacy
              Framework. Consulta la{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Política de Privacidad de Google
              </a>{' '}
              para más información.
            </p>

            <h2>7. Plazo de conservación</h2>
            <p>
              Los datos relacionados con encargos se conservan durante la vigencia
              de la relación y, posteriormente, durante los plazos legales aplicables
              (mínimo 5 años a efectos fiscales). Las cookies publicitarias tienen
              el plazo establecido por Google, generalmente 13 meses.
            </p>

            <h2>8. Tus derechos</h2>
            <p>
              En cualquier momento puedes ejercer los derechos de acceso,
              rectificación, supresión, oposición, limitación y portabilidad
              escribiéndonos a{' '}
              <a href={mailtoUrl()}>{CONTACTO.email}</a>
              , acreditando tu identidad. También puedes reclamar ante la{' '}
              <a
                href="https://www.aepd.es"
                target="_blank"
                rel="noopener noreferrer"
              >
                Agencia Española de Protección de Datos
              </a>
              .
            </p>

            <h2>9. Modificaciones</h2>
            <p>
              Podemos actualizar esta política para reflejar cambios en la legislación
              o en los servicios que utilizamos. La fecha de "Última actualización"
              al inicio indica cuándo se realizó la revisión más reciente.
            </p>

            <div className="terms-footer">
              <p>
                <strong>— 3DCC Salamanca</strong>
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <span className="footer-copy">
            &copy; 2026 Impresión 3DCC Salamanca.
          </span>
          <span className="footer-copy">
            <Link href="/terminos" className="footer-link">
              Términos y Condiciones
            </Link>
            <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
            <Link href="/privacidad" className="footer-link">
              Política de Privacidad
            </Link>
          </span>
        </div>
      </footer>
    </>
  );
}
