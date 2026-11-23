// Trabajos que enseñamos por la web: la tabla `trabajos`, que se gestiona en
// /admin/trabajos. Algunas fotos viven en public/images/trabajos (la fila guarda la ruta).
//
// La categoría de cada trabajo (lib/categorias-trabajo.ts) decide en qué página de
// servicio sale; se elige en /admin/trabajos con «Dónde sale». Sin categoría, el
// trabajo sale solo en el álbum de /trabajos.
import { createClient } from '@supabase/supabase-js';
import type { Database, Trabajo } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';
import { whatsappUrl } from '@/lib/contacto';
import { CATEGORIAS, type CategoriaId } from '@/lib/categorias-trabajo';

export { CATEGORIAS, type CategoriaId };

export function categoriaDe(t: Trabajo): CategoriaId | null {
  const ids: readonly string[] = CATEGORIAS.map((c) => c.id);
  return (t.etiquetas?.find((e) => ids.includes(e)) as CategoriaId | undefined) ?? null;
}

/** Mensaje de WhatsApp de «Quiero uno parecido», con el trabajo ya nombrado. */
export function parecidoUrl(t: Trabajo): string {
  return whatsappUrl(`Hola, he visto «${t.titulo}» en vuestra web y quiero algo parecido.`);
}

/** srcset para las fotos de public/images/trabajos, exportadas a 600 y 1200 px de ancho (3:4, como las del panel). */
export function srcSetDe(imagen: string): string | undefined {
  return imagen.endsWith('-1200.webp')
    ? `${imagen.replace('-1200.webp', '-600.webp')} 600w, ${imagen} 1200w`
    : undefined;
}

async function trabajosDeLaBase(): Promise<Trabajo[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  return buildSafe(async () => {
    const { data, error } = await createClient<Database>(url, key)
      .from('trabajos')
      .select('*')
      .order('fecha_efectiva', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }, []);
}

/**
 * Todos los trabajos, alternando categorías (el más reciente de cada una, luego
 * el siguiente…) para que las primeras filas enseñen variedad y no seis piezas
 * del mismo tipo. Los que no tienen categoría van al final, por fecha.
 */
export async function loadTrabajos(): Promise<Trabajo[]> {
  const db = await trabajosDeLaBase();
  const porFecha = [...db].sort((a, b) => b.fecha_efectiva.localeCompare(a.fecha_efectiva));
  const colas = CATEGORIAS.map((c) => porFecha.filter((t) => categoriaDe(t) === c.id));
  const out: Trabajo[] = [];
  while (colas.some((q) => q.length)) for (const q of colas) if (q.length) out.push(q.shift()!);
  return [...out, ...porFecha.filter((t) => !categoriaDe(t))];
}
