// Anonymous funnel of the tasador (quote_events): never identifies anyone.

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { QuoteEventoTipo } from '@/lib/types';
import type { MeshMetrics } from '@/lib/quote/geometry';
import type { QuoteResult } from '@/lib/quote/pricing';
import type { Pieza } from '@/lib/quote/types';
import { noRastrear, origenVisita } from '@/lib/tracking';

// Anonymous funnel id for quote_events (never identifies). Kept in
// sessionStorage so a reload in the same tab stays the same visit.
export const SESSION_ID = (() => {
  const nuevo = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  try {
    const guardado = sessionStorage.getItem('qt-session');
    if (guardado) return guardado;
    sessionStorage.setItem('qt-session', nuevo);
  } catch {
    // SSR or storage blocked: one id per page load.
  }
  return nuevo;
})();

/**
 * Short id of a piece's shape: the same file gives the same id in any visit,
 * so /admin/estadisticas can tell one piece tried many times from many pieces.
 */
export function huellaDe(m: MeshMetrics): string {
  const dims = [m.bboxMm.x, m.bboxMm.y, m.bboxMm.z].map((v) => Math.round(v)).sort((a, b) => a - b);
  const txt = `${Math.round(m.volumenCm3 * 10)}|${m.triangulos}|${dims.join('x')}`;
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export type TrackEvent = (evento: Exclude<QuoteEventoTipo, 'aceptado'>, payload?: Record<string, unknown>) => void;

// Fire-and-forget funnel event (errors are irrelevant to the customer).
export const trackEvent: TrackEvent = (evento, payload = {}) => {
  if (noRastrear()) return;
  void createClient()
    .from('quote_events')
    .insert({ session_id: SESSION_ID, evento, payload })
    .then(() => undefined, () => undefined);
};

/** One 'visita' per visit, with where it came from and the kind of device. */
export function useVisita(): void {
  useEffect(() => {
    try {
      if (sessionStorage.getItem('qt-visita')) return;
      sessionStorage.setItem('qt-visita', '1');
    } catch {
      // storage blocked: one per page load
    }
    trackEvent('visita', origenVisita());
  }, []);
}

/**
 * The price on screen: the funnel's "saw the price" step, then again each
 * time it settles on a new figure (3 s without changes), so the last one is
 * what the visitor had when they left. Capped per visit.
 */
export function usePrecioVisto(
  listo: boolean,
  quote: QuoteResult | null,
  piezas: Pieza[],
  entrega: string,
  cpValido: string | undefined
): void {
  const precioVisto = useRef({ enviados: 0, firma: '' });
  useEffect(() => {
    if (!listo || !quote) return;
    const datos = {
      total: quote.total,
      piezas: piezas.length,
      entrega,
      cp: cpValido,
      detalle: quote.piezas.map((r, i) => ({
        h: piezas[i] ? huellaDe(piezas[i].metrics) : '',
        mat: r.material,
        n: r.cantidad,
        g: Math.round(r.pesoG),
        t: Math.round(r.tiempoH * 10) / 10,
        eur: r.subtotal
      }))
    };
    const firma = JSON.stringify(datos);
    const ref = precioVisto.current;
    if (firma === ref.firma || ref.enviados >= 15) return;
    const t = setTimeout(
      () => {
        ref.firma = firma;
        ref.enviados++;
        trackEvent('precio_visto', datos);
      },
      ref.enviados === 0 ? 0 : 3000
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, quote]);
}
