'use client';

// Dinero → Estadísticas: carga los datos y se los pasa a Estadisticas.tsx.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Cobro, Quote, QuoteEvento, Recibo } from '@/lib/types';
import { AccesoDenegado, useAdminAuth } from '../_components/useAdminAuth';
import { mensajeDeError } from '@/lib/errors';
import { Estadisticas, type Datos } from './Estadisticas';
import type { FilaPedido } from './Dinero';

export default function AdminEstadisticas() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { authed } = useAdminAuth();

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from('quotes').select('*').order('created_at', { ascending: false }),
      supabase
        .from('quote_events')
        .select('*')
        .gte('created_at', new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase.from('orders').select('id, quote_id, data').eq('empresa', '3dcc'),
      supabase.from('cobros').select('*').eq('empresa', '3dcc'),
      supabase.from('recibos').select('id, codigo, cobro_id, anulado_at')
    ]).then(([qres, eres, ores, cres, rres]) => {
      const fallo = [qres, ores, cres].find((r) => r.error)?.error;
      if (fallo) setError(mensajeDeError(fallo, 'No se pudieron cargar todos los datos'));
      setDatos({
        quotes: (qres.data as Quote[]) ?? [],
        eventos: (eres.data as QuoteEvento[]) ?? [],
        filas: (ores.data as unknown as FilaPedido[]) ?? [],
        cobros: (cres.data as unknown as Cobro[]) ?? [],
        recibos: (rres.data as unknown as Recibo[]) ?? []
      });
    });
  }, []);

  if (authed === false) return <AccesoDenegado />;
  if (!datos) return <p style={{ color: 'var(--muted)' }}>Cargando…</p>;
  return <Estadisticas {...datos} error={error} />;
}
