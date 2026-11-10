# Fase 7 — Limpieza de la base de datos

**Estado:** pendiente · **Tamaño:** mediana, delicada
**Modelo:** Opus, esfuerzo alto · **Depende de:** fase 6 completa
**Índice:** [plan](../plan-calculadora-en-web.md)

## Objetivo

Quitar lo que solo existía para la Calculadora y para SILAB, sin romper
dinero ni estados.

## Condición de entrada

Nadie usa ya la Calculadora. Copia completa de la base de datos hecha y
comprobada antes de empezar.

## Contexto

- Multi-empresa: `0016_calculadora.sql` (`empresas`, `empresa_users`,
  `user_empresa`, `partner_de`, políticas del socio).
- Tarifas copiadas desde la config de la Calculadora:
  `0024_tasador_calculadora.sql` (`sync_costes_calculadora`).
- Estados en los dos sentidos: `0026_estados_pedido.sql`.
- Pedido 1:1: `0027_pedido_1a1.sql`. Cobros: `0028_cobros.sql`.
- Test que lo vigila todo: `scripts/test-migraciones.mjs`.

## Pasos, de uno en uno, una migración cada uno

1. **SILAB:** confirmar que el export de la fase 0 está entregado; borrar
   sus filas de `orders` y `empresa_docs` y su usuario.
2. **Políticas del socio** y `partner_de`: fuera.
3. **`empresa_users` y `user_empresa`:** fuera, una vez que nada entra con
   ese login. Las políticas «propia empresa» se sustituyen por las de admin
   (fase 0).
4. **Trigger de tarifas** (`sync_costes_calculadora`): fuera; los costes ya
   se editan en «Precios». Conservar `empresa_docs.config.purge_config`.
5. **Etiquetas antiguas:** un `update` único que normalice en `orders.data`
   diseño, post-procesado, fechas `DD/MM/AAAA` y estados viejos (las tablas
   de equivalencia están en `backend.mjs`: `DISENO_LEGACY`,
   `POSTPROC_LEGACY`, `normalizeEstado`).
6. **Opcional, al final:** un solo vocabulario de estados y un solo
   registro de pedido. Solo si lo anterior ha ido limpio y sigue mereciendo
   la pena; requiere su propio plan.

## Hecho cuando

- `npm run test:db` pasa tras cada migración.
- Totales de pedidos, cobrado y pendiente idénticos antes y después.
- El reparto de los pedidos compartidos históricos sigue ahí, de solo
  lectura.

## No hacer

- No juntar varios pasos en una migración.
- No borrar `purge_config`, `shared_split` ni `cobros`.
- No empezar el paso 6 en la misma sesión que los anteriores.
