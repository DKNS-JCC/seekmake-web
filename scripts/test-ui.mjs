// Render de humo de los componentes nuevos.
//
//   node scripts/test-ui.mjs
//
// `next build` no se puede ejecutar en cualquier entorno (necesita mmap sobre
// el sistema de ficheros del proyecto), y `tsc` solo comprueba tipos: no
// detecta que un componente reviente al pintarse con datos reales. Esto los
// empaqueta con esbuild y los renderiza con react-dom/server, que es donde
// salen los fallos de verdad: un campo nulo sin proteger, un .map sobre
// undefined, un hook mal puesto.
//
// Los .css se sustituyen por módulos vacíos: aquí se comprueba el marcado, no
// los estilos.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// El bundle se escribe DENTRO del proyecto: los imports que se dejan externos
// (react, react-dom) se resuelven subiendo hasta node_modules, y desde /tmp no
// habría forma de encontrarlos.
const dir = join(process.cwd(), 'node_modules', '.cache', 'ui-test');
mkdirSync(dir, { recursive: true });

let fallos = 0;
const ok = (m) => console.log(`  \x1b[32mok\x1b[0m   ${m}`);
const fail = (m) => {
  fallos++;
  console.log(`  \x1b[31mFALLO\x1b[0m ${m}`);
};

/** Ignora los imports de CSS al empaquetar. */
const cssVacio = {
  name: 'css-vacio',
  setup(b) {
    b.onResolve({ filter: /\.css$/ }, (a) => ({ path: a.path, namespace: 'css-vacio' }));
    b.onLoad({ filter: /.*/, namespace: 'css-vacio' }, () => ({ contents: '', loader: 'js' }));
  }
};

/** next/link se sustituye por un <a>: aquí se comprueba el marcado, no el enrutado. */
const linkSimple = {
  name: 'link-simple',
  setup(b) {
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'next-link', namespace: 'link-simple' }));
    b.onLoad({ filter: /.*/, namespace: 'link-simple' }, () => ({
      contents: "import { createElement } from 'react'; export default ({ href, children, ...p }) => createElement('a', { href, ...p }, children);",
      loader: 'js'
    }));
  }
};

/** next/navigation fuera de Next: una ruta fija y un router que no hace nada. */
const navegacionSimple = {
  name: 'navegacion-simple',
  setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'next-navigation', namespace: 'navegacion-simple' }));
    b.onLoad({ filter: /.*/, namespace: 'navegacion-simple' }, () => ({
      contents:
        "export const usePathname = () => '/instant-quote/';" +
        'export const useRouter = () => ({ push() {}, replace() {}, back() {}, refresh() {}, prefetch() {} });' +
        'export const useSearchParams = () => new URLSearchParams();',
      loader: 'js'
    }));
  }
};

/** Empaqueta un módulo del proyecto y lo importa ya ejecutable. */
async function cargar(entrada, nombre) {
  const salida = join(dir, `${nombre}.mjs`);
  await build({
    entryPoints: [entrada],
    outfile: salida,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    target: 'node20',
    // React y el cliente de Supabase se resuelven desde node_modules en
    // tiempo de ejecución, no se empaquetan.
    external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
    plugins: [cssVacio, linkSimple, navegacionSimple],
    alias: { '@': process.cwd() },
    logLevel: 'silent'
  });
  return import(pathToFileURL(salida).href);
}

// El cliente de Supabase se instancia en el módulo: hacen falta las variables.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://ejemplo.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'clave-de-prueba';

const { renderToStaticMarkup } = await import('react-dom/server');
const { createElement } = await import('react');

const render = (Comp, props) => renderToStaticMarkup(createElement(Comp, props));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function check(nombre, fn) {
  try {
    await fn();
    ok(nombre);
  } catch (e) {
    fail(`${nombre} — ${e.message}`);
  }
}

console.log('\n▸ Render de componentes\n');

// ── EnvioCard ──────────────────────────────────────────────────────────────
const { EnvioCard } = await cargar('app/(site)/presupuesto/EnvioCard.tsx', 'envio');

const envioBase = {
  carrier: 'inpost',
  carrier_nombre: 'InPost',
  metodo: 'InPost Parcels 48h',
  tracking_number: '620012345678',
  tracking_url: null,
  estado: 'en_transito',
  punto_recogida: {
    nombre: 'Locker Carrefour Torres Villarroel',
    direccion: 'C/ Vaguada de la Palma s/n',
    ciudad: 'Salamanca',
    horario: 'Abierto 24 h',
    hasta: '3 días para recogerlo'
  },
  fecha_estimada: '2026-08-18',
  nota_cliente: 'Te lo dejo en el locker porque el portal estaba cerrado.',
  etiqueta_at: '2026-08-12T09:00:00Z',
  transito_at: '2026-08-13T07:30:00Z',
  disponible_at: null,
  entregado_at: null,
  updated_at: '2026-08-13T07:30:00Z'
};

