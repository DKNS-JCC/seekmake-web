# Plan — Justificantes de pago en PDF + Seguimiento logístico

> Estado: **implementado**. Ver `docs/DESPLIEGUE-justificantes-y-tracking.md`
> para los pasos de despliegue y las diferencias finales (la plantilla del PDF
> acabó en `supabase/functions/_shared/recibo/`, no en `lib/`, porque la
> emisión es server-side y así el navegador no carga pdf-lib).
> Fecha: 13 de agosto de 2026.
> Alcance: `quotes`, `envios`, `/presupuesto`, `/admin/presupuestos`, Edge Functions.

---

## 1. Análisis de la situación actual

### 1.1 Restricción arquitectónica dominante

`next.config.mjs` fija `output: 'export'`. **No hay servidor Next**: no hay API routes, ni server actions, ni middleware. Todo lo que necesite un secreto o saltarse RLS tiene que vivir en una **Supabase Edge Function**. Todo lo demás corre en el navegador contra Supabase con la anon key.

Esto no es un problema para lo que pides, pero condiciona cada decisión de abajo. Cualquier alternativa que empiece por "una API route de Next…" queda descartada de entrada (o exige migrar a Vercel, que se valora en §6.5).

### 1.2 Lo que ya existe y sirve

| Pieza | Dónde | Estado |
|---|---|---|
| Ciclo de vida del pedido | `quotes.estado` (7 estados) | Sólido |
| Estado de pago | `quotes.pago` (`pendiente`/`adelanto`/`pagado`), `importe_pagado`, `precio_final` | Sólido pero **sin historial** |
| Consulta pública por código | RPC `get_quote_status(p_codigo)`, `security definer` | Buen patrón, reutilizable |
| Tabla de envíos | `envios` (0015) — ya tiene `tracking_number`, `tracking_url`, `carrier`, `estado` | **Existe pero es invisible para el cliente** |
| Generación de etiquetas | Edge Function `envios-etiqueta` + `EnvioPanel` | Funciona vía Sendcloud |
| Email al cliente | Edge Function `notify-quote` (SMTP denomailer) | Reutilizable para adjuntar PDFs |
| "PDF" de presupuesto | `lib/quote/pdf.ts` → `window.print()` | Sirve para un borrador, **no para un justificante** |
| Enlace personal por token | `quotes.acepta_token` + `?codigo=…&token=…` | **Clave**: ya tienes un mecanismo de autenticación ligera para el cliente |

### 1.3 Las cinco carencias reales

1. **No hay documento de pago.** El único "PDF" del proyecto es un `window.print()` de una estimación. Depende del navegador, se rompe en móvil y no se puede adjuntar a un correo ni archivar.
2. **No hay registro de cobros.** `importe_pagado` es un número que se sobrescribe. No sabes *cuándo* se cobró, *cómo* (Bizum, efectivo, transferencia) ni cuántos cobros hubo. Un justificante necesita exactamente esos tres datos.
3. **`envios` es invisible para el cliente.** RLS `admin read` + `admin write`, y `get_quote_status` no devuelve ni un solo campo de envío. El cliente ve "Envío nacional" y nada más.
4. **No se puede dar de alta un envío a mano.** `EnvioPanel` solo crea filas en `envios` como efecto secundario de generar una etiqueta en Sendcloud. Si envías por InPost al margen de Sendcloud (o pegas un número que te pasan por WhatsApp), no hay dónde meterlo.
5. **Doble fuente de verdad en los importes.** El trigger `project_order_to_quote()` (0017) escribe `pago`, `precio_final` e `importe_pagado` en `quotes` desde los pedidos de la Calculadora. Cualquier diseño nuevo tiene que convivir con eso o lo romperá. Está tratado en §3.2.

---

