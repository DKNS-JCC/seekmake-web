import type { Metadata } from 'next';
import { BajaClient } from './BajaClient';

export const metadata: Metadata = {
  title: 'Darse de baja | 3DCC Salamanca',
  description: 'Deja de recibir los correos de ofertas y novedades de 3DCC Salamanca.',
  // El enlace lleva el email y su token: nunca debe acabar indexado.
  robots: { index: false, follow: false }
};

export default function BajaPage() {
  return <BajaClient />;
}
