# Fase 2 — Pedido estándar: fecha prometida y precio firme

**Estado:** hecha (10 nov. 2026, en local; migración sin aplicar en producción ni funciones desplegadas) · **Tamaño:** mediana
**Modelo:** Opus (migración y reglas), Sonnet (pantallas y correos)
**Depende de:** fase 0; el último paso, de la fase 1 · **Índice:** [plan](../plan-calculadora-en-web.md)

## Objetivo

Que cualquier pedido, venga del tasador o de un encargo, tenga la misma
forma y una fecha tope que el cliente ve y el taller cumple.

## Contexto

- Plazo actual: `lib/quote/pricing.ts` (`diasEstimados`) y su copia en
  `supabase/functions/submit-quote/index.ts`. Se enseña en el tasador y en el
  PDF, no se guarda como fecha, y `/presupuesto` no la muestra.
- Pedido: `quotes` (lo que ve el cliente) + `orders` (JSON en `data`), 1:1
  por los triggers de 0027. Estados: 0026. Cobros: 0028.
- Capacidad decidida: 4 h de impresión al día, sin planificar por impresora.

## Pasos

### A. Fecha prometida

1. Migración: `quotes.fecha_prometida date`, `quotes.listo_at timestamptz`.
   Ajustes nuevos en `quote_settings`: `plazo_horas_dia` pasa a 4 y se añade
   `plazo_holgura_dias` (2).
2. Función SQL `fecha_tope(horas, dias_extra)`: horas pendientes de los
   pedidos en `aceptado` e `imprimiendo` + las de este pedido, entre
   `plazo_horas_dia`, más `dias_extra` y la holgura, en días laborables.
3. Se fija al pasar a `aceptado` (trigger en `quotes`). Antes de aceptar, el
   cliente ve la fecha orientativa calculada igual.
4. `listo_at` se rellena al pasar a `listo`: sirve para medir puntualidad.
5. Mostrar la fecha en el tasador («Listo antes del …»), en `/presupuesto`
   y en las plantillas de `notify-quote`.
6. En el tasador, junto a la fecha: enlace «¿Lo necesitas antes?
   Escríbenos». **Sin selector de urgencia.**
7. En el admin, la fecha se puede corregir a mano en la ficha del pedido.

### B. Urgencia (solo admin)

- Campo de urgencia del pedido con recargo configurable. Se usa en «Nuevo
  encargo» (fase 3) y al revisar un pedido. Urgente adelanta la fecha
  ignorando la cola.

### C. Señal

- Regla visible en la ficha: «Señal del 50 % pendiente» mientras lo cobrado
  no llegue a la mitad y el pedido esté aceptado. Sin bloquear el cambio de
  estado.

### D. Precio firme (cuando la fase 1 lo respalde)

1. `quotes.precio_firme boolean`: lo decide `submit-quote` según el tipo de
   pieza (análisis por capas, cabe en la cama, tipo validado en la fase 1).
   Lista de tipos validados en `quote_settings`.
   - **Pieza de varios colores** (un objeto con zonas de distinto color, o
     cuerpos de distinto color que se tocan): nunca firme; la tasa el
     taller.
   - **Objetos separados de distinto color** (cada cuerpo de un solo color,
     sin tocarse): se tasan como piezas de un color, sin recargo de
     multicolor, y pueden ser firmes. Criterio de detección en la fase 1,
     parte D.
2. Si no es firme, el tasador no enseña cifra cerrada: «Te confirmamos el
   precio en menos de 24 h» y la solicitud entra como hoy.
3. En el admin, un pedido con `precio_firme` no deja guardar un precio
   final distinto del mostrado. Para cambiarlo hay que usar «Rehacer
   presupuesto», que pide el motivo y reinicia la aceptación.
4. Guardar el desvío: coste real − coste estimado, por pedido.

## Hecho cuando

- Un pedido aceptado tiene fecha tope y el cliente la ve en su seguimiento.
- «Hoy» ordena lo pendiente de imprimir por esa fecha.
- Con la lista de tipos validados vacía, el tasador se comporta como hoy.
- `npm run test` y `npm run test:db` pasan; test nuevo de `fecha_tope`.

## No hacer

- No añadir opciones al formulario público del tasador.
- No planificar por impresora ni construir un calendario.
- No activar ningún tipo de pieza como firme sin datos de la fase 1.

