// Printable quote summary. The browser's own "save as PDF" does the work, so
// a static-export site needs no PDF library.

import { CONTACTO } from '@/lib/contacto';
import { fechaLarga as fechaPlazo, fechaTope, type QuoteResult, type QuoteSettings } from './pricing';
import { euros } from '@/lib/recibo/types';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fechaLarga(ms: number): string {
  return new Date(ms).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

type PdfQuote = Pick<QuoteResult, 'lineas' | 'total' | 'pesoG' | 'tiempoH'>;

/**
 * `encargo`: presupuesto cerrado de «Nuevo encargo» (no una estimación), con
 * su fecha tope ya calculada y, si lo hay, su código.
 */
export function buildQuotePdfHtml(
  quote: PdfQuote,
  settings: QuoteSettings,
  colaH = 0,
  encargo?: { fechaTope: string; codigo?: string }
): string {
  const fecha = fechaLarga(Date.now());
  const validez = fechaLarga(Date.now() + settings.validez_dias * 24 * 60 * 60 * 1000);
  const filas = quote.lineas
    .map(
      (l) =>
        `<tr><td>${esc(l.concepto)}</td>` +
        `<td style="text-align:right;white-space:nowrap;">${euros(l.importe)}</td></tr>`
    )
    .join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Presupuesto 3DCC${encargo?.codigo ? ` ${esc(encargo.codigo)}` : ''}</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#111;max-width:640px;margin:32px auto;padding:0 16px;}
  h1{color:#0EA5E9;margin:0;font-size:24px;} .sub{color:#666;font-size:13px;margin:2px 0 24px;}
  table{width:100%;border-collapse:collapse;font-size:14px;}
  td{padding:8px 10px;border-bottom:1px solid #eee;}
  .total td{font-weight:700;font-size:16px;border-top:2px solid #111;border-bottom:none;}
  .nota{color:#666;font-size:12px;margin-top:24px;line-height:1.6;}
</style></head><body>
${
  encargo
    ? `<h1>${CONTACTO.nombre} — Presupuesto${encargo.codigo ? ` ${esc(encargo.codigo)}` : ''}</h1>
<p class="sub">${fecha} · ${CONTACTO.dominio} · Válido hasta el ${validez}</p>
<table>${filas}<tr class="total"><td>TOTAL</td><td style="text-align:right;">${euros(quote.total)}</td></tr></table>
<p class="nota">
  Listo antes del ${fechaPlazo(encargo.fechaTope)} si lo aceptas hoy. Para empezar pedimos una señal del 50 %.<br>
  Contacto: ${CONTACTO.email} · WhatsApp ${CONTACTO.telefono}.
</p>`
    : `<h1>${CONTACTO.nombre} — Estimación de impresión 3D</h1>
<p class="sub">${fecha} · ${CONTACTO.dominio} · Estimación orientativa, válida hasta el ${validez}</p>
<table>${filas}<tr class="total"><td>TOTAL ESTIMADO</td><td style="text-align:right;">${euros(quote.total)}</td></tr></table>
<p class="nota">
  ~${Math.round(quote.pesoG)} g de material · ~${quote.tiempoH.toFixed(1)} h de impresión ·
  listo antes del ${fechaPlazo(fechaTope(quote.tiempoH, settings, colaH))} si lo pides hoy.<br>
  El precio final se confirma tras revisar las piezas. Contacto: ${CONTACTO.email} · WhatsApp ${CONTACTO.telefono}.
</p>`
}
<script>window.onload=function(){window.print();}</script>
</body></html>`;
}

/** Opens the summary in a new window and triggers the print dialog. */
export function openQuotePdf(
  quote: PdfQuote,
  settings: QuoteSettings,
  colaH = 0,
  encargo?: { fechaTope: string; codigo?: string }
): boolean {
  const w = window.open('', '_blank', 'width=760,height=900');
  if (!w) return false;
  w.document.write(buildQuotePdfHtml(quote, settings, colaH, encargo));
  w.document.close();
  return true;
}