## 2. Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Tipo de documento | **Recibo / justificante no fiscal** (sin serie fiscal ni IVA desglosado) |
| Motor PDF | **pdf-lib**, plantilla compartida navegador ↔ Deno |
| Canales | Descarga cliente + descarga admin + email automático al marcar pagado + archivado en Storage |
| Origen del tracking | **Introducción manual** del número de seguimiento desde el panel |

> **Aviso**: un "justificante de pago" acredita un cobro; **no sustituye a una factura**. Si un cliente (sobre todo empresa) te pide factura, sigue siendo un documento aparte. Esto no es asesoramiento fiscal — si tienes dudas sobre tus obligaciones de facturación (y sobre si Verifactu te afecta), consúltalo con tu asesor. El diseño de §3 deja la puerta abierta a añadir facturas sin rehacer nada (§6.3).

---

## 3. Parte A — Justificantes de pago

### 3.1 Principio de diseño: **un recibo = un cobro**

En lugar de "un recibo del pedido", cada fila documenta **un cobro concreto**. Esto resuelve gratis el caso `adelanto` (emites un recibo del adelanto y otro del resto), da historial, y evita inventar una tabla `pagos` separada que chocaría con la Calculadora.

### 3.2 Convivencia con el trigger de la Calculadora

El punto delicado. `project_order_to_quote()` machaca `quotes.importe_pagado` cada vez que se actualiza el pedido enlazado.

**Regla adoptada: `recibos` no escribe en `quotes`.** Es un libro de emisiones, no la fuente de verdad del saldo. `quotes.importe_pagado` sigue siendo lo que es hoy (lo que diga la Calculadora, o lo que teclee el admin).

Para que no se descuadre en silencio, el panel muestra un aviso cuando `SUM(recibos.importe) ≠ quotes.importe_pagado`. Es una comprobación de 10 líneas que evita el fallo más probable de todo este sistema: emitir dos veces el mismo recibo, o emitir por un importe que no cuadra con el pedido.

### 3.3 Modelo de datos — migración `0022_recibos.sql`

```sql
-- Secuencia y código legible: R-2026-0001
create sequence if not exists public.recibo_codigo_seq;

create or replace function public.next_recibo_codigo()
returns text language sql volatile set search_path = public as $$
  select 'R-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.recibo_codigo_seq')::text, 4, '0');
$$;

create table if not exists public.recibos (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique default public.next_recibo_codigo(),
  quote_id      uuid not null references public.quotes(id) on delete cascade,

  -- el cobro que documenta
  importe       numeric(10,2) not null check (importe > 0),
  metodo        text not null default 'transferencia'
                check (metodo in ('efectivo','bizum','transferencia','tarjeta','otro')),
  fecha_pago    date not null default current_date,
  concepto      text not null default '',
  es_adelanto   boolean not null default false,

  -- snapshot inmutable: con esto se reconstruye el PDF byte a byte
  datos         jsonb not null default '{}',

  -- archivo emitido (bucket privado `recibos`)
  pdf_path      text,

  -- verificación pública del documento
  verif_token   uuid not null default gen_random_uuid(),

  anulado_at    timestamptz,
  anulado_motivo text not null default '',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists recibos_quote_idx on public.recibos(quote_id, created_at desc);

drop trigger if exists touch_recibos on public.recibos;
create trigger touch_recibos before update on public.recibos
  for each row execute function public.touch_updated_at();

alter table public.recibos enable row level security;
create policy "recibos: admin all" on public.recibos
  for all using (public.is_admin()) with check (public.is_admin());
```

Notas sobre el esquema:

- **`datos` jsonb es el corazón.** Guarda el snapshot en el momento de emitir: nombre del cliente, código de pedido, líneas, total del pedido, importe cobrado, pendiente, datos del emisor. Si mañana cambias el nombre comercial o el teléfono, los recibos ya emitidos no mutan. Esto es innegociable en un documento que el cliente puede haber guardado.
- **Nunca se borra ni se edita un recibo.** Se anula (`anulado_at`) y se emite otro. Un justificante editable no justifica nada.
- **`verif_token`** alimenta un QR en el PDF que apunta a `/recibo/?c=R-2026-0001&t=<token>` y valida el documento contra la base de datos. Es la diferencia entre un PDF bonito y un PDF creíble. Coste: una RPC y una página mínima.