await check('envío InPost completo: tracking, punto y aviso de CP', async () => {
  const html = render(EnvioCard, { envio: envioBase });
  assert(html.includes('620012345678'), 'no muestra el número de seguimiento');
  assert(html.includes('InPost'), 'no muestra el transportista');
  assert(html.includes('Locker Carrefour'), 'no muestra el punto de recogida');
  // Sin tracking_url propia se enlaza a la página de InPost, que pide el CP:
  // hay que avisar en vez de prometer un enlace que se queda a medias.
  assert(html.includes('código postal'), 'no avisa de que InPost pedirá el CP');
  assert(html.includes('inpost.es'), 'no enlaza a InPost');
});

await check('con tracking_url de Sendcloud no se avisa del CP', async () => {
  const html = render(EnvioCard, {
    envio: { ...envioBase, tracking_url: 'https://tracking.sendcloud.sc/abc123' }
  });
  assert(html.includes('tracking.sendcloud.sc'), 'no usa la URL directa');
  assert(!html.includes('código postal'), 'avisa del CP con un enlace que no lo pide');
});

await check('envío mínimo: sin punto, sin nota, sin fechas', async () => {
  const html = render(EnvioCard, {
    envio: {
      ...envioBase,
      carrier: null,
      carrier_nombre: null,
      metodo: null,
      tracking_url: null,
      punto_recogida: {},
      fecha_estimada: null,
      nota_cliente: '',
      estado: 'pendiente',
      etiqueta_at: null,
      transito_at: null
    }
  });
  assert(html.includes('Tu envío'), 'no pinta la tarjeta');
  assert(!html.includes('Punto de recogida'), 'pinta un punto de recogida vacío');
  assert(!html.includes('Entrega estimada'), 'inventa una entrega estimada');
});

await check('punto_recogida con cadenas en blanco no pinta el bloque', async () => {
  const html = render(EnvioCard, {
    envio: { ...envioBase, punto_recogida: { nombre: '', direccion: '   ' } }
  });
  assert(!html.includes('Punto de recogida'), 'pinta el bloque con datos en blanco');
});

await check('sin número de seguimiento no se pinta el bloque de tracking', async () => {
  const html = render(EnvioCard, {
    envio: { ...envioBase, tracking_number: null, punto_recogida: {} }
  });
  assert(!html.includes('Nº de seguimiento'), 'pide copiar un número que no existe');
});

await check('estado incidencia sustituye la línea de tiempo por un aviso', async () => {
  const html = render(EnvioCard, { envio: { ...envioBase, estado: 'incidencia' } });
  assert(html.includes('Incidencia'), 'no avisa de la incidencia');
  assert(!html.includes('En tránsito'), 'sigue pintando los pasos');
});

await check('entregado marca todos los pasos anteriores', async () => {
  const html = render(EnvioCard, {
    envio: {
      ...envioBase,
      estado: 'entregado',
      disponible_at: '2026-08-14T10:00:00Z',
      entregado_at: '2026-08-15T18:00:00Z'
    }
  });
  const hechos = (html.match(/class="hecho"|class="actual"/g) ?? []).length;
  assert(hechos === 4, `esperaba 4 pasos completados, hay ${hechos}`);
  assert(!html.includes('Entrega estimada'), 'sigue mostrando estimación tras entregar');
});

await check('un carrier desconocido no rompe nada', async () => {
  const html = render(EnvioCard, {
    envio: { ...envioBase, carrier: 'transportes_paco', carrier_nombre: null }
  });
  assert(html.includes('Transportista'), 'no usa el transportista genérico');
});

// ── Fechas ─────────────────────────────────────────────────────────────────
await check('una fecha inválida no imprime "Invalid Date"', async () => {
  const html = render(EnvioCard, {
    envio: { ...envioBase, etiqueta_at: 'no-es-una-fecha', fecha_estimada: null }
  });
  assert(!html.includes('Invalid'), 'se cuela un Invalid Date en la interfaz');
  assert(!html.includes('NaN'), 'se cuela un NaN en la interfaz');
});

