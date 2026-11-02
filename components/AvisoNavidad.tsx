'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { campanaActiva, fechaMinima, hoyMadrid, proximaFecha, type Plazas } from '@/lib/campana-navidad';
import './aviso-navidad.css';

// Barra fina de campaña: un mensaje, una fecha concreta y un enlace. Sin
// cuentas atrás ni adornos. Las plazas solo salen cuando quedan pocas, que
// es cuando la escasez es verdad. `hoy` viene del build para que el HTML
// estático ya sea correcto; al cargar se recalcula con la fecha real.
const POCAS_PLAZAS = 5;

// Un abeto como sale de la impresora: capas de PLA apiladas, con el
// escalonado de los bordes a la vista. 12 capas de 1,5 px.
const CAPAS = Array.from({ length: 12 }, (_, i) => 4 + i * 1.5);

function Abeto() {
  return (
    <svg className="aviso-navidad-abeto" width="22" height="34" viewBox="0 0 22 34" aria-hidden="true">
      <polygon className="estrella" points="11,0 12.4,3.1 15.8,3.3 13.2,5.4 14,8.7 11,6.9 8,8.7 8.8,5.4 6.2,3.3 9.6,3.1" />
      {CAPAS.map((ancho, i) => (
        <rect key={i} x={(22 - ancho) / 2} y={9 + i * 1.8} width={ancho} height={1.5} />
      ))}
      <rect className="tronco" x={9} y={30.6} width={4} height={3.4} />
    </svg>
  );
}

export function AvisoNavidad({ plazas, hoy: hoyBuild }: { plazas: Plazas | null; hoy: string }) {
  const [hoy, setHoy] = useState(hoyBuild);
  useEffect(() => setHoy(hoyMadrid()), []);

  if (!campanaActiva(hoy)) return null;

  const prox = proximaFecha(hoy);
  const libres = plazas ? Math.max(0, plazas.semana - plazas.ocupadas) : null;
  const mensaje = prox
    ? `${prox.corto}: hasta el ${fechaMinima(prox.fecha)}`
    : 'Pedidos de Navidad cerrados. Escríbenos y vemos qué se puede hacer';

  return (
    <Link href="/#contacto" className="aviso-navidad">
      <Abeto />
      <span className="aviso-navidad-texto">
        <strong>Navidad</strong> · {mensaje}
        {libres !== null && libres <= POCAS_PLAZAS && (
          <span className="aviso-navidad-plazas">
            {' · '}
            {libres === 0 ? 'semana completa' : `quedan ${libres} ${libres === 1 ? 'plaza' : 'plazas'} esta semana`}
          </span>
        )}
      </span>
      <span className="aviso-navidad-ver">Contáctanos</span>
    </Link>
  );
}
