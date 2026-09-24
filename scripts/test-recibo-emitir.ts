// Prueba de integración de la Edge Function `recibo-emitir`.
//
//   deno run -A --import-map=scripts/deno-test.json scripts/test-recibo-emitir.ts
//   (o: npm run test:funcion)
//
// Ejecuta la función DE VERDAD —el mismo index.ts que se despliega— contra un
// Supabase y un SMTP falsos (scripts/stub-*.ts, enchufados por import map). El
// PDF que genera es el real: la plantilla no se sustituye por nada.
//
// Cubre lo que puede costar dinero o disgustos:
//   · autorización: anónimo, cliente con token, cliente con token ajeno, admin
//   · validación de importes, fechas y métodos de pago
//   · antiduplicado (doble clic / reintento)
//   · cuentas de acumulado y pendiente con varios cobros
//   · rollback si falla el archivado (no dejar códigos quemados)
//   · el email lleva el PDF adjunto y su fallo no invalida la emisión
//   · anular no borra el PDF y bloquea la descarga del cliente

import { estado, reset, enviados, resetMail } from './stub-supabase-bridge.ts';

// ── Entorno que espera la función ──────────────────────────────────────────
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_ANON_KEY', 'anon-test');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-test');
Deno.env.set('GMAIL_USER', 'info@impresion3dcc.com');
Deno.env.set('GMAIL_APP_PASSWORD', 'contrasena-de-prueba');
Deno.env.set('ALLOWED_ORIGIN', 'https://www.impresion3dcc.com');

// Importar el módulo arranca su Deno.serve(): se captura el handler.
let handler: (req: Request) => Promise<Response>;
const serveOriginal = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: any) => {
  handler = h;
  return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
};
await import('../supabase/functions/recibo-emitir/index.ts');
// deno-lint-ignore no-explicit-any
(Deno as any).serve = serveOriginal;

// ── Utilidades ─────────────────────────────────────────────────────────────
const JWT_ADMIN = 'jwt-admin';
const JWT_PELELE = 'jwt-usuario-normal';

// deno-lint-ignore no-explicit-any
async function llamar(body: any, jwt?: string): Promise<{ status: number; json: any }> {
  const res = await handler(
    new Request('https://test.functions/recibo-emitir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://www.impresion3dcc.com',
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {})
      },
      body: JSON.stringify(body)
    })
  );
  return { status: res.status, json: await res.json() };
}

