'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mensajeDeError } from '@/lib/errors';

type Status = 'idle' | 'sending' | 'ok' | 'error';

/**
 * Calls the `trigger-rebuild` Supabase Edge Function, which validates that
 * the caller is an admin and then dispatches a `rebuild` event to the
 * GitHub Actions workflow. The deploy is live ~2 min later.
 *
 * If the function isn't deployed yet (or env vars aren't set), gracefully
 * surfaces the error inline — the button stays usable.
 */
export function RebuildButton({ small = false }: { small?: boolean }) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  // Auto-reset 'ok' or 'error' back to 'idle' after a few seconds.
  useEffect(() => {
    if (status !== 'ok' && status !== 'error') return;
    const t = setTimeout(() => {
      setStatus('idle');
      setMessage(null);
    }, 4500);
    return () => clearTimeout(t);
  }, [status]);

  async function trigger() {
    setStatus('sending');
    setMessage(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke('trigger-rebuild', {
        method: 'POST'
      });
      if (error) {
        setStatus('error');
        setMessage(mensajeDeError(error));
        return;
      }
      if (data?.error) {
        setStatus('error');
        setMessage(data.error);
        return;
      }
      setStatus('ok');
      setMessage(data?.message ?? 'Rebuild lanzado');
    } catch (err) {
      setStatus('error');
      setMessage(mensajeDeError(err));
    }
  }

  const label =
    status === 'sending'
      ? 'Lanzando…'
      : status === 'ok'
        ? '✓ Rebuild lanzado'
        : status === 'error'
          ? '! Error — reintentar'
          : 'Republicar sitio';

  const bg =
    status === 'ok'
      ? '#10b981'
      : status === 'error'
        ? '#ef4444'
        : 'var(--accent)';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        type="button"
        onClick={trigger}
        disabled={status === 'sending'}
        className="btn-primary"
        title="Dispara un rebuild en GitHub Actions. ~2 min hasta que esté live."
        style={{
          background: bg,
          padding: small ? '8px 16px' : undefined,
          fontSize: small ? 11 : undefined,
          transition: 'background 0.2s'
        }}
      >
        {label}
      </button>
      {status === 'error' && message && (
        <div
          style={{
            fontSize: 11,
            color: '#dc2626',
            maxWidth: 320,
            textAlign: 'right',
            fontFamily: "'IBM Plex Mono', monospace"
          }}
        >
          {message}
        </div>
      )}
      {status === 'ok' && message && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--muted)',
            maxWidth: 320,
            textAlign: 'right'
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