// ── ReciboVerify ───────────────────────────────────────────────────────────
const { ReciboVerify } = await cargar('app/(site)/recibo/ReciboVerify.tsx', 'verify');

await check('la página de verificación renderiza en servidor', async () => {
  const html = render(ReciboVerify, {});
  assert(html.includes('Justificante de pago'), 'no pinta el título');
  // Sin useEffect (no hay navegador) debe quedarse en el estado de carga y no
  // reventar por tocar window.
  assert(html.includes('Comprobando'), 'no muestra el estado inicial');
});

// ── Formatos compartidos ───────────────────────────────────────────────────
const { euros, fechaCorta } = await cargar('lib/recibo/types.ts', 'recibo-types');

await check('euros() formatea como en el PDF', async () => {
  const casos = [
    [45, '45,00 €'],
    [1234.5, '1.234,50 €'],
    [0, '0,00 €'],
    [1234567.891, '1.234.567,89 €'],
    [0.005, '0,01 €'],
    [null, '0,00 €'],
    [undefined, '0,00 €']
  ];
  for (const [ent, esperado] of casos) {
    const got = euros(ent);
    assert(got === esperado, `euros(${ent}) = "${got}", esperaba "${esperado}"`);
  }
});

await check('fechaCorta() no depende de la zona horaria', async () => {
  assert(fechaCorta('2026-01-01') === '01/01/2026', 'falla en Año Nuevo');
  assert(fechaCorta('2026-12-31') === '31/12/2026', 'falla en Nochevieja');
  assert(fechaCorta('') === '', 'no aguanta una cadena vacía');
});

const { carrierInfo, urlSeguimiento } = await cargar('lib/envio/carriers.ts', 'carriers');

await check('carrierInfo() normaliza códigos de Sendcloud', async () => {
  assert(carrierInfo('inpost').nombre === 'InPost', 'inpost');
  assert(carrierInfo('correos-express').nombre === 'Correos Express', 'guion');
  assert(carrierInfo('CORREOS').nombre === 'Correos', 'mayúsculas');
  assert(carrierInfo(null).nombre === 'Transportista', 'null');
  assert(carrierInfo('lo-que-sea').nombre === 'Transportista', 'desconocido');
});

await check('urlSeguimiento() prefiere la URL de Sendcloud', async () => {
  const directo = urlSeguimiento('inpost', 'https://tracking.sendcloud.sc/x');
  assert(directo.directo === true && directo.pideCp === false, 'no prioriza la URL propia');

  const caida = urlSeguimiento('inpost', null);
  assert(caida.directo === false && caida.pideCp === true, 'no marca que InPost pide CP');

  // Una URL basura en base de datos no debe colarse como enlace.
  const basura = urlSeguimiento('inpost', 'javascript:alert(1)');
  assert(!basura.url.startsWith('javascript:'), 'ACEPTA UN ENLACE javascript:');
});

// ── Pedidos (fase 4): pestañas, estados y ficha ────────────────────────────
const { Pestanas } = await cargar('app/admin/_components/Pestanas.tsx', 'pestanas');
const est = await cargar('app/admin/presupuestos/estados.ts', 'estados');
const { Ficha } = await cargar('app/admin/presupuestos/Ficha.tsx', 'ficha');
const { normalizeSettings } = await cargar('lib/quote/pricing.ts', 'pricing-ui');

await check('Pestanas: tablist con una sola pestaña en el orden de tabulación', async () => {
  const html = render(Pestanas, {
    id: 'fi', etiqueta: 'Secciones', value: 'cobros', onChange: () => {},
    pestanas: [{ value: 'resumen', label: 'Resumen' }, { value: 'cobros', label: 'Cobros' }]
  });
  assert(html.includes('role="tablist"') && html.includes('role="tab"'), 'sin roles');
  assert(/aria-selected="true"[^>]*tabindex="0"|tabindex="0"[^>]*aria-selected="true"/.test(html) || html.split('tabindex="-1"').length === 2, 'la pestaña activa no es la parada de tabulación');
  assert(html.split('tabindex="0"').length === 2, 'más de una parada de tabulación');
});

