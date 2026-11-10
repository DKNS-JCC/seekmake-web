# Fase 5 — Inventario y estadísticas

**Estado:** hecha (10 nov. 2026; rama `claude/calc-fase-4-5-panel-892074`, sin PR; los totales no se han podido cotejar con datos reales de la 7.2, ver «Cambios») · **Tamaño:** mediana · **Modelo:** Sonnet
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

## Cambios respecto al plan

- **Taller → Filamento gastado** (`/admin/filamento`): lee la vista
  `gasto_filamento` (migración `20261111110000_gasto_filamento.sql`, sin cambio de
  esquema): gramos de los pedidos con `material_contabilizado` más el ajuste de
  `empresa_docs` inventory (`filament_stock[].ajuste_g`), y su equivalente en € al
  precio por kg de la configuración. Salen también los colores del catálogo web y
  los que solo tienen ajuste. El ajuste se edita en la propia fila y guarda al
  salir del campo (relee el inventario y toca solo esa entrada). Es acumulado:
  no mira el periodo, como `filamentUsageByColor` de la 7.2.
- **Dinero → Estadísticas** (`/admin/estadisticas`): un solo periodo (30 días,
  90 días, este mes, este año, todo, o un mes concreto) para todo. Arriba, el
  dinero (`Dinero.tsx` + `lib/quote/dinero.ts`): facturado solo de pedidos con
  compromiso, cobrado por fecha de cobro y por método (desde `cobros`, con el
  listado y el justificante), beneficio real (con reimpresiones y gastos
  extra), pendiente de cobro a día de hoy, beneficio por hora de impresora, y los
  bloques «¿Quién debe?», «¿Se aceptan los presupuestos?» (por origen y por
  tramo de precio), «¿Se cumplen los plazos?», «¿Acierta el riesgo?», «¿Acierta el
  tasador?» y clientes que repiten (lista derivada de los pedidos, sin ficha).
  Se añade la exportación CSV de la 7.2. Debajo, «Tasador web» con el embudo, los
  abandonos, el tráfico, WhatsApp, las solicitudes por semana y los materiales.
- **Retirado por duplicado:** los cinco contadores de arriba (solicitudes,
  pedidos en firme, cobrado, ticket medio, material impreso) y el «Pipeline
  histórico» (ahora lo da la lista de Pedidos).
- **Reglas de la 7.2 portadas** (`isCommitted`, `orderRealCost`, `orderShare`,
  fechas de pedido): `scripts/test-dinero.ts` las compara con la copia de
  `scripts/calculadora-7.2/backend.mjs` (80 pedidos sintéticos, caja por método,
  sumas del periodo con las fórmulas de `Statistics.vue`, CSV). La vista
  `gasto_filamento` se compara con `filamentUsageByColor`, `filamentSpendG` y
  `filamentSpendEur` en `test:db`.
- **Medidas nuevas:** aceptación por origen y tramo; puntualidad (fecha tope
  frente a `listo_at`, y pedidos vencidos sin terminar); reimpresiones reales por
  pedido frente al `error_rate` presupuestado; desvío del tasador (mediana, p90 y
  suma de `desvio_coste`). Todo estadística simple en el navegador.
- **Decisión:** la caja sale del libro `cobros` (como pide el plan) y el resto
  de los pedidos. Coincide con `orderCashEvents` porque el historial del pedido
  se calcula del libro; solo podría diferir en el «saldo anterior» de pedidos muy
  antiguos, que el libro fecha por su migración.
- **No se porta de la 7.2:** la serie mensual con gráficos, los tramos de
  antigüedad de la deuda, el top de material e impresora, los gramos por
  material y la electricidad total (el gasto de filamento ya da los gramos por
  color); la mediana del ticket y los días medios de cobro. Ninguno entra en la
  lista de «no se porta» del plan: **quedan fuera por decisión mía** (no
  tienen decisión detrás en el plan ni en la guía) y se añaden si hacen falta.
- **Pendiente de verificar:** «los totales de un mes coinciden con los de la
  Calculadora 7.2» solo se ha comprobado con pedidos sintéticos; falta cotejar un
  mes real abriendo las dos pantallas con los mismos datos.
