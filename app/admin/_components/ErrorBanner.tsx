'use client';

/** The red error strip that four admin pages had copy-pasted inline. */
export function ErrorBanner({
  children,
  tone = 'error'
}: {
  children: React.ReactNode;
  tone?: 'error' | 'info';
}) {
  if (!children) return null;
  const colores =
    tone === 'info'
      ? { background: '#dbeafe', color: '#1e40af' }
      : { background: '#fee2e2', color: '#991b1b' };
  return (
    <div
      role="alert"
      style={{
        ...colores,
        padding: 12,
        borderRadius: 'var(--r)',
        marginBottom: 16,
        fontSize: 13
      }}
    >
      {children}
    </div>
  );
}