await check('estados: filtros, siguiente paso y plazo escrito (no solo color)', async () => {
  const q = (estado, extra = {}) => ({ estado, archivado: false, ...extra });
  assert(est.coincideFiltro(q('listo'), 'activos') && !est.coincideFiltro(q('entregado'), 'activos'), 'activos');
  assert(est.coincideFiltro(q('entregado', { archivado: true }), 'archivados'), 'archivados');
  assert(!est.coincideFiltro(q('listo', { archivado: true }), 'listo'), 'un archivado sigue en su estado');
  assert(est.SIGUIENTE.imprimiendo.a === 'listo' && !est.SIGUIENTE.entregado && !est.SIGUIENTE.nuevo, 'siguiente paso');
  const hoy = '2026-11-10';
  assert(est.plazoDe(q('imprimiendo', { fecha_prometida: '2026-11-08' }), hoy).texto === '2 días tarde', 'tarde');
  assert(est.plazoDe(q('aceptado', { fecha_prometida: '2026-11-10' }), hoy).texto === 'vence hoy', 'hoy');
  assert(est.plazoDe(q('aceptado', { fecha_prometida: '2026-11-11' }), hoy).riesgo === true, 'mañana es riesgo');
  assert(est.plazoDe(q('aceptado', { fecha_prometida: '2026-11-20' }), hoy).riesgo === false, 'lejos');
  assert(est.plazoDe(q('listo', { fecha_prometida: '2026-11-01' }), hoy).riesgo === false, 'listo no está en riesgo');
  assert(est.plazoDe(q('aceptado', {}), hoy).texto === '—', 'sin fecha');
});

await check('Ficha: cabecera con el siguiente paso, cuatro pestañas y señal pendiente', async () => {
  const quote = {
    id: 'q1', codigo: 'Q-2026-0142', estado: 'imprimiendo', nombre: 'Ana García', email: 'ana@example.com',
    telefono: '600111222', mensaje: '', archivos: [], material: 'PLA', colores: [], resistencia: 'Normal',
    detalle: 'Estándar', cantidad: 1, entrega: 'recogida', direccion: {}, metricas: {}, desglose: {},
    precio_total: 34.5, precio_final: 34.5, pago: 'pendiente', importe_pagado: 0, archivado: false,
    notas_admin: '', origen: 'calculadora', descripcion: 'Tapa caja fusibles', fecha_prometida: '2026-11-14',
    urgente: false, precio_firme: false, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z'
  };
  const pedido = { id: 'AB12CD34', quote_id: 'q1', data: { coste_bruto: 4.2, repeticiones_error: 1, peso_g: '12.8', horas: '1.5', filamento: 'PLA', filamento_color: 'Negro', impresora: 'Creality K1C' } };
  const acciones = { mover: async () => {}, archivar: async () => {}, eliminar: async () => {}, duplicar: async () => {}, releer: async () => {}, avisar: () => {} };
  const html = render(Ficha, { q: quote, pedido, conPedido: true, ajustes: normalizeSettings(null), pestana: 'resumen', onPestana: () => {}, onCerrar: () => {}, acciones });
  assert(html.includes('Marcar listo y avisar') && html.includes('sin avisar'), 'no ofrece el siguiente paso con aviso');
  for (const p of ['Resumen', 'Piezas', 'Cobros', 'Envío']) assert(html.includes(`>${p}<`), `falta la pestaña ${p}`);
  assert(html.includes('Señal del 50 % pendiente'), 'no avisa de la señal');
  assert(html.includes('Editar y recalcular') && html.includes('Duplicar') && html.includes('Archivar') && html.includes('Eliminar pedido'), 'faltan acciones');
  assert(html.includes('Reimpresiones por fallo'), 'faltan las reimpresiones');
  // Sin email no se ofrece avisar.
  const sin = render(Ficha, { q: { ...quote, email: '' }, pedido, conPedido: true, ajustes: normalizeSettings(null), pestana: 'resumen', onPestana: () => {}, onCerrar: () => {}, acciones });
  assert(sin.includes('Marcar listo') && !sin.includes('y avisar'), 'ofrece avisar sin email');
  // Una solicitud nueva se presupuesta en «Nuevo encargo».
  const nuevo = render(Ficha, { q: { ...quote, estado: 'nuevo', origen: 'web' }, pedido, conPedido: true, ajustes: normalizeSettings(null), pestana: 'piezas', onPestana: () => {}, onCerrar: () => {}, acciones });
  assert(nuevo.includes('/admin/encargo?solicitud=Q-2026-0142'), 'no enlaza a presupuestar');
  assert(nuevo.includes('Creality K1C') && nuevo.includes('12,8 g'), 'la pestaña Piezas no enseña los datos del taller');
});

