# Fase 1 — Banco de pruebas real y perfil del taller

**Estado:** pendiente · **Tamaño:** pequeña de código, con trabajo de taller
**Modelo:** Sonnet (script y perfil); Opus (modelo de multicolor)
**Depende de:** nada; va en paralelo · **Índice:** [plan](../plan-calculadora-en-web.md)

## Objetivo

Saber de verdad cuánto falla el estimador, por tipo de pieza, con piezas
reales del taller. Es la condición para activar el precio firme (fase 2).

Las cifras actuales de `docs/estimador-presupuestos.md` (2,9 % / 3,9 %,
273 casos) salen de piezas sin testar y **no se usan**.

## Parte A — El perfil que simula la web no es el del taller

Datos del proyecto `calicat.3mf` (ver apartado 9 del índice) frente a
`lib/quote/estimador/perfil.ts`:

| Ajuste | Web | Taller |
|---|---|---|
| Impresora | K1 SE | K1C 0.4 |
| Flujo PLA | 0,95 | 0,987 |
| Densidad PLA | 1,24 | 1,23 |
| Caudal máximo PLA (mm³/s) | 18 | 12 |
| Tiempo mínimo de capa (s) | 12 | 4 |
| Pared interior (mm/s) | 300 | 250 |
| Superficie superior (mm/s) | 150 | 200 |
| Aceleración pared exterior | 5000 | 3000 |
| Soportes | normales | árbol (auto) |

Pasos:

1. Pedir al taller el perfil completo exportado de Orca (o reutilizar
   `Metadata/project_settings.config` de un proyecto suyo) y pasar todos los
   valores que `PerfilImpresora` y `PerfilMaterial` conocen. Cada campo
   lleva en su comentario la clave de Orca.
2. Los valores van a `quote_settings.perfil` y a los materiales, no al
   código: así se cambian desde `/admin/tarifas`.
3. `soporte_tipo` a `arbol`.

## Parte B — Colección de piezas reales

Trabajo del taller, sin código:

- 20–30 piezas ya impresas o representativas: funcionales, figuras, con
  soportes, paredes finas, lotes de varias copias, y algunas multicolor.
- Cada una laminada en OrcaSlicer con el perfil real y **exportada como
  laminado** («Exportar archivo laminado de la bandeja», `.gcode.3mf`, o el
  `.gcode`). El proyecto `.3mf` no sirve: no trae gramos ni horas.
- Si se imprime, apuntar peso y tiempo medidos.

**Actualización (11 nov. 2026): no hace falta laminar a mano.** El Orca del
taller lamina por línea de comandos un proyecto `.3mf` tal cual (lleva su
perfil dentro) y da las mismas cifras que la ventana: comprobado con
`calicat.3mf` (14,41 g, 1 h 31 min 14 s, 25 cambios, idéntico al laminado
del usuario).

    orca-slicer.exe --datadir <carpeta aparte> --slice 0 --outputdir <salida> --export-3mf x.gcode.3mf proyecto.3mf

La colección sale de los proyectos ya hechos en `D:\3DCC\Proyectos` (39
`.3mf`), laminados así sobre copias. El usuario solo aporta **lo que cobró**
por cada uno, para comparar también el precio. Los proyectos de la Kobra X
laminados en AnycubicSlicerNext no entran por esta vía.

## Parte C — Benchmark por tipo de pieza

1. `scripts/benchmark-estimador.ts` lee la carpeta y compara estimador
   contra laminado. Salida por tipo de pieza (sin soportes, con soportes,
   multicolor, lote): **mediana y percentil 90** de real ÷ estimado, en
   gramos, horas y precio. No una media global.
2. Leer gramos y horas del laminado directamente del `.gcode` exportado. El
   formato está comprobado y descrito en la fase 3, parte B; ese lector se
   reutiliza allí.
3. `tasador_calibracion()` y el panel «Precisión del tasador» desglosan por
   tipo de pieza y enseñan la dispersión, con los pedidos reales.
4. Reescribir el apartado de precisión de `estimador-presupuestos.md` con
   estas cifras.

## Parte D — Multicolor (Opus)

