'use client';

import { ReactNode, useEffect } from 'react';

/**
 * Slide-in drawer anchored to the right edge of the viewport.
 * Closes on ESC and on backdrop click. Locks body scroll while open.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(2px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s',
          zIndex: 300
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(560px, 100vw)',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.25)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          zIndex: 301,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <h2
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 26,
              letterSpacing: '0.02em',
              color: 'var(--text)'
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              width: 32,
              height: 32,
              borderRadius: 'var(--r)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>{children}</div>
        {footer && (
          <footer
            style={{
              padding: 16,
              borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end'
            }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}
