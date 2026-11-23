// Prueba fail-safe de `submit-quote` y `send-contact-email`.
//
//   npx -y deno@2 run -A --import-map=scripts/deno-test.json scripts/test-submit-quote.ts
//
// Ejecuta las funciones DE VERDAD (el index.ts que se despliega) contra un
// Supabase y un SMTP falsos (scripts/stub-*.ts). Lo que vigila es lo que nos
// hizo perder clientes sin enterarnos:
//   · el honeypot relleno (autocompletado del móvil) NO descarta el pedido
//   · nunca se contesta «ok» sin un pedido guardado de verdad
//   · un SMTP caído no tira el pedido
//   · un pedido grande no enseña precio al cliente, pero tú sí lo ves

import { estado, reset, enviados, resetMail } from './stub-supabase-bridge.ts';

Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-test');
Deno.env.set('GMAIL_USER', 'info@impresion3dcc.com');
Deno.env.set('GMAIL_APP_PASSWORD', 'abcd efgh ijkl mnop'); // 16 letras, como una de Google
Deno.env.set('CONTACT_RECIPIENT', 'taller@impresion3dcc.com');
Deno.env.set('ALLOWED_ORIGIN', 'https://www.impresion3dcc.com');

// deno-lint-ignore no-explicit-any
type Handler = (req: Request) => Promise<Response>;
async function cargar(ruta: string): Promise<Handler> {
  let h: Handler | undefined;
  const original = Deno.serve;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (fn: Handler) => {
    h = fn;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
  };
  await import(ruta);
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = original;
  return h!;
}
const submit = await cargar('../supabase/functions/submit-quote/index.ts');
const contacto = await cargar('../supabase/functions/send-contact-email/index.ts');

let ip = 0;
// deno-lint-ignore no-explicit-any
async function llamar(h: Handler, body: any): Promise<{ status: number; json: any }> {
  const res = await h(
    new Request('https://test.functions/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://www.impresion3dcc.com', 'x-forwarded-for': `10.0.0.${++ip}` },
      body: JSON.stringify(body)
    })
  );
  return { status: res.status, json: await res.json() };
}

let fallos = 0;
function check(nombre: string, cond: boolean, extra = '') {
  console.log(`  ${cond ? '\x1b[32mok\x1b[0m  ' : '\x1b[31mFALLO\x1b[0m'} ${nombre}${!cond && extra ? ` — ${extra}` : ''}`);
  if (!cond) fallos++;
}

/** One piece priced by volume (no layer analysis): small or big by cm³. */
function pedido(extra: Record<string, unknown>, volumen = 5, cantidad = 1) {
  return {
    archivos: [{
      nombre: 'pieza.stl', cantidad, material: 'PLA', resistencia: 'estandar', detalle: 'estandar',
      colores: [{ nombre: 'Negro', hex: '#000000', parte: '' }],
      url: 'https://test.supabase.co/storage/v1/object/public/quote-uploads/quotes/abc.stl',
      path: 'quotes/abc.stl', tamano: 1000, tamano_original: 1000, comprimido: false,
      metricas: { volumen_cm3: volumen, area_cm2: 50, soporte_cm3: 0, bbox_mm: { x: 50, y: 50, z: 50 } }
    }],
    material: 'PLA', colores: [], cantidad, entrega: 'recogida', precio_total: 0,
    nombre: 'Ana', telefono: '600 123 456',
    ...extra
  };
}
const asunto = (m: { subject: string }) => String(m.subject);
const cuerpo = (m: { content: string; html: string }) => `${m.content}\n${m.html}`;
const alTaller = () => enviados.find((m) => m.to === 'taller@impresion3dcc.com');
const alCliente = (to: string) => enviados.find((m) => m.to === to);
function preparar() {
  reset();
  resetMail();
  estado.rpcs = { plazo_cola_horas: 0 };
}

console.log('\nsubmit-quote');

preparar();
let r = await llamar(submit, pedido({ email: 'a@cliente.es', website: 'autocompletado' }));
check('honeypot relleno: el pedido se guarda igual', r.status === 200 && estado.tablas.quotes.length === 1, JSON.stringify(r.json));
check('honeypot relleno: código real, nunca Q-0000-0000', /^Q-2026-\d{4}$/.test(r.json.codigo) && !r.json.codigo.includes('0000'), r.json.codigo);
check('honeypot relleno: el taller recibe el correo marcado [spam?]', !!alTaller() && asunto(alTaller()).includes('[spam?]'));
check('honeypot relleno: el cliente recibe su confirmación', !!alCliente('a@cliente.es'));

