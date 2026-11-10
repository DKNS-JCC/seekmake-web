# Fase 4 — Panel admin reordenado

**Estado:** pendiente · **Tamaño:** mediana · **Modelo:** Sonnet
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
2. **Pedidos:** tablero por estado (columnas en escritorio, lista con
   filtro por estado en móvil), con los dos orígenes marcados.
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
