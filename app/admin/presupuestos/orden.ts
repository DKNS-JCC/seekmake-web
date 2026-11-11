// El «pedido» de taller (tabla orders, forma de normalizeOrder de la
// Calculadora 7.2) que cuelga de cada presupuesto. Los cambios se hacen
// releyendo la fila y mezclando solo lo que se toca, para no pisar lo que la
// Calculadora haya guardado entre medias.

import type { SupabaseClient } from '@supabase/supabase-js';

export type PedidoData = Record<string, any>;
export type PedidoRow = { id: string; quote_id: string | null; data: PedidoData };

const EMPRESA = '3dcc';
export const nuevoId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();

export async function leerOrden(sb: SupabaseClient, quoteId: string): Promise<PedidoRow | null> {
  const { data } = await sb
    .from('orders')
    .select('id, quote_id, data')
    .eq('empresa', EMPRESA)
    .eq('quote_id', quoteId)
    .maybeSingle();
  return (data as PedidoRow | null) ?? null;
}

/** Lee el pedido, aplica `cambios` y lo guarda. */
export async function parchearOrden(
  sb: SupabaseClient,
  quoteId: string,
  cambios: PedidoData
): Promise<PedidoRow | null> {
  const fila = await leerOrden(sb, quoteId);
  if (!fila) return null;
  const nuevo = { ...fila.data, ...cambios };
  const { error } = await sb.from('orders').update({ data: nuevo }).eq('empresa', EMPRESA).eq('id', fila.id);
  if (error) throw error;
  return { ...fila, data: nuevo };
}

/** Líneas de material que se gastan (multimaterial o una sola). */
export function lineasMaterial(d: PedidoData): { material: string; color: string; grams: number }[] {
  if (d.is_multimaterial && Array.isArray(d.material_breakdown) && d.material_breakdown.length) {
    return d.material_breakdown
      .map((l: any) => ({
        material: String(l.material || '').trim(),
        color: String(l.color || '').trim() || 'Negro',
        grams: Math.max(0, Number(l.grams) || 0)
      }))
      .filter((l: { material: string; grams: number }) => l.material && l.grams > 0);
  }
  const grams = Math.max(0, Number(d.peso_g) || 0);
  const material = String(d.filamento || '').trim();
  return material && grams > 0
    ? [{ material, color: String(d.filamento_color || '').trim() || 'Negro', grams }]
    : [];
}

/**
 * Da por gastado el material del pedido (el flag que lee el gasto de
 * filamento). Devuelve el texto del aviso, o null si ya estaba apuntado o el
 * pedido no tiene material.
 */
export async function contabilizarMaterial(sb: SupabaseClient, quoteId: string): Promise<string | null> {
  const fila = await leerOrden(sb, quoteId);
  if (!fila || fila.data.material_contabilizado) return null;
  const lineas = lineasMaterial(fila.data);
  if (!lineas.length) return null;
  await parchearOrden(sb, quoteId, { material_contabilizado: true });
  const g = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
  return (
    'Apuntados ' +
    lineas.map((l) => `${g(l.grams)} g de ${l.material}${lineas.length > 1 ? ' ' + l.color : ''}`).join(' + ') +
    '.'
  );
}
