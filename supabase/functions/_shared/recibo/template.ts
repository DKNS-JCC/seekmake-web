// Plantilla del justificante de pago (A4, una página).
//
// REQUISITO CLAVE — DETERMINISMO: los mismos `datos` deben producir siempre
// los mismos bytes. Por eso:
//   * las fechas de creación/modificación del PDF salen de `datos.emitido_at`,
//     nunca de Date.now();
//   * no se usa Intl (el ICU puede diferir entre entornos): el formato de
//     moneda y fecha es manual;
//   * no hay nada aleatorio (ni IDs, ni UUIDs, ni orden de claves variable).
// Si esto se rompe, el PDF archivado deja de coincidir con el que descarga el
// cliente y el archivado deja de probar nada. Hay un test que lo comprueba:
// scripts/test-recibo.ts
//
// Fuentes estándar (Helvetica/Courier) con WinAnsiEncoding: cubre acentos, ñ
// y € sin incrustar tipografías (~30 KB por PDF en vez de ~250 KB).

import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import type { ReciboDatos } from './types.ts';
import { METODO_LABEL } from './types.ts';
import { LOGO_PNG_BASE64 } from './assets.ts';
import { qrRuns } from './qr.ts';

// ── Geometría (puntos PostScript; A4 = 595.28 × 841.89) ────────────────────
const A4_W = 595.28;
const A4_H = 841.89;
const M = 56; // margen ~2 cm

// ── Paleta (alineada con las variables CSS del sitio) ──────────────────────
const ACCENT = rgb(0.035, 0.365, 0.792); // #095DCA
const TEXT = rgb(0.067, 0.071, 0.09); // #11121A
const MUTED = rgb(0.38, 0.37, 0.42);
const HAIRLINE = rgb(0.87, 0.87, 0.88);
const FILL = rgb(0.965, 0.969, 0.976);
const WHITE = rgb(1, 1, 1);

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

// ── Saneado WinAnsi ────────────────────────────────────────────────────────
// Helvetica estándar solo codifica WinAnsi. Un carácter fuera de esa tabla
// (una comilla curva pegada desde Word, un emoji en el concepto) haría que
// pdf-lib lanzara una excepción a mitad de la emisión. Se normaliza antes.
const REEMPLAZOS: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'",
  '“': '"', '”': '"', '„': '"',
  '–': '-', '—': '-', '−': '-',
  '…': '...', ' ': ' ', ' ': ' ', ' ': ' ',
  '•': '·', '→': '->', '×': 'x'
};

export function winAnsiSafe(s: string): string {
  let out = '';
  for (const ch of String(s ?? '')) {
    const rep = REEMPLAZOS[ch];
    if (rep !== undefined) {
      out += rep;
      continue;
    }
    const cp = ch.codePointAt(0) ?? 0;
    // ASCII imprimible + Latin-1 alto (cubre áéíóúñÑüçÁÉ...) + € y ‰.
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || cp === 0x20ac) {
      out += ch;
    }
    // Cualquier otra cosa (emoji, CJK, símbolos raros) se descarta en
    // silencio: mejor un guion de menos que un justificante que no se emite.
  }
  return out;
}

// ── Formatos manuales (deterministas, sin Intl) ────────────────────────────

/** 1234.5 → "1.234,50 EUR" con el símbolo €. */
export function euros(n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const neg = v < 0;
  const [ent, dec] = Math.abs(v).toFixed(2).split('.');
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${miles},${dec} €`;
}

/** "2026-08-12" → "12/08/2026". Sin new Date(): evita saltos de zona horaria. */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? '');
}

/** "2026-08-12T…" → "12 de agosto de 2026". */
export function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  const mes = MESES[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} de ${mes} de ${m[1]}`;
}

// ── Utilidades de dibujo ───────────────────────────────────────────────────

type Font = { widthOfTextAtSize(t: string, s: number): number };

