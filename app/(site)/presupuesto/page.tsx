import type { Metadata } from 'next';
import { PresupuestoClient } from './PresupuestoClient';

export const metadata: Metadata = {
  title: 'Estado de tu Presupuesto | 3DCC Salamanca',
  description:
    'Consulta el estado de tu presupuesto de impresión 3D con tu código de referencia.'
};

export default function PresupuestoPage() {
  return <PresupuestoClient />;
}
