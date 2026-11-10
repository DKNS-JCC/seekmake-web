# Fase 3 — «Nuevo encargo» en /admin

**Estado:** hecha en local (10 nov. 2026; sin PR ni despliegue) — falta probar en el navegador la entrada «?solicitud=» y la vista móvil 375 px; la entrada «Últimos laminados» no se construye (pendiente de verificar en el taller) · **Tamaño:** grande
**Modelo:** Opus (motor y paridad), Sonnet (pantalla e importador)
**Depende de:** fases 0 y 2 · **Índice:** [plan](../plan-calculadora-en-web.md)

## Objetivo

La calculadora de taller dentro de la web. Con esta fase se puede dejar de
usar la Calculadora para presupuestar.

## El flujo que tiene que cubrir

Llega alguien con un problema → se modela → se lamina en OrcaSlicer → se
suben los datos → se añaden diseño, error y extras → se pasa el precio.

## Contexto

- Cálculo actual: `Calculadora/src/shared/backend.mjs`
  (`calculateBudget`, `calculateCost`, tablas `DISENO_MODELADO`,
  `POSTPROCESADO`, `PROBABILIDAD_ERROR`, `URGENCIA`).
- Fórmula: coste = filamento + luz + desgaste de impresora;
  precio = coste × margen + coste × error + diseño + post-procesado × uds,
  × (1 + urgencia), + gasto extra, mínimo, redondeo a 5 céntimos hacia
  arriba.
- El diseño se cobra una vez; el post-procesado, por unidad.
- Coste base ya existe aquí: `costeHoraMaquina`, `precioKgDe` en
  `lib/quote/pricing.ts`.

## Pasos

### A. Motor (Opus)

1. `lib/quote/encargo.ts`: función pura que recibe los datos del encargo y
   los ajustes y devuelve desglose, coste, beneficio y precio. Reutiliza el
   coste base de `pricing.ts`.
2. **Test de paridad** `scripts/test-paridad-calculadora.ts`: casos sacados
   de pedidos reales (exportar 30–50 de `orders`); el motor nuevo da el
   mismo precio al céntimo que `calculateBudget`. Añadirlo a `npm run test`.
3. Ajustes en `quote_settings`: €/h de diseño y de post-procesado, tramos,
   error por defecto, recargo de urgencia. El mínimo: hoy 3 € en la
   Calculadora y 7 € aquí; dejar uno por entrada, explícito.

### B. Importar el laminado (Sonnet)

1. Arrastrar el archivo exportado de OrcaSlicer y rellenar gramos, horas y
   material por color.
2. **Formato del `.gcode` comprobado** con `calicat_PLA_1h31m.gcode`
   (OrcaSlicer 2.5.0-dev, 10 nov. 2026). Los datos están en comentarios al
   final del archivo; basta leer los últimos ~64 KB:

   ```
   ; filament used [g] = 12.80, 0.00, 0.00, 1.61, 0.00
   ; total filament used [g] = 14.41
   ; total filament change = 25
   ; estimated printing time (normal mode) = 1h 31m 14s
   ; filament_type = PLA;PLA;PLA;PLA;TPU
   ; filament_colour = #FFFFFF;#B0B0B0;#FFFFFF;#383838;#1A1A1A
   ; filament_settings_id = "SUNLU PLA+ - Tuned";…
   ; printer_model = Creality K1C
   ```

   `filament used [g]` va por ranura: las que tienen más de 0 son las
   líneas de material del encargo (tipo y color en la misma posición de
   `filament_type` y `filament_colour`). Los gramos ya incluyen purga y
   torre.
   Comprobado también con AnycubicSlicerNext 2.0.0.2 (Kobra X,
   `1110-0137-calicat_plate(01)_PLA_0.2_1h6m32s.gcode`): mismo bloque final,
   con dos diferencias a tener en cuenta:
   - `estimated printing time (normal mode)` aparece decenas de veces a lo
     largo del archivo como marca de progreso (con `= segundos` al final).
     **Tomar la última**, la que va junto a `total filament used [g]`.
   - Añade líneas `(silent mode)` y `(sport mode)`: ignorarlas.

   `printer_model` («Creality K1C», «Anycubic Kobra X») selecciona la
   impresora del encargo, que cambia el coste por hora.

   **Purga en la K1:** su gcode no cuenta el filamento purgado. Si la
   impresora es la K1 y `total filament change` es mayor que 0, la pantalla
   añade una línea «Purga estimada» (cambios `T…` del gcode × volumen de
   `flush_volumes_matrix` × densidad), editable. En la Kobra X no: ya va
   incluida.
