import { createClient as createServerClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import type { Database } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';
import { MuestrarioClient } from './MuestrarioClient';

export const metadata: Metadata = {
  title: 'Muestrario | 3DCC Salamanca',
  description:
    'Muestrario completo de colores y materiales (PLA, PETG, ASA, TPU) para impresión 3D.'
};

// Static-export: this fetches at build time. The Supabase URL/anon-key must
// be available at build. If they're not set we render an empty muestrario
// rather than failing the build, so the scaffold still ships.
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

export default async function MuestrarioPage() {
  const { filamentos, colores } = await loadData();
  return <MuestrarioClient filamentos={filamentos} colores={colores} />;
}
