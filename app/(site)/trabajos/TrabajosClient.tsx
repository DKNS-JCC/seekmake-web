'use client';

import { useState, useEffect } from 'react';
import type { Trabajo } from '@/lib/types';
import './trabajos.css';

export function TrabajosClient({ trabajos }: { trabajos: Trabajo[] }) {
  const [selected, setSelected] = useState<Trabajo | null>(null);

  // Close modal with Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="tr-page fade-up">
      <div className="tr-hero">
        <h1 className="bebas" style={{ fontSize: 52, margin: '0 0 16px' }}>
          Nuestros Trabajos
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 16, lineHeight: 1.6 }}>
          Explora nuestra galería de proyectos de impresión 3D a medida. 
          Desde piezas técnicas y prototipos hasta figuras decorativas y funcionales.
        </p>
      </div>

      <div className="tr-grid">
        {trabajos.length === 0 && (
          <div className="tr-empty" style={{ gridColumn: '1 / -1' }}>
            No hay trabajos publicados aún.
          </div>
        )}
        
        {trabajos.map((t) => (
          <div key={t.id} className="tr-card" onClick={() => setSelected(t)}>
            <div className="tr-card-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.imagen} alt={t.titulo} loading="lazy" />
            </div>
            <div className="tr-card-body">
              <div className="tr-card-title">{t.titulo}</div>
              <div className="tr-card-desc">{t.descripcion}</div>
              
              {(t.material || (t.etiquetas && t.etiquetas.length > 0)) && (
                <div className="tr-card-meta">
                  {t.material && <span className="tr-card-material">{t.material}</span>}
                  {t.etiquetas?.map((et) => (
                    <span key={et} className="tr-card-tag">{et}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div 
        className={`tr-modal-overlay ${selected ? 'open' : ''}`} 
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}
      >
        {selected && (
          <div className="tr-modal">
            <div className="tr-modal-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.imagen} alt={selected.titulo} />
            </div>
            <div className="tr-modal-body">
              <button 
                className="tr-modal-close" 
                onClick={() => setSelected(null)}
                aria-label="Cerrar"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="tr-modal-title">{selected.titulo}</div>
              <div className="tr-modal-desc" style={{ whiteSpace: 'pre-wrap' }}>
                {selected.descripcion}
              </div>
              
              {(selected.material || (selected.etiquetas && selected.etiquetas.length > 0)) && (
                <div className="tr-card-meta" style={{ marginBottom: 20 }}>
                  {selected.material && (
                    <span className="tr-card-material">{selected.material}</span>
                  )}
                  {selected.etiquetas?.map((et) => (
                    <span key={et} className="tr-card-tag">{et}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}