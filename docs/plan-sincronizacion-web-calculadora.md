# Web ↔ Calculadora: un solo sistema

**Objetivo:** que tocar algo en un sitio se vea en el otro: estados, cobros,
correos y tarifas.

> **Estado (sep. 2026): fases A-E hechas** (migraciones 0024-0028, web y
> Calculadora 7.2.0). La tabla del apartado 1 describe cómo estaba antes;
> lo que hay ahora está en los apartados 4-6.

## 1. Qué está desincronizado (verificado en el código)

| Tema | Web | Calculadora | Qué pasa hoy |
|---|---|---|---|
| **Estados** | `quotes.estado`: nuevo, revisado, aceptado, imprimiendo, listo, entregado, rechazado | `orders.data.estado`: Presupuesto enviado, Aceptado, En producción, Post-procesado, Listo para entregar, Entregado (+ Descartado) | Solo viaja **pedido → web** (trigger 0017). Si cambias el estado en /admin/presupuestos, la Calculadora no se entera, y el siguiente guardado del pedido lo pisa. Si el cliente acepta en la web, el pedido no cambia. «Descartado» no tiene equivalencia: la solicitud se queda en «revisado». |
| **Qué es un pedido** | Solo las solicitudes del tasador | Todos los encargos | Los pedidos hechos a mano en la Calculadora no existen en la web: sin seguimiento en /presupuesto, sin recibos, sin envíos. |
| **Cobros** | `recibos` (libro de justificantes, nunca escribe en `quotes`) + `quotes.importe_pagado` | `payment_history` dentro del JSON del pedido | Tres sitios con el dinero. `importe_pagado` de la web lo sobrescribe el pedido; los recibos de la web no llegan a la Calculadora; el panel ya avisa de que "no cuadra". |
| **Correos** | Edge Functions: `submit-quote`, `notify-quote`, `recibo-emitir` (Gmail en secrets) | Electron `mailer.js` con sus propias plantillas y PDF; en el móvil no envía; la contraseña de Gmail viaja en la config del cliente | Dos diseños de correo distintos, dos remitentes/plantillas, posibles duplicados (la Calculadora ya llama a `notify-quote` para los pedidos web *y* manda los suyos). |
| **Tarifas** | `quote_settings` | `empresa_docs.config` | **Resuelto (fase A, migración 0024):** al guardar la config de 3DCC en la Calculadora, la web copia sola impresora K1, €/kWh y €/kg, y calcula con la misma fórmula (coste × (markup + error)). Markup, error, mínimo y post-procesado de la web siguen en /admin/tarifas. |
| **Código** | — | El repo de GitHub no tiene «Descartado» ni el auto-descartado que aparecen en el CSV | La versión que usas está por delante de la publicada. |

## 2. Diseño propuesto: un pedido, un estado, un libro de cobros

1. **Un pedido = una fila en `quotes`** (el registro que ve el cliente, con
   código Q-AAAA-NNNN) **+ su fila en `orders`** (costes, reparto con SILAB3D,
   filamento). Relación 1:1 siempre:
   - solicitud web → se crea el pedido en la Calculadora automáticamente
     (estado «Nuevo»), ya con gramos y horas del nuevo estimador; la bandeja
     «Presupuestos web» desaparece: es la lista de pedidos filtrada;
   - pedido creado en la Calculadora → se le crea su `quote` (código y enlace
     de seguimiento para el cliente, recibos y envíos como en la web).
2. **Un único vocabulario de estados**, guardado en la base de datos, con la
   misma lista en las dos apps: nuevo · presupuestado · aceptado · imprimiendo
   · post-procesado · listo · entregado · rechazado/descartado. Triggers en
   los dos sentidos con protección anti-bucle: cambies donde cambies, cambia
   en los dos.
3. **Un libro de cobros** (`recibos` generalizado a «cobros»): la Calculadora y
   la web registran cada pago con la misma RPC; `importe_pagado` y el estado de
   pago se calculan de ahí. Emitir el justificante PDF pasa a ser opcional.
4. **Todos los correos desde Supabase** (`notify-quote` → «notificar-pedido»,
   `recibo-emitir`), con las mismas plantillas y el mismo diálogo de
   «¿avisar al cliente?» en las dos apps. Se retira el mailer de Electron: el
   móvil gana correos y la contraseña sale del cliente.
5. **Tarifas con una sola fuente**: los costes viven en la config de la
   Calculadora y un trigger los copia a `quote_settings` al guardarlos; la web
   deja de pedir importar.

## 3. Fases

| Fase | Contenido | Dónde | Estado |
|---|---|---|---|
| A ✅ | Tarifas: trigger `empresa_docs` → `quote_settings` | migración 0024 | hecho |
| B ✅ | Estados: tabla `pedido_estados`, triggers en los dos sentidos, anti-bucle, copias viejas, «Descartado» y «Nuevo» | 0025, 0026 + Calculadora | hecho |
| C ✅ | Pedido 1:1: pedido al recibir la solicitud, quote al crear el pedido, relleno inicial | 0027 + Calculadora (bandeja → lista) | hecho |
| D ✅ | Cobros: libro `cobros` + RPC, migración de `payment_history` y recibos | 0028 + web + Calculadora | hecho |
| E ✅ | Correos de 3DCC por `notify-quote` / `recibo-emitir` (escritorio y móvil) | funciones + Calculadora | hecho (SILAB3D pendiente, ver §5) |

## 4. Decisiones tomadas