El estimador no modela purga, torre ni tiempo de cambio. En el perfil real
cada cambio de color cuesta 119 s de carga y entre 260 y 719 mm³ de purga
(× 0,8), más 60 mm³ de torre por capa. En una pieza con cambios en muchas
capas eso puede pesar más que la pieza.

Caso real, `calicat_PLA_1h31m.gcode` (blanco con un detalle negro, 41 mm,
205 capas): 14,41 g y 1 h 31 min, con **25 cambios de filamento**. A 119 s
por cambio son unos 50 minutos, más de la mitad del tiempo total si Orca
los cuenta en su estimación (comprobarlo laminando la misma pieza en un
solo color). Es la primera pieza de la colección.

La misma pieza laminada para la Kobra X (AnycubicSlicerNext, perfil
«0.20mm High Quality»):

| | K1C | Kobra X |
|---|---|---|
| Filamento total | 14,41 g | 22,98 g |
| Blanco / negro | 12,80 / 1,61 g | 18,85 / 4,13 g |
| Tiempo estimado | 1 h 31 min | 1 h 06 min |
| Cambios de filamento | 25 | 25 |
| Tiempo de carga por cambio (perfil) | 119 s | 0 s |
| Soportes | sí (árbol) | no |
| Pared exterior / interior (mm/s) | 200 / 250 | 60 / 150 |

**El gcode de la K1 no cuenta el filamento purgado** (dato del taller): la
purga existe, pero no entra en `filament used [g]`. El de la Kobra X sí la
cuenta. Por eso la K1 parece gastar menos; no es más eficiente.

Estimación de la purga que falta, con la matriz del propio gcode de la K1
(`flush_volumes_matrix`, ya multiplicada): 13 cambios de blanco a negro a
210 mm³ y 12 de negro a blanco a 536 mm³ son unos 9,2 cm³, **unos 11 g**.
Sumados a los 14,41 g dan unos 25,7 g, en línea con los 22,98 g de la
Kobra X. La matriz no está calibrada, así que es orientativo.

No es una comparación limpia (perfiles y soportes distintos), pero deja
tres cosas claras:

- En multicolor, los gramos del gcode de la K1 se quedan cortos: hay que
  sumar la purga (cambios × volumen de la matriz × densidad) o apuntarla a
  mano.
- El perfil de la Kobra X tiene el tiempo de carga a 0, así que su
  estimación seguramente no cuenta los cambios: hay que medir una impresión
  real antes de fiarse de esa hora y seis minutos.
- El tasador calcula siempre como si fuera la K1. Para multicolor eso no
  vale: depende de dónde se imprima.

Decisión: **el multicolor lo tasa el taller**, no el tasador. Pero hay que
distinguir dos casos que hoy se tratan igual:

| Caso | Qué es | Cómo se tasa |
|---|---|---|
| Pieza de varios colores | Un mismo objeto con zonas de distinto color (el CaliCat con su detalle negro). Hay cambios de filamento durante la impresión | «Precio en menos de 24 h»; lo tasa el taller con el laminado real |
| Objetos separados de distinto color | Varias piezas sueltas, cada una de un solo color. Se imprimen por separado, sin cambios ni purga | Como piezas normales de un color; pueden ir a precio firme |

Cómo distinguirlos en el tasador: varios archivos, o un archivo con varios
cuerpos que no se tocan, cada uno con un color, son objetos separados. Un
cuerpo con más de un color, o cuerpos de distinto color que se tocan o se
solapan, es una pieza de varios colores. Primera versión con las cajas
envolventes de cada cuerpo: si no se solapan, separados. En la duda, va a
revisión: equivocarse hacia ese lado nunca da un precio bajo.

Para modelarlo: número de capas con más de un color × (tiempo de carga +
purga de la matriz + torre). Los datos salen del análisis por capas que ya
existe y de la matriz `flush_volumes_matrix` del perfil. Validar con las
piezas multicolor de la colección antes de usarlo en precio.

## Hecho cuando

- El perfil de la web es el del taller.
- Existe la tabla de precisión por tipo de pieza con datos reales.
- Queda escrito qué tipos de pieza pasan a precio firme y con qué umbral.

## No hacer

- No ajustar la calibración global para «arreglar» un tipo de pieza.
- No activar precio firme desde esta fase: solo aporta los datos.
