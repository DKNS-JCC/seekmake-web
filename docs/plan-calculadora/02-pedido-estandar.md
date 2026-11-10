# Fase 2 — Pedido estándar: fecha prometida y precio firme

**Estado:** pendiente · **Tamaño:** mediana
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
