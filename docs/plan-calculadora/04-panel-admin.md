# Fase 4 — Panel admin reordenado

**Estado:** hecha (10 nov. 2026; rama `claude/calc-fase-4-5-panel-892074`, sin PR) · **Tamaño:** mediana · **Modelo:** Sonnet
**Depende de:** fases 2 y 3 · **Índice:** [plan](../plan-calculadora-en-web.md)

## Objetivo

Que el panel esté ordenado por el trabajo que se hace, no por la
herramienta que lo creó.

## Contexto

- Menú: `app/admin/_components/AdminNav.tsx`.
- `app/admin/presupuestos/page.tsx`: 852 líneas, lista + cajón que mezcla
  cliente, piezas, configuración, desglose, respuesta, cobros y envío.
- `app/admin/tarifas/page.tsx`: 971 líneas, diez secciones.
- `app/admin/page.tsx` («Hoy») ya agrupa por lo pendiente.
- Lo que solo tiene la Calculadora está en `Calculadora/src/components/Orders.vue`.

## Pasos

1. **Menú** según el apartado 7 del índice: Hoy · Pedidos · Nuevo encargo ·
   Taller · Dinero · Web · Ajustes.
2. **Pedidos:** lista con filtro por estado, en escritorio y en móvil, con
   los dos orígenes marcados. Sin tablero por columnas (decisión del
   10 nov. 2026, ver `ux-nuevo-encargo.md`, apartado 0): «Hoy» hace de
   tablero.
3. **Ficha del pedido** en pestañas: Resumen (estado, fecha tope, precio,
   señal) · Piezas · Cobros · Envío. Partir el cajón actual en componentes;
   `ReciboPanel` y `EnvioPanel` ya existen.
4. **Acciones que faltan:** duplicar, repeticiones por error, notas,
   archivar, contabilizar el material al aceptar. «Editar y recalcular»
   abre la pantalla de la fase 3.
5. **Hoy:** añadir «por imprimir» ordenado por fecha tope y aviso de
   pedidos en riesgo y de señal pendiente.
6. **Limpieza automática en el servidor** (`pg_cron`, ya se usa):
   recordatorio al taller a los 3 y 7 días sin respuesta, descarte a los 15
   (hoy lo hace la Calculadora al abrirse), archivado de entregados y
   cobrados.
7. **Ajustes** en dos páginas: «Precios» (costes, margen, error, mínimo,
   mano de obra, urgencia, envío, plazos) y «Tasador» (resistencia, detalle,
   laminado, calibración).

## Hecho cuando

- Todo lo que se hacía en la pestaña Pedidos de la Calculadora se puede
  hacer aquí.
- El panel se usa con una mano en el móvil.
- `npm run test:ui` pasa.

## No hacer

- No cambiar el esquema de la base de datos (eso es la fase 7).
- No rediseñar las secciones de «Web» (productos, blog…): solo se recolocan
  en el menú.
- Aprobación del diseño como estado propio: fuera, salvo que se pida.

## Cambios respecto al plan

- **Ruta:** la lista de pedidos sigue en `/admin/presupuestos` (el menú dice
  «Pedidos»): es una exportación estática y los enlaces de correo y de «Hoy»
  ya apuntan ahí. La ficha se abre con `?abrir=Q-…` y `&pestana=cobros`.
- **Piezas nuevas:** `app/admin/_components/Pestanas.tsx` y, en
  `app/admin/presupuestos/`, `Ficha.tsx` (cajón en pestañas), `estados.ts`
  (estados, siguiente paso, plazo en riesgo) y `orden.ts` (lectura y parche del
  pedido de taller). El cajón de 852 líneas queda en lista + ficha.
- **Una acción por fila:** el botón enseña el siguiente paso y lo ejecuta **sin
  avisar** al cliente (el aviso del pie dice que no se le avisó). «… y avisar»
  está en la ficha. Una solicitud nueva se presupuesta en «Nuevo encargo»
  (`?solicitud=`).
- **Aceptar apunta el material** (`material_contabilizado`). Si el cliente acepta
  desde la web no hay quien lo apunte (haría falta un trigger: cambio de base de
  datos), así que la ficha ofrece «Apuntar material».
- **Entregado y todo cobrado** archiva solo, con «Deshacer». Archivar y eliminar
  también ofrecen «Deshacer» 6 s; eliminar borra a los 6 s (pedido de taller
  primero, luego la quote; si se cierra la pestaña antes, no se borra).
- **Duplicar** inserta un pedido nuevo en `orders` (como `duplicateOrder` de la
  7.2) y el trigger 0027 crea su quote.
- **Taller → Cola de impresión** (`/admin/taller`): solo lectura, por fecha
  tope, con «N h pendientes · M días a 4 h/día».
- **Hoy:** avisos de pedidos en riesgo (vence en ≤ 1 día o pasado) y con señal
  pendiente; «Por cobrar» abre la ficha en la pestaña Cobros. El recordatorio a
  los 3 y 7 días sin respuesta se **enseña** en «Esperando al cliente».
- **Limpieza en el servidor:** migración `20261111100000_limpieza_pedidos.sql`
  (`limpieza_pedidos()` + pg_cron diario): descarta a los 15 días los
  presupuestos sin respuesta y archiva a los 7 los entregados y cobrados. El
  recordatorio **no manda correo** (haría falta una Edge Function nueva, y esto
  se queda en local). Usa `quotes.updated_at` como «último movimiento» (ver el
  `ponytail:` de la SQL).
- **Ajustes en dos páginas:** «Precios» (`/admin/tarifas`: costes del taller de
  la Calculadora —luz, mano de obra, mínimo, €/kg e impresoras, con ejemplo
  vivo— más mínimo del tasador, plazos, urgencia, envío, recargos, descuentos y
  materiales) y «Tasador» (`/admin/tasador`: precio firme, cómo se calcula,
  resistencia, detalle, laminador y precisión). Los costes del taller escriben
  `empresa_docs` 3dcc/config (solo sus claves, releyendo antes) con su propio
  botón; el resto, el de siempre. El margen (×2,30) es una constante del motor
  y no se edita.
- **No se porta de Orders.vue:** la imagen del pedido, el envío del presupuesto
  por email con PDF adjunto (`mailer.js`), aplazar avisos
  (`notif_snooze_until`), el pedido compartido y el cobro por Stripe.
- **Tests:** `test:db` (limpieza: descarta, archiva, es idempotente y no la
  ejecutan anon ni authenticated) y `test:ui` (pestañas, estados y plazos, ficha).
- **Probado en el navegador** contra un Supabase simulado (no hay base de datos
  local): lista, ficha, siguiente paso, material, cobros, duplicar, archivar,
  eliminar y deshacer, Hoy, Cola, Precios, Tasador y `?solicitud=`, en escritorio
  y a 375 px. Los triggers reales (fecha al aceptar, sincronía quote ↔ pedido)
  solo los cubre `test:db`.