3. El proyecto `.3mf` no sirve (no trae resultados). El `.gcode.3mf` no
   está comprobado: admitir solo `.gcode` de entrada.
4. Si falta alguna de esas líneas, avisar y dejar los campos para teclear.
5. El lector es el mismo de la fase 1, parte C.

### C. Pantalla (Sonnet)

- Ruta `/admin/encargo`. Cliente (nombre, email, teléfono), descripción,
  impresora, material y color del catálogo, gramos y horas, cantidad,
  diseño (tramo o por horas), post-procesado, error, urgencia, gasto extra.
- Multicolor: líneas de material con sus gramos, como hoy.
- Resultado en vivo: precio de cliente y, aparte, coste y beneficio.
- Guardar crea el pedido en `orders` con la forma de `normalizeOrder`; el
  trigger de 0027 le crea su `quote`. Queda en «Presupuesto enviado».
- Pregunta «¿Avisar al cliente?» y envío con `notify-quote`. PDF con la
  página imprimible de `lib/quote/pdf.ts`.
- Editar y recalcular un encargo existente con la misma pantalla.
- Usable en móvil: es donde más se usa la Calculadora hoy.

## Hecho cuando

- El test de paridad pasa.
- Un encargo creado aquí aparece en la Calculadora 7.2 con los mismos
  importes, y al revés.
- El cliente recibe el correo con su enlace de seguimiento y la fecha tope.

## No hacer

- No portar pedidos compartidos, Stripe, tickets de texto ni matriz de
  purga.
- No tocar el tasador público.
- No dar cifra antes de tener datos del laminador: la pantalla no calcula
  sin gramos y horas.

## Cambios respecto al plan

- Configuración: el motor usa la de la Calculadora (`empresa_docs` 3dcc/config: impresoras, €/kg, €/h, mínimo), no campos nuevos en `quote_settings`, para que web y 7.2 no puedan divergir. De `quote_settings` solo salen la urgencia (`urgencia_recargo_pct`), el riesgo por defecto (`calculadora.error`) y el plazo. Sin migración nueva.
- Mínimo del encargo = `global_config.precio_minimo` de la Calculadora. **Ojo:** en la exportación del 24 sep. valía 7 €, no 3 €.
- Paridad: `scripts/test-paridad-calculadora.ts` contra una copia literal de `backend.mjs` 7.2.0 (`scripts/calculadora-7.2/`): 72 pedidos reales (sin datos personales) × 3 configuraciones + 864 combinaciones sintéticas, dinero y campos guardados idénticos.
- Tiempo: un entero suelto son minutos («91»), con decimales horas («1,5»), por decisión del taller (la 7.2 leía «91» como horas).
- El bloque «Laminado» va el primero y con el foco (gramos → Tab → tiempo), por el apartado 0.1 de la guía.
- Purga K1: media de `flush_volumes_matrix` entre las ranuras usadas × `flush_multiplier` × densidad × cambios; sin gcode, 298,4 mm³ por cambio. Se guarda como línea `color: 'Purga'` del desglose multicolor.
- Teléfono: en `quotes.telefono` y en `orders.data.cliente_telefono` (la 7.2 lo ignora).
