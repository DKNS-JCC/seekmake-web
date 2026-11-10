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
    plugins: [cssVacio, linkSimple],
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

rmSync(dir, { recursive: true, force: true });

console.log(
  fallos === 0
    ? '\n\x1b[32mTodas las comprobaciones de interfaz OK\x1b[0m\n'
    : `\n\x1b[31m${fallos} fallo(s)\x1b[0m\n`
);
process.exit(fallos === 0 ? 0 : 1);
