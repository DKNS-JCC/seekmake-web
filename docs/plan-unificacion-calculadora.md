# Plan de unificación — Calculadora ↔ Web (Supabase)

**Objetivo:** migrar la capa de datos de la Calculadora (Firebase/Firestore) al proyecto Supabase de la web, de forma que presupuestos web y pedidos internos vivan en la misma base de datos, sin cambiar la interfaz de la Calculadora ni el flujo de trabajo de SILAB3D.

**Principio rector:** SILAB3D ya es inquilino de tu Firebase (`empresas/silab3d`); pasa a ser inquilino de tu Supabase con el mismo aislamiento (RLS en vez de Firestore rules). Su app, su login y sus datos siguen igual. Los pedidos compartidos y el pool de inventario conjunto se mantienen porque ambas empresas siguen en la misma base de datos.

---

## 1. Estado actual (verificado en código)

### Calculadora (Firestore)

Esquema por empresa (`src/firestoreService.js`):

```
empresas/{slug}/data/config      → { printers, filament_types, global_config, purge_config }
empresas/{slug}/data/inventory   → { filament_stock }
empresas/{slug}/data/clients     → { clients }
empresas/{slug}/data/calc_state  → { …estado del formulario }
empresas/{slug}/orders/{id}      → un documento por pedido
```

Slugs: `3dcc` y `silab3d`. Funciones cross-empresa que hay que preservar: `loadPartnerInventory` / `savePartnerInventory` (pool compartido de filamento, con escritura en el stock del socio) y `loadPartnerSharedOrders` (pedidos con `is_shared: true` visibles para ambos).

Pipeline de estados (`ORDER_LIFECYCLE` en `src/shared/backend.mjs`):
`Presupuesto enviado → Aceptado → En producción → Post-procesado → Listo para entregar → Entregado`.
Pago derivado: `payment_status` = Pendiente / Parcial / Pagado según `importe_pagado` vs `precio_final`.

Auth: Firebase Auth email+password; el mapeo usuario→empresa se guarda en Firestore (`saveUserEmpresa`).

**Báscula ESP8266** (descubierta en `firestore.rules`): un dispositivo hardware lee `data/inventory` de Firestore **sin autenticación** (API key embebida en el firmware) y escribe pesajes en `filament_readings`. La app no consume `filament_readings` — solo lo escribe la báscula. Tras la migración, la lectura de inventario de la báscula quedará obsoleta salvo que se actualice el firmware para apuntar a Supabase (PostgREST + anon key) o se mantenga Firebase vivo solo para ella. **Decisión (2026-08-03): retirada** — las rules de Firebase pueden pasar a solo lectura sin excepciones y el proyecto cerrarse tras el margen de 30 días.

Secretos hoy en cliente (a corregir en fase 3): `global_config.stripe_secret_key` y `global_config.email_app_password` viajan al renderer.

### Web (Supabase)

- `quotes` — solicitudes del tasador. Estados: `nuevo → revisado → aceptado → imprimiendo → listo → entregado`, más `rechazado`. Pago: `pago` (pendiente/adelanto/pagado), `importe_pagado`, `precio_final`. Además: `codigo` (Q-YYYY-NNNN), `archivos` jsonb, `metricas`, `desglose`, `acepta_token`, `valido_hasta`, `archivado`, RPCs `get_quote_status` y `accept_quote`.
- `quote_settings` — tarifas públicas (jsonb único, editable en /admin/tarifas).
- `quote_events`, `filamentos`, `colores`, buckets de storage, limpieza pg_cron.

**Nada de esto cambia.** El tasador público, /presupuesto y /admin/presupuestos siguen funcionando tal cual.

---

## 2. Esquema objetivo en Supabase

Decisión de diseño tras leer ambos esquemas: **no fusionar `quotes` y pedidos en una sola tabla.** Una solicitud web (con token de aceptación, ficheros STL, métricas de geometría) y un pedido de producción (con desglose de costes, split entre empresas, historial de cobros) son entidades distintas con ~40 campos no solapados cada una. Lo que las coordina es un **enlace `orders.quote_id`** y una **proyección automática de estado** (trigger), todo dentro de la misma base de datos y transaccional — no es el "sync entre esquemas" de la opción C descartada.

