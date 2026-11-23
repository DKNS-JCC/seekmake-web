import type { Trabajo } from '@/lib/types';
import { parecidoUrl, srcSetDe } from '@/lib/trabajos';
import './trabajos-grid.css';

/** Cuadrícula de trabajos con foto y «Quiero uno parecido». Sin estado: vale en servidor y en cliente. */
export function TrabajosGrid({ trabajos }: { trabajos: Trabajo[] }) {
  return (
    <ul className="tg-grid">
      {trabajos.map((t) => (
        <li key={t.id} className="tg-card">
          <img
            className="tg-img"
            src={t.imagen}
            srcSet={srcSetDe(t.imagen)}
            sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 400px"
            alt={t.titulo}
            loading="lazy"
            decoding="async"
          />
          <div className="tg-body">
            <h3 className="tg-title">{t.titulo}</h3>
            {t.material && <p className="tg-material">{t.material}</p>}
            {t.descripcion?.trim() && <p className="tg-desc">{t.descripcion}</p>}
            <a className="tg-parecido" href={parecidoUrl(t)} target="_blank" rel="noopener noreferrer">
              Quiero uno parecido
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