### 3.4 El bucket

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recibos', 'recibos', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false;
```

**Privado, a diferencia de `quote-uploads`.** Un recibo lleva nombre del cliente e importe. El acceso se sirve siempre con URL firmada de caducidad corta (5–15 min), emitida por la Edge Function.

### 3.5 Motor PDF — plantilla compartida

Aquí está el truco que hace que las cuatro vías de entrega no diverjan: **pdf-lib es JS puro y corre igual en el navegador y en Deno**. Una sola plantilla, cero duplicación.

```
lib/recibo/
  template.ts   → buildReciboPdf(datos): Promise<Uint8Array>   // puro, sin DOM, sin Node
  types.ts      → ReciboDatos
  assets.ts     → logo PNG en base64 (inline, para que funcione en Deno)
  qr.ts         → QR del enlace de verificación (PNG data URL)
```

Requisitos de la función `buildReciboPdf`:

- Sin `document`, sin `window`, sin `fs`. Solo `pdf-lib` y datos de entrada.
- **Determinista**: los metadatos de creación del PDF se fijan a partir de `datos.emitido_at`, no de `Date.now()`. Si no, el PDF que descarga el cliente y el archivado difieren en bytes y el archivado deja de ser una prueba.
- Fuentes estándar (Helvetica) con `WinAnsiEncoding`: cubre acentos, `ñ` y `€` sin incrustar tipografías. Si quieres la tipografía de marca, hace falta `@pdf-lib/fontkit` + TTF incrustada (+~200 KB por PDF). Recomendación: Helvetica en v1.

Contenido del documento (A4, una página):

```
┌──────────────────────────────────────────────┐
│ [logo]  3DCC Salamanca      JUSTIFICANTE     │
│         impresion3dcc.com   DE PAGO          │
│                             R-2026-0001      │
├──────────────────────────────────────────────┤
│ Recibido de:  <nombre cliente>               │
│ Pedido:       Q-2026-0042                    │
│ Fecha cobro:  12/08/2026                     │
│ Forma de pago: Bizum                         │
├──────────────────────────────────────────────┤
│ Concepto                                     │
│ Impresión 3D — 3 piezas PETG · Q-2026-0042  │
├──────────────────────────────────────────────┤
│ IMPORTE RECIBIDO                    45,00 €  │
│ Total del pedido                    90,00 €  │
│ Pendiente                           45,00 €  │
├──────────────────────────────────────────────┤
│ [QR]  Verifica este justificante en          │
│       impresion3dcc.com/recibo               │
│                                              │
│ Documento acreditativo de pago. No es una    │
│ factura a efectos fiscales.                  │
└──────────────────────────────────────────────┘
```

Esa última línea es importante: deja claro qué es el documento y evita malentendidos.

**Bundle**: `pdf-lib` (~150 KB min+gz) se carga con `await import('pdf-lib')` dentro del handler del botón. No entra en el chunk inicial de ninguna página.

### 3.6 Emisión — Edge Function `recibo-emitir`

Una sola función, tres acciones. El PDF se genera **una vez, en el servidor**, y se archiva. Los cuatro canales sirven **ese mismo archivo**.

| Acción | Quién | Qué hace |
|---|---|---|
| `emitir` | admin (JWT) | Valida, monta `datos`, genera el PDF, lo sube al bucket, inserta en `recibos`, opcionalmente lo adjunta a un email al cliente. Devuelve URL firmada. |
| `descargar` | admin (JWT) **o** cliente (`codigo` + `acepta_token`) | Devuelve URL firmada del PDF archivado. |
| `anular` | admin (JWT) | Marca `anulado_at`. No borra el archivo. |

**Por qué la emisión va en el servidor y no en el navegador**, aunque hayas elegido pdf-lib cliente: querías email automático y archivado. Si el PDF se genera en el cliente hay que subirlo desde el cliente (el navegador escribiendo en el bucket de justificantes: mala idea) y el email no puede adjuntarlo. Generándolo en la Edge Function con **la misma plantilla pdf-lib que elegiste**, los cuatro canales sirven un fichero idéntico y el archivado es una prueba real. La variante 100 % navegador queda descrita en §6.2 por si prefieres empezar por ahí.

**Autenticación del cliente**: reutiliza `quotes.acepta_token`, que ya viaja en el enlace del email de confirmación (`?codigo=…&token=…`). Cero mecanismos nuevos.

### 3.7 Verificación pública — RPC + `/recibo`

```sql
create or replace function public.verificar_recibo(p_codigo text, p_token uuid)
returns table (codigo text, importe numeric, fecha_pago date,
               metodo text, pedido text, valido boolean, anulado boolean)
