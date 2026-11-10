// Barra horizontal de un dato (sin librería de gráficos): etiqueta, barra, cifra.

export function Bar({
  label,
  value,
  max,
  color,
  suffix,
  texto
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  suffix?: string;
  /** Cifra ya formateada (sustituye a value + suffix). */
  texto?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <span style={{ width: 110, fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 4, height: 18, overflow: 'hidden' }} aria-hidden="true">
        <div
          style={{
            width: `${pct}%`,
            minWidth: value > 0 ? 4 : 0,
            height: '100%',
            background: color,
            borderRadius: 4,
            transition: 'width 0.4s'
          }}
        />
      </div>
      <span style={{ minWidth: 70, fontSize: 12, fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>
        {texto ?? `${value}${suffix ?? ''}`}
      </span>
    </div>
  );
}
