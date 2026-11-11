// What the tasador sends submit-quote: one ficha per piece (the server
// re-prices from it) and the order-level fields. Pure functions.

import type { Filamento, QuoteEntrega } from '@/lib/types';
import type { QuoteResult } from '@/lib/quote/pricing';
import { piezaColors, type Pieza } from '@/lib/quote/types';
import { objetosSeparados } from '@/lib/quote/tresmf';

/** The one contact field: an email if it has an @, else a phone of 9+ digits. */
export function leerContacto(txt: string): { email: string; telefono: string } | null {
  const t = txt.trim();
  if (t.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? { email: t, telefono: '' } : null;
  return t.replace(/\D/g, '').length >= 9 ? { email: '', telefono: t } : null;
}

export function randomPath(ext: string): string {
  const safe = (Math.random().toString(36).slice(2, 8) + Date.now().toString(36)).slice(0, 16);
  return `quotes/${safe}.${ext}`;
}

/**
 * A multi-part file whose bodies each print in one color and do not touch:
 * separate objects, not a multicolor piece (phase 1, part D). It only sets
 * the piece type for the firm price; the price itself does not change.
 */
export function piezaSeparada(p: Pieza): boolean {
  return p.partNames.length > 1 && objetosSeparados(p.cuerpos, p.config.partColors.map((c) => c?.id ?? null));
}

/** What the server needs to price one piece (no file: see submit). */
export function fichaPieza(
  p: Pieza,
  i: number,
  quote: QuoteResult | null,
  filamentos: Filamento[]
): Record<string, unknown> {
  const fil = filamentos.find((f) => f.id === p.config.filamentoId);
  const coloresPieza =
    p.partNames.length > 1
      ? p.config.partColors
          .map((c, j) =>
            c
              ? {
                  nombre: c.nombre,
                  hex: c.hex,
                  muestra_colores: c.muestra_colores,
                  muestra_tipo: c.muestra_tipo,
                  acabado: c.acabado,
                  parte: p.partNames[j]
                }
              : null
          )
          .filter(Boolean)
      : piezaColors(p).map((c) => ({
          nombre: c.nombre,
          hex: c.hex,
          muestra_colores: c.muestra_colores,
          muestra_tipo: c.muestra_tipo,
          acabado: c.acabado,
          parte: ''
        }));
  const pr = quote?.piezas[i];
  return {
    nombre: p.name,
    cantidad: p.cantidad,
    material: fil?.material ?? 'PLA',
    colores: coloresPieza,
    resistencia: p.config.resistenciaId,
    detalle: p.config.detalleId,
    metricas: {
      volumen_cm3: Math.round(p.metrics.volumenCm3 * 100) / 100,
      area_cm2: Math.round(p.metrics.areaCm2 * 10) / 10,
      soporte_cm3: Math.round(p.metrics.soporteCm3 * 10) / 10,
      overhang_cm2: Math.round(p.metrics.overhangCm2 * 10) / 10,
      bbox_mm: p.metrics.bboxMm,
      triangulos: p.metrics.triangulos,
      mallas: p.metrics.mallas,
      peso_g: pr?.pesoG ?? null,
      soporte_g: pr?.soporteG ?? null,
      tiempo_h: pr?.tiempoH ?? null,
      relleno_pct: pr?.rellenoPct ?? null,
      // Layer-analysis figures the server prices from (see submit-quote).
      estimador: pr?.metodo === 'capas' ? 'capas-v1' : 'aproximado',
      por_cama: pr?.porCama ?? 1,
      camas: pr?.camas ?? 1,
      con_soportes: pr?.conSoportes ?? false,
      objetos_separados: piezaSeparada(p),
      orientacion: p.estimacion.original ? 'original' : 'auto',
      rotacion: p.estimacion.R.map((x) => Math.round(x * 1e4) / 1e4)
    }
  };
}

/** The order-level fields both the request and "envíame el presupuesto" send. */
export function cuerpoPedido(
  archivos: Record<string, unknown>[],
  piezas: Pieza[],
  quote: QuoteResult | null,
  entrega: QuoteEntrega,
  cpValido: string | undefined,
  website: string
) {
  if (!quote) return null;
  const materiales = [...new Set(archivos.map((a) => a.material as string))];
  const resistencias = [...new Set(piezas.map((p) => p.config.resistenciaId))];
  const detalles = [...new Set(piezas.map((p) => p.config.detalleId))];
  const coloresGlobal = archivos.flatMap((a, i) =>
    (a.colores as any[]).map((c) => ({
      ...c,
      parte: piezas.length > 1 ? `${piezas[i].name}${c.parte ? ` · ${c.parte}` : ''}` : c.parte
    }))
  );
  return {
    website,
    archivos,
    material: materiales.join(', '),
    colores: coloresGlobal,
    resistencia: resistencias.length === 1 ? resistencias[0] : 'mixto',
    detalle: detalles.length === 1 ? detalles[0] : 'mixto',
    cantidad: quote.unidades,
    entrega,
    direccion: cpValido ? { cp: cpValido } : {},
    metricas: {
      peso_g: quote.pesoG,
      tiempo_h: quote.tiempoH,
      dias_estimados: quote.diasEstimados,
      piezas: quote.piezas.length
    },
    desglose: {
      lineas: quote.lineas,
      descuento_pct: quote.descuentoPct,
      minimo_aplicado: quote.minimoAplicado,
      envio: quote.envio
    },
    precio_total: quote.total,
    cupon: quote.cupon ?? undefined
  };
}
