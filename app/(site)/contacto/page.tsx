import type { Metadata } from 'next';
import { ContactForm } from './ContactForm';
import './contacto.css';
import { CONTACTO, mailtoUrl, siteUrl, whatsappUrl } from '@/lib/contacto';

export const metadata: Metadata = {
  title: 'Contacto: impresión 3D en Salamanca | 3DCC',
  description:
    'Contacta con 3DCC, taller de impresión 3D en Salamanca. Presupuestos por WhatsApp o email, recogida en mano en Salamanca y envíos a toda España.',
  alternates: { canonical: siteUrl('/contacto/') }
};

const WA_LINK =
  whatsappUrl('Hola, quiero información sobre impresión 3D');

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
          <h2>Canales directos</h2>

          <div className="contacto-aside-item">
            <div className="contacto-aside-label">WhatsApp / Llamadas</div>
            <a href={`tel:${CONTACTO.telefonoTel}`}>{CONTACTO.telefono}</a>
          </div>

          <div className="contacto-aside-item">
            <div className="contacto-aside-label">Email</div>
            <a href={mailtoUrl()}>
              {CONTACTO.email}
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
