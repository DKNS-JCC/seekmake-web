# Calculadora dentro de la web: dos entradas, un taller

**Objetivo:** traer la Calculadora (repo `Calculadora`, Vue + Electron +
Capacitor) al panel `/admin` de esta web y retirar la app aparte, dejando
estandarizado todo lo que viene después del precio: pedido, panel, plazos y
cobros.

> **Estado (10 nov. 2026): solo planificado.** Nada implementado.
> Este documento es el índice: enfoque, decisiones y reglas. Cada fase tiene
> su propio archivo en [`plan-calculadora/`](plan-calculadora/), pensado para
> abrir una sesión nueva solo con él.
> Sustituye como rumbo a `plan-unificacion-calculadora.md` y
> `plan-sincronizacion-web-calculadora.md`, que siguen siendo la referencia
> de cómo funciona hoy el esquema.

## 1. Fases

| Fase | Archivo | Tamaño | Modelo recomendado |
|---|---|---|---|
| 0 | [Preparación y acceso](plan-calculadora/00-preparacion.md) | pequeña | Sonnet |
| 1 | [Banco de pruebas real y perfil](plan-calculadora/01-banco-de-pruebas.md) | pequeña + trabajo de taller | Sonnet; Opus para multicolor |
| 2 | [Pedido estándar: fecha y precio firme](plan-calculadora/02-pedido-estandar.md) | mediana | Opus (migración), Sonnet (pantallas) |
| 3 | [«Nuevo encargo» en /admin](plan-calculadora/03-nuevo-encargo.md) | grande | Opus (motor y paridad), Sonnet (pantalla) |
| 4 | [Panel admin reordenado](plan-calculadora/04-panel-admin.md) | mediana | Sonnet |
| 5 | [Inventario y estadísticas](plan-calculadora/05-inventario-estadisticas.md) | mediana | Sonnet |
| 6 | [PWA y retirada de la Calculadora](plan-calculadora/06-pwa-y-retirada.md) | pequeña | Haiku |
| 7 | [Limpieza de la base de datos](plan-calculadora/07-limpieza-bd.md) | mediana, delicada | Opus, esfuerzo alto |
| 8 | [Revisión a fondo del tasador](plan-calculadora/08-tasador.md) | grande | Sonnet (partir), Opus (motor único) |

Orden: 0 → 2 → 3 → 4 → 5 → 6 → 7 → 8. La fase 1 va en paralelo desde el
principio; solo condiciona el precio firme (fase 2, paso final).

### Cómo ejecutar una fase

1. Sesión nueva en `D:\3DCC\Web`, con el modelo de la tabla.
2. Primer mensaje: «Ejecuta `docs/plan-calculadora/NN-….md`».
3. Una rama y un PR por fase. Antes del PR: `npm run test` y, si toca base
   de datos, `npm run test:db`.
4. Al terminar, marcar la fase como hecha en su archivo (línea «Estado») y
   anotar lo que haya cambiado respecto al plan.

Criterio de modelo: **Haiku** para cambios mecánicos y acotados; **Sonnet**
para implementar pantallas y scripts con el diseño ya decidido; **Opus**
para dinero, migraciones con triggers y decisiones de diseño. Si una tarea
de Sonnet se atasca dos veces en lo mismo, subir a Opus en vez de insistir.

## 2. Por qué

- **SILAB3D ya no usa la Calculadora.** Todo lo multi-empresa es residuo.
- **Duplicación web ↔ Calculadora:** la fórmula de precios vive en
  `Calculadora/src/shared/backend.mjs`, en `lib/quote/pricing.ts`, portada a
  `supabase/functions/submit-quote` y en parte en SQL (0024, 0027); dos
  vocabularios de estados con triggers en los dos sentidos (0026); dos
  paneles, dos logins y dos pantallas de estadísticas.
- **Empaquetado:** Electron + APK firmada + dos actualizadores para una
  herramienta que ya necesita conexión.
