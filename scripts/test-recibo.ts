// Test de la plantilla del justificante de pago.
//
//   deno run -A scripts/test-recibo.ts [carpeta-salida]
//
// Comprueba lo que puede romperse de verdad:
//   1. DETERMINISMO — dos emisiones con los mismos datos dan bytes idénticos.
//      Si esto falla, el PDF archivado deja de coincidir con el que descarga
//      el cliente y el archivado no prueba nada.
//   2. Caracteres — acentos, ñ, €, comillas curvas y emojis pegados desde
//      WhatsApp no deben tumbar la emisión.
//   3. Casos límite — nombres larguísimos, conceptos de tres líneas, importes
//      de cuatro cifras, pedidos sin total, pagos completos y adelantos.
//
// Deja los PDFs en la carpeta indicada (por defecto /tmp/recibos) para
// revisarlos a ojo, que es la única forma de validar una maquetación.

import { buildReciboPdf } from '../supabase/functions/_shared/recibo/template.ts';
import type { ReciboDatos } from '../supabase/functions/_shared/recibo/types.ts';

const OUT = Deno.args[0] ?? '/tmp/recibos';

const EMISOR = {
  nombre: '3DCC Salamanca',
  dominio: 'impresion3dcc.com',
  email: 'info@impresion3dcc.com',
  telefono: '+34 923 793 123'
};

function base(over: Partial<ReciboDatos> = {}): ReciboDatos {
  return {
    codigo: 'R-2026-0001',
    emitido_at: '2026-08-13T10:24:00.000Z',
    emisor: EMISOR,
    cliente: { nombre: 'María Fernández Núñez' },
    pedido: { codigo: 'Q-2026-0042', total: 90 },
    cobro: {
      importe: 45,
      metodo: 'bizum',
      fecha_pago: '2026-08-12',
      concepto: 'Impresión 3D — 3 piezas en PETG negro · pedido Q-2026-0042',
      es_adelanto: true
    },
    acumulado: { pagado: 45, pendiente: 45 },
    verificacion_url:
      'https://impresion3dcc.com/recibo/?c=R-2026-0001&t=8f14e45f-ceea-467a-9f7c-1b2d3e4f5a6b',
    ...over
  };
}

const CASOS: { nombre: string; datos: ReciboDatos }[] = [
  {
    nombre: '01-adelanto',
    datos: base()
  },
  {
    nombre: '02-pagado-completo',
    datos: base({
      codigo: 'R-2026-0002',
      cliente: { nombre: 'Juan Pérez' },
      cobro: {
        importe: 45,
        metodo: 'efectivo',
        fecha_pago: '2026-08-20',
        concepto: 'Resto del pedido Q-2026-0042',
        es_adelanto: false
      },
      acumulado: { pagado: 90, pendiente: 0 }
    })
  },
  {
    nombre: '03-caracteres-raros',
    datos: base({
      codigo: 'R-2026-0003',
      // Comillas curvas, guiones largos, emoji y CJK: todo lo que la gente
      // pega desde WhatsApp o Word sin darse cuenta.
      cliente: { nombre: 'Ángel Muñoz “el Ñoño” — Diseño & Cía. 🎨' },
      cobro: {
        importe: 1234.5,
        metodo: 'transferencia',
        fecha_pago: '2026-12-31',
        concepto:
          'Reproducción de pieza histórica — acabado «premium» con purpurina, ' +
          'incluye postprocesado, imprimación y barnizado 東京 🚀 a 0,05 €/g',
        es_adelanto: false
      },
      pedido: { codigo: 'Q-2026-1234', total: 1234.5 },
      acumulado: { pagado: 1234.5, pendiente: 0 }
    })
  },
  {
    nombre: '04-sin-total-ni-qr',
    datos: base({
      codigo: 'R-2026-0004',
      pedido: { codigo: 'Q-2026-0007', total: null },
      acumulado: { pagado: 20, pendiente: null },
      cobro: {
        importe: 20,
        metodo: 'otro',
        fecha_pago: '2026-01-05',
        concepto: '',
        es_adelanto: false
      },
      verificacion_url: null
    })
  },
  {
    nombre: '05-desbordes',
    datos: base({
      codigo: 'R-2026-0005',
      cliente: {
        nombre:
          'Asociación Cultural y Deportiva de Fabricantes Digitales de Castilla y León'
      },
      pedido: { codigo: 'Q-2026-9999', total: 12345.67 },
      cobro: {
        importe: 9999.99,
        metodo: 'tarjeta',
        fecha_pago: '2026-02-29',
        concepto:
          'Pedido corporativo de 480 piezas repartidas en 12 referencias distintas, ' +
          'con control dimensional pieza a pieza, embalaje individual retractilado, ' +
          'etiquetado con código QR por unidad y entrega fraccionada en cuatro envíos ' +
          'a lo largo del primer trimestre según calendario acordado por correo.',
        es_adelanto: true
      },
      acumulado: { pagado: 9999.99, pendiente: 2345.68 }
    })
  }
];

// ── Ejecución ──────────────────────────────────────────────────────────────

async function sha256(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

await Deno.mkdir(OUT, { recursive: true });

let fallos = 0;
const ok = (msg: string) => console.log(`  \x1b[32mok\x1b[0m   ${msg}`);
const fail = (msg: string) => {
  fallos++;
  console.log(`  \x1b[31mFALLO\x1b[0m ${msg}`);
};

console.log(`\nJustificantes de prueba → ${OUT}\n`);

for (const caso of CASOS) {
  try {
    const a = await buildReciboPdf(caso.datos);
    const b = await buildReciboPdf(caso.datos);
    const ha = await sha256(a);
    const hb = await sha256(b);

    await Deno.writeFile(`${OUT}/${caso.nombre}.pdf`, a);

    if (ha !== hb) {
      fail(`${caso.nombre}: NO determinista (${ha.slice(0, 12)} vs ${hb.slice(0, 12)})`);
    } else if (a.byteLength < 2000) {
      fail(`${caso.nombre}: PDF sospechosamente pequeño (${a.byteLength} B)`);
    } else {
      const cab = new TextDecoder().decode(a.subarray(0, 5));
      if (cab !== '%PDF-') {
        fail(`${caso.nombre}: cabecera inválida "${cab}"`);
      } else {
        ok(`${caso.nombre}  ${(a.byteLength / 1024).toFixed(1)} KB  sha ${ha.slice(0, 12)}`);
      }
    }
  } catch (e) {
    fail(`${caso.nombre}: excepción — ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Un cambio real en los datos DEBE cambiar los bytes: si no, el determinismo
// se estaría consiguiendo ignorando la entrada.
const uno = await buildReciboPdf(base());
const otro = await buildReciboPdf(base({ cobro: { ...base().cobro, importe: 46 } }));
if ((await sha256(uno)) === (await sha256(otro))) {
  fail('sensibilidad: cambiar el importe no cambia el PDF');
} else {
  ok('sensibilidad: cambiar los datos cambia el PDF');
}

console.log(
  fallos === 0
    ? `\n\x1b[32m${CASOS.length + 1} comprobaciones OK\x1b[0m\n`
    : `\n\x1b[31m${fallos} fallo(s)\x1b[0m\n`
);
Deno.exit(fallos === 0 ? 0 : 1);
