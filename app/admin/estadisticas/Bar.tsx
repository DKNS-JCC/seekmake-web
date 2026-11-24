// Barra horizontal de un dato (sin librería de gráficos): etiqueta, barra, cifra.
// Una serie = un color (el acento); `tenue` para lo secundario. Las etiquetas
// largas se cortan con «…» y el texto completo queda en el title.

export function Bar({
  label,
  value,
  max,
  suffix,
  texto,
  tenue
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  /** Cifra ya formateada (sustituye a value + suffix). */
  texto?: string;
  tenue?: boolean;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="est-bar" title={label}>
      <span className="est-bar-label">{label}</span>
      <span className="est-bar-pista" aria-hidden="true">
        <span className={'est-bar-valor' + (tenue ? ' tenue' : '')} style={{ width: `${pct}%`, minWidth: value > 0 ? 4 : 0 }} />
      </span>
      <span className="est-bar-cifra">{texto ?? `${value}${suffix ?? ''}`}</span>
    </div>
  );
}

/** Cifra destacada: qué es, el número y una nota opcional debajo. */
export function Cifra({ label, valor, nota }: { label: string; valor: string | number; nota?: string }) {
  return (
    <div className="est-cifra">
      <span className="est-cifra-label">{label}</span>
      <strong>{valor}</strong>
      {nota && <small>{nota}</small>}
    </div>
  );
}