- **Panel admin y tasador desordenados:** `/admin/presupuestos` es una
  página de 852 líneas con un cajón que lo mezcla todo; tarifas son diez
  secciones en una página; `QuoteClient.tsx` son 1.813 líneas y 28 estados.
- **Plazos:** el cliente no sabe cuándo recibe su pedido.

## 3. Enfoque

**No se fusionan la calculadora y el tasador.** Son dos trabajos distintos:

| | Encargo a medida | Tasador |
|---|---|---|
| Quién empieza | El taller: llega alguien con un problema («se me ha roto X») | El cliente, que ya trae sus archivos |
| Camino | Modelar → laminar en OrcaSlicer → datos reales → extras → precio | Subir archivos → precio → pedir |
| Gramos y horas | Reales, del laminador | Estimados en el navegador |
| Dónde | `/admin` → «Nuevo encargo» | `/instant-quote` (público) |

**Se estandariza lo que comparten:** tarifas, catálogo de materiales, mínimo
y redondeo, el coste base (material + máquina) y lo que viene después: un
pedido con la misma forma, los mismos estados, la misma fecha prometida, los
mismos cobros y un solo panel.

## 4. Decisiones tomadas

1. **Datos de SILAB:** exportar, entregárselos y borrarlos.
2. **Pedidos compartidos históricos:** reparto de solo lectura; no se porta
   la interfaz para crearlos.
3. **App instalable:** PWA. Se retiran el APK y el instalador de Windows.
4. **Stripe:** se elimina.
5. **Facturas con IVA:** fuera del alcance.
6. **Dos entradas, no una pantalla única.**
7. **El precio que ve el cliente nunca sube** tras la revisión.
8. **El precio aceptado tampoco baja:** si el coste real sale por debajo, es
   margen.
9. **El precio del tasador no puede estar inflado** para cubrirse: centrado,
   no acolchado.
10. **La precisión publicada del estimador no vale** (2,9 % / 3,9 %, piezas
    sin testar). No se usa para decidir nada; el banco de pruebas se rehace.
11. **Plazo:** fecha tope («listo antes del viernes 14»), calculada con
    holgura para cumplirla siempre.
12. **Urgencia: no hay selector en el tasador.** El cliente ya elige
    bastante (material, color, resistencia, detalle). Junto a la fecha se
    pone un enlace «¿Lo necesitas antes? Escríbenos». La urgencia con
    recargo existe solo en el admin.
13. **Señal del 50 %** para empezar (ya se cobra así).
14. **Capacidad:** dos impresoras (K1 y Kobra X), unos dos pedidos por
    semana. Se calcula con 4 h de impresión al día, que ya es holgado. No se
    planifica por impresora.
15. **Matriz de purga:** no se porta (no se usa). `purge_config` se conserva
    en la base de datos por si se retoma.
16. **Calculadora 7.2.0:** publicada y `sync-web` fusionada. Queda congelada.
17. **Multicolor:** una pieza de varios colores la tasa el taller, no el
    tasador. Varios objetos separados, cada uno de un color, no son
    multicolor: se tasan como piezas normales (fase 1, parte D).
18. **El gcode de la K1 no cuenta el filamento purgado;** el de la Kobra X
    sí. En encargos multicolor de la K1 se suma una purga estimada.

## 5. Política de precio

- **Tasador, precio firme:** lo que ve el cliente es lo que paga. Si el
  coste real sale por encima, lo asume el taller y queda registrado el
  desvío.
- **Solo cambia si el cliente cambia el encargo** (unidades, material,
  diseño, envío, urgencia): presupuesto nuevo, con el motivo a la vista.
- **Firme solo donde hay confianza medida:** análisis por capas, cabe en la
  cama y ese tipo de pieza ha pasado el banco de pruebas real. En el resto:
  «te confirmamos el precio en menos de 24 h».
