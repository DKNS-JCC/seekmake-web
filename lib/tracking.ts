// Anonymous funnel analytics helpers (quote_events). Never identifies anyone:
// where the visit came from and the kind of device, nothing else.

const MARCA = '3dcc-no-rastrear';

/**
 * The shop's own browsers stay out of the stats: any browser that has opened
 * the admin, or visited any page once with ?no-rastrear=1 (for the phone).
 */
export function noRastrear(): boolean {
  try {
    if (new URLSearchParams(location.search).has('no-rastrear')) localStorage.setItem(MARCA, '1');
    return localStorage.getItem(MARCA) === '1';
  } catch {
    return false;
  }
}

export function marcarNoRastrear(): void {
  try {
    localStorage.setItem(MARCA, '1');
  } catch {
    // storage blocked: nothing to remember
  }
}

/** Where this visit came from, for the 'visita' event. */
export function origenVisita(): Record<string, string> {
  const q = new URLSearchParams(location.search);
  let referrer = '';
  try {
    const host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
    if (host !== location.hostname.replace(/^www\./, '')) referrer = host;
  } catch {
    // malformed referrer: treat as direct
  }
  const datos: Record<string, string> = {
    referrer,
    dispositivo: matchMedia('(pointer: coarse)').matches ? 'movil' : 'escritorio'
  };
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const v = q.get(k);
    if (v) datos[k] = v.slice(0, 60);
  }
  return datos;
}

/** One label per visit for the stats: the campaign, else the site that linked, else direct. */
export function etiquetaOrigen(p: Record<string, unknown>): string {
  const utm = [p.utm_source, p.utm_medium].filter(Boolean).join(' / ');
  return utm || String(p.referrer || '') || 'directo';
}