preparar();
r = await llamar(submit, pedido({ email: 'b@cliente.es' }));
const precio = Number(r.json.precio_total);
check('pedido normal: guardado, con código y precio', r.status === 200 && /^Q-/.test(r.json.codigo) && precio > 0 && r.json.consultar === false, JSON.stringify(r.json));
check('pedido normal: el cliente ve su precio', cuerpo(alCliente('b@cliente.es')).includes(`${precio.toFixed(2)} €`));
check('pedido normal: el asunto del taller sin marcas', !/\[(spam|CONSULTAR)/.test(asunto(alTaller())), asunto(alTaller()));

preparar();
r = await llamar(submit, pedido({ email: 'c@cliente.es' }, 900, 3));
const q = estado.tablas.quotes[0];
check('pedido grande: se guarda con código', r.status === 200 && /^Q-/.test(r.json.codigo) && !!q, JSON.stringify(r.json));
check('pedido grande: la respuesta no lleva precio', r.json.consultar === true && r.json.precio_total === null);
check('pedido grande: queda marcado en la base de datos', q?.desglose?.consultar === true && Number(q?.precio_total) >= 100, String(q?.precio_total));
const correoGrande = cuerpo(alCliente('c@cliente.es'));
check('pedido grande: el correo del cliente no lleva el total', !correoGrande.includes(`${Number(q.precio_total).toFixed(2)} €`) && !/total estimado/i.test(correoGrande));
check('pedido grande: le dice que le mandamos el precio', correoGrande.includes('pedido grande') && correoGrande.includes('24 h'));
check('pedido grande: el taller lo ve como [CONSULTAR] con la cifra', asunto(alTaller()).includes('[CONSULTAR]') && cuerpo(alTaller()).includes(Number(q.precio_total).toFixed(2)));

preparar();
r = await llamar(submit, { ...pedido({ email: 'd@cliente.es' }, 900, 3), accion: 'guardar' });
check('pedido grande: «envíamelo por email» no manda la cifra', r.status === 409 && enviados.length === 0 && (estado.tablas.presupuestos_guardados ?? []).length === 0);

preparar();
resetMail(true);
r = await llamar(submit, pedido({ email: 'e@cliente.es' }));
check('SMTP caído: el pedido se guarda y se da el código', r.status === 200 && /^Q-/.test(r.json.codigo) && estado.tablas.quotes.length === 1 && r.json.emailSent === false);

preparar();
estado.fallarInsert = true;
r = await llamar(submit, pedido({ email: 'f@cliente.es' }));
check('base de datos caída: error, nunca un «ok» sin código', r.status >= 500 && !r.json.ok && !r.json.codigo, JSON.stringify(r.json));

preparar();
r = await llamar(submit, pedido({ email: 'g@cliente.es' }));
const r2 = await llamar(submit, pedido({ email: 'g@cliente.es' }));
check('doble clic: devuelve el mismo código, sin duplicar', r2.json.duplicado === true && r2.json.codigo === r.json.codigo && estado.tablas.quotes.length === 1);

preparar();
r = await llamar(submit, pedido({ email: 'h@cliente.es', telefono: '' }));
check('sin móvil no se guarda la solicitud', r.status === 400 && (estado.tablas.quotes ?? []).length === 0, JSON.stringify(r.json));
r = await llamar(submit, pedido({ email: 'h@cliente.es', nombre: '  ' }));
check('sin nombre no se guarda la solicitud', r.status === 400 && (estado.tablas.quotes ?? []).length === 0, JSON.stringify(r.json));
r = await llamar(submit, pedido({ email: '', acepta_ofertas: true }));
check('nombre y móvil sin email: se guarda', r.status === 200 && estado.tablas.quotes.length === 1, JSON.stringify(r.json));
check('ofertas marcadas sin email: no cuenta como consentimiento', estado.tablas.quotes[0].acepta_ofertas === false);
preparar();
await llamar(submit, pedido({ email: 'i@cliente.es', acepta_ofertas: true }));
check('ofertas marcadas con email: se guarda el consentimiento', estado.tablas.quotes[0]?.acepta_ofertas === true);

console.log('\nsend-contact-email');
resetMail();
r = await llamar(contacto, { nombre: 'Ana', email: 'ana@cliente.es', mensaje: 'Hola, quiero una pieza', website: 'autocompletado' });
check('honeypot relleno: el mensaje llega igual, marcado [spam?]', r.status === 200 && enviados.some((m) => asunto(m).includes('[spam?]')), JSON.stringify(r.json));

console.log(fallos ? `\n\x1b[31m${fallos} fallo(s)\x1b[0m` : '\n\x1b[32mTodo OK\x1b[0m');
if (fallos) Deno.exit(1);
