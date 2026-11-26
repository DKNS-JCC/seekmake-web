'use client';

// Botón «Ticket» de la ficha + selector de cupón. El cupón elegido se recuerda
// en este navegador para los siguientes tickets («Sin cupón» lo apaga).

import { useEffect, useState } from 'react';
import type { CuponRow, Quote } from '@/lib/types';
import { hayBluetooth, imprimirCanvas } from '@/lib/impresora-termica';
import { mensajeDeError } from '@/lib/errors';
import { inputStyle } from '../_components/Field';
import { useAdminAuth } from '../_components/useAdminAuth';
import { ticketPedido, type Pieza } from './ticket';

const CLAVE = '3dcc-ticket-cupon';

export function BotonTicket({ q, piezas, onError }: { q: Quote; piezas: Pieza[]; onError: (e: string | null) => void }) {
  const { supabase } = useAdminAuth();
  const [cupones, setCupones] = useState<CuponRow[]>([]);
  const [cupon, setCupon] = useState('');
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    if (!hayBluetooth()) return;
    const hoy = new Date().toISOString().slice(0, 10);
    void supabase()
      .from('cupones')
      .select('*')
      .eq('activo', true)
      .then(({ data }) => {
        const vivos = (data ?? []).filter((c) => !c.valido_hasta || c.valido_hasta >= hoy);
        setCupones(vivos);
        const guardado = localStorage.getItem(CLAVE) ?? '';
        setCupon(vivos.some((c) => c.codigo === guardado) ? guardado : '');
      });
  }, [supabase]);

  if (!hayBluetooth()) return null;

  async function imprimir() {
    setImprimiendo(true);
    onError(null);
    try {
      await imprimirCanvas(await ticketPedido(q, piezas, cupones.find((c) => c.codigo === cupon) ?? null));
    } catch (e) {
      const err = e as Error;
      if (/globally disabled/i.test(err.message)) {
        // Brave lo trae apagado de serie; en Chrome es el permiso «Dispositivos Bluetooth».
        onError('El navegador tiene el Bluetooth web desactivado. En Brave: brave://flags/#brave-web-bluetooth-api → Enabled y reiniciar. En Chrome: permite «Dispositivos Bluetooth» en la configuración del sitio.');
      } else if (!(err.name === 'NotFoundError' && /cancel/i.test(err.message))) {
        // Cerrar el selector de Bluetooth sin elegir no es un error.
        onError(mensajeDeError(err as { message?: string }, 'No se pudo imprimir el ticket'));
      }
    } finally {
      setImprimiendo(false);
    }
  }

  return (
    <span className="fi-fila">
      <button type="button" className="btn-outline" disabled={imprimiendo} onClick={() => void imprimir()}>
        {imprimiendo ? 'Imprimiendo…' : 'Ticket'}
      </button>
      {cupones.length > 0 && (
        <select
          aria-label="Cupón en el ticket"
          style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 }}
          value={cupon}
          onChange={(e) => {
            setCupon(e.target.value);
            localStorage.setItem(CLAVE, e.target.value);
          }}
        >
          <option value="">Sin cupón</option>
          {cupones.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.codigo} ({c.tipo === 'pct' ? `-${c.valor} %` : `-${c.valor} €`})
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