await check('Ficha: un pedido web de varias piezas enseña cada una (fase 8)', async () => {
  const q = {
    id: 'q2', codigo: 'Q-2026-0150', estado: 'nuevo', nombre: 'Luis', email: 'l@example.com', telefono: '', mensaje: '',
    archivos: [], material: 'PLA, PETG', colores: [], resistencia: 'estandar', detalle: 'estandar', cantidad: 4, entrega: 'recogida',
    direccion: {}, metricas: {}, desglose: {}, precio_total: 25, precio_final: null, pago: 'pendiente', importe_pagado: 0, archivado: false,
    notas_admin: '', origen: 'web', descripcion: '', fecha_prometida: null, urgente: false, precio_firme: false,
    created_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-10T10:00:00Z'
  };
  const piezas = [
    { nombre: 'tapa.stl', cantidad: 3, material: 'PLA', colores: [{ nombre: 'Negro', hex: '#000000', parte: '' }], peso_g: 12.5, horas: 0.75 },
    { nombre: 'qr.3mf', cantidad: 1, material: 'PETG', colores: [{ nombre: 'Blanco', hex: '#ffffff', parte: 'Base' }, { nombre: 'Negro', hex: '#000000', parte: 'Código' }], peso_g: 30, horas: 2 }
  ];
  const acciones = { mover: async () => {}, archivar: async () => {}, eliminar: async () => {}, duplicar: async () => {}, releer: async () => {}, avisar: () => {} };
  const props = { q, conPedido: true, ajustes: normalizeSettings(null), pestana: 'piezas', onPestana: () => {}, onCerrar: () => {}, acciones };
  const html = render(Ficha, { ...props, pedido: { id: 'P2', quote_id: 'q2', data: { peso_g: '68', horas: '4.25', filamento: 'PLA, PETG', piezas } } });
  assert(html.includes('Piezas del pedido (2)'), 'no enseña la lista de piezas');
  assert(html.includes('tapa.stl × 3') && html.includes('12,5 g') && html.includes('0,75 h') && html.includes('por unidad'), 'primera pieza');
  assert(html.includes('qr.3mf') && html.includes('PETG') && html.includes('Blanco → Base') && html.includes('30 g · 2 h'), 'segunda pieza');
  const una = render(Ficha, { ...props, pedido: { id: 'P3', quote_id: 'q2', data: { piezas: piezas.slice(0, 1) } } });
  assert(!una.includes('Piezas del pedido'), 'con una sola pieza basta con los datos del taller');
  const vieja = render(Ficha, { ...props, pedido: { id: 'P4', quote_id: 'q2', data: {} } });
  assert(!vieja.includes('Piezas del pedido'), 'un pedido antiguo sin detalle no debe romper');
});

// ── Dinero (fase 5) ─────────────────────────────────────────────────────────
const { Dinero } = await cargar('app/admin/estadisticas/Dinero.tsx', 'dinero');
const { spanDe } = await cargar('lib/quote/dinero.ts', 'dinero-lib');

await check('Dinero: cifras del periodo, cobros por método y bloques con su pregunta', async () => {
  const ped = (id, estado, o = {}) => ({
    id: 'P' + id, quote_id: 'q' + id,
    data: { id: 'P' + id, estado, fecha: '2026-11-05', cliente: 'Ana', precio_final: 40, coste_bruto: 10, gasto_misc: 0,
      repeticiones_error: 1, horas: '2', peso_g: '50', error_rate: 0.25, importe_pagado: 20, payment_history: [], ...o }
  });
  const quote = (id, o = {}) => ({ id: 'q' + id, codigo: 'Q-2026-010' + id, nombre: 'Ana', origen: 'calculadora', estado: 'aceptado', archivado: false,
    created_at: '2026-11-05T10:00:00Z', fecha_prometida: '2026-11-12', listo_at: null, coste_estimado: null, coste_real: null, ...o });
  const html = render(Dinero, {
    filas: [ped(1, 'Entregado'), ped(2, 'Aceptado'), ped(3, 'Descartado')],
    quotes: [quote(1, { estado: 'entregado', listo_at: '2026-11-10T09:00:00Z' }), quote(2), quote(3, { origen: 'web', estado: 'rechazado', coste_estimado: 10, coste_real: 12, desvio_coste: 2 })],
    cobros: [
      { id: 'c1', quote_id: 'q1', importe: 20, metodo: 'Bizum', cobrado_at: '2026-11-06T10:00:00Z', tipo: 'cobro', anulado_at: null },
      { id: 'c2', quote_id: 'q2', importe: 99, metodo: 'Efectivo', cobrado_at: '2026-11-06T10:00:00Z', tipo: 'cobro', anulado_at: '2026-11-07T10:00:00Z' }
    ],
    recibos: [{ id: 'r1', codigo: 'R-2026-0001', cobro_id: 'c1', anulado_at: null }],
    span: spanDe('concreto', '2026-11')
  });
  // Dos pedidos comprometidos de 40 € y 10 € de coste × 2 pasadas: 80 € facturados.
  assert(html.includes('80,00 €') && html.includes('facturado'), 'no enseña lo facturado');
  assert(html.includes('20,00 €') && !html.includes('99,00 €'), 'el cobro anulado cuenta o falta el cobrado');
  assert(html.includes('Bizum') && html.includes('R-2026-0001'), 'cobros por método o justificante');
  for (const t of ['¿Cuánto entra y por dónde?', '¿Quién debe?', '¿Se aceptan los presupuestos?', '¿Se cumplen los plazos?', '¿Acierta el riesgo?', '¿Acierta el tasador?']) {
    assert(html.includes(t), `falta el bloque «${t}»`);
  }
  assert(html.includes('/admin/presupuestos?abrir=Q-2026-0102&amp;pestana=cobros'), 'quien debe no enlaza a la ficha');
  // Sin datos no revienta y lo dice.
  const vacio = render(Dinero, { filas: [], quotes: [], cobros: [], recibos: [], span: spanDe('concreto', '2026-11') });
  assert(vacio.includes('Sin datos en este periodo') && !vacio.includes('NaN'), 'el periodo vacío rompe o enseña NaN');
});

