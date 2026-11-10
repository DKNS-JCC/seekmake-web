# Fase 5 — Inventario y estadísticas

**Estado:** pendiente · **Tamaño:** mediana · **Modelo:** Sonnet
**Depende de:** fase 4 · **Índice:** [plan](../plan-calculadora-en-web.md)

## Objetivo

Traer lo que queda de la Calculadora (Inventario, Estadísticas, Inicio) y
añadir las medidas que el plan necesita.

## Contexto

- Cálculos de dinero real: `Calculadora/src/shared/backend.mjs`
  (`orderCashEvents`, `orderRealCost`, `orderRealProfit`, `isCommitted`,
  `filamentUsageByColor`).
- Pantallas de origen: `Statistics.vue`, `Dashboard.vue`, `Inventory.vue`.
- Aquí: `app/admin/estadisticas/page.tsx` (solo mira `quotes` y
  `quote_events`) y `Abandonos.tsx`.

## Pasos

1. **Taller → Filamento:** gramos y euros gastados por color, derivados de
   los pedidos con material contabilizado más el ajuste manual
   (`empresa_docs.inventory.ajuste_g`). Mejor una vista SQL que código.
2. **Dinero:**
   - caja por fecha de cobro y por método, desde `cobros`;
   - facturación solo de pedidos con compromiso (de «Aceptado» en adelante);
   - coste real (con repeticiones por error y gastos extra) y beneficio
     real;
   - beneficio por hora de impresora.
3. **Medidas nuevas:**
   - aceptación por origen (encargo o tasador) y por tramo de precio;
   - puntualidad: fecha tope frente a `listo_at`;
   - desvío del tasador: coste estimado frente a real;
   - error real (repeticiones) frente al porcentaje presupuestado.
4. Retirar de `/admin/estadisticas` lo que quede duplicado.

## Hecho cuando

- Los totales de un mes coinciden con los de la pestaña Estadísticas de la
  Calculadora 7.2 para el mismo periodo.
- No queda nada en la Calculadora que no esté en la web, salvo lo listado
  como «no se porta».

## No hacer

- No crear un CRM ni una ficha de cliente: si hace falta, una lista de
  clientes recurrentes derivada de los pedidos.
- No llevar stock restante ni umbral de compra: solo gasto.