- **Hasta que exista el banco de pruebas real**, el tasador sigue como hoy
  (estimación sujeta a revisión).
- **Centrar, no acolchar:** la calibración busca real ÷ estimado = 1 por
  tipo de pieza.
- **Aprender sin cómputo:** consulta SQL con mediana y percentil 90 de
  real ÷ estimado por tipo de pieza. Nada de red neuronal.
- **Mercado:** aceptación por tramo de precio; se corrige con margen y
  mínimo, no con el estimador.
- **Encargo a medida:** sin cifra antes de laminar; el presupuesto enviado
  es cerrado.

## 6. Plazos

Hoy (`lib/quote/pricing.ts`): días = horas de impresión ÷ 8 + 1. No mira la
cola, no cuenta diseño ni post-procesado, no se guarda y el seguimiento del
cliente no enseña ninguna fecha.

- **Fecha tope** = hoy + (horas pendientes de pedidos aceptados + horas de
  este pedido) ÷ 4 h al día + días de diseño y post-procesado si los hay +
  holgura configurable (2 días laborables de partida).
- **El reloj empieza al aceptar** (o al registrar la señal).
- **Se guarda en el pedido** (`fecha_prometida`): sale en el seguimiento y
  en los correos, ordena «Hoy» y marca los pedidos en riesgo.
- **Se mide la puntualidad** (prometida frente a real) para ajustar la
  holgura.

## 7. Panel admin

| Sección | Contenido |
|---|---|
| Hoy | Por contestar, esperando al cliente, por imprimir (por fecha prometida), por entregar, por cobrar |
| Pedidos | Lista con filtros por estado y los dos orígenes marcados (sin tablero: «Hoy» hace de tablero); ficha en pestañas (resumen, piezas, cobros, envío) |
| Nuevo encargo | La calculadora de taller |
| Taller | Cola de impresión; gasto de filamento |
| Dinero | Estadísticas y cobros |
| Web | Productos, filamentos, trabajos, reseñas, blog, cupones |
| Ajustes | «Precios» y «Tasador» |

## 8. Principios de ejecución

- **Convivencia, no corte brusco.** Las dos apps leen las mismas tablas.
- **Los pedidos se siguen guardando en `orders` con la forma actual** hasta
  la fase 7, para que la Calculadora 7.2 los vea.
- **No se limpia el repo de la Calculadora:** se archiva al final.
- **No se porta:** modo fantasma, inventario del socio, pedidos compartidos,
  `mailer.js`, IPC de Electron, actualizadores, Stripe, documento `clients`,
  tickets de texto, PDF con PDFKit, matriz de purga.

## 9. Datos del perfil real (calicat.3mf, 9 nov. 2026)

Proyecto de OrcaSlicer 2.5.0-dev del taller. Es un archivo de **proyecto**,
no un laminado: trae modelo y perfil, pero no gramos ni horas.

- Impresora «Creality K1C 0.4»; proceso «0.20mm Standard»; 2 paredes, 15 %
  giroide, 5 capas arriba y 3 abajo; soportes activados, árbol (auto).
- Filamento 1 «SUNLU PLA+ - Tuned»: densidad 1,23; flujo 0,987; caudal
  máximo 12 mm³/s; 18,99 €/kg; enfriado: capa mínima 4 s.
- Multicolor con un solo extrusor: carga de filamento 119 s por cambio;
  purga de 260 a 719 mm³ por cambio × 0,8; torre de purga de 30 mm con
  60 mm³ por capa.

El estimador web simula otra cosa (`lib/quote/estimador/perfil.ts`): K1 SE,
PLA con flujo 0,95, caudal 18 y capa mínima 12 s, pared interior a 300 (el
perfil real 250), superficie superior a 150 (real 200), aceleración de
pared exterior 5000 (real 3000), y **no modela purga, torre ni tiempo de
cambio de color**: el multicolor es solo un recargo del 15 % + 1 € por
color. Corregirlo es parte de la fase 1.