// ── Tasador (fase 8): la página pública, antes y después de partirla ───────
const { QuoteClient } = await cargar('app/(site)/instant-quote/QuoteClient.tsx', 'tasador');
const filamentos = [
  { id: 'f1', material: 'PLA', descripcion: 'El de siempre', orden: 1, activo: true },
  { id: 'f2', material: 'PETG', descripcion: 'Aguanta calor', orden: 2, activo: true }
];
const colores = [
  { id: 'c1', filamento_id: 'f1', nombre: 'Negro', hex: '#000000', acabado: null, agotado: false, muestra_tipo: 'solido', muestra_colores: [], orden: 1 },
  { id: 'c2', filamento_id: 'f1', nombre: 'Oro', hex: '#d4af37', acabado: 'Metálico', agotado: true, muestra_tipo: 'solido', muestra_colores: [], orden: 2 }
];

await check('Tasador: sin piezas pide subir una y no enseña precio', async () => {
  const html = render(QuoteClient, { filamentos, colores });
  assert(html.includes('Calcula el precio de tu pieza'), 'falta el título');
  assert(html.includes('Sube tu archivo 3D') && !html.includes('Elegir archivo') && !html.includes('política de privacidad'), 'subida: un botón, sin textos de más');
  assert(html.includes('accept=".stl,.3mf,.obj"') && html.includes('multiple'), 'el selector de archivos cambió');
  assert(html.includes('Sube una pieza para ver el precio.'), 'falta el aviso del precio');
  assert(html.includes('¿No tienes archivo 3D?') && html.includes('Mándanos una foto'), 'falta la puerta para quien no tiene archivo');
  assert(!html.includes('Pedirlo') && !html.includes('€'), 'enseña precio o pedido sin piezas');
});

// Las partes, con una pieza y un precio de verdad.
const { computeQuote, fechaLarga } = await cargar('lib/quote/pricing.ts', 'pricing-tasador');
const { Resumen, Entrega } = await cargar('app/(site)/instant-quote/Resumen.tsx', 'resumen');
const { Pedir } = await cargar('app/(site)/instant-quote/Pedir.tsx', 'pedir');
const { Recibido } = await cargar('app/(site)/instant-quote/Recibido.tsx', 'recibido');
const { ConfigPieza } = await cargar('app/(site)/instant-quote/ConfigPieza.tsx', 'config');
const { ListaPiezas } = await cargar('app/(site)/instant-quote/ListaPiezas.tsx', 'lista');
const ajustes = normalizeSettings(null);
const metrics = { volumenCm3: 12, soporteCm3: 0, areaCm2: 30, bboxMm: { x: 30, y: 25, z: 30 }, triangulos: 1200, mallas: 1, overhangCm2: 0 };
const pieza = {
  id: 'p1', file: null, name: 'soporte.stl', size: 1000, ext: 'stl', metrics, cantidad: 1, partNames: ['Parte 1'], sugeridos: [null],
  config: { filamentoId: 'f1', mainColor: colores[0], multicolor: false, extraColors: [], partColors: [colores[0]], resistenciaId: 'estandar', detalleId: 'estandar' },
  estimacion: { estado: 'ok', progreso: 1, R: [1, 0, 0, 0, 1, 0, 0, 0, 1], original: true }, cuerpos: []
};
const quote = computeQuote([{ nombre: pieza.name, metrics, analisis: null, cantidad: 1, material: 'PLA',
  colores: [{ nombre: 'Negro', hex: '#000000', acabado: null }], resistenciaId: 'estandar', detalleId: 'estandar' }], ajustes, 'envio');
