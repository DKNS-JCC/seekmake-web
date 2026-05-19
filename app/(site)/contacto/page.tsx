import type { Metadata } from 'next';
import { ContactForm } from './ContactForm';
import './contacto.css';

export const metadata: Metadata = {
  title: 'Contacto | 3DCC Salamanca',
  description:
    'Contacta con 3DCC Salamanca: presupuestos personalizados, consultas y soporte sobre impresión 3D.',
  alternates: { canonical: 'https://impresion3dcc.com/contacto' }
};

const WA_LINK =
  'https://wa.me/34665148956?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20impresi%C3%B3n%203D';

export default function ContactoPage() {
  return (
    <main className="contacto-page">
      <div className="contacto-wrap">
        {/* ── Form ─────────────────────────────── */}
        <section>
          <header className="contacto-hero">
            <div className="section-tag">Contacto</div>
            <h1 className="section-title" style={{ marginTop: 8 }}>
              Hablemos
            </h1>
            <p className="section-desc" style={{ marginTop: 14 }}>
              Cuéntanos qué necesitas y te respondemos en menos de 24h.
            </p>
          </header>

          <ContactForm />
        </section>

        {/* ── Direct channels ──────────────────── */}
        <aside className="contacto-aside">
          <h3>Canales directos</h3>

          <div className="contacto-aside-item">
            <div className="contacto-aside-label">WhatsApp / Llamadas</div>
            <a href="tel:+34665148956">+34 665 14 89 56</a>
          </div>

          <div className="contacto-aside-item">
            <div className="contacto-aside-label">Email</div>
            <a href="mailto:impresion3dslmc@gmail.com">
              impresion3dslmc@gmail.com
            </a>
          </div>

          <div className="contacto-aside-item">
            <div className="contacto-aside-label">WhatsApp directo</div>
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
              Abrir conversación →
            </a>
          </div>

          <div className="contacto-aside-item">
            <div className="contacto-aside-label">Ubicación</div>
            <p style={{ color: 'var(--text)' }}>
              Plza. Barrio Vidal
              <br />
              Salamanca 37006, España
            </p>
          </div>

          <div className="contacto-aside-item">
            <div className="contacto-aside-label">Horario de respuesta</div>
            <p>Lun–Sáb, 09:00–21:00</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
