import { ReactNode } from 'react';

export function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label style={{ display: 'block', marginBottom: 18 }}>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 6
        }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--muted)',
            marginTop: 4,
            fontStyle: 'italic'
          }}
        >
          {hint}
        </div>
      )}
    </label>
  );
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 13,
  fontFamily: 'inherit'
};
