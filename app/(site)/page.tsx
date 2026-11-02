import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';
import { loadResenas } from '@/lib/resenas';
import { HomeClient } from './HomeClient';

async function loadTrabajos() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  return buildSafe(async () => {
    const supabase = createClient<Database>(url, key);
    const { data, error } = await supabase
      .from('trabajos')
      .select('*')
      .order('fecha_efectiva', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }, []);
}

export default async function HomePage() {
  const [trabajos, resenas] = await Promise.all([loadTrabajos(), loadResenas()]);
  return <HomeClient trabajos={trabajos} resenas={resenas} />;
}
