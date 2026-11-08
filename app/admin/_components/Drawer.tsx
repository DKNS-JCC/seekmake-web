'use client';

import { ReactNode, useCallback, useEffect, useId, useRef } from 'react';
import { ErrorBanner } from './ErrorBanner';
import { useConfirm } from './useConfirm';

/**
 * Slide-in drawer anchored to the right edge of the viewport.
 *
 * - `error` shows inside the drawer: the page's own banner sits behind the
 *   backdrop, where nobody sees it.
 * - `dirty` asks before closing (Esc, backdrop, ×) and before leaving the page.
 * - Focus moves in on open, stays inside while open, and returns on close.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  error,
  dirty = false
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  error?: ReactNode;
  dirty?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const { confirmar, dialogo } = useConfirm();

  const pedirCierre = useCallback(async () => {
    if (
      dirty &&
      !(await confirmar({
        titulo: '¿Cerrar sin guardar?',
        mensaje: 'Hay cambios sin guardar en este formulario.',
        detalle: 'Si cierras, se pierden.',
        confirmar: 'Cerrar sin guardar',
        cancelar: 'Seguir editando'
      }))
    ) {
      return;
    }
    onClose();
  }, [dirty, confirmar, onClose]);

  useEffect(() => {
    if (!open) return;
    const antes = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The confirm dialog handles its own Esc.
        if (!document.querySelector('[data-confirm-open]')) void pedirCierre();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      antes?.focus?.();
    };
  }, [open, pedirCierre]);

  // Reloading or leaving the page with unsaved changes.
  useEffect(() => {
    if (!open || !dirty) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [open, dirty]);

  return (
    <>
      {dialogo}
      <div
        className={'adm-drawer-velo' + (open ? ' abierto' : '')}
        onClick={() => void pedirCierre()}
        aria-hidden="true"
      />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={'adm-drawer' + (open ? ' abierto' : '')}
        // Closed drawers stay in the DOM: keep them out of Tab order and screen readers.
        {...((!open ? { inert: true, 'aria-hidden': true } : {}) as Record<string, unknown>)}
      >
        <header className="adm-drawer-cab">
          <h2 id={titleId}>{title}</h2>
          <button type="button" onClick={() => void pedirCierre()} aria-label="Cerrar" className="adm-drawer-x">
            <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="adm-drawer-cuerpo">
          {error && <ErrorBanner>{error}</ErrorBanner>}
          {children}
        </div>
        {footer && <footer className="adm-drawer-pie">{footer}</footer>}
      </aside>
    </>
  );
}
