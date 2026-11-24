// Pickup appointments (huecos_recogida): local Salamanca time ↔ timestamptz.

export const LUGAR_RECOGIDA = 'Puerta de la Farmacia Ciurana, Plaza del Barrio Vidal, Salamanca';

/** «2026-12-02» + «18:00» in Madrid time → ISO UTC. */
export function madridISO(fecha: string, hora: string): string {
  const g = new Date(`${fecha}T${hora}:00Z`);
  const enMadrid = new Date(g.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const enUtc = new Date(g.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(g.getTime() - (enMadrid.getTime() - enUtc.getTime())).toISOString();
}

/** «mar 2 dic · 18:00» */
export function citaCorta(iso: string): string {
  const d = new Date(iso);
  const dia = d
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })
    .replace(/\./g, '');
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${dia} · ${hora}`;
}

/** «17:00, 17:30 18:00» → ['17:00', '17:30', '18:00']; null if any is not a time. */
export function parseHorasCita(s: string): string[] | null {
  const partes = s.split(/[\s,;]+/).filter(Boolean);
  const horas = partes.map((p) => {
    const m = p.match(/^(\d{1,2})(?:[:.h](\d{2}))?$/);
    if (!m || +m[1] > 23 || +(m[2] ?? 0) > 59) return null;
    return `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`;
  });
  return horas.length && horas.every(Boolean) ? (horas as string[]) : null;
}

/**
 * «10-14, 20:00-21:30» every 30 min → ['10:00', '10:30', …, '13:30', '20:00', '20:30', '21:00'].
 * The end is not a slot (14:00 is when you leave). null if a window is malformed.
 */
export function parseFranjas(s: string, cadaMin: number): string[] | null {
  if (!(cadaMin >= 5)) return null;
  const franjas = s.split(/[,;]+/).map((f) => f.trim()).filter(Boolean);
  if (!franjas.length) return null;
  const min = (h: string) => +h.slice(0, 2) * 60 + +h.slice(3);
  const out = new Set<string>();
  for (const f of franjas) {
    const [a, b, extra] = f.split(/\s*[-–a]\s*/).map((x) => parseHorasCita(x)?.[0]);
    if (!a || !b || extra !== undefined || min(b) <= min(a)) return null;
    for (let m = min(a); m < min(b); m += cadaMin) {
      out.add(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
  }
  return [...out].sort();
}

/** Days from `desde` to `hasta` (YYYY-MM-DD) whose weekday (0 = Sunday) is in `dias`. Max 92. */
export function diasEntre(desde: string, hasta: string, dias: number[]): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${desde}T12:00:00Z`), fin = Date.parse(`${hasta}T12:00:00Z`); t <= fin && out.length < 92; t += 86400000) {
    const d = new Date(t);
    if (dias.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
