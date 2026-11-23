'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { Trabajo } from '@/lib/types';
import { parecidoUrl, srcSetDe } from '@/lib/trabajos';
import './trabajos.css';

// Giro de cada foto, en grados: un patrón fijo para que no cambie al hidratar.
const GIROS = [-2, 1.4, -0.8, 2.2, -1.6, 0.6, 1.8, -2.4];

export function Album({ trabajos }: { trabajos: Trabajo[] }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [abierto, setAbierto] = useState<Trabajo | null>(null);

  const abrir = (t: Trabajo) => {
    setAbierto(t);
    dlg.current?.showModal();
  };

  return (
    <section className="al-section">
      <div className="container-3dcc">
        <ul className="al-album">
          {trabajos.map((t, i) => (
            <li key={t.id} style={{ '--giro': `${GIROS[i % GIROS.length]}deg` } as React.CSSProperties}>
              <button type="button" className="al-foto" onClick={() => abrir(t)}>
                <img
                  src={t.imagen}
                  srcSet={srcSetDe(t.imagen)}
                  sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 300px"
                  alt=""
                  loading={i < 4 ? 'eager' : 'lazy'}
                  decoding="async"
                />
                <span className="al-pie">{t.titulo}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="al-final">
          <p>¿Buscas algo que no está aquí? Casi todo lo que hacemos es a medida.</p>
          <Link href="/instant-quote/" className="btn-primary">Calcular precio</Link>
        </div>
      </div>

      {/* <dialog> nativo: foco, Escape y fondo los gestiona el navegador. */}
      <dialog
        ref={dlg}
        className="al-dialog"
        aria-label={abierto?.titulo}
        onClick={(e) => { if (e.target === e.currentTarget) dlg.current?.close(); }}
        onClose={() => setAbierto(null)}
      >
        {abierto && (
          <div className="al-dialog-in">
            <button type="button" className="al-cerrar" aria-label="Cerrar" onClick={() => dlg.current?.close()}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
            <img src={abierto.imagen} alt={abierto.titulo} />
            <div className="al-dialog-txt">
              <h2>{abierto.titulo}</h2>
              {abierto.material && <p className="al-material">{abierto.material}</p>}
              {abierto.descripcion?.trim() && <p>{abierto.descripcion}</p>}
              <div className="al-acciones">
                <a className="btn-primary" href={parecidoUrl(abierto)} target="_blank" rel="noopener noreferrer">
                  Quiero uno parecido
                </a>
                <button type="button" className="btn-outline" onClick={() => dlg.current?.close()}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
