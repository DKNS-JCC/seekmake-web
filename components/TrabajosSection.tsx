'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Trabajo } from '@/lib/types';
import { TrabajosTimeline } from './TrabajosTimeline';

export function TrabajosSection() {
  const [items, setItems] = useState<Trabajo[]>([]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return;
    const supabase = createClient();
    supabase
      .from('trabajos')
      .select('*')
      .order('fecha_efectiva', { ascending: false })
      .then(({ data }) => {
        if (data) setItems(data);
      });
  }, []);

  if (items.length === 0) return null;

  return (
    <section id="trabajos">
      <div className="container-3dcc">
        <div className="section-header">
          <div className="section-tag">Portfolio</div>
          <h2 className="section-title">Nuestros Trabajos</h2>
          <p className="section-desc">
            Línea temporal completa: desliza para recorrer cronológicamente
            los proyectos que hemos hecho. Vota los que más te gusten.
          </p>
        </div>
      </div>

      <TrabajosTimeline trabajos={items} autoScroll />
    </section>
  );
}