const cup = { cupon: null, setCupon() {}, cuponTxt: '', setCuponTxt() {}, cuponAbierto: false, setCuponAbierto() {}, cuponError: null, setCuponError() {}, cuponCargando: false, aplicarCupon: async () => {} };
const pz = {
  piezas: [pieza], activeId: 'p1', activePieza: pieza, activeFilamento: filamentos[0], partsMode: false, piezasRef: { current: [pieza] },
  setActiveId() {}, setCantidad() {}, removePieza() {}, rescalePieza() {}, patchActiveConfig() {}, applyToAll() {},
  changeMaterial() {}, pickColor() {}, toggleExtraColor() {}, addFiles: async () => {}, loadingFile: false, fileError: null
};
const euro = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

await check('Tasador · Resumen: líneas, total estimado, plazo y confianza', async () => {
  const html = render(Resumen, {
    settings: ajustes, settingsLoaded: true, numPiezas: 1, numAnalizando: 0, progresoAnalisis: 1,
    listo: true, quote, precioFinal: false, firmeActivo: false, listoAntes: '2026-11-13', entrega: 'envio',
    cup
  });
  assert(html.includes('Total estimado') && html.includes(euro(quote.total)), 'falta el total');
  for (const l of quote.lineas) assert(html.includes(l.concepto.replace(/ \(~[^)]*\)/, '').replace(/&/g, '&amp;')), `falta la línea ${l.concepto}`);
  assert(!html.includes('~'), 'gramos y horas no se enseñan al cliente');
  assert(html.includes('Precio orientativo: lo cerramos al revisar la pieza'), 'sin precio firme debe decir orientativo');
  assert(html.includes(`Listo antes del ${fechaLarga('2026-11-13')}`), 'falta la fecha tope');
  assert(html.includes('¿Lo necesitas antes? Escríbenos') && !/urgen/i.test(html), 'urgencia: solo el enlace, sin selector');
  assert(!html.includes('qt-upsell') && !html.includes('reseñas') && html.includes('¿Tienes un código de descuento?'), 'sin extras, con cupón');
  const cargando = render(Resumen, { settingsLoaded: true, numPiezas: 2, numAnalizando: 2, progresoAnalisis: 0.5,
    listo: false, quote: null, precioFinal: false, firmeActivo: false, listoAntes: null, entrega: 'recogida', cup });
  assert(cargando.includes('Calculando el precio de 2 piezas') && cargando.includes('50') && cargando.includes('width:50%'), 'progreso del cálculo');
  const ent = render(Entrega, { settings: ajustes, entrega: 'envio', setEntrega() {}, cp: '', setCp() {} });
  assert(ent.includes('Gratis desde') && ent.includes('Código postal'), 'entrega con envío');
});

await check('Tasador · Pedir y Recibido: solicitar, WhatsApp, email y el código', async () => {
  const props = { piezas: [pieza], quote, listo: true, settings: ajustes, colaH: 0, filamentos, entrega: 'recogida', cpValido: undefined, setStatus() {}, cup };
  const html = render(Pedir, { ...props, status: { kind: 'idle' } });
  assert(html.includes('Pedirlo') && html.includes('qt-cta-wa'), 'faltan las llamadas'); assert(html.includes(`Pedirlo · ${euro(quote.total)}`), 'el botón no lleva el precio');
  assert(html.includes(encodeURIComponent(`Total: ${euro(quote.total)}`).replace(/%20/g, '%20')) || html.includes('Total%3A'), 'el WhatsApp no lleva el total');
  assert(html.includes('Envíamelo por email') && !html.includes('Descargar PDF'), 'guardar sí, PDF no');
  const ok = render(Pedir, { ...props, status: { kind: 'ok', codigo: 'Q-2026-0001', duplicado: false, porEmail: true } });
  assert(ok.includes('Q-2026-0001') && ok.includes('por email') && !ok.includes('Pedirlo'), 'la confirmación');
  assert(render(Recibido, { status: { kind: 'ok', codigo: 'Q-1', duplicado: true, porEmail: false } }).includes('Ya teníamos esta misma solicitud'), 'duplicado');
});

