import type { Trabajo } from '@/lib/types';
import { TrabajosTimeline } from './TrabajosTimeline';

// Trabajos are fetched at build time in app/(site)/page.tsx; votes stay client-side in TrabajosTimeline.
export function TrabajosSection({ trabajos: items }: { trabajos: Trabajo[] }) {
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