let fallos = 0;
const ok = (m: string) => console.log(`  \x1b[32mok\x1b[0m   ${m}`);
const fail = (m: string) => {
  fallos++;
  console.log(`  \x1b[31mFALLO\x1b[0m ${m}`);
};
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
async function check(nombre: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    ok(nombre);
  } catch (e) {
    fail(`${nombre} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

const QUOTE_TOKEN = '8f14e45f-ceea-467a-9f7c-1b2d3e4f5a6b';

function sembrar() {
  reset();
  resetMail();
  estado.usuarios.set(JWT_ADMIN, { id: 'u-admin', app_metadata: { is_admin: true } });
  estado.usuarios.set(JWT_PELELE, { id: 'u-normal', app_metadata: {} });
  estado.tablas.quotes = [
    {
      id: 'q1',
      codigo: 'Q-2026-0042',
      nombre: 'María Fernández Núñez',
      email: 'maria@example.com',
      acepta_token: QUOTE_TOKEN,
      precio_total: 90,
      precio_final: 90
    },
    {
      id: 'q2',
      codigo: 'Q-2026-0043',
      nombre: 'Otro Cliente',
      email: 'otro@example.com',
      acepta_token: '11111111-1111-1111-1111-111111111111',
      precio_total: 30,
      precio_final: null
    }
  ];
}

const emitir = (extra: Record<string, unknown> = {}) => ({
  action: 'emitir',
  quote_id: 'q1',
  importe: 45,
  metodo: 'bizum',
  fecha_pago: '2026-08-12',
  concepto: 'Adelanto del pedido Q-2026-0042',
  es_adelanto: true,
  ...extra
});

console.log('\n▸ Edge Function recibo-emitir\n');

// ═══ Autorización ══════════════════════════════════════════════════════════
await check('sin JWT no se puede emitir', async () => {
  sembrar();
  const r = await llamar(emitir());
  assert(r.status === 403, `status ${r.status}`);
  assert(estado.tablas.recibos.length === 0, 'creó el recibo igualmente');
});

await check('un usuario autenticado no admin tampoco puede emitir', async () => {
  sembrar();
  const r = await llamar(emitir(), JWT_PELELE);
  assert(r.status === 403, `status ${r.status}`);
});

await check('un JWT inventado no cuela', async () => {
  sembrar();
  const r = await llamar(emitir(), 'jwt-falsificado');
  assert(r.status === 403, `status ${r.status}`);
});

await check('anular y descargar-como-admin exigen admin', async () => {
  sembrar();
  assert((await llamar({ action: 'anular', recibo_id: 'x' })).status === 403, 'anular abierto');
  assert((await llamar({ action: 'loquesea' }, JWT_ADMIN)).status === 400, 'acción desconocida');
});

// ═══ Validación ════════════════════════════════════════════════════════════
await check('rechaza importes no válidos', async () => {
  sembrar();
  for (const importe of [0, -5, 'hola', null, 100001]) {
    const r = await llamar(emitir({ importe }), JWT_ADMIN);
    assert(r.status === 400, `aceptó importe ${JSON.stringify(importe)} (status ${r.status})`);
  }
  assert(estado.tablas.recibos.length === 0, 'creó recibos con importes inválidos');
});

await check('rechaza métodos de pago y fechas inventadas', async () => {
  sembrar();
  assert((await llamar(emitir({ metodo: 'criptomoneda' }), JWT_ADMIN)).status === 400, 'método');
  assert((await llamar(emitir({ fecha_pago: '12/08/2026' }), JWT_ADMIN)).status === 400, 'fecha dd/mm');
  assert((await llamar(emitir({ fecha_pago: '' }), JWT_ADMIN)).status === 400, 'fecha vacía');
});

await check('un presupuesto inexistente da 404', async () => {
  sembrar();
  const r = await llamar(emitir({ quote_id: 'no-existe' }), JWT_ADMIN);
  assert(r.status === 404, `status ${r.status}`);
});

// ═══ Emisión ═══════════════════════════════════════════════════════════════
await check('emite, archiva el PDF y devuelve URL firmada', async () => {
  sembrar();
  const r = await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  assert(r.status === 200, `status ${r.status}: ${r.json.error}`);
  assert(/^R-\d{4}-\d{4}$/.test(r.json.codigo), `código ${r.json.codigo}`);
  assert(r.json.url?.startsWith('https://firmada.test/'), 'sin URL firmada');
  assert(r.json.pagado === 45 && r.json.pendiente === 45, `acumulado ${r.json.pagado}/${r.json.pendiente}`);

  const fila = estado.tablas.recibos[0];
  assert(fila.pdf_path === `Q-2026-0042/${r.json.codigo}.pdf`, `ruta ${fila.pdf_path}`);
  assert(fila.datos?.codigo === r.json.codigo, 'no guardó el snapshot en `datos`');

  const pdf = estado.storage.get(fila.pdf_path)!;
  assert(pdf && pdf.byteLength > 3000, `PDF de ${pdf?.byteLength ?? 0} B`);
  assert(new TextDecoder().decode(pdf.subarray(0, 5)) === '%PDF-', 'no es un PDF');
});

await check('el snapshot lleva el total y el pendiente del momento', async () => {
  sembrar();
  await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  const d = estado.tablas.recibos[0].datos;
  assert(d.pedido.total === 90, `total ${d.pedido.total}`);
  assert(d.acumulado.pendiente === 45, `pendiente ${d.acumulado.pendiente}`);
  assert(d.cliente.nombre === 'María Fernández Núñez', 'sin nombre de cliente');
  assert(d.verificacion_url?.includes(estado.tablas.recibos[0].verif_token), 'QR sin token');
});

await check('el segundo cobro acumula y deja el pendiente a cero', async () => {
  sembrar();
  await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  const r = await llamar(
    emitir({ importe: 45, fecha_pago: '2026-08-20', es_adelanto: false, enviar_email: false }),
    JWT_ADMIN
  );
  assert(r.json.pagado === 90, `pagado ${r.json.pagado}`);
  assert(r.json.pendiente === 0, `pendiente ${r.json.pendiente}`);
  assert(estado.tablas.recibos.length === 2, 'no hay dos recibos');
});

await check('sin precio_final se usa precio_total', async () => {
  sembrar();
  const r = await llamar(
    emitir({ quote_id: 'q2', importe: 10, enviar_email: false }),
    JWT_ADMIN
  );
  assert(r.json.pendiente === 20, `pendiente ${r.json.pendiente} (esperaba 20)`);
});

await check('los céntimos no arrastran error de coma flotante', async () => {
  sembrar();
  estado.tablas.quotes[0].precio_final = 0.3;
  await llamar(emitir({ importe: 0.1, enviar_email: false }), JWT_ADMIN);
  await llamar(emitir({ importe: 0.1, fecha_pago: '2026-08-13', enviar_email: false }), JWT_ADMIN);
  const r = await llamar(emitir({ importe: 0.1, fecha_pago: '2026-08-14', enviar_email: false }), JWT_ADMIN);
  assert(r.json.pagado === 0.3, `pagado ${r.json.pagado} (0.1+0.1+0.1 debe ser 0.3)`);
  assert(r.json.pendiente === 0, `pendiente ${r.json.pendiente}`);
});

// ═══ Antiduplicado ═════════════════════════════════════════════════════════
await check('el mismo cobro dos veces seguidas se bloquea', async () => {
  sembrar();
  const a = await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  assert(a.status === 200, 'la primera falló');
  const b = await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  assert(b.status === 409, `la segunda pasó con status ${b.status}`);
  assert(String(b.json.error).includes(a.json.codigo), 'no dice cuál era el duplicado');
  assert(estado.tablas.recibos.length === 1, 'se archivaron dos recibos iguales');
});

await check('mismo importe en otra fecha sí se permite', async () => {
  sembrar();
  await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  const b = await llamar(emitir({ fecha_pago: '2026-09-01', enviar_email: false }), JWT_ADMIN);
  assert(b.status === 200, `bloqueó un cobro legítimo (${b.json.error})`);
});

// ═══ Fallos a mitad ════════════════════════════════════════════════════════
await check('si falla el archivado no queda un recibo sin PDF', async () => {
  sembrar();
  estado.fallarUpload = true;
  const r = await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  assert(r.status === 502, `status ${r.status}`);
  assert(
    estado.tablas.recibos.length === 0,
    'quedó un código de recibo quemado apuntando a ningún PDF'
  );
});

// ═══ Libro de cobros (0028) ════════════════════════════════════════════════
const JWT_CALC = 'jwt-calculadora-3dcc';
const JWT_SILAB = 'jwt-calculadora-silab';
function sembrarCalc() {
  estado.usuarios.set(JWT_CALC, { id: 'u-calc', app_metadata: {} });
  estado.usuarios.set(JWT_SILAB, { id: 'u-silab', app_metadata: {} });
  estado.tablas.empresa_users = [
    { user_id: 'u-calc', empresa: '3dcc' },
    { user_id: 'u-silab', empresa: 'silab3d' }
  ];
}

await check('emitir sin cobro_id registra el cobro en el libro y lo enlaza', async () => {
  sembrar();
  const r = await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  assert(r.status === 200, `status ${r.status} ${JSON.stringify(r.json)}`);
  const cobros = estado.tablas.cobros ?? [];
  assert(cobros.length === 1, `${cobros.length} cobros`);
  assert(cobros[0].importe === 45 && cobros[0].metodo === 'Bizum' && cobros[0].fecha === '2026-08-12', 'datos del cobro');
  assert(cobros[0].origen === 'web' && cobros[0].quote_id === 'q1', 'origen/enlace');
  assert(estado.tablas.recibos[0].cobro_id === cobros[0].id && r.json.cobro_id === cobros[0].id, 'recibo sin cobro_id');
});

await check('emitir para un cobro existente usa sus datos y no crea otro', async () => {
  sembrar();
  estado.tablas.cobros = [
    { id: 'c1', empresa: '3dcc', quote_id: 'q1', importe: 30, metodo: 'Efectivo', fecha: '2026-08-01', anulado_at: null }
  ];
  const r = await llamar({ action: 'emitir', cobro_id: 'c1', enviar_email: false }, JWT_ADMIN);
  assert(r.status === 200, `status ${r.status} ${JSON.stringify(r.json)}`);
  assert(estado.tablas.cobros.length === 1, 'creó un cobro de más');
  const rec = estado.tablas.recibos[0];
  assert(rec.importe === 30 && rec.metodo === 'efectivo' && rec.fecha_pago === '2026-08-01' && rec.cobro_id === 'c1', 'datos del recibo');
  assert(r.json.pagado === 30 && r.json.pendiente === 60, `acumulado ${r.json.pagado}/${r.json.pendiente}`);
});

await check('un cobro con justificante vivo no admite otro', async () => {
  sembrar();
  estado.tablas.cobros = [
    { id: 'c1', empresa: '3dcc', quote_id: 'q1', importe: 30, metodo: 'Bizum', fecha: '2026-08-01', anulado_at: null }
  ];
  await llamar({ action: 'emitir', cobro_id: 'c1' }, JWT_ADMIN);
  const r = await llamar({ action: 'emitir', cobro_id: 'c1' }, JWT_ADMIN);
  assert(r.status === 409, `status ${r.status}`);
  assert(estado.tablas.recibos.length === 1, 'duplicó el justificante');
});

await check('un cobro anulado o un ajuste negativo no llevan justificante', async () => {
  sembrar();
  estado.tablas.cobros = [
    { id: 'c1', empresa: '3dcc', quote_id: 'q1', importe: 30, metodo: 'Bizum', fecha: '2026-08-01', anulado_at: '2026-08-02' },
    { id: 'c2', empresa: '3dcc', quote_id: 'q1', importe: -5, metodo: 'Ajuste', fecha: '2026-08-01', anulado_at: null }
  ];
  assert((await llamar({ action: 'emitir', cobro_id: 'c1' }, JWT_ADMIN)).status === 404, 'anulado');
  assert((await llamar({ action: 'emitir', cobro_id: 'c2' }, JWT_ADMIN)).status === 400, 'negativo');
});

await check('la Calculadora (usuario de 3DCC) puede emitir; SILAB3D no', async () => {
  sembrar();
  sembrarCalc();
  const r = await llamar(emitir({ enviar_email: false }), JWT_CALC);
  assert(r.status === 200, `3DCC: status ${r.status}`);
  const s = await llamar(emitir({ enviar_email: false, fecha_pago: '2026-08-13' }), JWT_SILAB);
  assert(s.status === 403, `SILAB3D: status ${s.status}`);
});

await check('si falla el archivado, el cobro recién creado queda anulado', async () => {
  sembrar();
  estado.fallarUpload = true;
  const r = await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  assert(r.status === 502, `status ${r.status}`);
  const c = (estado.tablas.cobros ?? [])[0];
  assert(c && c.anulado_at, 'dejó dinero apuntado de una emisión fallida');
});

await check('lo cobrado sale del libro, no de los recibos', async () => {
  sembrar();
  // Un cobro de la Calculadora sin justificante ya cuenta.
  estado.tablas.cobros = [
    { id: 'c0', empresa: '3dcc', quote_id: 'q1', importe: 50, metodo: 'Bizum', fecha: '2026-08-01', anulado_at: null }
  ];
  const r = await llamar(emitir({ importe: 40, enviar_email: false }), JWT_ADMIN);
  assert(r.json.pagado === 90 && r.json.pendiente === 0, `acumulado ${r.json.pagado}/${r.json.pendiente}`);
});

await check('la Calculadora puede pedir el justificante por pedido (empresa + order_id)', async () => {
  sembrar();
  sembrarCalc();
  estado.tablas.orders = [{ empresa: '3dcc', id: 'ABCD1234', quote_id: 'q2' }];
  const r = await llamar(
    { action: 'emitir', empresa: '3dcc', order_id: 'ABCD1234', importe: 10, metodo: 'efectivo', fecha_pago: '2026-08-12' },
    JWT_CALC
  );
  assert(r.status === 200 && estado.tablas.recibos[0].quote_id === 'q2', `status ${r.status}`);
});

// ═══ Email ═════════════════════════════════════════════════════════════════
await check('el email lleva el PDF adjunto', async () => {
  sembrar();
  const r = await llamar(emitir({ enviar_email: true }), JWT_ADMIN);
  assert(r.json.enviado === true, `enviado=${r.json.enviado} aviso=${r.json.aviso}`);
  assert(enviados.length === 1, `${enviados.length} correos`);
  const msg = enviados[0];
  assert(msg.to === 'maria@example.com', `destinatario ${msg.to}`);
  assert(msg.attachments?.length === 1, 'sin adjunto');
  assert(msg.attachments[0].contentType === 'application/pdf', 'el adjunto no es PDF');
  assert(msg.attachments[0].filename === `justificante-${r.json.codigo}.pdf`, 'nombre del adjunto');
  assert(msg.attachments[0].content.length > 1000, 'adjunto vacío');
  // El asunto tiene que ir en ASCII puro: denomailer rompe las cabeceras con
  // acentos y el cliente acaba viendo el MIME en crudo.
  // deno-lint-ignore no-control-regex
  assert(!/[^\x20-\x7E]/.test(msg.subject), `asunto con no-ASCII: ${msg.subject}`);
});

await check('si el SMTP falla, el justificante sigue emitido y archivado', async () => {
  sembrar();
  resetMail(true);
  const r = await llamar(emitir({ enviar_email: true }), JWT_ADMIN);
  assert(r.status === 200, `status ${r.status}`);
  assert(r.json.enviado === false, 'dice que lo envió');
  assert(r.json.aviso, 'no avisa de que el email no salió');
  assert(estado.tablas.recibos.length === 1, 'perdió el recibo por un fallo de email');
  assert(estado.storage.size === 1, 'perdió el PDF por un fallo de email');
});

await check('un presupuesto sin email no rompe la emisión', async () => {
  sembrar();
  estado.tablas.quotes[0].email = '';
  const r = await llamar(emitir({ enviar_email: true }), JWT_ADMIN);
  assert(r.status === 200, `status ${r.status}`);
  assert(r.json.aviso, 'no avisa de que no hay email');
  assert(enviados.length === 0, 'intentó enviar a la nada');
});

// ═══ Descarga ══════════════════════════════════════════════════════════════
await check('el cliente descarga con el token de su pedido', async () => {
  sembrar();
  const e = await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  const r = await llamar({
    action: 'descargar',
    recibo_codigo: e.json.codigo,
    quote_codigo: 'Q-2026-0042',
    token: QUOTE_TOKEN
  });
  assert(r.status === 200, `status ${r.status}: ${r.json.error}`);
  assert(r.json.url?.startsWith('https://firmada.test/'), 'sin URL firmada');
});

await check('sin token, con token falso o con el de otro pedido: 403', async () => {
  sembrar();
  const e = await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  const base = { action: 'descargar', recibo_codigo: e.json.codigo, quote_codigo: 'Q-2026-0042' };

  assert((await llamar(base)).status === 403, 'sin token');
  assert((await llamar({ ...base, token: 'no-es-un-uuid' })).status === 403, 'token basura');
  assert(
    (await llamar({ ...base, token: '11111111-1111-1111-1111-111111111111' })).status === 403,
    'TOKEN DE OTRO PEDIDO ACEPTADO'
  );
  // Token bueno pero diciendo que es de otro pedido: tampoco.
  assert(
    (await llamar({ ...base, quote_codigo: 'Q-2026-0043', token: QUOTE_TOKEN })).status === 403,
    'no cruza el recibo con su pedido'
  );
});

await check('el admin descarga sin token', async () => {
  sembrar();
  const e = await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  const r = await llamar({ action: 'descargar', recibo_codigo: e.json.codigo }, JWT_ADMIN);
  assert(r.status === 200, `status ${r.status}`);
});

await check('un código de recibo inexistente da 404', async () => {
  sembrar();
  const r = await llamar({ action: 'descargar', recibo_codigo: 'R-2026-9999' }, JWT_ADMIN);
  assert(r.status === 404, `status ${r.status}`);
});

// ═══ Anulación ═════════════════════════════════════════════════════════════
await check('anular marca la fila y conserva el PDF', async () => {
  sembrar();
  const e = await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  const id = estado.tablas.recibos[0].id;
  const r = await llamar({ action: 'anular', recibo_id: id, motivo: 'importe mal' }, JWT_ADMIN);
  assert(r.status === 200, `status ${r.status}`);
  assert(estado.tablas.recibos[0].anulado_at, 'no marcó la anulación');
  assert(estado.tablas.recibos[0].anulado_motivo === 'importe mal', 'no guardó el motivo');
  assert(estado.storage.size === 1, 'borró el PDF archivado');
  assert(e.json.codigo, 'sin código');
});

await check('el cliente no puede descargar un justificante anulado', async () => {
  sembrar();
  const e = await llamar(emitir({ enviar_email: false }), JWT_ADMIN);
  await llamar({ action: 'anular', recibo_id: estado.tablas.recibos[0].id }, JWT_ADMIN);
  const r = await llamar({
    action: 'descargar',
    recibo_codigo: e.json.codigo,
    quote_codigo: 'Q-2026-0042',
    token: QUOTE_TOKEN
  });
  assert(r.status === 410, `status ${r.status}`);
  // El admin sí, para poder comprobar qué se emitió mal.
  const a = await llamar({ action: 'descargar', recibo_codigo: e.json.codigo }, JWT_ADMIN);
  assert(a.status === 200, 'el admin tampoco puede verlo');
});

// ═══ CORS y método ═════════════════════════════════════════════════════════
await check('OPTIONS responde CORS y GET no está permitido', async () => {
  const pre = await handler(
    new Request('https://test.functions/recibo-emitir', {
      method: 'OPTIONS',
      headers: { origin: 'https://www.impresion3dcc.com' }
    })
  );
  assert(pre.status === 200, `preflight ${pre.status}`);
  assert(
    pre.headers.get('Access-Control-Allow-Origin') === 'https://www.impresion3dcc.com',
    'CORS mal'
  );

  const get = await handler(
    new Request('https://test.functions/recibo-emitir', { method: 'GET' })
  );
  assert(get.status === 405, `GET devolvió ${get.status}`);
});

await check('un origen no permitido no se refleja en la cabecera', async () => {
  const pre = await handler(
    new Request('https://test.functions/recibo-emitir', {
      method: 'OPTIONS',
      headers: { origin: 'https://sitio-malicioso.example' }
    })
  );
  assert(
    pre.headers.get('Access-Control-Allow-Origin') !== 'https://sitio-malicioso.example',
    'REFLEJA CUALQUIER ORIGEN'
  );
});

console.log(
  fallos === 0
    ? '\n\x1b[32mTodas las comprobaciones de la Edge Function OK\x1b[0m\n'
    : `\n\x1b[31m${fallos} fallo(s)\x1b[0m\n`
);
Deno.exit(fallos === 0 ? 0 : 1);
