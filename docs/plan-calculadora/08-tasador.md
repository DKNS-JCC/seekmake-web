# Fase 8 — Revisión a fondo del tasador

**Estado:** pendiente · **Tamaño:** grande
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
