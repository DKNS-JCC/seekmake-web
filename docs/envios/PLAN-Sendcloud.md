# Plan de integración de envíos — 3DCC Salamanca

**Proveedor recomendado:** Sendcloud (agregador de envíos con origen España)
**Alcance:** tarifa de envío + generación de etiqueta + tracking
**Estado de este documento:** plan + prueba de concepto (PoC). No es una implementación completa.
**Fecha:** junio 2026

---

## 1. Resumen y recomendación

La petición original era integrar **Parcel2Go**. Tras revisarlo, Parcel2Go es un *broker con origen en Reino Unido*: factura en libras y está pensado para enviar *desde* UK. Para un taller que envía *desde* Salamanca a clientes de España y la UE, el origen no encaja.

La alternativa nativa para España es **Sendcloud**. Es un agregador (un solo contrato/API que da acceso a Correos, SEUR, GLS, MRW/Mondial Relay, CTT, UPS, DHL, etc.), con origen España, precios en € y API completa de **tarifas, etiquetas y tracking**. Packlink PRO se descartó porque su API ya no está disponible para nuevas integraciones; su producto es sobre todo panel web.

**Veredicto:** la integración es viable y útil. Encaja exactamente en un hueco que ya existe en tu web: hoy, cuando un presupuesto es con `entrega = 'envio'`, el coste del envío "se acuerda tras revisión, nunca lo calcula la web". Sendcloud permite calcularlo automáticamente, generar la etiqueta desde el panel y dar seguimiento al cliente.

**Hay un matiz técnico importante** (sección 5): el endpoint de precio exacto de Sendcloud *no soporta los carriers españoles que tarifan por zona de código postal*. Eso condiciona cómo calculamos la tarifa y se aborda en el plan.

---

## 2. Por qué Sendcloud (y no Parcel2Go / Packlink)

| Criterio | Parcel2Go | Packlink PRO | **Sendcloud** |
|---|---|---|---|
| Origen de envío | Reino Unido | España/UE | **España/UE** |
| Moneda | £ | € | **€** |
| API pública (rates/label/tracking) | Sí (OAuth2) | No (sin API para nuevas integraciones) | **Sí** |
| Carriers ES (Correos, SEUR, GLS, MRW, CTT) | Limitado/UK-origen | Sí | **Sí** |
| Contrato propio del carrier | No | No | **Sí (puedes subir tus tarifas)** |
| Encaje con un taller en Salamanca | Malo | Medio (sin API) | **Bueno** |

Sendcloud además permite operar **sin contrato propio** (usas tarifas Sendcloud con descuento según plan) o **con tu contrato** (subes tus precios negociados de Correos/SEUR y generas etiquetas con ellos).

---

## 3. Encaje con tu sitio actual

Tu stack es **Next.js 16 (static export) + Supabase**. El modelo de datos ya está casi listo para esto:

La tabla `public.quotes` contiene:

- `entrega` — `'recogida' | 'envio'`
- `direccion` — `jsonb { calle, ciudad, cp, provincia }` (se rellena cuando `entrega = 'envio'`)
- `metricas` — `jsonb` que **ya incluye `peso_g`** (peso estimado de la pieza, calculado en `instant-quote`)
- `cantidad`, `precio_total`, `estado` (`nuevo → revisado → aceptado → completado`)

Es decir: ya tienes **peso** y **destino (CP/provincia)**, que es justo lo que la API de envíos necesita para cotizar. El comentario de la migración lo dice explícitamente:

> *delivery: pickup in Salamanca (free) or national shipping (cost agreed after review — informative only, never priced by the calculator)*

La integración convierte ese "cost agreed after review" en un cálculo automático.

---

## 4. Arquitectura

### El problema del export estático

El sitio se publica como **export estático** (`next build` → HTML/JS sin servidor). No hay `app/api`. La API de Sendcloud se autentica con un **par de claves Public/Secret**; el `secret` **no puede vivir en el cliente** (cualquiera lo vería en el bundle). Necesitamos un pequeño backend.

### Solución: Supabase Edge Function como proxy

Ya usas Supabase, así que la pieza natural es una **Edge Function** (Deno) que actúa de proxy: el navegador y el panel admin llaman a la function; la function guarda el secret en variables de entorno de Supabase y habla con Sendcloud.

```
┌────────────────────┐      ┌─────────────────────────┐      ┌──────────────┐
│  Web estática       │      │  Supabase Edge Function  │      │  Sendcloud   │
│  (Next.js export)   │      │  (Deno — guarda secret)  │      │  API         │
│                     │      │                          │      │              │
│  instant-quote ─────┼─POST─▶  /envios-cotizar  ───────┼─auth─▶ shipping     │
│  presupuesto        │      │                          │      │  methods     │
│                     │      │                          │      │              │
│  admin/trabajos ────┼─POST─▶  /envios-etiqueta ───────┼─────▶ parcels +     │
│                     │      │   (requiere is_admin)    │      │  label       │
│                     │      │                          │      │              │
│  cliente / admin ◀──┼──────┤  /envios-tracking ◀──────┼─webhook─ status     │
└────────────────────┘      └─────────────────────────┘      └──────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ Postgres (Supabase)│
                              │  tabla `envios`    │
                              └──────────────────┘
```