language sql stable security definer set search_path = public as $$
  select r.codigo, r.importe, r.fecha_pago, r.metodo, q.codigo,
         true, r.anulado_at is not null
    from public.recibos r join public.quotes q on q.id = r.quote_id
   where r.codigo = upper(trim(p_codigo)) and r.verif_token = p_token
   limit 1;
$$;
grant execute on function public.verificar_recibo(text, uuid) to anon, authenticated;
```

Página `/recibo` estática, cliente, ~80 líneas: lee los query params, llama a la RPC, muestra ✅ válido / ⚠️ anulado / ❌ no encontrado. Sin token no devuelve nada, así que los códigos no son enumerables.

### 3.8 UI

**Admin (`/admin/presupuestos`, drawer)** — nuevo `ReciboPanel` junto a `EnvioPanel`:

- Lista de recibos emitidos (código, importe, fecha, método, ⬇ descargar, anular).
- Formulario "Emitir justificante": importe (precargado con `importe_pagado` o el pendiente), método, fecha, concepto (autogenerado editable), checkbox "enviar por email al cliente".
- Aviso de descuadre si la suma no coincide con `importe_pagado`.

**Cliente (`/presupuesto`)** — bloque nuevo bajo la tarjeta de estado, visible solo con token en la URL:

- "Justificantes de pago" con una fila por recibo y botón de descarga.
- Sin token: una línea discreta "Los justificantes están disponibles desde el enlace de tu email de confirmación".

**Email** — plantilla nueva en `notify-quote` (o directamente desde `recibo-emitir`): asunto "Justificante de pago R-2026-0001 · 3DCC", PDF adjunto, enlace al seguimiento.

### 3.9 Automatismo "al marcar como pagado"

Deliberadamente **semiautomático**: al cambiar `pago` a `pagado` (o `adelanto`), el panel **propone** emitir el justificante con el formulario ya relleno, en vez de emitirlo solo.

Razón: un recibo emitido por un trigger con datos incompletos (método de pago desconocido, fecha equivocada) es un documento erróneo ya enviado al cliente, y no se puede desemitir. Un clic de confirmación con el formulario precargado cuesta dos segundos y elimina esa clase entera de errores. Si aun así lo quieres 100 % automático, es un trigger sobre `quotes` que llama a la función vía `pg_net` — pero mi recomendación es no hacerlo.

---

## 4. Parte B — Seguimiento logístico

### 4.1 Enfoque: manual, pero bien modelado

Introduces el número de seguimiento a mano. La consecuencia de diseño: como no hay eventos del carrier, **el estado y sus fechas los pones tú**, y la UI debe construir una línea de tiempo creíble a partir de muy pocos datos. Se consigue con marcas de tiempo por estado en lugar de una tabla de eventos.

### 4.2 Migración `0023_envios_publico.sql`

```sql
alter table public.envios
  -- display
  add column if not exists carrier_nombre text,            -- "InPost", "Correos Express"
  -- punto de recogida (InPost Parcels: locker o tienda)
  add column if not exists punto_recogida jsonb not null default '{}',
     -- {nombre, direccion, ciudad, cp, horario, codigo_apertura}
  -- línea de tiempo sin tabla de eventos
  add column if not exists etiqueta_at   timestamptz,
  add column if not exists transito_at   timestamptz,
  add column if not exists disponible_at timestamptz,      -- llegó al punto InPost
  add column if not exists entregado_at  timestamptz,
  add column if not exists fecha_estimada date,
  add column if not exists nota_cliente text not null default '',
  -- alta manual sin pasar por Sendcloud
  add column if not exists origen text not null default 'sendcloud'
     check (origen in ('sendcloud','manual'));

