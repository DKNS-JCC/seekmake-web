'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Small counter of estado='nuevo' quotes next to the "Presupuestos" nav
 * link. Renders nothing while logged out (RLS returns no rows) or at zero.
 */
export function NuevosBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    createClient()
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'nuevo')
      .eq('archivado', false)
      .then(({ count: c }) => setCount(c ?? 0));
  }, []);

  if (!count) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        marginLeft: 6,
        background: 'var(--accent)',
        color: '#fff',
        borderRadius: 9,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
        fontWeight: 600
      }}
    >
      {count}
    </span>
  );
}
