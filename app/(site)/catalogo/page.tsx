import { createClient as createServerClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import type { Database } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';
import { siteUrl } from '@/lib/contacto';
import { CatalogoClient } from './CatalogoClient';

export const metadata: Metadata = {
  title: 'Regalos y piezas impresas en 3D, envío a toda España | 3DCC',
  description:
    'Catálogo de regalos personalizados, organizadores, repuestos y piezas impresas en 3D. Pídelo por WhatsApp y recíbelo en cualquier punto de España, o recógelo en mano en Salamanca.',
  alternates: { canonical: siteUrl('/catalogo/') }
};

async function loadProducts() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  return buildSafe(async () => {
    const supabase = createServerClient<Database>(url, key);
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('destacado', { ascending: false })
      .order('legacy_id');
    if (error) throw error;
    return data ?? [];
  }, []);
}

export default async function CatalogoPage() {
  const productos = await loadProducts();
  return <CatalogoClient productos={productos} />;
}
