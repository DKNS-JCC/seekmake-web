// Campaña de Navidad 2026. Productos, precios y fechas se editan aquí; las
// plazas de la semana, desde /admin/navidad (tabla campana_navidad).
// Los precios son el suelo de la calculadora: validarlos antes de publicar.

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';

/** Último día en que se ve la campaña (menú, banner). Reyes. */
export const FIN_CAMPANA = '2027-01-06';

export type ProductoNavidad = {
  id: string;
  nombre: string;
  precio: string;
  tamano: string;
  plazo: string;
  descripcion: string;
  /** Qué tiene que mandarnos el cliente. */
  necesitamos: string;
  /** Título de un trabajo real cuya foto se usa; sin foto si no existe. */
  fotoTrabajo?: string;
  waMensaje: string;
};

export const PRODUCTOS: ProductoNavidad[] = [
  {
    id: 'figura-foto',
    nombre: 'Figura desde tu foto',
    precio: 'Desde 20 €',
    tamano: '10 cm de alto',
    plazo: '3 días de taller',
    descripcion:
      'Una persona, una pareja o una mascota convertida en figura. La modelamos a partir de la foto y la imprimimos en el color que elijas.',
    necesitamos: 'Una foto de cuerpo entero, con buena luz y sin nada tapando. Con permiso de quien sale.',
    waMensaje: 'Hola, quiero una figura desde una foto para Navidad.'
  },
  {
    id: 'litofania',
    nombre: 'Litofanía',
    precio: 'Desde 10 €',
    tamano: '10 x 15 cm',
    plazo: '2 días de taller',
    descripcion:
      'Parece una placa blanca con relieve hasta que le pones luz detrás: entonces aparece la foto con todos sus tonos. Si pides varias, cada una sale más barata.',
    necesitamos: 'La foto original, no una captura. Mejor si las caras se ven grandes.',
    fotoTrabajo: 'Litofanía personalizada',
    waMensaje: 'Hola, quiero una litofanía para Navidad. Os mando la foto.'
  },
  {
    id: 'nombre',
    nombre: 'Nombre o llavero personalizado',
    precio: 'Desde 4 €',
    tamano: 'Unos 6 cm',
    plazo: '2 días de taller',
    descripcion:
      'Con un nombre, una fecha o una palabra que solo entendéis vosotros. A uno o dos colores.',
    necesitamos: 'El texto exacto, con tildes, y los colores.',
    fotoTrabajo: 'Llaveros personalizados Vespa Club',
    waMensaje: 'Hola, quiero llaveros o nombres personalizados para Navidad.'
  },
  {
    id: 'amigo-invisible',
    nombre: 'Pack amigo invisible',
    precio: 'A consultar',
    tamano: 'Desde 10 unidades',
    plazo: '4 días de taller',
    descripcion:
      'Para el amigo invisible de la oficina, la clase o la cuadrilla: un regalo distinto con el nombre de cada uno, todos con el mismo presupuesto. Nos decís cuántos sois y lo que queréis gastar por persona, y os proponemos ideas y una muestra.',
    necesitamos: 'Cuántos sois, el presupuesto por persona, la lista de nombres y la fecha del intercambio.',
    fotoTrabajo: 'Abrelatas Scout',
    waMensaje: 'Hola, queremos un pack para el amigo invisible.'
  }
];

export type FechaLimite = { fecha: string; texto: string };

/** Fechas límite de pedido, en orden. */
export const FECHAS: FechaLimite[] = [
  { fecha: '2026-12-11', texto: 'Figuras con envío antes de Nochebuena' },
  { fecha: '2026-12-14', texto: 'Resto de personalizados con envío antes de Nochebuena' },
  { fecha: '2026-12-17', texto: 'Recogida en Salamanca antes de Nochebuena' },
  { fecha: '2026-12-28', texto: 'Para Reyes' }
];

/** YYYY-MM-DD de hoy en Madrid. */
export function hoyMadrid(ahora = new Date()): string {
  return ahora.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
}

export function campanaActiva(hoy = hoyMadrid()): boolean {
  return hoy <= FIN_CAMPANA;
}

/** Días enteros de `desde` a `hasta` (ambos YYYY-MM-DD). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + 'T12:00:00Z') - Date.parse(desde + 'T12:00:00Z')) / 86_400_000);
}

/** La primera fecha límite que aún no ha pasado, o null. */
export function proximaFecha(hoy = hoyMadrid()): FechaLimite | null {
  return FECHAS.find((f) => f.fecha >= hoy) ?? null;
}

export function fechaCorta(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

export type Plazas = { semana: number; ocupadas: number };

/** Plazas de la semana, leídas en build. Sin datos: null y no se enseñan. */
export async function loadPlazas(): Promise<Plazas | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return buildSafe(async () => {
    const { data, error } = await createClient<Database>(url, key)
      .from('campana_navidad')
      .select('plazas_semana, plazas_ocupadas')
      .maybeSingle();
    if (error) throw error;
    return data ? { semana: data.plazas_semana, ocupadas: data.plazas_ocupadas } : null;
  }, null);
}