-- 'disponible' = en el punto de recogida, esperando al cliente
alter table public.envios drop constraint if exists envios_estado_check;
alter table public.envios add constraint envios_estado_check
  check (estado in ('pendiente','etiqueta','en_transito','disponible',
                    'entregado','incidencia','cancelado'));
```

`punto_recogida` como jsonb en vez de columnas: los datos de un locker InPost, una oficina de Correos y una entrega a domicilio no tienen la misma forma, y no merece la pena normalizar algo que solo se muestra.

### 4.3 Exposición pública — RPC dedicada

Deliberadamente **una RPC nueva** en lugar de ampliar `get_quote_status`. Cambiar el tipo de retorno de esa función obliga a `drop function` (ya pasó dos veces, en 0013 y 0014) y arrastra a toda la página de estado. Separar aísla el riesgo y permite pedir el envío solo cuando `entrega = 'envio'`.

```sql
create or replace function public.get_envio_status(p_codigo text)
returns table (
  carrier_nombre  text,
  metodo          text,
  tracking_number text,
  tracking_url    text,
  estado          text,
  punto_recogida  jsonb,
  fecha_estimada  date,
  nota_cliente    text,
  etiqueta_at     timestamptz,
  transito_at     timestamptz,
  disponible_at   timestamptz,
  entregado_at    timestamptz,
  updated_at      timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.carrier_nombre, e.metodo, e.tracking_number, e.tracking_url,
         e.estado, e.punto_recogida, e.fecha_estimada, e.nota_cliente,
         e.etiqueta_at, e.transito_at, e.disponible_at, e.entregado_at,
         e.updated_at
    from public.envios e
    join public.quotes q on q.id = e.quote_id
   where q.codigo = upper(trim(p_codigo))
     and not q.archivado
     and e.estado <> 'cancelado'
   order by e.created_at desc
   limit 1;
$$;
grant execute on function public.get_envio_status(text) to anon, authenticated;
```

**No expone dirección, ni nombre, ni teléfono, ni coste, ni `coste_carrier`** (tu margen). Mismo criterio de privacidad que `get_quote_status`. El `cp_destino` tampoco sale, aunque haga falta para consultar en inpost.es — el cliente conoce su propio código postal.

### 4.4 UI de seguimiento en `/presupuesto`

Tarjeta nueva bajo el stepper, solo si `entrega === 'envio'` y la RPC devuelve fila:

```
┌────────────────────────────────────────────┐
│ 📦 Tu envío                    [InPost]    │
├────────────────────────────────────────────┤
│  ●─── Etiqueta creada        12 ago        │
│  ●─── En tránsito            13 ago        │
│  ○─── Disponible en tu punto  —            │
│  ○─── Entregado               —            │
├────────────────────────────────────────────┤
│ Nº de seguimiento                          │
│  ┌──────────────────────┐                  │
│  │ 620012345678         │ [copiar]         │
│  └──────────────────────┘                  │
│  [ Seguir mi envío en InPost ↗ ]           │
│  Necesitarás tu código postal.             │
├────────────────────────────────────────────┤
│ Punto de recogida                          │
│  Locker InPost — Carrefour Torres Villarroel │
│  C/ Vaguada de la Palma s/n, Salamanca     │
│  Abierto 24 h · 3 días para recogerlo      │
└────────────────────────────────────────────┘
```

Detalles que importan:

- **Botón copiar** el número. Es lo que hace el 90 % de la gente y en móvil seleccionar texto es un fastidio.
- **Enlace**: si `tracking_url` viene de Sendcloud (envío creado con etiqueta), se usa tal cual y funciona directo. Si es alta manual, se enlaza a `https://www.inpost.es/seguimiento-del-envio/`, que **exige número + código postal de destino**, así que hay que avisar de ello en la propia UI en vez de prometer un enlace mágico. ([InPost](https://www.inpost.es/seguimiento-del-envio/))
- **Bloque de punto de recogida** solo si `punto_recogida` no está vacío. Para InPost Parcels es lo más útil de toda la tarjeta: dónde está y hasta cuándo.
- **Fechas**: se muestran las que existen; los pasos futuros quedan en gris sin fecha. Nunca se inventa una fecha estimada que no hayas puesto tú.

Mapa carrier → etiqueta visual en `lib/envio/carriers.ts` (`inpost`, `correos`, `correos_express`, `seur`, `gls`, `ups`, `dhl`, genérico), con nombre bonito, color y URL base de seguimiento. Un objeto, no una tabla.

### 4.5 Alta manual en el panel

`EnvioPanel` pasa a tener dos pestañas:

- **Sendcloud** — el flujo actual, intacto.
- **Manual** — carrier (select), método (texto libre: "InPost Parcels 48 h"), nº de seguimiento, URL de seguimiento (autocompletada desde el carrier), estado, fecha estimada, punto de recogida (nombre, dirección, horario), nota al cliente.

Bajo ambas, un **control de estado del envío** con botones que además sellan la marca de tiempo correspondiente: `Etiqueta` → `En tránsito` → `Disponible en el punto` → `Entregado`. Un clic por transición; nada de editar fechas a mano.

Escritura directa desde el navegador admin (RLS `envios: admin write` ya lo permite). No hace falta tocar la Edge Function para el alta manual.

Extra de bajo coste: al pasar a `en_transito`, ofrecer "avisar al cliente" reutilizando `notify-quote` con el número de seguimiento y el enlace. Es el email que la gente espera y ahora mismo no existe.

---

## 5. Fases de implementación

| Fase | Contenido | Entregable comprobable |
|---|---|---|
| **0** | `0022_recibos.sql` + `0023_envios_publico.sql` + bucket. Aplicar con `scripts/apply-migration.mjs` y añadir `scripts/test-0022-rls.mjs` siguiendo el patrón de `test-0016-rls.mjs` | Migraciones aplicadas, RLS verificado |
| **1** | `lib/recibo/template.ts` + `types.ts` + assets. Script `scripts/test-recibo.ts` que escupe un PDF de muestra | Un PDF que puedas mirar y aprobar antes de conectar nada |
| **2** | Edge Function `recibo-emitir` (acciones `emitir` / `descargar` / `anular`) | Recibo emitido y archivado desde curl |
| **3** | `ReciboPanel` en admin + aviso de descuadre | Emitir desde el panel |
| **4** | Email con adjunto + página `/recibo` de verificación + RPC | Cliente recibe el PDF y el QR valida |
| **5** | Pestaña Manual y control de estado en `EnvioPanel`, `lib/envio/carriers.ts` | Alta manual de un tracking InPost |
| **6** | `get_envio_status` + tarjeta de seguimiento en `/presupuesto` + descarga de justificantes por token | Vista de cliente completa |
| **7** | Verificación: PDF idéntico en los 4 canales, RPC sin fugas de datos personales, `npm run build` limpio, prueba en móvil | Cierre |

Las fases 5–6 (tracking) son independientes de las 1–4 (justificantes): si quieres resultado visible antes, se pueden hacer primero — son claramente las más baratas.

---

## 6. Alternativas barajadas

### 6.1 Motor PDF

| Opción | A favor | En contra | Veredicto |
|---|---|---|---|
| **pdf-lib compartido (elegido)** | PDF real, mismo código en navegador y Deno, un solo documento para los 4 canales | ~150 KB, hay que maquetar por coordenadas | **Recomendado** |
| `window.print()` (patrón actual) | Cero dependencias, ya está en el repo | Salida distinta por navegador, mala en móvil, imposible adjuntar o archivar | Descartado para justificantes; vale para el presupuesto |
| jsPDF | API más cómoda para texto | Más pesado, peor en Deno, peor con fuentes | Descartado |
| HTML → PDF con Puppeteer/Gotenberg | Maquetación en HTML/CSS, mucho más cómoda | Chromium headless: no cabe en una Edge Function, exige servicio aparte (coste + otra pieza que mantener) | Descartado por desproporcionado |
| Servicio externo (DocRaptor, PDFMonkey…) | Cero mantenimiento | Coste recurrente, datos de clientes fuera, dependencia externa para un documento de 1 página | Descartado |
| `pdfmake` | Layout declarativo, sin coordenadas | Fuentes incrustadas obligatorias (bundle ×3) | Segunda opción si maquetar a mano cansa |

### 6.2 Dónde se genera el PDF

| Opción | A favor | En contra |
|---|---|---|
| **Servidor (Edge Function) — recomendado** | Un único fichero archivado = prueba real; el email puede adjuntarlo; el navegador nunca escribe en el bucket | Una Edge Function más que desplegar |
| Solo navegador | Sin backend nuevo, más rápido de tener | El email no puede adjuntar nada; el archivado exige que el cliente suba al bucket; riesgo de que el PDF descargado y el archivado difieran |
| Híbrido (cliente genera, servidor re-genera para email) | Descarga instantánea | Dos rutas de código para un mismo documento: la peor de las tres |

Si prefieres empezar por "solo navegador" para ver algo funcionando ya, el trabajo de §3.5 (`lib/recibo/template.ts`) se aprovecha íntegro al mover la emisión al servidor. No se tira nada.

### 6.3 Modelo del documento

| Opción | Comentario |
|---|---|
| **Recibo por cobro (elegido)** | Resuelve adelanto+resto, da historial, no toca `quotes` |
| Un recibo por pedido | Más simple, pero se rompe en cuanto hay un adelanto — y `pago='adelanto'` ya existe en tu esquema |
| Tabla `pagos` + tabla `recibos` | Contablemente más puro, pero duplica la fuente de verdad de `importe_pagado` y choca con el trigger de la Calculadora |
| Factura desde el día 1 | Numeración correlativa sin huecos, IVA, datos fiscales del cliente, conservación… mucho más trabajo y obligaciones. El esquema actual admite añadir un `tipo` a `recibos` y una serie separada cuando lo necesites |

### 6.4 Origen del estado del envío

| Opción | Esfuerzo | Mantenimiento | Comentario |
|---|---|---|---|
| **Manual (elegido)** | Bajo | Tú, en cada cambio | Correcto con poco volumen. Todo el diseño de §4 sigue valiendo si luego automatizas |
| Webhook de Sendcloud | Medio (1 Edge Function + verificación de firma) | Cero | El salto natural cuando cansen los clics: la función solo escribe las mismas columnas que rellenas a mano ahora |
| Cron con polling | Medio | Bajo | Peor que el webhook en todo salvo en no depender de configuración externa |
| Página de tracking de Sendcloud | Casi cero | Cero | El cliente sale de tu web y pierdes el control del diseño ([Sendcloud](https://support.sendcloud.com/hc/en-us/articles/360024840812-Sendcloud-Tracking)) |
| API de InPost directa | Alto | Alto | Solo tendría sentido si dejaras Sendcloud |

**Consecuencia práctica**: como el modelo de datos de §4.2 es el mismo que rellenaría un webhook, migrar de manual a automático más adelante son ~150 líneas y ninguna migración. La decisión no te encierra.

### 6.5 ¿Y salir del static export?

Migrar a Vercel daría API routes, `@react-pdf/renderer` y SSR. Pero el proyecto lleva un año de decisiones tomadas alrededor del export estático (RPC `security definer`, Edge Functions, todo cliente) y funciona. **No recomiendo migrar por esto**: dos Edge Functions resuelven el caso completo. Se anota como opción por si en el futuro se acumulan más necesidades de servidor.

---

## 7. Riesgos y cómo se mitigan

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Recibo emitido con datos erróneos, ya enviado | Alto — no se puede deshacer | Emisión con confirmación (§3.9), anulación explícita, nunca edición |
| PDF archivado ≠ PDF descargado | Alto — el archivado deja de probar nada | Un solo punto de generación (servidor) + plantilla determinista |
| Descuadre `recibos` vs `importe_pagado` | Medio | Aviso de descuadre en el panel; `recibos` no escribe en `quotes` |
| Fuga de datos personales por RPC pública | Alto (RGPD) | `get_envio_status` devuelve solo campos logísticos; recibos siempre tras token |
| Bucket `recibos` mal configurado como público | Alto | `public = false` explícito en la migración + test que compruebe que un GET anónimo devuelve 400 |
| `pdf-lib` engorda el bundle | Bajo | `await import()` dentro del handler; verificar con `next build` que no entra en el chunk inicial |
| El cliente pierde el enlace con token | Medio | El email de confirmación es reenviable desde el panel; alternativa: mostrar los justificantes también con solo el código (decisión de privacidad pendiente) |
| Acentos o `€` mal renderizados en el PDF | Medio | Helvetica + `WinAnsiEncoding` los cubre; incluir un caso con "ñ, á, €" en el PDF de muestra de la fase 1 |
| Confundir el justificante con una factura | Medio | Leyenda explícita en el documento |

---

## 8. Resumen de ficheros

**Nuevos**

```
supabase/migrations/0022_recibos.sql
supabase/migrations/0023_envios_publico.sql
supabase/functions/recibo-emitir/index.ts
lib/recibo/{template,types,assets,qr}.ts
lib/envio/carriers.ts
app/admin/_components/ReciboPanel.tsx
app/(site)/recibo/{page.tsx,ReciboVerify.tsx}   # dentro de (site) para heredar nav/footer
scripts/test-recibo.ts
```

**Modificados**

```
app/(site)/presupuesto/PresupuestoClient.tsx   → tarjeta de envío + justificantes
app/(site)/presupuesto/presupuesto.css         → estilos de ambos bloques
app/admin/_components/EnvioPanel.tsx           → pestaña Manual + control de estado
app/admin/presupuestos/page.tsx                → montar ReciboPanel
lib/types.ts                                   → Recibo, Envio, PuntoRecogida
supabase/functions/notify-quote/index.ts       → plantillas de justificante y de envío
package.json                                   → pdf-lib, qrcode
```

---

## Fuentes

- [InPost España — Seguimiento del envío](https://www.inpost.es/seguimiento-del-envio/)
- [InPost España — ¿Cómo puedo rastrear mi paquete?](https://www.inpost.es/preguntas-frecuentes/recibir-un-paquete/seguimiento-de-envio/)
- [Sendcloud Help Center — Sendcloud Tracking](https://support.sendcloud.com/hc/en-us/articles/360024840812-Sendcloud-Tracking)
- [Sendcloud Developer Portal — Tracking parcels](https://sendcloud.dev/docs/tracking/tracking-parcels)
