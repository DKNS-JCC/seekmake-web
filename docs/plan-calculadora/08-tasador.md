# Fase 8 — Revisión a fondo del tasador

**Estado:** hecha en local (10 nov. 2026; rama `claude/calc-fase-8-tasador-f33ed5`, sin PR; migración sin aplicar y `submit-quote` sin desplegar). Cambios respecto al plan en [«Cómo quedó»](#cómo-quedó) · **Tamaño:** grande
**Modelo:** Sonnet (partir el componente), Opus (motor único y detalle por pieza)
**Depende de:** fases 1 y 2 · **Índice:** [plan](../plan-calculadora-en-web.md)

## Objetivo

Ordenar el tasador por dentro sin cambiar lo que ve el cliente. Va al final
porque funciona y no bloquea nada.

## Contexto

- `app/(site)/instant-quote/QuoteClient.tsx`: 1.813 líneas, 28 estados, un
  solo componente que carga y analiza archivos, pinta el visor, configura
  cada pieza, aplica cupones, registra eventos, envía y genera el PDF.
- `supabase/functions/submit-quote/index.ts` (924 líneas) recalcula el
  precio con una copia de `lib/quote/pricing.ts`;
  `scripts/test-paridad-servidor.ts` vigila que no se separen.
- `quote_a_order_data` (0027) aplana la solicitud al crear el pedido: suma
  gramos y horas de todas las piezas y se queda con un material y el primer
  color.

## Pasos

1. **Partir `QuoteClient.tsx`** sin cambiar comportamiento: carga y
   análisis de archivos (hook), visor, configuración de la pieza activa,
   resumen y envío. `npm run test:ui` antes y después.
2. **Un solo módulo de precios:** que `submit-quote` importe el mismo código
   que el navegador (mover el motor a `supabase/functions/_shared/` y que
   `lib/quote` lo reexporte, o al revés, según lo que admita el despliegue de
   funciones). Desaparece `test-paridad-servidor`.
3. **Detalle por pieza en el pedido:** `quote_a_order_data` guarda la lista
   de piezas con su material, colores, gramos y horas, además de los
   totales. La ficha del pedido (fase 4) las enseña.
4. **Revisión del formulario público** con lo aprendido en la fase 1: qué
   opciones confunden, qué se puede quitar. Regla: ninguna opción nueva sin
   quitar otra.

## Hecho cuando

- Ningún archivo del tasador pasa de unas 400 líneas.
- El precio se calcula con el mismo código en navegador y servidor.
- Un pedido de varias piezas conserva el detalle de cada una.

## No hacer

- No cambiar precios ni la fórmula en esta fase.
- No añadir selector de urgencia.
- No tocar el estimador (`lib/quote/estimador/`): su trabajo es la fase 1.

## Cómo quedó

- **Paso 1.** `QuoteClient.tsx` (2.032 líneas) queda en ~315 y orquesta:
  `usePiezas` (archivos, análisis, configuración), `useVisor` + `Visor`,
  `ListaPiezas`, `ConfigPieza`, `Resumen` (entrega y precio), `Pedir` +
  `Recibido`, `useCupon`, `seguimiento`, `solicitud` y `modelo` (three.js).
  `quote.css` se parte en dos mitades contiguas (`quote-precio.css`). El
  HTML del tasador vacío sale idéntico byte a byte; `test:ui` gana pruebas de
  humo de la página y de cada parte.
- **Paso 2.** El motor vive en `supabase/functions/_shared/precios.ts` (sin
  imports, lo cargan Next, tsx y Deno); `submit-quote` lo importa y
  `lib/quote/pricing.ts` lo reexporta y añade solo la parte del estimador.
  `test-paridad-servidor` desaparece; `test-motor-precios` compara con una
  foto de lo que cobraba el servidor antes (300 pedidos sembrados, idénticos
  al céntimo y línea a línea) y navegador = servidor. Unificar dejó dos
  diferencias solo teóricas, resueltas al lado del servidor (que es quien
  guarda el precio): los colores de una pieza se cuentan por nombre+color
  (antes el navegador contaba por id del muestrario) y los números de los
  ajustes se leen con `Number()`. Con los datos actuales no cambia ningún
  precio. No hace falta subir `TASADOR_VERSION`. «Nuevo encargo» sigue con
  su propio motor (`lib/quote/encargo.ts`, el de la Calculadora 7.2): la
  fase solo pedía navegador y servidor.
- **Paso 3.** Migración `20261112100000_pedido_piezas`: `data.piezas` en el
  pedido (nombre, unidades, material, colores con su parte, gramos y horas
  por unidad, método). Solo pedidos nuevos; los existentes no se rellenan.
  La ficha lo enseña cuando hay más de una pieza. Ojo: si la 7.2 reescribe
  el pedido con `normalizeOrder`, puede perder ese campo (no se ha probado).
- **Paso 4, revisión del formulario.** No se quita ni se añade ninguna
  opción: sin datos del banco de pruebas no hay base para decir qué confunde.
  Candidata a revisar con datos: «Quiero combinar varios colores» en piezas
  de un solo cuerpo, que el taller tasa igualmente (decisión 17). Sí se
  incorpora el criterio de la fase 1, parte D (`objetosSeparados` en
  `lib/quote/tresmf.ts`, por cajas envolventes; en la duda, multicolor): el
  navegador lo calcula al subir el archivo y lo manda como
  `metricas.objetos_separados`. Solo cambia el **tipo** de pieza para el
  precio firme, que sigue apagado (`tipos_precio_firme` vacío). El recargo
  multicolor se sigue cobrando igual: quitarlo para objetos separados es un
  cambio de precio y queda para cuando haya datos. El servidor se fía de esa
  marca (no tiene la geometría); como mucho hace firme un precio que ya
  lleva el recargo.
- **Archivos de más de ~400 líneas que quedan:** `precios.ts` (~860, la
  mitad son tipos y comentarios; partirlo obliga a imports `.ts` que el
  tsconfig de Next no admite) y `submit-quote/index.ts` (~800, correos y
  validación de la solicitud). Se interpretó el límite para la página del
  tasador.
- **Probado en el navegador** (escritorio y 375 px) contra un backend local:
  REST y Storage falsos y el `submit-quote` real ejecutado en Deno con
  Supabase y SMTP en memoria. Subir STL y OBJ de dos cuerpos → laminado →
  precio con unidades, cupón y envío → solicitud por email y por WhatsApp →
  «envíame el presupuesto». El servidor dio el mismo total que la página.
  Sin probar: la base de datos real (triggers al insertar), Storage real,
  el envío de correo y un 3MF de Bambu/Orca de verdad.