Tres functions (o una con rutas):

1. **`envios-cotizar`** — pública (con rate-limit). Recibe `{ peso_g, cp_destino, pais }`, devuelve opciones de envío con precio. La llaman `instant-quote` y `presupuesto`.
2. **`envios-etiqueta`** — protegida (`is_admin`). Crea el `parcel` en Sendcloud, pide la etiqueta y guarda `tracking_number` + URL del PDF. La llama `admin/trabajos`.
3. **`envios-tracking`** — webhook que Sendcloud llama al cambiar el estado del envío; actualiza la tabla `envios` y, opcionalmente, dispara email al cliente.

> Alternativa si en el futuro dejas el export estático: mover esto a route handlers de Next.js (`app/api/...`) en un hosting con servidor (Vercel/Cloudflare). El código de proxy es prácticamente el mismo.

---

## 5. La API de Sendcloud que usaremos

**Base:** `https://panel.sendcloud.sc/api/v2/` (v3 ya disponible; ver nota de migración).
**Auth:** HTTP Basic con `Public API Key` (usuario) y `Secret API Key` (contraseña), generadas en *Settings → Integrations → API* del panel Sendcloud.

| Función | Endpoint | Uso |
|---|---|---|
| Listar métodos + tarifas | `GET /shipping_methods?from_country=ES&to_country=ES` | Opciones disponibles con peso mín/máx y precio por país |
| Precio de un método | `GET /shipping-price/?shipping_method_id=…&weight=…&from_country=ES&to_country=…` | Precio exacto de un método |
| Crear envío + etiqueta | `POST /parcels` con `request_label: true` | Crea el `parcel`, devuelve `tracking_number`, `tracking_url` y URL del PDF de etiqueta |
| Descargar etiqueta | URL `label.normal_printer` de la respuesta del parcel | PDF para imprimir |
| Puntos de recogida | `GET https://servicepoints.sendcloud.sc/api/v2/service-points/` | Si ofreces entrega en punto |
| Tracking | Webhook que configura Sendcloud + `tracking_url` | Estado del envío en tiempo real |

### ⚠️ Caveat crítico para España (de la propia doc de Sendcloud)

> *"Carriers that use pricing based on shipping zones (e.g. Spanish carriers who charge different rates based on the postal code of the shipment) are not supported"* — para el endpoint de **precio exacto** (`shipping-price`).

Implicación: para **carriers españoles que tarifan por zona/CP**, el precio exacto vía API puede venir `null`. Opciones para sortearlo, en orden de preferencia:

1. **Subir tu contrato propio** a Sendcloud (tus precios negociados de Correos/SEUR/GLS). Entonces las tarifas vienen de tu tabla de precios y son fiables.
2. **Usar métodos de tarifa plana** (p. ej. un método nacional con precio único por tramo de peso) y mostrar ese precio.
3. **Tabla de tarifas propia en `quote_settings`** (por zonas de CP) como *fallback*, y usar Sendcloud solo para etiqueta + tracking. Es la opción más robusta para el MVP y la que menos depende del caveat.

> Recomendación para empezar: **opción 3 para la tarifa mostrada al cliente** (control total, sin sorpresas) + **Sendcloud para etiqueta y tracking**. Cuando subas tu contrato propio, migras la tarifa a Sendcloud (opción 1).

### Nota de versión

La v2 sigue operativa pero Sendcloud marca varias páginas como "archivadas" a favor de **API v3**. El PoC usa v2 (estable y documentado); en producción conviene evaluar v3 (`/api/v3/`) para `parcels`/`shipments`. La estructura del proxy no cambia.

---

## 6. Modelo de datos (extensión Supabase)

Nueva tabla `public.envios` (1 envío ↔ 1 quote/trabajo) y un par de campos de apoyo. SQL completo en `poc/migration-envios.sql`. Resumen:

```sql
create table public.envios (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid references public.quotes(id) on delete set null,
  -- proveedor
  proveedor       text not null default 'sendcloud',
  sendcloud_id    bigint,                 -- parcel id en Sendcloud
  metodo          text,                   -- nombre del método (Correos 48h, SEUR 24…)
  -- destino / paquete (snapshot)
  cp_destino      text,
  pais            text not null default 'ES',
  peso_g          integer,
  -- tarifa
  coste           numeric(10,2),          -- lo que paga el cliente
  coste_carrier   numeric(10,2),          -- coste real en Sendcloud (margen)
  -- seguimiento
  tracking_number text,
  tracking_url    text,
  etiqueta_url    text,                   -- PDF
  estado          text not null default 'pendiente', -- pendiente|etiqueta|en_transito|entregado|incidencia
  estado_carrier  text,                   -- texto crudo del carrier
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

Las políticas RLS siguen el patrón existente (`is_admin()` para escritura; lectura pública opcional solo del tracking por token).

---

## 7. Usos / casos de uso (los 3 alcances elegidos)

### A. Tarifa de envío (cara al cliente)

En `instant-quote` y `presupuesto`, cuando el usuario elige `entrega = 'envio'` e introduce su CP, la web llama a `envios-cotizar` con `{ peso_g (de métricas), cp_destino }` y muestra el coste estimado del envío como una línea más del desglose. Hoy ese coste es "se acuerda después"; pasa a verse al instante.

- **MVP:** tabla de zonas propia (opción 3 del caveat) → respuesta inmediata y fiable.
- **v2:** tarifas reales de Sendcloud con tu contrato.

### B. Generar etiqueta (panel admin)

En `admin/trabajos` (o `admin/presupuestos`), un botón **"Crear envío"** llama a `envios-etiqueta`. Crea el `parcel` en Sendcloud con la dirección del quote, recupera el PDF de etiqueta y el `tracking_number`, y los guarda en `envios`. El admin imprime la etiqueta desde el panel. Esto elimina el copia-pega manual de direcciones al panel del carrier.

### C. Tracking (cliente + admin)

El webhook `envios-tracking` actualiza `envios.estado` cuando el carrier reporta cambios. Usos:

- En el panel admin, columna de estado del envío en la lista de trabajos.
- Para el cliente: un email automático ("tu pedido va en camino", con `tracking_url`) y/o una página `qr/` o `success/` que muestra el estado por código de quote.

---

## 8. Fases de implementación

**Fase 0 — PoC (incluida en este entregable).**
Edge Function `envios-cotizar` que llama a Sendcloud `shipping_methods` con credenciales de prueba y devuelve opciones; tipos TS; hook `useShippingQuote`; SQL de la tabla. Objetivo: validar credenciales, formato de respuesta y el caveat de zonas con datos reales antes de construir.

**Fase 1 — MVP tarifa (cliente).**
Tabla de zonas propia en `quote_settings` + `envios-cotizar` devolviendo precio. Mostrar línea de envío en `instant-quote`/`presupuesto`. Sin etiquetas todavía.

**Fase 2 — Etiquetas (admin).**
`envios-etiqueta` + tabla `envios` + botón "Crear envío" en `admin/trabajos`. Generación e impresión de etiqueta. Requiere cuenta Sendcloud con plan que permita crear labels.

**Fase 3 — Tracking + emails.**
Webhook `envios-tracking`, estado en admin, email automático al cliente con `tracking_url`.

**Fase 4 — Tarifa real con contrato.**
Subir contrato propio de Correos/SEUR a Sendcloud y migrar la tarifa de la tabla propia a precios Sendcloud (opción 1 del caveat).

---

## 9. Costes y cuenta

- **Plan Sendcloud:** hay nivel gratuito; los planes de pago empiezan en ~40 €/mes (Small Shop) y suben (EMP ~89 €/mes, Business ~199 €/mes). El plan determina el descuento sobre la etiqueta.
- **Fee por etiqueta:** pequeño recargo por etiqueta según plan (céntimos).
- **Etiquetas:** se pagan a Sendcloud (con tu saldo/contrato) o con tu contrato propio del carrier.
- **Cuenta necesaria:** alta en Sendcloud, activar los carriers que quieras (Correos/SEUR/GLS…), generar par de claves API. Para envíos a España es habitual que el carrier pida el **NIF del destinatario** en algunos casos.

> Antes de Fase 1 conviene confirmar precios vigentes y el plan mínimo que habilita la API de etiquetas, directamente en la cuenta Sendcloud.

---

## 10. Riesgos y decisiones abiertas

- **Caveat de zonas (sección 5):** decidir entre tabla de tarifas propia vs. contrato propio en Sendcloud. Recomendación: tabla propia para el MVP.
- **Plan de Sendcloud:** confirmar qué plan habilita creación de etiquetas vía API y su coste real (los precios cambian).
- **API v2 vs v3:** PoC en v2; evaluar v3 para producción.
- **NIF destinatario:** algunos envíos lo requieren; añadir campo opcional en la dirección del quote.
- **Static export:** las Edge Functions resuelven el secret, pero si el proyecto crece, valorar mover a hosting con servidor.
- **Margen:** decidir si se repercute el coste exacto al cliente o se aplica un margen/tarifa redondeada (campos `coste` vs `coste_carrier` ya lo contemplan).

---

## 11. PoC incluido

En `docs/envios/poc/`:

- `migration-envios.sql` — DDL de la tabla `envios` + RLS.
- `envios-cotizar.ts` — Edge Function (Deno) proxy a Sendcloud `shipping_methods`.
- `sendcloud.types.ts` — tipos TS de la respuesta y del DTO que devuelve la function.
- `useShippingQuote.ts` — hook React para llamar a la function desde la web.
- `README.md` — cómo desplegar y probar el PoC.

El PoC **no** modifica el build ni toca el sitio en producción: son archivos de referencia para validar antes de la Fase 1.
