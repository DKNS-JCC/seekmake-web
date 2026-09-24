# Web ↔ Calculadora: un solo sistema

**Objetivo:** que tocar algo en un sitio se vea en el otro: estados, cobros,
correos y tarifas. Hoy cada app tiene su versión de cada cosa y solo una
pequeña parte viaja, en un único sentido.

## 1. Qué está desincronizado (verificado en el código)

| Tema | Web | Calculadora | Qué pasa hoy |
|---|---|---|---|
| **Estados** | `quotes.estado`: nuevo, revisado, aceptado, imprimiendo, listo, entregado, rechazado | `orders.data.estado`: Presupuesto enviado, Aceptado, En producción, Post-procesado, Listo para entregar, Entregado (+ Descartado) | Solo viaja **pedido → web** (trigger 0017). Si cambias el estado en /admin/presupuestos, la Calculadora no se entera, y el siguiente guardado del pedido lo pisa. Si el cliente acepta en la web, el pedido no cambia. «Descartado» no tiene equivalencia: la solicitud se queda en «revisado». |
| **Qué es un pedido** | Solo las solicitudes del tasador | Todos los encargos | Los pedidos hechos a mano en la Calculadora no existen en la web: sin seguimiento en /presupuesto, sin recibos, sin envíos. |
| **Cobros** | `recibos` (libro de justificantes, nunca escribe en `quotes`) + `quotes.importe_pagado` | `payment_history` dentro del JSON del pedido | Tres sitios con el dinero. `importe_pagado` de la web lo sobrescribe el pedido; los recibos de la web no llegan a la Calculadora; el panel ya avisa de que "no cuadra". |
| **Correos** | Edge Functions: `submit-quote`, `notify-quote`, `recibo-emitir` (Gmail en secrets) | Electron `mailer.js` con sus propias plantillas y PDF; en el móvil no envía; la contraseña de Gmail viaja en la config del cliente | Dos diseños de correo distintos, dos remitentes/plantillas, posibles duplicados (la Calculadora ya llama a `notify-quote` para los pedidos web *y* manda los suyos). |
| **Tarifas** | `quote_settings` | `empresa_docs.config` | Duplicadas. Mitigado en esta rama: la web calcula igual que la Calculadora y /admin/tarifas puede importar sus costes, pero es una copia manual. |
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

| Fase | Contenido | Dónde | Esfuerzo |
|---|---|---|---|
| A | Tarifas: trigger `empresa_docs` → `quote_settings` | solo base de datos | ½ día |
| B | Estados: vocabulario común + triggers en los dos sentidos + «Descartado» | BD + Calculadora (listas de estados) | 1 día |
| C | Pedido 1:1: crear pedido al recibir solicitud y `quote` al crear pedido | BD + Calculadora (bandeja → lista) | 1-2 días |
| D | Cobros: libro único + RPC; migrar `payment_history` | BD + Calculadora + web | 1-2 días |
| E | Correos: todo por Edge Functions, retirar `mailer.js` | Calculadora + funciones | 1 día |

## 4. Lo que hace falta para empezar

- Acceso de escritura al repo `DKNS-JCC/Calculadora` en esta sesión y que
  esté subida la última versión (la del «Descartado»).
- Decidir: ¿los pedidos hechos a mano también se ven en /admin/presupuestos y
  tienen seguimiento público? ¿el aviso al cliente se pregunta siempre o es
  automático en ciertos estados?
