// Ticket del pedido para la impresora térmica (384 px): logo, resumen de
// piezas con importes, totales, entrega, cuidados de los materiales técnicos,
// un cupón opcional para el próximo encargo y un QR para dejarnos una reseña.

import qrcode from 'qrcode-generator';
import type { CuponRow, Quote } from '@/lib/types';
import { ANCHO } from '@/lib/impresora-termica';
import { CONTACTO } from '@/lib/contacto';
import { euros } from '@/lib/recibo/types';
import { diaCorto, piezas } from './estados';

const M = 10; // margen lateral
const UTIL = ANCHO - 2 * M;

export type Pieza = { nombre: string; cantidad: number; material: string; colores?: { nombre: string }[] };
type Linea = { concepto: string; importe: number };

// Solo materiales técnicos y solo lo que el cliente debe saber para no
// estropear la pieza. PLA y PETG no llevan nada. Se busca por palabra
// («PA12-CF» cuenta como PA y como fibra).
const CUIDADOS: [RegExp, string, string][] = [
  [/^ASA$/, 'ASA', 'Apta para exterior. Limpiar solo con agua y jabón, nunca con acetona.'],
  [/^ABS$/, 'ABS', 'Evitar el sol directo. Limpiar solo con agua y jabón, nunca con acetona.'],
  [/^TPU$/, 'TPU', 'Pieza flexible. Limpiar con agua tibia y jabón, sin disolventes.'],
  [/^(PA\d*|NYLON)$/, 'Nailon', 'Guardar en un lugar seco.'],
  [/^PC$/, 'Policarbonato', 'No limpiar con acetona ni disolventes.'],
  [/^(CF|GF)$/, 'Con fibra', 'No lijar ni taladrar sin mascarilla.']
];

export function cuidados(materiales: (string | null | undefined)[]): { material: string; texto: string }[] {
  const palabras = new Set(materiales.flatMap((m) => (m ?? '').toUpperCase().split(/[^A-Z0-9]+/)).filter(Boolean));
  return CUIDADOS.filter(([re]) => [...palabras].some((w) => re.test(w))).map(([, material, texto]) => ({ material, texto }));
}

let logo: Promise<HTMLImageElement> | null = null;
function cargarLogo() {
  logo ??= new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error('No se pudo cargar el logo'));
    img.src = '/icons/logo.webp';
  });
  return logo;
}

/** Líneas del ticket: desglose («pieza.stl — PLA (~2 g…)») con material y colores; sin desglose, una línea con el total. */
export function lineasTicket(q: Pick<Quote, 'desglose' | 'archivos' | 'descripcion'>, total: number, pzs: Pieza[] = []) {
  const desglose = (q.desglose as { lineas?: Linea[] } | null)?.lineas;
  if (!Array.isArray(desglose) || !desglose.length) return [{ nombre: piezas(q), detalle: '', importe: total }];
  return desglose.map((l) => {
    const [archivo, resto = ''] = l.concepto.split(' — ');
    const p = pzs.find((x) => x.nombre === archivo);
    const material = p?.material ?? resto.split(' (')[0];
    const colores = (p?.colores ?? []).map((c) => c.nombre).join(', ');
    return {
      nombre: (p && p.cantidad > 1 ? `${p.cantidad} × ` : '') + archivo.replace(/\.(stl|3mf|obj|step|stp)$/i, ''),
      detalle: [material, colores].filter(Boolean).join(' · '),
      importe: Number(l.importe) || 0
    };
  });
}

