// Single source of truth for the business's public contact details and URLs.
//
// These used to be typed by hand in ~50 places across 20 files, in four
// different phone formats. Change them here and every page follows.

/** E.164 digits, no plus — the form wa.me and tel: links are built from. */
const PHONE_E164 = '34923793123';

export const CONTACTO = {
  nombre: '3DCC Salamanca',
  /** Canonical site origin, no trailing slash. */
  sitio: 'https://www.impresion3dcc.com',
  /** Bare host, for display in copy and PDFs. */
  dominio: 'impresion3dcc.com',
  email: 'info@impresion3dcc.com',
  /** Human-readable, for link text. */
  telefono: '+34 923 793 123',
  /** Dial string, for href="tel:". */
  telefonoTel: `+${PHONE_E164}`,
  whatsapp: PHONE_E164,
  instagram: 'https://www.instagram.com/impresion3dcc/',
  /** Google Business profile, by its stable CID. */
  googleMaps: 'https://www.google.com/maps?cid=5037644109956242266',
  /** Atajo a «Escribir una reseña» en Google (página /qr y tickets). */
  resena: 'https://reviewthis.biz/3dcc'
} as const;

/** Tasador con el cupón ya aplicado (lo lee useCupon). */
export function enlaceCupon(codigo: string): string {
  return `${CONTACTO.sitio}/instant-quote?cupon=${encodeURIComponent(codigo)}`;
}

/** `mailto:` link, optionally with a prefilled subject. */
export function mailtoUrl(subject?: string): string {
  const base = `mailto:${CONTACTO.email}`;
  return subject ? `${base}?subject=${encodeURIComponent(subject)}` : base;
}

/** WhatsApp deep link with an optional prefilled message. */
export function whatsappUrl(mensaje?: string): string {
  const base = `https://wa.me/${CONTACTO.whatsapp}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}

/** WhatsApp deep link to an arbitrary number (admin contacting a customer). */
export function whatsappTo(telefono: string, mensaje?: string): string {
  const digits = telefono.replace(/\D/g, '');
  const base = `https://wa.me/${digits}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}

/** Absolute URL for a site path, e.g. canonicals and JSON-LD ids. */
export function siteUrl(path = '/'): string {
  return `${CONTACTO.sitio}${path.startsWith('/') ? path : '/' + path}`;
}

/** Standard sign-off used by error states across the public site. */
export const ESCRIBENOS = `escríbenos a ${CONTACTO.email}`;
