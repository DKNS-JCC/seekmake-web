'use client';

/**
 * Promise-based replacement for window.confirm().
 *
 * The native dialog can't be styled, blocks the main thread and looks nothing
 * like the rest of the admin. Usage keeps the same shape as before:
 *
 *   const { confirmar, dialogo } = useConfirm();
 *   ...
 *   if (!(await confirmar({ mensaje: '¿Eliminar el color?' }))) return;
 *   ...
 *   return (<>{dialogo}...</>);
 */

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export type ConfirmOptions = {
  mensaje: string;
  /** Extra line under the message — say what is irreversible. */
  detalle?: string;
  titulo?: string;
  confirmar?: string;
  cancelar?: string;
  /** Red confirm button for destructive actions. Defaults to true. */
  destructivo?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export function useConfirm(): {
  confirmar: (opts: ConfirmOptions) => Promise<boolean>;
  dialogo: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirmar = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    []
  );

  const close = useCallback(
    (ok: boolean) => {
      setPending((p) => {
        p?.resolve(ok);
        return null;
      });
    },
    []
  );

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    // Focus the confirm button so Tab stays inside and Enter works immediately.
    const t = setTimeout(() => confirmRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [pending, close]);

  const destructivo = pending?.destructivo ?? true;

  const dialogo = pending ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      data-confirm-open=""
      onClick={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        // Above the drawer (300/301): confirms are often opened from one.
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
      >
        <h2
          id="confirm-title"
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 24,
            lineHeight: 1.1,
            marginBottom: 8,
            color: 'var(--text)'
          }}
        >
          {pending.titulo ?? 'Confirmar'}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
          {pending.mensaje}
        </p>
        {pending.detalle && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
            {pending.detalle}
          </p>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 24
          }}
        >
          <button type="button" className="btn-outline" onClick={() => close(false)}>
            {pending.cancelar ?? 'Cancelar'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => close(true)}
            className={destructivo ? undefined : 'btn-primary'}
            style={
              destructivo
                ? {
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--r)',
                    padding: '10px 18px',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    cursor: 'pointer'
                  }
                : undefined
            }
          >
            {pending.confirmar ?? 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirmar, dialogo };
}