export async function ticketPedido(q: Quote, pzs: Pieza[] = [], cupon: CuponRow | null = null): Promise<HTMLCanvasElement> {
  // Se pinta en un lienzo alto y al final se recorta a lo usado.
  const c = document.createElement('canvas');
  c.width = ANCHO;
  c.height = 4000;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ANCHO, c.height);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  let y = 8;

  const partir = (t: string, ancho: number) => {
    const out: string[] = [];
    let l = '';
    for (const w of t.split(/\s+/).filter(Boolean)) {
      const p = l ? `${l} ${w}` : w;
      if (ctx.measureText(p).width > ancho && l) {
        out.push(l);
        l = w;
      } else l = p;
    }
    return l ? [...out, l] : out;
  };
  const texto = (t: string, fuente: string, alto: number, alinear: 'left' | 'center' = 'left', max = 3) => {
    ctx.font = fuente;
    ctx.textAlign = alinear;
    let ls = partir(t, UTIL);
    if (ls.length > max) ls = [...ls.slice(0, max - 1), ls[max - 1] + '…'];
    for (const l of ls) {
      ctx.fillText(l, alinear === 'center' ? ANCHO / 2 : M, y);
      y += alto;
    }
    ctx.textAlign = 'left';
  };
  // Concepto a la izquierda (puede partirse) e importe a la derecha.
  const fila = (izq: string, der: string, fuente: string, alto: number) => {
    ctx.font = fuente;
    const ancho = ctx.measureText(der).width;
    ctx.textAlign = 'right';
    ctx.fillText(der, ANCHO - M, y);
    ctx.textAlign = 'left';
    for (const l of partir(izq, UTIL - ancho - 12).slice(0, 3)) {
      ctx.fillText(l, M, y);
      y += alto;
    }
  };
  const dibujarQr = (contenido: string, lado: number) => {
    const qr = qrcode(0, 'M');
    qr.addData(contenido);
    qr.make();
    const n = qr.getModuleCount();
    const mod = Math.floor(lado / n);
    const x0 = Math.round((ANCHO - n * mod) / 2);
    y += 8;
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) ctx.fillRect(x0 + k * mod, y + r * mod, mod, mod);
    y += n * mod + 14;
  };
  const raya = (gruesa = false) => {
    y += 6;
    if (gruesa) ctx.fillRect(M, y, UTIL, 3);
    else for (let x = M; x < ANCHO - M; x += 10) ctx.fillRect(x, y, 6, 2);
    y += 12;
  };

  // Cabecera: logo pasado a blanco y negro puro (el azul claro se perdería con el umbral de la impresora).
  const img = await cargarLogo();
  const lado = 200;
  ctx.drawImage(img, 150, 160, 724, 724, (ANCHO - lado) / 2, y, lado, lado);
  const px = ctx.getImageData(0, y, ANCHO, lado);
  for (let i = 0; i < px.data.length; i += 4) {
    const v = (px.data[i] + px.data[i + 1] + px.data[i + 2]) / 3 < 200 ? 0 : 255;
    px.data[i] = px.data[i + 1] = px.data[i + 2] = v;
  }
  ctx.putImageData(px, 0, y);
  y += lado + 6;
  texto('Impresión 3D a medida · Salamanca', 'bold 20px sans-serif', 26, 'center');
  texto(`${CONTACTO.dominio} · ${CONTACTO.telefono}`, '18px sans-serif', 24, 'center');
  raya(true);

  // Pedido y cliente.
  texto(q.codigo, 'bold 44px sans-serif', 50, 'center');
  texto(new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }), '18px sans-serif', 26, 'center');
  texto(`Cliente: ${q.nombre}`, 'bold 22px sans-serif', 28, 'left', 2);
  raya();

  // Piezas.
  const total = Number(q.precio_final ?? q.precio_total) || 0;
  for (const l of lineasTicket(q, total, pzs)) {
    fila(l.nombre, euros(l.importe), 'bold 21px sans-serif', 26);
    if (l.detalle) texto(l.detalle, '18px sans-serif', 24, 'left', 2);
    y += 6;
  }
  raya();

  // Totales.
  const pagado = Number(q.importe_pagado) || 0;
  fila('TOTAL', euros(total), 'bold 32px sans-serif', 40);
  fila('Pagado', euros(pagado), '21px sans-serif', 28);
  if (pagado >= total) texto('✓ PAGADO', 'bold 24px sans-serif', 30, 'center');
  else fila('Pendiente', euros(total - pagado), 'bold 24px sans-serif', 30);
  raya();

  // Entrega.
  texto(q.entrega === 'envio' ? `Envío a ${q.direccion?.ciudad ?? '—'}` : 'Recogida en Salamanca', 'bold 21px sans-serif', 26, 'left', 2);
  if (q.fecha_prometida) texto(`Listo antes del ${diaCorto(q.fecha_prometida)}`, '20px sans-serif', 26);
  raya();

  // Cuidados de los materiales técnicos.
  const notas = cuidados([...pzs.map((p) => p.material), q.material]);
  if (notas.length) {
    texto('Cuidados de tu pieza', 'bold 24px sans-serif', 30);
    for (const n of notas) {
      texto(n.material, 'bold 20px sans-serif', 25);
      texto(n.texto, '19px sans-serif', 24, 'left', 5);
      y += 6;
    }
    raya();
  }

  // Cupón para el próximo encargo (opcional, se elige junto al botón).
  if (cupon) {
    texto('Para tu próximo encargo', 'bold 24px sans-serif', 32, 'center');
    ctx.font = 'bold 40px monospace';
    const caja = Math.min(UTIL, ctx.measureText(cupon.codigo).width + 40);
    ctx.fillRect((ANCHO - caja) / 2, y, caja, 56);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(cupon.codigo, ANCHO / 2, y + 8);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';
    y += 66;
    texto(`${cupon.tipo === 'pct' ? `${cupon.valor} %` : euros(Number(cupon.valor))} de descuento`, 'bold 26px sans-serif', 32, 'center');
    const condiciones = [
      Number(cupon.pedido_minimo) > 0 ? `Pedido mínimo ${euros(Number(cupon.pedido_minimo))}` : '',
      cupon.valido_hasta ? `Hasta el ${diaCorto(cupon.valido_hasta)}` : ''
    ].filter(Boolean).join(' · ');
    if (condiciones) texto(condiciones, '19px sans-serif', 24, 'center', 2);
    texto(`Úsalo en ${CONTACTO.dominio}`, '19px sans-serif', 24, 'center');
    raya();
  }

  // QR de reseña.
  texto('¿Qué tal ha ido?', 'bold 26px sans-serif', 32, 'center');
  texto('Escanea y déjanos tu reseña en Google', '19px sans-serif', 26, 'center');
  dibujarQr(CONTACTO.resena, 180);
  texto('¡Gracias por confiar en nosotros!', 'bold 22px sans-serif', 28, 'center');
  y += 10;
  texto('Documento sin validez fiscal', '16px sans-serif', 20, 'center');
  y += 20;

  const out = document.createElement('canvas');
  out.width = ANCHO;
  out.height = y;
  out.getContext('2d')!.drawImage(c, 0, 0);
  return out;
}
