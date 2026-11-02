'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { campanaActiva, fechaCorta, hoyMadrid, proximaFecha, type Plazas } from '@/lib/campana-navidad';
import './aviso-navidad.css';

// Barra fina de campaña: un mensaje, una fecha concreta y un enlace. Sin
// cuentas atrás ni adornos. Las plazas solo salen cuando quedan pocas, que
// es cuando la escasez es verdad. `hoy` viene del build para que el HTML
// estático ya sea correcto; al cargar se recalcula con la fecha real.
const POCAS_PLAZAS = 5;

export function AvisoNavidad({ plazas, hoy: hoyBuild }: { plazas: Plazas | null; hoy: string }) {
  const [hoy, setHoy] = useState(hoyBuild);
  useEffect(() => setHoy(hoyMadrid()), []);

  if (!campanaActiva(hoy)) return null;

  const prox = proximaFecha(hoy);
  const libres = plazas ? Math.max(0, plazas.semana - plazas.ocupadas) : null;
  const mensaje = prox
    ? `${prox.texto}: pide hasta el ${fechaCorta(prox.fecha)}`
    : 'Pedidos de Navidad cerrados. Escríbenos y vemos qué se puede hacer';

  return (
    <Link href="/navidad/" className="aviso-navidad">
      <span className="aviso-navidad-texto">
        <strong>Navidad</strong> · {mensaje}
        {libres !== null && libres <= POCAS_PLAZAS && (
          <span className="aviso-navidad-plazas">
            {' · '}
            {libres === 0 ? 'semana completa' : `quedan ${libres} ${libres === 1 ? 'plaza' : 'plazas'} esta semana`}
          </span>
        )}
      </span>
      <span className="aviso-navidad-ver">Ver regalos</span>
    </Link>
  );
}
