'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { createClient } from '@/lib/supabase/client';
import type { Trabajo } from '@/lib/types';

// Legacy fallback used when Supabase isn't configured or empty. Keeps the
// section looking populated for first-time visitors.
const FALLBACK: Pick<Trabajo, 'titulo' | 'descripcion' | 'imagen'>[] = [
  {
    titulo: 'Productos Corporativos',
    descripcion: 'Detalles simples a medida',
    imagen: '/images/examples/corporativa.jpg'
  },
  {
    titulo: 'Figuras Decorativas',
    descripcion: 'Diseños personalizados y detallados',
    imagen: '/images/examples/Decoracion.jpeg'
  },
  {
    titulo: 'Repuestos y Recambios',
    descripcion: 'Soluciones a medida',
    imagen: '/images/examples/repuesto.png'
  }
];

export function TrabajosSection() {
  const [items, setItems] = useState<
    Array<Pick<Trabajo, 'titulo' | 'descripcion' | 'imagen'>>
  >(FALLBACK);

  const [emblaRef] = useEmblaCarousel({ loop: true, align: 'start' }, [
    Autoplay({ delay: 3500, stopOnInteraction: false })
  ]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return;
    const supabase = createClient();
    supabase
      .from('trabajos')
      .select('titulo, descripcion, imagen')
      .eq('destacado', true)
      .order('orden')
      .returns<Pick<Trabajo, 'titulo' | 'descripcion' | 'imagen'>[]>()
      .then(({ data }) => {
        if (data && data.length > 0) setItems(data);
      });
  }, []);

  return (
    <section id="trabajos">
      <div className="container-3dcc">
        <div className="section-header">
          <div className="section-tag">Portfolio</div>
          <h2 className="section-title">Algunos Trabajos</h2>
        </div>
      </div>
      <div className="embla" ref={emblaRef}>
        <div className="embla__container">
          {items.map((p, i) => (
            <div key={p.imagen + i} className="embla__slide">
              <div className="portfolio-item fade-up">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imagen} alt={p.titulo} loading="lazy" />
                <div className="portfolio-cap">
                  <div className="portfolio-title">{p.titulo}</div>
                  <div className="portfolio-sub">{p.descripcion}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        className="container-3dcc"
        style={{ textAlign: 'center', marginTop: 40 }}
      >
        <Link href="/trabajos" className="btn-outline">
          Ver todos los trabajos{' '}
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
  );
}
