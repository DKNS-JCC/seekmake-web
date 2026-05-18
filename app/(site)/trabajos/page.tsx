import { createClient as createServerClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import type { Database } from '@/lib/types';
import { TrabajosClient } from './TrabajosClient';

export const metadata: Metadata = {
  title: 'Trabajos | 3DCC Salamanca',
  description: 'Galería completa de impresión 3D a medida: piezas técnicas, figuras y más.'
};

async function loadData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  
  const supabase = createServerClient<Database>(url, key);
  const { data } = await supabase.from('trabajos').select('*').order('orden');
  
  return data ?? [];
}

export default async function TrabajosPage() {
  const trabajos = await loadData();
  return <TrabajosClient trabajos={trabajos} />;
}
