import type { Metadata } from 'next';
import { ReciboVerify } from './ReciboVerify';

export const metadata: Metadata = {
  title: 'Verificar justificante de pago | 3DCC Salamanca',
  description:
    'Comprueba que un justificante de pago emitido por 3DCC Salamanca es auténtico.',
  // No tiene sentido en resultados de búsqueda: sin el token de la URL no
  // muestra nada, y el token no debe acabar indexado en ninguna parte.
  robots: { index: false, follow: false }
};

export default function ReciboPage() {
  return <ReciboVerify />;
}
