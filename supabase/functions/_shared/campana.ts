// Shared by campana-enviar and campana-baja. No Deno APIs, so
// scripts/test-campana.ts can check it from Node.

// denomailer breaks non-ASCII subjects (see send-contact-email), but passes
// pure ASCII untouched: hand it RFC 2047 encoded-words already built. 10
// characters per word keep each one under the 75-char limit (≤ 4 UTF-8
// bytes each).
export function encodeAsunto(s: string): string {
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  const chars = [...s.replace(/\s+/g, ' ').trim()];
  const palabras: string[] = [];
  for (let i = 0; i < chars.length; i += 10) {
    const bytes = new TextEncoder().encode(chars.slice(i, i + 10).join(''));
    palabras.push(`=?UTF-8?B?${btoa(String.fromCharCode(...bytes))}?=`);
  }
  return palabras.join(' ');
}

// Unsubscribe token: HMAC of the email, so a link only unsubscribes its own
// address and nobody can unsubscribe others by guessing.
export async function tokenBaja(email: string, secreto: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firma = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.toLowerCase())));
  return [...firma.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// {{var}} in text, and its %7B%7Bvar%7D%7D form (marked URL-encodes hrefs).
export function sustituir(plantilla: string, vars: Record<string, string>, esc: (s: string) => string = (s) => s): string {
  return plantilla.replace(/\{\{\s*(\w+)\s*\}\}|%7B%7B(\w+)%7D%7D/gi, (m, a, b) => {
    const v = vars[(a ?? b).toLowerCase()];
    return v === undefined ? m : esc(v);
  });
}
