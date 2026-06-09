'use client';

import { useEffect, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  onClick: () => Promise<void> | void;
  state?: SaveState;
  dirty?: boolean;
  label?: string;
}

/**
 * Button with built-in save lifecycle:
 *   idle  → 'Guardar'
 *   saving → 'Guardando…' (disabled)
 *   saved → '✓ Guardado'  (auto-resets to idle after 1.4s)
 *   error → '! Error'
 *
 * Either pass `state` from the parent (controlled) or let the button manage
 * it internally by awaiting `onClick`.
 */
export function SaveButton({ onClick, state, dirty = true, label = 'Guardar' }: Props) {
  const [internalState, setInternalState] = useState<SaveState>('idle');
  const effective = state ?? internalState;

  useEffect(() => {
    if (effective !== 'saved') return;
    const t = setTimeout(() => setInternalState('idle'), 1400);
    return () => clearTimeout(t);
  }, [effective]);

  async function handle() {
    if (effective === 'saving') return;
    setInternalState('saving');
    try {
      await onClick();
      setInternalState('saved');
    } catch {
      setInternalState('error');
    }
  }

  const text =
    effective === 'saving'
      ? 'Guardando…'
      : effective === 'saved'
        ? '✓ Guardado'
        : effective === 'error'
          ? '! Error'
          : label;

  const bg =
    effective === 'saved'
      ? '#10b981'
      : effective === 'error'
        ? '#ef4444'
        : 'var(--accent)';

  return (
    <button
      type="button"
      onClick={handle}
      disabled={effective === 'saving' || (!dirty && effective === 'idle')}
      className="btn-primary"
      style={{
        background: bg,
        opacity: !dirty && effective === 'idle' ? 0.5 : 1,
        cursor: !dirty && effective === 'idle' ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s, opacity 0.2s'
      }}
    >
      {text}
    </button>
  );
}