```sql
-- Tenancy
create table public.empresas (
  slug   text primary key,          -- '3dcc' | 'silab3d'
  nombre text not null              -- '3DCC' | 'SILAB3D'
);

create table public.empresa_users (
  user_id uuid primary key references auth.users on delete cascade,
  empresa text not null references public.empresas(slug)
);

-- Helpers para RLS
create function public.user_empresa() returns text
  language sql stable security definer as
  $$ select empresa from public.empresa_users where user_id = auth.uid() $$;

create function public.partner_de(e text) returns text
  language sql immutable as
  $$ select case e when '3dcc' then 'silab3d' when 'silab3d' then '3dcc' end $$;

-- Documentos de configuración: espejo 1:1 de Firestore (jsonb).
-- El adaptador hace upsert del documento completo, igual que setDoc().
create table public.empresa_docs (
  empresa    text not null references public.empresas(slug),
  doc        text not null check (doc in ('config','inventory','clients','calc_state')),
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (empresa, doc)
);

-- Pedidos de la Calculadora. El pedido completo va en `data` (jsonb, misma
-- forma que normalizeOrder); columnas generadas para consultar sin drift.
create table public.orders (
  id         text primary key,                     -- ids de 8 chars existentes
  empresa    text not null references public.empresas(slug),
  quote_id   uuid references public.quotes(id),    -- enlace a solicitud web
  data       jsonb not null,
  estado     text    generated always as (data->>'estado') stored,
  is_shared  boolean generated always as ((data->>'is_shared')::boolean) stored,
  archived   boolean generated always as ((data->>'archived')::boolean) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### RLS (replica las Firestore rules actuales, incluido el acceso al socio)

| Tabla | Propia empresa | Empresa socia |
|---|---|---|
| `empresa_docs` | todo | `select` de `config` e `inventory`; `update` de `inventory` (pool compartido) |
| `orders` | todo | `select` cuando `is_shared and not archived` |
| `quotes` | — (solo `is_admin()` como hoy) | + `select/update` para usuarios 3DCC (bandeja web, fase 2) |

Con dos inquilinos, las políticas del socio se expresan con `empresa = partner_de(user_empresa())`. SILAB3D no ve `quotes` (son solicitudes de tu web), ni tus clientes, ni tu configuración más allá de lo que ya ve hoy.

---

## 3. Mapeo de estados (proyección pedido → quote)

Cuando un pedido tiene `quote_id`, un trigger sobre `orders` proyecta su estado al `quotes` enlazado, de modo que /presupuesto (cliente) y /admin/presupuestos siempre reflejan la realidad de producción:

| `orders.estado` (Calculadora) | `quotes.estado` (web) |
|---|---|
| Presupuesto enviado | revisado |
| Aceptado | aceptado |
| En producción | imprimiendo |
| Post-procesado | imprimiendo |
| Listo para entregar | listo |
| Entregado | entregado |

| `payment_status` (Calculadora) | `quotes.pago` |
|---|---|
| Pendiente | pendiente |
| Parcial | adelanto |
| Pagado | pagado |

El trigger también proyecta `precio_final` e `importe_pagado`. Dirección única (pedido → quote): la quote es la vista pública; el pedido es la fuente de verdad una vez existe. Antes de existir pedido, la quote se gestiona como hoy (incluido `accept_quote` del cliente).

---

## 4. Cambios en la Calculadora

### 4.1 Adaptador de datos (el corazón de la fase 1)

`store.js` hace `import * as fsService from './firestoreService'` — un único punto de entrada. Se crea `src/supabaseService.js` con **exactamente la misma API**:

`loadAllData, saveAllData, saveConfig, saveInventory, saveCalcState, saveClients, saveOrder, removeOrder, loadPartnerInventory, savePartnerInventory, loadPartnerSharedOrders, empresaSlug`

y se cambia una línea de import. Ningún componente Vue se toca. Equivalencias: `getDoc/setDoc` de docs → `select/upsert` sobre `empresa_docs`; colección `orders` → tabla `orders` (el documento entero en `data`); `loadPartnerSharedOrders` → `select … where empresa = partner and is_shared` (la RLS ya lo limita).

### 4.2 Auth

`firebase.js` se sustituye por un wrapper de `@supabase/supabase-js` con las mismas exports (`onAuthChange`, `loginWithEmail`, `getUserEmpresa`, `logout`). La empresa se deriva de `empresa_users` en vez de elegirse en el login (el selector actual de Login.vue pasa a ser informativo o se retira): más seguro, imposible entrar "como" la otra empresa.

Los hashes de contraseña de Firebase (scrypt propio) no se importan de forma fiable a Supabase; siendo 2-3 usuarios, se crean las cuentas a mano y cada uno estrena contraseña (o enlace de reset). Es el único cambio visible para SILAB3D.

### 4.3 Bandeja de presupuestos web (fase 2)

Nueva sección en Orders.vue, solo visible para 3DCC: lista `quotes` activas (`nuevo/revisado/aceptado`, sin pedido enlazado) y botón **"Convertir en pedido"** que precarga el formulario: cliente ← `nombre`/`email`, descripción ← `codigo` + ficheros, material ← `material`, peso ← suma de `archivos[].metricas.peso_g`, precio ← `precio_final ?? precio_total`. Al guardar se escribe `quote_id` y desde ahí el trigger mantiene la quote al día. Se acabó re-teclear pedidos web.

### 4.4 Servicios a edge functions (fase 3)

- **Email** — `order-notify`: misma infraestructura SMTP que ya usan `submit-quote` y `notify-quote`. El móvil gana el email de estado que hoy `platform.js` stubea con "solo disponible en escritorio". `email_app_password` sale del cliente y pasa a secrets de la función.
- **Stripe** — `order-stripe-link`: crea el checkout desde el servidor; `stripe_secret_key` deja de viajar al renderer. El móvil gana enlaces de pago.
- **PDF** — el escritorio sigue generándolo local (PDFKit en Electron, cero cambios); para el móvil, pdfmake en cliente o una edge function, a decidir en su momento.

---

## 5. Migración de datos

Script Node (`scripts/migrate-firestore-supabase.mjs`) fuera de la app:

1. Lee todo con `firebase-admin` (ambas empresas: config, inventory, clients, calc_state, orders).
2. Transforma: pedido → fila de `orders` (pasando por `normalizeData`/`normalizeOrder` para sanear datos antiguos); docs → filas de `empresa_docs`. Los secretos de `global_config` (`stripe_secret_key`, `email_app_password`) **se mantienen tal cual** para que email/Stripe de escritorio sigan funcionando sin regresión; se moverán a secrets de edge functions en la fase 3.
3. Escribe con service role (upsert idempotente — se puede ejecutar N veces).
4. Verifica: conteo de pedidos por empresa y suma de `precio_final` e `importe_pagado` Firestore vs Supabase deben coincidir al céntimo. Con `--dry-run` solo imprime el informe.

---

## 6. Cutover y rollback (impacto en SILAB3D)

| Momento | Acción |
|---|---|
| T-7 días | Avisar a SILAB3D: "el día X actualizad la app; os llegará contraseña nueva". Fase 0 desplegada (esquema + cuentas), sin efecto en nadie. |
| T-0 | Ventana de ~1 h sin usar la app. Ejecutar migración + verificación. |
| T-0 +1 h | Publicar builds por los canales existentes (`publish-electron` / `publish-android`, con el auto-updater actual). Probar login y un pedido de humo con cada empresa. |
| T+30 días | Si todo bien, retirar el proyecto Firebase. |

**Rollback:** Firebase queda intacto y en solo lectura durante la transición; volver atrás = reinstalar la versión anterior de la app (los releases quedan publicados). Lo único que se perdería es lo escrito en Supabase durante el intervalo, por eso la ventana de freeze es corta y el humo se prueba el mismo día.

Para SILAB3D el resultado neto: misma app, mismos datos, contraseña nueva una vez — y a partir de la fase 3, email/Stripe en el móvil que hoy no tienen.

---

## 7. Fases y esfuerzo orientativo

| Fase | Contenido | Esfuerzo | Riesgo |
|---|---|---|---|
| 0 | Migración SQL (`empresas`, `empresa_users`, `empresa_docs`, `orders` + RLS), cuentas auth | ~1 día | Nulo (no afecta a nada en producción) |
| 1 | `supabaseService.js` + wrapper auth + script de migración + builds + cutover | 2-4 días | El principal; mitigado por API idéntica, dry-run y rollback |
| 2 | Bandeja web + `quote_id` + trigger de proyección | 1-2 días | Bajo (aditivo) |
| 3 | Edge functions email/Stripe, secrets fuera del cliente | 1-2 días | Bajo |
| 4 (opc.) | Realtime en `orders` (PC/móvil/socio en vivo), inventario normalizado por filas, tarifas coherentes (avisar en /admin/tarifas si `precio_g` público queda por debajo del coste interno + markup) | según apetito | Bajo |

---

## 8. Riesgos y limitaciones honestas

- **Offline:** Firestore cachea y tolera cortes breves; supabase-js no. Tras la migración la Calculadora necesita conexión. Si el móvil se usa en sitios sin cobertura, plantear en fase 4 una caché local de solo lectura.
- **Escrituras de documento completo:** `inventory`/`clients` se guardan enteros (igual que hoy); dos personas editando a la vez pueden pisarse, como ahora. No es una regresión, pero la normalización por filas de la fase 4 lo eliminaría.
- **RLS:** un fallo de política puede filtrar datos entre empresas o romper el pool compartido. Antes del cutover, probar la matriz completa con un usuario de cada empresa (ver/editar propio, ver compartido del socio, no ver el resto).
- **Funciones a retestear tras fase 1:** pedidos compartidos con split, consumo de pool del socio, ghost mode (Ctrl+Shift+G), migración CRM automática de `store.js`.
- **RLS y comportamiento real:** las Firestore rules actuales dan lectura/escritura total a cualquier usuario autenticado (el ghost mode depende de leerlo todo del socio). La RLS replica la lectura total entre socios pero **restringe las escrituras** a lo que la app hace de verdad (todo lo propio + inventory del socio); es una mejora de seguridad sin cambio de comportamiento. Endurecer las lecturas (p. ej. eliminar ghost mode) queda como decisión de negocio, no técnica.
- **Báscula ESP8266:** retirada (decisión 2026-08-03); no requiere acción.
- Estimaciones orientativas, no compromisos.

