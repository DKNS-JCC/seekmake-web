import Link from 'next/link';
import type { Metadata } from 'next';
import '../terminos/terminos.css';
import { CONTACTO, mailtoUrl, siteUrl } from '@/lib/contacto';

export const metadata: Metadata = {
  title: 'Política de Privacidad - 3DCC Salamanca',
  description:
    'Qué datos trata 3DCC Salamanca, para qué, con qué proveedores, cuánto tiempo se guardan y cómo ejercer tus derechos.',
  robots: { index: false, follow: true },
  alternates: { canonical: siteUrl('/privacidad/') }
};

export default function PrivacidadPage() {
  return (
    <>
      <nav id="navbar">
        <div className="nav-inner">
          <Link href="/" className="nav-logo">
            <img src="/icons/android-chrome-192x192.png" alt="" width={192} height={192} />
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
            Última actualización: 20 de octubre de 2026
          </p>

          <div className="terms-card">
            <h2>1. Responsable del tratamiento</h2>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              <li><strong>Titular:</strong> Jorge Cuadrado Criado ({CONTACTO.nombre})</li>
              <li>
                <strong>Email:</strong>{' '}
                <a href={mailtoUrl()}>{CONTACTO.email}</a>
              </li>
              <li>
                <strong>Teléfono / WhatsApp:</strong>{' '}
                <a href={`tel:${CONTACTO.telefonoTel}`}>{CONTACTO.telefono}</a>
              </li>
              <li><strong>Ubicación:</strong> Plza. Barrio Vidal, 37006 Salamanca, España</li>
            </ul>

            <h2>2. Datos que recogemos</h2>
            <ul>
              <li>
                <strong>Formulario de contacto:</strong> nombre, email, teléfono (opcional),
                el tipo de consulta, tu mensaje y los archivos que adjuntes.
              </li>
              <li>
                <strong>Calculadora de presupuesto:</strong> nombre, email, teléfono,
                dirección de envío si eliges envío, los archivos 3D que subes y la
                configuración de cada pieza (material, color, cantidad).
              </li>
              <li>
                <strong>Encargos y pagos:</strong> importes, fechas y método de pago
                (efectivo, Bizum o transferencia) para emitir justificantes. No
                guardamos datos de tarjetas ni de cuentas bancarias.
              </li>
              <li>
                <strong>Seguridad:</strong> un resumen cifrado (hash) de tu dirección IP
                al enviar un presupuesto, solo para frenar envíos masivos.
              </li>
              <li>
                <strong>Uso de la calculadora:</strong> eventos anónimos (por ejemplo,
                «archivo analizado» o «presupuesto enviado») con un identificador
                aleatorio que no te identifica, para saber qué pasos fallan.
              </li>
            </ul>
            <p>
              Si nos escribes por WhatsApp o Instagram, esa conversación se rige
              también por la política de privacidad de Meta.
            </p>

            <h2>3. Cookies y almacenamiento local</h2>
            <p>
              Una cookie es un pequeño archivo de texto que un sitio web almacena en
              tu navegador. Este sitio no usa cookies de publicidad ni de analítica.
              Solo guarda, en tu propio navegador:
            </p>
            <ul>
              <li>
                <strong>theme</strong> (almacenamiento local): si prefieres el modo
                claro u oscuro.
              </li>
            </ul>
            <p>
              Son estrictamente necesarias para lo que pides y no requieren
              consentimiento. La página de enlaces rápidos (/qr) muestra un mapa de
              Google Maps: al cargarlo, Google puede recibir tu IP y usar sus propias
              cookies según su{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
                política de privacidad
              </a>
              . Puedes borrar o bloquear las cookies desde la configuración de tu
              navegador.
            </p>

            <h2>4. Finalidades y base jurídica</h2>
            <ul>
              <li>
                <strong>Responder consultas, preparar presupuestos y realizar y enviar
                encargos.</strong> Base: ejecución del contrato o medidas
                precontractuales a petición tuya (art. 6.1.b RGPD).
              </li>
              <li>
                <strong>Emitir justificantes y cumplir obligaciones contables y
                fiscales.</strong> Base: obligación legal (art. 6.1.c RGPD).
              </li>
              <li>
                <strong>Proteger los formularios frente a abusos y mejorar la
                calculadora con datos anónimos.</strong> Base: interés legítimo
                (art. 6.1.f RGPD).
              </li>
            </ul>
            <p>No tomamos decisiones automatizadas ni elaboramos perfiles.</p>

            <h2>5. Destinatarios y transferencias internacionales</h2>
            <p>
              No vendemos ni cedemos tus datos. Los tratan, por cuenta nuestra y solo
              para prestar el servicio, estos proveedores:
            </p>
            <ul>
              <li>
                <strong>Supabase</strong>: base de datos, almacenamiento de archivos y
                funciones del servidor.
              </li>
              <li>
                <strong>Google (Gmail)</strong>: envío y recepción de los emails de
                contacto, presupuestos y justificantes.
              </li>
              <li>
                <strong>GitHub (GitHub Pages)</strong>: alojamiento de la web, que
                registra técnicamente las visitas (IP y navegador).
              </li>
              <li>
                <strong>Sendcloud y la empresa de mensajería</strong> que se elija, solo
                si el encargo se envía: nombre, dirección, teléfono y email de entrega.
              </li>
            </ul>
            <p>
              Algunos de estos proveedores pueden tratar datos en Estados Unidos. En ese
              caso, la transferencia se ampara en el Marco de Privacidad de Datos
              UE-EE. UU. o en las cláusulas contractuales tipo aprobadas por la
              Comisión Europea.
            </p>

            <h2>6. Plazo de conservación</h2>
            <ul>
              <li>
                <strong>Archivos 3D del presupuesto:</strong> se borran solos a las 48 h
                si no llegas a enviar el presupuesto, 30 días después de entregar o
                rechazar el encargo y, como máximo, a los 120 días.
              </li>
              <li>
                <strong>Consultas de contacto:</strong> el tiempo necesario para
                atenderlas.
              </li>
              <li>
                <strong>Encargos y justificantes de pago:</strong> mientras dure la
                relación y, después, los plazos legales aplicables (hasta seis años
                para la documentación contable, art. 30 del Código de Comercio).
              </li>
            </ul>

            <h2>7. Tus derechos</h2>
            <p>
              En cualquier momento puedes ejercer los derechos de acceso,
              rectificación, supresión, oposición, limitación y portabilidad
              escribiéndonos a{' '}
              <a href={mailtoUrl()}>{CONTACTO.email}</a>
              , acreditando tu identidad. Te responderemos en el plazo de un mes.
              Si crees que no hemos atendido bien tu solicitud, puedes reclamar ante la{' '}
              <a
                href="https://www.aepd.es"
                target="_blank"
                rel="noopener noreferrer"
              >
                Agencia Española de Protección de Datos
              </a>
              .
            </p>

            <h2>8. Modificaciones</h2>
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
