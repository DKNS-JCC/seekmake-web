'use client';

import { useEffect, useState } from 'react';

// Context-aware greeting for QRs printed on order slips/packaging.
// * /qr?de=pedido          → thank-you banner + generic tracking link
// * /qr?codigo=Q-2026-0042 → tracking link jumps straight to that order
// Business-card QRs (plain /qr) never see this.
export function QrPedidoBanner() {
  const [show, setShow] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get('codigo')?.trim().toUpperCase() || null;
    if (p.get('de') === 'pedido' || c) {
      setShow(true);
      setCodigo(c);
    }
  }, []);

  if (!show) return null;

  const trackUrl = codigo
    ? `/presupuesto?codigo=${encodeURIComponent(codigo)}`
    : '/presupuesto';

  return (
    <div className="qr-pedido qr-fade in">
      <div className="qr-pedido-title">¡Gracias por tu pedido!</div>
      <p className="qr-pedido-sub">
        Esperamos que lo disfrutes. Desde aquí puedes seguir su estado
        {codigo ? '' : ' con tu código'} o contarnos qué tal ha ido.
      </p>
      <a href={trackUrl} className="qr-pedido-btn">
        Seguir mi pedido{codigo ? ` · ${codigo}` : ''}
      </a>
    </div>
  );
}
