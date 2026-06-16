import { createClient as createServerClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import type { Database } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';
import { QuoteClient } from './QuoteClient';

export const metadata: Metadata = {
  title: 'Calculadora de Precio | 3DCC Salamanca',
  description:
    'Sube tu pieza 3D (STL, 3MF, OBJ) y obtén el precio al instante. Elige material, color y acabado del muestrario real.'
};

// Static-export: filamentos/colores are fetched at build time (same model as
// the muestrario). Pricing settings are fetched client-side at runtime so
// tariff changes in /admin/tarifas apply without a rebuild.
async function loadData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { filamentos: [], colores: [] };
  }
  return buildSafe(async () => {
    const supabase = createServerClient<Database>(url, key);
    const [{ data: filamentos, error: e1 }, { data: colores, error: e2 }] = await Promise.all([
      supabase.from('filamentos').select('*').order('orden'),
      supabase.from('colores').select('*').order('orden')
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    return { filamentos: filamentos ?? [], colores: colores ?? [] };
  }, { filamentos: [], colores: [] });
}

export default async function InstantQuotePage() {
  const { filamentos, colores } = await loadData();
  return <QuoteClient filamentos={filamentos} colores={colores} />;
}
