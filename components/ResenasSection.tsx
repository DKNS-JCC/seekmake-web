import type { ResenasData } from '@/lib/resenas';
import { CONTACTO } from '@/lib/contacto';
import './resenas.css';

const fechaCorta = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

// Sin widget ni JSON-LD de reseñas: Google no muestra estrellas de reseñas
// de un negocio sobre sí mismo, y el texto va en el HTML estático.
export function ResenasSection({ resenas, resumen }: ResenasData) {
  if (resenas.length === 0) return null;
  const media = resumen ? Number(resumen.media).toLocaleString('es-ES', { minimumFractionDigits: 1 }) : null;

  return (
    <section className="resenas-section" id="resenas">
      <div className="container-3dcc">
        <div className="section-header">
          <div className="section-tag">Reseñas en Google</div>
          <h2 className="section-title">Lo que nos dicen</h2>
          {resumen && (
            <p className="resenas-nota">
              <span className="resenas-media">{media}</span>
              <span aria-hidden="true" className="resenas-estrellas">{'★'.repeat(Math.round(Number(resumen.media)))}</span>
              <span>{resumen.total} reseñas en nuestra ficha</span>
            </p>
          )}
        </div>
        <ul className="resenas-lista">
          {resenas.map((r) => (
            <li key={r.id} className="resena">
              <p className="resena-texto">{r.texto}</p>
              <p className="resena-autor">
                {r.autor_visible}
                <span> · {fechaCorta(r.fecha)}</span>
              </p>
            </li>
          ))}
        </ul>
        <a href={CONTACTO.googleMaps} className="btn-outline" target="_blank" rel="noopener noreferrer">
          Ver todas en Google
        </a>
      </div>
    </section>
  );
}