- **Los pedidos hechos a mano sí tienen quote**, seguimiento público en
  /presupuesto (con la descripción del encargo), aceptación en un clic,
  recibos y envíos, y aparecen en /admin/presupuestos marcados como
  «Calculadora». Solo los de 3DCC: SILAB3D no tiene web.
- **El aviso al cliente se pregunta siempre**, en las dos apps (diálogo de la
  Calculadora; en la web, «Guardar y avisar» o la pregunta tras cambiar el
  estado desde la lista). Nunca se avisa solo. Excepciones fijas: «Nuevo»
  (ya recibió el acuse de la web) y «Descartado» (limpieza interna) no
  avisan nunca.
- **La web no distingue producción de post-procesado**: ambos son
  `imprimiendo`. Si el pedido está en post-procesado, un `imprimiendo` que
  llegue de la web no lo mueve.
- **Rechazado y Descartado son el mismo estado**: `rechazado` en la web,
  «Descartado» en la Calculadora.
- **El precio de un pedido lo fija la Calculadora**: en /admin/presupuestos
  es de solo lectura cuando hay pedido.
- **Lo cobrado no se edita a mano en ningún sitio**: se registra un cobro (o
  un ajuste negativo) y el resto se calcula. Quitar un apunte = anularlo.

## 5. Cómo funciona ahora

**Estados.** `pedido_estados` guarda la lista común (etiqueta de la
Calculadora ↔ código de la web). Cambiar el estado en cualquier sitio lo
cambia en el otro. Cada proyección marca la transacción con
`app.sync_desde` y la contraria no se dispara (anti-bucle). La Calculadora
guarda el pedido entero; si guarda una copia vieja, el servidor conserva el
estado con el `last_status_update` más reciente.

**Pedido 1:1.** `submit-quote` inserta la quote → trigger → pedido en
«Nuevo» con gramos, horas, coste (config de 3DCC), notas con entrega,
teléfono, colores y mensaje. Un pedido nuevo de 3DCC en la Calculadora →
trigger → quote `origen = 'calculadora'`. Si alguno de los dos falla, la
solicitud o el pedido se guardan igual (aviso en el log).

**Cobros.** `cobros` es la fuente de verdad. `importe_pagado`,
`payment_status`, `importe_pendiente` y `payment_history` del pedido y
`importe_pagado` / `pago` de la quote se recalculan del libro en cada
escritura. Registrar: `registrar_cobro` (web) o, desde la Calculadora, el
flujo de siempre (editar lo cobrado → el apunte nuevo entra en el libro).
Anular: `anular_cobro`. Justificante: `recibo-emitir` con `cobro_id` (o
registra el cobro y emite en un paso).

**Correos.** 3DCC: siempre `notify-quote` con `{ empresa, order_id }`; al
enviar el presupuesto, el PDF de la Calculadora de escritorio va adjunto.
Configuración ya no pide la contraseña de Gmail y la borra al guardar.

## 6. Despliegue (orden importante)

1. **Web primero.** Merge a `main` de este repo: el workflow «Deploy
   Supabase» aplica 0025-0028 y despliega `notify-quote` y `recibo-emitir`.
   La Calculadora instalada sigue funcionando con la BD nueva (sus cobros
   entran al libro por el JSON), pero su bandeja web se queda vacía: las
   solicitudes aparecen ya como pedidos en «Nuevo».
2. **Después, la Calculadora 7.2.0.** La versión nueva necesita las RPC y la
   función nueva; instalada antes que la BD, los avisos y anular cobros
   fallarían.
3. **Revisar `cobros_revisar`** (vista, solo admin): justificantes antiguos
   que no casan con ningún cobro de la Calculadora. En el cajón de cada
   presupuesto salen avisados, con «Registrar cobro» o «Anular».

Pendiente:

- **SILAB3D** sigue mandando sus correos con el mailer de Electron (solo
  escritorio) y su contraseña en la config. Para pasarlo a Supabase hace
  falta un remitente suyo en los secrets de las funciones.
- `supabase/migrations/0024_tarifas_recalibradas.sql` (sin commitear en la
  copia local) choca en número con `0024_tasador_calculadora.sql` y
  reescribe `precio_hora`, `tarifa_preparacion` (4 €) y `precio_minimo`, que
  0024 ya puso en modo calculadora. No se ha incluido: si llegase a `main`,
  el workflow lo aplicaría y cambiaría los precios de la web.

## 7. Referencias en el código

- Estados: `seekmake-web/supabase/migrations/0026_estados_pedido.sql`
  (antes 0017/0018/0025); Calculadora `src/shared/backend.mjs`
  (`ORDER_LIFECYCLE`, `normalizeOrder`), `src/components/Orders.vue`
  (cambios de estado y diálogo de correo), `src/components/WebQuotesInbox.vue`.
- Pedido 1:1: `0027_pedido_1a1.sql`; Calculadora `src/components/WebQuotesInbox.vue`,
  `store.presupuestarSolicitud`.
- Cobros: `0028_cobros.sql`, `0022_recibos.sql`, `supabase/functions/recibo-emitir`,
  `app/admin/_components/ReciboPanel.tsx`; Calculadora `payment_history` en
  `src/shared/backend.mjs`.
- Correos: `seekmake-web/supabase/functions/{submit-quote,notify-quote,recibo-emitir}`;
  Calculadora `electron-main/mailer.js`, `src/platform.js`,
  `src/components/EmailNotifyDialog.vue`.
- Tarifas: `seekmake-web/lib/quote/pricing.ts` (modo `calculadora`),
  migración `0024_tasador_calculadora.sql`.
