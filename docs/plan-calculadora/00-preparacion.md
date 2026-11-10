# Fase 0 — Preparación y acceso

**Estado:** hecha (10 nov. 2026; PR sin abrir) — la exportación de SILAB queda por ejecutar con credenciales reales · **Tamaño:** pequeña · **Modelo:** Sonnet
**Depende de:** nada · **Índice:** [plan](../plan-calculadora-en-web.md)

## Objetivo

Que el admin de la web pueda leer y escribir los pedidos y la configuración
que hoy solo abre el login de la Calculadora, y dejar a salvo los datos de
SILAB antes de tocar nada.

## Contexto

- El admin usa el claim `is_admin` (`0001_initial.sql`).
- `orders` y `empresa_docs` solo se abren por `empresa_users`
  (`0016_calculadora.sql`). `cobros` ya tiene lectura de admin (0028).
- La Calculadora 7.2.0 está publicada y congelada: sigue en uso durante todo
  el plan.

## Pasos

1. **Exportar SILAB.** Con `scripts/export-db.mjs` (o una consulta), volcar
   `empresa_docs` y `orders` de `empresa = 'silab3d'` a un JSON fuera del
   repo. No borrar nada todavía: el borrado es la fase 7.
2. **Migración nueva** (nombre con fecha, como las últimas): políticas
   `for all using (public.is_admin()) with check (public.is_admin())` en
   `orders` y `empresa_docs`. No tocar las políticas existentes.
3. **Test** en `scripts/test-migraciones.mjs`: un admin lee y escribe
   `orders` de 3DCC; un anónimo y un usuario sin claim no ven nada.

## Hecho cuando

- `npm run test:db` pasa con los casos nuevos.
- Desde `/admin`, con sesión de admin, una consulta a `orders` devuelve los
  pedidos de 3DCC.
- La Calculadora 7.2 sigue cargando y guardando igual.

## No hacer

- No borrar tablas, políticas ni datos de SILAB.
- No cambiar `empresa_users` ni el login de la Calculadora.

## Cambios respecto al plan

- Migración: `20261110150000_admin_orders_empresa_docs.sql` (políticas
  «admin all» en `orders` y `empresa_docs`).
- Exportación: script propio `scripts/export-silab.mjs` (filtra
  `empresa = 'silab3d'`, rechaza una salida dentro del repo). Pendiente de
  ejecutar: `node scripts/export-silab.mjs` con la service role en `.env.local`.
- `scripts/test-migraciones.mjs`: además del caso nuevo, se añaden al entorno
  simulado `auth.role()` y el rol `service_role`, que `20261109150000_campanas.sql`
  ya necesitaba y hacían fallar `test:db` en `main`.
