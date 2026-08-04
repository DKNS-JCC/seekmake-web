'use client';

// Keeps filament/colour data fresh without giving up static rendering.
//
// The site is a static export, so `filamentos`/`colores` are baked in at build
// time. That meant an admin edit — a new colour, a price tweak, marking
// something agotado — did nothing on the public site until someone pressed
// "Rebuild" and waited ~2 min for CI. Stock in particular needs to be live.
//
// So: render the build-time snapshot immediately (fast first paint, still
// indexable), then re-fetch on mount and swap in whatever is current. The
// tasador already did this for `quote_settings`; this brings colours in line.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Color, Filamento } from '@/lib/types';

export type CatalogoColores = {
  filamentos: Filamento[];
  colores: Color[];
  /** True until the live re-fetch has settled (success or failure). */
  cargando: boolean;
};

export function useCatalogoColores(
  inicial: { filamentos: Filamento[]; colores: Color[] }
): CatalogoColores {
  const [datos, setDatos] = useState(inicial);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    const supabase = createClient();

    Promise.all([
      supabase.from('filamentos').select('*').order('orden'),
      supabase.from('colores').select('*').order('orden')
    ])
      .then(([f, c]) => {
        if (!vivo) return;
        // Never replace good build-time data with an error or an empty read —
        // a blank muestrario is far worse than a slightly stale one.
        if (f.error || c.error) return;
        if (!f.data?.length || !c.data?.length) return;
        setDatos({ filamentos: f.data, colores: c.data });
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
    };
  }, []);

  return { ...datos, cargando };
}
