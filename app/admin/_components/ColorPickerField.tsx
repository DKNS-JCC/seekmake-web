'use client';

/**
 * Hex color editor: native color picker + synchronised text input + big swatch
 * preview. Both inputs stay in sync; the text input accepts/strips the leading #.
 */
export function ColorPickerField({
  value,
  onChange,
  acabado
}: {
  value: string;
  onChange: (next: string) => void;
  acabado?: string | null;
}) {
  // Normalise hex to #RRGGBB for <input type="color">.
  const normalised = /^#[0-9a-f]{6}$/i.test(value) ? value : '#cccccc';

  const finishClassMap: Record<string, string> = {
    'Metálico':    'finish-metallic',
    'Fluorescente':'finish-fluorescente',
    'Translucido': 'finish-translucido',
    'Textura':     'finish-textura',
    'Brillante':   'finish-brillante',
    'Purpurina':   'finish-purpurina',
    'Mate':        'finish-mate',
    'Flexible':    'finish-flexible'
  };
  const finishClass = acabado ? finishClassMap[acabado] ?? '' : '';

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
      <div
        className={finishClass}
        style={{
          width: 88,
          height: 88,
          background: normalised,
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
          ...(acabado === 'Fluorescente'
            ? ({ ['--glow-color' as any]: normalised } as React.CSSProperties)
            : {})
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <input
          type="color"
          value={normalised}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            height: 44,
            padding: 4,
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            background: 'var(--surface)',
            cursor: 'pointer'
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            let v = e.target.value.trim();
            if (v && !v.startsWith('#')) v = '#' + v;
            onChange(v.toLowerCase());
          }}
          placeholder="#000000"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 13,
            fontFamily: "'IBM Plex Mono', monospace"
          }}
        />
      </div>
    </div>
  );
}
