'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  campanaActiva,
  diasEntre,
  fechaCorta,
  hoyMadrid,
  proximaFecha,
  type Plazas
} from '@/lib/campana-navidad';
import './impresora-navidad.css';

// "La Navidad se está imprimiendo": la campaña como la pantalla de la
// impresora. `hoy` llega del build para que el HTML estático ya diga algo
// cierto; al cargar se recalcula con la fecha del visitante.
export function ImpresoraNavidad({
  plazas,
  hoy: hoyBuild,
  variante
}: {
  plazas: Plazas | null;
  hoy: string;
  variante: 'banner' | 'pagina';
}) {
  const [hoy, setHoy] = useState(hoyBuild);
  useEffect(() => setHoy(hoyMadrid()), []);

  if (!campanaActiva(hoy)) return null;

  const prox = proximaFecha(hoy);
  const dias = prox ? diasEntre(hoy, prox.fecha) : 0;
  const libres = plazas ? Math.max(0, plazas.semana - plazas.ocupadas) : null;
  const pct = plazas && plazas.semana > 0 ? Math.round((plazas.ocupadas / plazas.semana) * 100) : null;

  const plazasTxt =
    libres === null ? null : libres === 0 ? 'Semana completa' : `Quedan ${libres} ${libres === 1 ? 'plaza' : 'plazas'} esta semana`;
  const fechaTxt = prox
    ? `${dias === 0 ? 'Último día' : dias === 1 ? 'Queda 1 día' : `Quedan ${dias} días`} · ${prox.texto}, hasta el ${fechaCorta(prox.fecha)}`
    : 'Ya no llegamos a Reyes con envío. Escríbenos y vemos qué se puede hacer.';

  const pantalla = (
    <>
      <span className="nv-cabecera">
        <span className="nv-led" aria-hidden="true" />
        Imprimiendo Navidad 2026
      </span>
      {pct !== null && (
        <span className="nv-progreso" aria-hidden="true">
          <span className="nv-barra"><span style={{ width: `${pct}%` }} /></span>
          <span className="nv-pct">{pct}%</span>
        </span>
      )}
      <span className="nv-datos">
        {plazasTxt && <span>{plazasTxt}</span>}
        <span>{fechaTxt}</span>
      </span>
    </>
  );

  if (variante === 'pagina') {
    return <div className="nv-pantalla nv-pantalla-pagina">{pantalla}</div>;
  }
  return (
    <Link href="/navidad/" className="nv-pantalla nv-banner">
      {pantalla}
      <span className="nv-cta">Ver regalos →</span>
    </Link>
  );
}