/** Parte `texto` en líneas que caben en `max` puntos. */
function wrap(texto: string, font: Font, size: number, max: number): string[] {
  const palabras = winAnsiSafe(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const lineas: string[] = [];
  let actual = palabras[0];
  for (let i = 1; i < palabras.length; i++) {
    const cand = `${actual} ${palabras[i]}`;
    if (font.widthOfTextAtSize(cand, size) <= max) {
      actual = cand;
    } else {
      lineas.push(actual);
      actual = palabras[i];
    }
  }
  lineas.push(actual);
  return lineas;
}

/** Recorta con puntos suspensivos si no cabe (nombres largos de cliente). */
function ellipsis(texto: string, font: Font, size: number, max: number): string {
  const t = winAnsiSafe(texto);
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  let corte = t;
  while (corte.length > 1 && font.widthOfTextAtSize(corte + '...', size) > max) {
    corte = corte.slice(0, -1);
  }
  return corte.trimEnd() + '...';
}

// ── Documento ──────────────────────────────────────────────────────────────

export async function buildReciboPdf(datos: ReciboDatos): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.CourierBold);

  const page = pdf.addPage([A4_W, A4_H]);
  const rightEdge = A4_W - M;
  const contentW = A4_W - M * 2;

  const text = (
    s: string,
    x: number,
    y: number,
    opts: { size?: number; font?: typeof helv; color?: typeof TEXT } = {}
  ) => {
    page.drawText(winAnsiSafe(s), {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? helv,
      color: opts.color ?? TEXT
    });
  };

  const textRight = (
    s: string,
    xRight: number,
    y: number,
    opts: { size?: number; font?: typeof helv; color?: typeof TEXT } = {}
  ) => {
    const safe = winAnsiSafe(s);
    const f = opts.font ?? helv;
    const size = opts.size ?? 10;
    text(safe, xRight - f.widthOfTextAtSize(safe, size), y, opts);
  };

  /** Etiqueta en versalitas espaciadas, el estilo del panel de admin. */
  const label = (s: string, x: number, y: number) => {
    text(s.toUpperCase(), x, y, { size: 7.5, font: bold, color: MUTED });
  };

  // ── Cabecera ─────────────────────────────────────────────────────────────
  const logo = await pdf.embedPng(decodeBase64(LOGO_PNG_BASE64));
  const logoSize = 40;
  page.drawImage(logo, { x: M, y: A4_H - 58 - logoSize + 12, width: logoSize, height: logoSize });

  text(datos.emisor.nombre, M + logoSize + 12, A4_H - 62, { size: 13, font: bold });
  text(datos.emisor.dominio, M + logoSize + 12, A4_H - 76, { size: 9, color: MUTED });

  textRight('JUSTIFICANTE DE PAGO', rightEdge, A4_H - 60, {
    size: 11,
    font: bold,
    color: ACCENT
  });
  textRight(datos.codigo, rightEdge, A4_H - 80, { size: 16, font: mono, color: TEXT });

  page.drawRectangle({
    x: M,
    y: A4_H - 100,
    width: contentW,
    height: 2,
    color: ACCENT
  });

  // ── Datos del cobro (rejilla 2×2) ────────────────────────────────────────
  const colL = M;
  const colR = M + contentW / 2 + 8;
  const colW = contentW / 2 - 8;
  let y = A4_H - 128;

  label('Recibido de', colL, y);
  label('Nº de pedido', colR, y);
  y -= 15;
  text(ellipsis(datos.cliente.nombre || '—', bold, 12, colW), colL, y, {
    size: 12,
    font: bold
  });
  text(datos.pedido.codigo || '—', colR, y, { size: 12, font: mono });

  y -= 30;
  label('Fecha del cobro', colL, y);
  label('Forma de pago', colR, y);
  y -= 15;
  text(fechaCorta(datos.cobro.fecha_pago), colL, y, { size: 11 });
  text(METODO_LABEL[datos.cobro.metodo] ?? datos.cobro.metodo, colR, y, { size: 11 });

  // ── Concepto ─────────────────────────────────────────────────────────────
  y -= 34;
  label('Concepto', colL, y);
  y -= 8;

  // Máximo 6 líneas: acota la altura de la página y garantiza que el bloque
  // de verificación nunca puede chocar con el pie, por largo que sea el texto.
  const conceptoLineas = wrap(
    datos.cobro.concepto || 'Servicios de impresión 3D',
    helv,
    10.5,
    contentW - 28
  ).slice(0, 6);
  const conceptoH = Math.max(38, 20 + conceptoLineas.length * 14);
  page.drawRectangle({
    x: M,
    y: y - conceptoH,
    width: contentW,
    height: conceptoH,
    color: FILL,
    borderColor: HAIRLINE,
    borderWidth: 1
  });
  let cy = y - 22;
  for (const linea of conceptoLineas) {
    text(linea, M + 14, cy, { size: 10.5 });
    cy -= 14;
  }
  y -= conceptoH + 26;

  // ── Importes ─────────────────────────────────────────────────────────────
  const cajaH = 74;
  page.drawRectangle({
    x: M,
    y: y - cajaH,
    width: contentW,
    height: cajaH,
    color: WHITE,
    borderColor: ACCENT,
    borderWidth: 1.5
  });

  label(
    datos.cobro.es_adelanto ? 'Importe recibido (adelanto)' : 'Importe recibido',
    M + 16,
    y - 24
  );
  text(euros(datos.cobro.importe), M + 16, y - 54, { size: 24, font: bold, color: ACCENT });

  // Contexto del saldo, a la derecha. Solo si se conoce el total del pedido:
  // un "pendiente" inventado en un justificante es peor que no decir nada.
  if (datos.pedido.total != null) {
    const pend = datos.acumulado.pendiente ?? 0;
    const pagado = pend <= 0.004;
    // Etiqueta y valor en columnas fijas y sin texto variable en el importe:
    // un literal largo tipo "pedido pagado" se comía la etiqueta de al lado.
    const labelX = rightEdge - 170;

    label('Total del pedido', labelX, y - 26);
    textRight(euros(datos.pedido.total), rightEdge - 16, y - 28, { size: 10.5 });

    label('Pendiente', labelX, y - 50);
    textRight(euros(pend), rightEdge - 16, y - 52, {
      size: 11,
      font: bold,
      color: pagado ? rgb(0.02, 0.5, 0.32) : TEXT
    });
    if (pagado) {
      textRight('Pedido pagado por completo', rightEdge - 16, y - 64, {
        size: 8,
        color: rgb(0.02, 0.5, 0.32)
      });
    }
  }

  y -= cajaH + 34;

  // ── Verificación (QR) ────────────────────────────────────────────────────
  // Sigue el flujo justo debajo de los importes. El blanco sobrante queda
  // todo junto al final de la página, que es como se lee un recibo; anclarlo
  // abajo dejaba un hueco en mitad del documento con pinta de error.
  if (datos.verificacion_url) {
    const qr = qrRuns(datos.verificacion_url);
    // 92 pt / 41 módulos ≈ 0,8 mm por módulo: el mínimo cómodo para que la
    // cámara de un móvil lo lea de una pasada sobre papel.
    const qrPx = 92;
    const mod = qrPx / qr.size;
    const qrX = M;
    const qrY = y - qrPx;

    // Zona de silencio blanca: sin ella el lector falla sobre fondo de color.
    page.drawRectangle({
      x: qrX - 5,
      y: qrY - 5,
      width: qrPx + 10,
      height: qrPx + 10,
      color: WHITE
    });
    for (const [row, col, len] of qr.runs) {
      page.drawRectangle({
        x: qrX + col * mod,
        // fila 0 del QR arriba; el eje Y del PDF crece hacia arriba.
        y: qrY + qrPx - (row + 1) * mod,
        width: len * mod,
        height: mod,
        color: TEXT
      });
    }

    const tx = qrX + qrPx + 20;
    text('Verifica este justificante', tx, y - 16, { size: 10.5, font: bold });
    text('Escanea el código o abre el enlace: la web confirma', tx, y - 32, {
      size: 8.5,
      color: MUTED
    });
    text('el importe y la fecha contra nuestros registros.', tx, y - 43, {
      size: 8.5,
      color: MUTED
    });
    const urlLineas = wrap(datos.verificacion_url, helv, 7.5, contentW - qrPx - 36);
    let uy = y - 60;
    for (const linea of urlLineas.slice(0, 3)) {
      text(linea, tx, uy, { size: 7.5, color: MUTED });
      uy -= 10;
    }
  }

  // ── Pie ──────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: M, y: 96, width: contentW, height: 1, color: HAIRLINE });

  text(
    'Este documento acredita el cobro indicado. No es una factura a efectos fiscales.',
    M,
    80,
    { size: 8.5, font: bold, color: MUTED }
  );
  text(
    `Emitido el ${fechaLarga(datos.emitido_at)} por ${datos.emisor.nombre}.`,
    M,
    68,
    { size: 8.5, color: MUTED }
  );
  text(
    `${datos.emisor.email} · ${datos.emisor.telefono} · ${datos.emisor.dominio}`,
    M,
    56,
    { size: 8.5, color: MUTED }
  );

  // ── Metadatos deterministas ──────────────────────────────────────────────
  const emitido = new Date(datos.emitido_at);
  const creacion = isNaN(emitido.getTime()) ? new Date(0) : emitido;

  pdf.setTitle(`Justificante de pago ${datos.codigo}`);
  pdf.setSubject(`Cobro de ${euros(datos.cobro.importe)} - pedido ${datos.pedido.codigo}`);
  pdf.setAuthor(datos.emisor.nombre);
  pdf.setProducer(datos.emisor.dominio);
  pdf.setCreator(datos.emisor.dominio);
  pdf.setCreationDate(creacion);
  pdf.setModificationDate(creacion);

  return await pdf.save({ useObjectStreams: false });
}

// ── base64 → bytes, sin depender de atob ni de Buffer ──────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function decodeBase64(b64: string): Uint8Array {
  const limpio = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((limpio.length * 3) / 4);
  const out = new Uint8Array(len);
  let acc = 0;
  let bits = 0;
  let pos = 0;
  for (const ch of limpio) {
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[pos++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, pos);
}