await check('Tasador · pedido grande: ni precio, ni PDF, ni «envíamelo»; solo pedirlo', async () => {
  const html = render(Resumen, {
    settings: ajustes, settingsLoaded: true, numPiezas: 1, numAnalizando: 0, progresoAnalisis: 1,
    listo: true, quote, precioFinal: false, consultar: true, firmeActivo: false, listoAntes: '2026-11-13', entrega: 'recogida',
    cup
  });
  assert(html.includes('A consultar') && html.includes('menos de 24 h'), 'falta el «a consultar»');
  assert(!html.includes(euro(quote.total)) && !html.includes('código de descuento'), 'enseña el precio o el cupón');
  const props = { piezas: [pieza], quote, listo: true, settings: ajustes, colaH: 0, filamentos, entrega: 'recogida', cpValido: undefined, setStatus() {}, cup, consultar: true };
  const ped = render(Pedir, { ...props, status: { kind: 'idle' } });
  assert(ped.includes('Pedirlo') && ped.includes('qt-cta-wa'), 'tiene que poder pedirlo'); assert(!ped.includes(euro(quote.total)), 'el botón enseña el precio');
  assert(!ped.includes('Descargar PDF') && !ped.includes('Envíamelo por email'), 'PDF o email llevarían el precio');
  assert(!ped.includes('Total%3A') && !ped.includes(encodeURIComponent(euro(quote.total))), 'el WhatsApp lleva el precio');
});

await check('Tasador · Piezas y configuración: material por uso y color, sin resistencia ni detalle', async () => {
  const lista = render(ListaPiezas, { pz, quote, tooBig: true, degenerate: false, maxBedMm: 220, scaleSuggestions: [{ unidad: 'pulgadas', factor: 25.4 }], setActivePart() {} });
  assert(lista.includes('soporte.stl') && lista.includes('Quitar soporte.stl'), 'la lista de piezas');
  assert(lista.includes('supera los 220 mm') && lista.includes('Convertir de pulgadas'), 'los avisos');
  const cfg = render(ConfigPieza, { pz, settings: ajustes, filamentos, materialColors: colores, activeColors: [colores[0]], activePart: 0, setActivePart() {} });
  for (const t of ['1 · Material', '2 · Color', 'Resistente', 'PETG'])
    assert(cfg.includes(t), `falta «${t}»`);
  assert(!cfg.includes('¿Cómo de resistente') && !cfg.includes('¿Cuánto detalle?'), 'resistencia y detalle ya no se preguntan');
  assert(cfg.includes('Oro (agotado)') && !cfg.includes('Ver todos') && cfg.includes('¿Varios colores?'), 'todos los colores a la vista, agotados marcados');
  assert(!cfg.includes('Aplicar a todas'), 'con una pieza no ofrece aplicar a todas');
});

await check('Tasador · 3MF con varias camas: se juntan en una y el aviso de tamaño va por objeto', async () => {
  const THREE = await import('three');
  const { juntarObjetos } = await cargar('app/(site)/instant-quote/modelo.ts', 'modelo');
  const { analyzeObject } = await cargar('lib/quote/geometry.ts', 'geometry');
  const cubo = (x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 20)); m.position.set(x, 0, 10); return m; };
  const montar = (xs) => { const root = new THREE.Group(); const g = new THREE.Group(); g.userData.objetos = true; xs.forEach((x) => g.add(cubo(x))); root.add(g); return root; };
  // Dos camas: objetos de 100 mm separados 300 mm, el conjunto mide 400.
  const camas = montar([0, 300]);
  juntarObjetos(camas, 220);
  const m = analyzeObject(camas);
  assert(m.bboxMm.x <= 220 && m.bboxMm.y <= 220, `no se juntaron: ${m.bboxMm.x} × ${m.bboxMm.y}`);
  assert(m.objetoMayorMm === 100, `el objeto mayor mide 100, no ${m.objetoMayorMm}`);
  // Un montaje cuyos objetos se tocan no se mueve.
  const montaje = montar([0, 100, 200, 300]);
  juntarObjetos(montaje, 220);
  assert(analyzeObject(montaje).bboxMm.x === 400, 'un montaje que se toca no se mueve');
});

rmSync(dir, { recursive: true, force: true });

console.log(
  fallos === 0
    ? '\n\x1b[32mTodas las comprobaciones de interfaz OK\x1b[0m\n'
    : `\n\x1b[31m${fallos} fallo(s)\x1b[0m\n`
);
process.exit(fallos === 0 ? 0 : 1);
