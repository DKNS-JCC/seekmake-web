// Discount code: validated by validar_cupon, re-checked on submit.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Cupon } from '@/lib/quote/pricing';

export function useCupon() {
  const [cupon, setCupon] = useState<Cupon | null>(null);
  const [cuponTxt, setCuponTxt] = useState('');
  const [cuponAbierto, setCuponAbierto] = useState(false);
  const [cuponError, setCuponError] = useState<string | null>(null);
  const [cuponCargando, setCuponCargando] = useState(false);

  async function aplicarCupon(txt: string) {
    const codigo = txt.trim().toUpperCase();
    if (!codigo) return;
    setCuponCargando(true);
    setCuponError(null);
    const { data, error } = await createClient().rpc('validar_cupon', { p_codigo: codigo });
    setCuponCargando(false);
    setCuponAbierto(true);
    const fila = Array.isArray(data) ? data[0] : null;
    if (error) {
      setCuponError('No hemos podido comprobar el código. Inténtalo de nuevo.');
    } else if (!fila) {
      setCuponError(`El código ${codigo} no existe o ya no está activo.`);
    } else {
      setCupon({
        codigo: fila.codigo,
        tipo: fila.tipo,
        valor: Number(fila.valor),
        pedido_minimo: Number(fila.pedido_minimo)
      });
      setCuponTxt('');
    }
  }

  // Campaign links: /instant-quote?cupon=NAVIDAD10 applies it straight away.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('cupon');
    if (c) void aplicarCupon(c);
  }, []);

  return {
    cupon,
    setCupon,
    cuponTxt,
    setCuponTxt,
    cuponAbierto,
    setCuponAbierto,
    cuponError,
    setCuponError,
    cuponCargando,
    aplicarCupon
  };
}

export type CuponEstado = ReturnType<typeof useCupon>;
