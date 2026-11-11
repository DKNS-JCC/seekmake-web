'use client';

// The answer after a request: its code, how we will reply and where to
// follow it.

import { useEffect, useRef } from 'react';
import type { QuoteStatus } from '@/lib/quote/types';
import { plazoRespuesta } from '@/lib/quote/respuesta';
import { WhatsAppIcon } from '@/components/WhatsAppFAB';
import { whatsappUrl } from '@/lib/contacto';

export function Recibido({ status }: { status: Extract<QuoteStatus, { kind: 'ok' }> }) {
  const successRef = useRef<HTMLDivElement>(null);
  // Move focus to the confirmation so screen readers and keyboards land on it.
  useEffect(() => {
    successRef.current?.focus();
  }, []);

  return (
    <div className="qt-success" role="status" tabIndex={-1} ref={successRef}>
      <svg className="qt-success-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="m8 12 3 3 5-6" />
      </svg>
      <h2 className="qt-success-title">Recibido</h2>
      <p className="qt-success-lead">
        Te contestamos <strong>{plazoRespuesta()}</strong>{' '}
        {status.porEmail ? 'por email' : 'por WhatsApp'}.
      </p>
      <div className="qt-success-code">{status.codigo}</div>
      <p>
        {status.duplicado
          ? 'Ya teníamos esta misma solicitud: es la de arriba, no hace falta enviarla otra vez.'
          : status.porEmail
            ? 'Es tu código. Te hemos mandado un email con el resumen.'
            : 'Es tu código: guárdalo por si nos escribes.'}
      </p>
      <div className="qt-success-acciones">
        <a className="btn-outline" href={`/presupuesto?codigo=${encodeURIComponent(status.codigo)}`}>
          Ver estado
        </a>
        <a
          className="btn-outline"
          href={whatsappUrl(`Hola, quiero cambiar algo del presupuesto ${status.codigo}: `)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <WhatsAppIcon /> Cambiar algo
        </a>
      </div>
      <button type="button" className="qt-cupon-abrir" onClick={() => location.reload()}>
        Calcular otra pieza
      </button>
    </div>
  );
}