## Lo que se hizo y lo que cambió respecto al plan

Migración `20261110170000_pedido_estandar.sql`; tests en
`scripts/test-migraciones.mjs` (fase 2), `test-pricing.ts` y
`test-paridad-servidor.ts`.

- **Plazo en tres sitios a la par:** `public.fecha_tope()` (SQL, la que fija
  `fecha_prometida`), `diasPlazo`/`sumarLaborables`/`fechaTope` en
  `lib/quote/pricing.ts` y su copia en `submit-quote`. Los tests usan los
  mismos casos en los tres. Días laborables = lunes a viernes; **los
  festivos no se cuentan** (la holgura los cubre).
- **`plazo_holgura_dias` sustituye a `plazo_dias_margen`** (mismo papel); la
  migración borra el viejo. `diasEstimados` del tasador ya no cuenta la cola;
  la fecha que ve el cliente sí (RPC pública `plazo_cola_horas()`, solo
  devuelve un número).
- **Horas de un pedido:** las de `orders.data.horas` (el taller las corrige
  al laminar) o, si no hay, `quotes.metricas.tiempo_h`.
- **Días extra** (`dias_extra_pedido`): 1 por diseño medio/alto, «A medida» =
  horas ÷ 8, y 1 por post-procesado, leídos del pedido de la Calculadora. Las
  solicitudes del tasador no tienen.
- **La fecha se fija** al entrar en `aceptado` o `imprimiendo` desde antes de
  aceptar (no se pisa si el admin la puso a mano). Marcar urgente un pedido
  en marcha la recalcula. Los pedidos ya en marcha al migrar reciben fecha
  contada desde el día de la migración.
- **Seguimiento:** RPC nueva `get_quote_plazo()` (no se toca
  `get_quote_status`). Antes de aceptar muestra la fecha orientativa.
- **Urgencia:** `quotes.urgente` + `urgencia_recargo_pct` (50, como la
  Calculadora). Un pedido de la Calculadora con `urgencia_nivel = Urgente`
  cuenta igual. El recargo se aplica con un botón en la ficha, solo cuando el
  precio se edita en la web; no se copia `urgente` al JSON del pedido.
- **Señal:** aviso en la ficha y en «Hoy» en `aceptado`, `imprimiendo` y
  `listo` (no solo `aceptado`): la señal sigue haciendo falta después.
- **«Hoy»:** grupo nuevo «Por imprimir» ordenado por fecha prometida, con
  «en riesgo» (vence en ≤ 1 día) y «fuera de plazo».
- **Precio firme:** lo hace cumplir un trigger, no solo la pantalla. Un
  guardado de la Calculadora 7.2 con otro precio **no se rechaza** (perdería
  el pedido entero): se conserva el precio firme en `quotes` y queda un
  aviso en el log. Quitar `precio_firme` exige motivo nuevo; lo hace
  `rehacer_presupuesto()`, que además vuelve a «presupuestado», borra
  `aceptado_at` y la fecha, renueva la validez y cambia el `acepta_token`
  (el enlace viejo deja de valer).
- **Tipo de pieza** para el precio firme: el de `tasador_tipos()` (fase 1),
  por pieza: cada una tiene que ser de un tipo validado, por capas y caber en
  la cama. Una pieza con más de un color es siempre «multicolor» y nunca
  firme (la detección de cuerpos separados dentro de un archivo, fase 1
  parte D, sigue pendiente: en la duda, a revisión).
- **Lista vacía = como hoy:** sin tipos marcados en `/admin/tarifas`,
  `precio_firme` es siempre falso y el tasador enseña lo mismo que antes. Con
  tipos marcados, lo no firme dice «Te confirmamos el precio en menos de
  24 h» (la cifra queda como «Total estimado»).
- **Desvío:** `quotes.coste_estimado` (primer `coste_bruto` del pedido, el del
  tasador), `coste_real` (el último, tras laminar) y `desvio_coste`
  (columna generada). Solo pedidos del tasador; los anteriores a la
  migración quedan sin estimación.
- `TASADOR_VERSION` de `submit-quote` pasa a 8: la web no se publica sin la
  función nueva desplegada.

Pendiente fuera de esta fase: aplicar la migración y desplegar `submit-quote`
y `notify-quote`; revisar las pantallas a 375 px con datos reales.
