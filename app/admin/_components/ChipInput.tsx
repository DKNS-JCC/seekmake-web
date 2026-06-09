'use client';

import { KeyboardEvent, useState } from 'react';

/**
 * Chip-based array editor. User types a value, presses Enter or comma to add.
 * Backspace on empty input removes the last chip.
 */
export function ChipInput({
  values,
  onChange,
  placeholder
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (values.includes(v)) return;
    onChange([...values, v]);
    setDraft('');
  };

  const remove = (i: number) => {
    onChange(values.filter((_, idx) => idx !== i));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && values.length) {
      remove(values.length - 1);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: 6,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        minHeight: 40,
        alignItems: 'center'
      }}
    >
      {values.map((v, i) => (
        <span
          key={v + i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px 4px 10px',
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: 999,
            fontSize: 12,
            fontFamily: "'IBM Plex Mono', monospace"
          }}
        >
          {v}
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Quitar ${v}`}
            style={{
              background: 'rgba(0,0,0,0.25)',
              border: 'none',
              color: '#fff',
              width: 16,
              height: 16,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              fontSize: 14,
              lineHeight: 1
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft && add(draft)}
        placeholder={values.length === 0 ? placeholder : ''}
        style={{
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--text)',
          fontSize: 13,
          flex: 1,
          minWidth: 120,
          padding: '6px 4px'
        }}
      />
    </div>
  );
}
