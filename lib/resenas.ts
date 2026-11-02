import { createClient } from '@supabase/supabase-js';
import type { Database, Resena, ResenasResumen } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';

export type ResenasData = { resenas: Resena[]; resumen: ResenasResumen | null };

/** Reseñas publicadas, leídas en build. Sin Supabase o sin datos: lista vacía. */
export async function loadResenas(): Promise<ResenasData> {
  const vacio: ResenasData = { resenas: [], resumen: null };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return vacio;
  return buildSafe(async () => {
    const supabase = createClient<Database>(url, key);
    const [r, s] = await Promise.all([
      supabase.from('resenas').select('*').eq('publicada', true).order('orden').limit(6),
      supabase.from('resenas_resumen').select('*').maybeSingle()
    ]);
    if (r.error) throw r.error;
    return { resenas: r.data ?? [], resumen: s.data ?? null };
  }, vacio);
}
