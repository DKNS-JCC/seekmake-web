'use client';

/**
 * The auth guard every admin page repeated verbatim: read the session once,
 * expose a memoised Supabase client, and render the same "Acceso denegado"
 * screen while the user isn't logged in.
 *
 *   const { authed, supabase } = useAdminAuth();
 *   ...
 *   if (authed === false) return <AccesoDenegado />;
 *
 * `authed` is null until the session check resolves, so callers can tell
 * "not logged in" apart from "still checking".
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { marcarNoRastrear } from '@/lib/tracking';

// Same claim the database checks in public.is_admin(): a signed-in Calculadora
// user is not an admin and must not see the panel.
export const esAdmin = (u: User | null | undefined) => u?.app_metadata?.is_admin === true;

export function useAdminAuth() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  // One client per mount instead of a new one on every call site.
  const client = useMemo(() => createClient(), []);

  useEffect(() => {
    let vivo = true;
    client.auth.getUser().then(({ data }) => {
      if (vivo) setAuthed(esAdmin(data.user));
    });
    const { data: sub } = client.auth.onAuthStateChange((_e, session) => {
      if (vivo) setAuthed(esAdmin(session?.user));
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, [client]);

  // The admin's browser stays out of the tasador stats from now on.
  useEffect(() => {
    if (authed) marcarNoRastrear();
  }, [authed]);

  return { authed, supabase: () => client, client };
}

export function AccesoDenegado() {
  return (
    <div>
      <h1 className="section-title" style={{ fontSize: 32, marginBottom: 24 }}>
        Acceso denegado
      </h1>
      <Link href="/admin/login" className="btn-primary">
        Iniciar sesión
      </Link>
    </div>
  );
}
