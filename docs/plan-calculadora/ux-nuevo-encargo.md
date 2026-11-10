# UX de «Nuevo encargo» y de las pantallas heredadas de la Calculadora

**Estado:** propuesta de diseño (10 nov. 2026) · **Acompaña a:** fases
[3](03-nuevo-encargo.md), [4](04-panel-admin.md) y
[5](05-inventario-estadisticas.md) · **Índice:** [plan](../plan-calculadora-en-web.md)

Quien implemente la fase 3 no necesita abrir la Calculadora: todo lo que hay
que saber de ella está aquí. Las rutas `src/…` son del repo `Calculadora`
(v7.2, congelada); las rutas `app/…` y `lib/…` son de este repo.

Prioridades, por orden: (1) rapidez, (2) facilidad, (3) profesionalidad,
(4) integración con el admin. Cuando dos chocan, gana la de número más bajo.

Contexto de uso que condiciona todo: una persona, dos impresoras, unos dos
encargos por semana, en el PC del taller (con OrcaSlicer abierto al lado) y
en el móvil (sin el archivo laminado a mano: allí se teclea).

---

## 1. Cómo es hoy la Calculadora

### 1.1 Mapa de pantallas

Seis pestañas en una barra superior (`src/App.vue:227-246`): Dashboard,
Calculadora, Pedidos, Inventario, Estadísticas, Configuración. Por debajo de
1024 px se sirve la variante «handheld» (`src/composables/useMediaQuery.js:27`).

| Pestaña | Qué tiene | Diálogos |
|---|---|---|
| Calculadora (`Calculator.vue`) | 3 paneles plegables de formulario a la izquierda (420 px), resultado a la derecha | Cuestionario de riesgo, Ticket, Aviso por email, «Pedido existente» |
| Pedidos (`Orders.vue`) | Bandeja web, aviso de estancados, 4 contadores, barra de 17 iconos, filtros de cobro, tabla (tarjetas en móvil) | Ficha, Modificar pedido, Ticket, Enlace de pago, Aviso por email |
| Inventario (`Inventory.vue`) | 3 contadores, tabla de colores con gasto | Alta/edición de color |
| Estadísticas (`Statistics.vue`) | Periodo + 7 bloques (dinero, comercial, caja, cobros, pendiente, clientes, producción) | — |
| Configuración (`Configuration.vue`) | 7 subpestañas: General, Impresoras, Materiales, Purgas, Stripe, Notificaciones, Marca/PDF | Impresora, Material |
| Dashboard (`Dashboard.vue`) | Aviso de auto-descartados, 4 KPI, estancados, resumen | — |

Único atajo global: Ctrl+Mayús+G, modo fantasma (`src/App.vue:106-111`).
Atajos locales: Enter en un campo = Calcular (`Calculator.vue:519-523`);
Ctrl+S en la ficha del pedido (`Orders.vue:1506`).

### 1.2 Flujo real de un encargo (escritorio, un color, cliente nuevo)

Punto de partida: el laminado ya está exportado y OrcaSlicer sigue abierto.

| # | Paso | Dónde | Acciones |
|---|---|---|---|
| 1 | Ir a la pestaña Calculadora | `App.vue:230` | 1 clic |
| 2 | Borrar cliente y descripción del encargo anterior (el formulario se restaura entero del último cálculo) | `Calculator.vue:393-418`, `459-469` | 2 campos |
| 3 | Cliente | `:835` | teclear |
| 4 | Descripción | `:843` | teclear |
| 5 | Email | `:851` | teclear |
| 6 | Impresora | `:883` | 2 clics |
| 7 | Material | `:887` | 2 clics |
| 8 | Color | `:891` | 2 clics |
| 9 | Peso: mirar Orca, volver, teclear | `:902` | cambio de ventana + teclear |
| 10 | Tiempo: ídem | `:907` | cambio de ventana + teclear |
| 11 | Diseño | `:977` | 2 clics |
| 12 | Post-procesado | `:1002` | 2 clics |
| 13 | Prob. de error: abrir diálogo, 2 desplegables manuales, Aplicar | `:1030-1035`, `:1196-1230` | 6 clics, 1 diálogo |
| 14 | Calcular | `:1059` | 1 clic |
| 15 | Guardar pedido | `:1177` | 1 clic |
| 16 | Diálogo «Notificar nuevo presupuesto» → Enviar email | `EmailNotifyDialog.vue:112-140` | 1 clic, 1 diálogo |

**Total: 5 campos tecleados + 2 borrados, ~20 clics, 2 diálogos, 2 viajes a
la ventana de Orca.** Con cantidad, extra o diseño por horas, un campo más
cada uno. No existe campo de teléfono.

Multicolor (2 colores): marcar la casilla (`:919`) y, por cada color,
material (2 clics), color (2 clics) y gramos tecleados (`:928-959`):
**+9 clics y +2 campos**. En la K1 la purga no aparece en ningún sitio.

En móvil es lo mismo en una sola columna, con «Calcular» en una barra fija
abajo (`:1259-1269`) y salto automático al resultado (`:509-512`).

### 1.3 Fricciones, por coste

| # | Fricción | Dónde | Coste |
|---|---|---|---|
| F1 | Gramos, horas, impresora, material y color se copian a ojo de OrcaSlicer, aunque el `.gcode` los trae todos | `Calculator.vue:883-907` | 2 campos + 6 clics + 2 cambios de ventana por encargo; en multicolor, +1 campo y +4 clics por color; riesgo de error de transcripción en lo que más pesa en el precio |
| F2 | El precio no es en vivo: hay que pulsar «Calcular» y, tras cualquier cambio, «Recalcular» | `:1059`, `:1176` | 1 clic por cada prueba («¿y con post-procesado medio?»); el resultado en pantalla puede no corresponder al formulario |
| F3 | Peso y tiempo arrancan en 50 g y 1 h, valores inventados que dan un precio verosímil | `:139-140`, `:404-405` | Riesgo de enviar un presupuesto con datos falsos; contradice «sin cifra antes de laminar» |
| F4 | El riesgo se elige en un diálogo de 4 desplegables; el campo visible es de solo lectura | `:1030-1035`, `:1196-1230` | 6 clics y un cambio de contexto para elegir 1 valor de 5 |
| F5 | El formulario conserva cliente y descripción del encargo anterior y no hay «Nuevo» ni «Limpiar» | `:393-418`, `:683-745` | 2 campos que borrar; riesgo de guardar con el cliente anterior |
| F6 | Tres desplegables (impresora, material, color) con 2-5 opciones cada uno | `:883-898` | 6 clics donde bastarían 3 (o 0 con el archivo) |
| F7 | Guardar abre un diálogo de email a pantalla completa con 3 botones, y antes puede abrir otro de «Pedido existente» | `:691-729`, `EmailNotifyDialog.vue` | 1-2 diálogos y 1-2 clics en el último paso |
| F8 | La validación solo salta al calcular, con un aviso genérico «Revisa los campos marcados en rojo» | `:486-498` | Un intento fallido y buscar el campo |
| F9 | Multicolor es un modo aparte (casilla) con mínimo de 2 líneas; una línea sin color se descarta sin avisar aunque sus gramos sí cuentan en el total | `:919`, `:256-266`, `:274-276` | 1 clic extra; inventario descuadrado sin aviso |
| F10 | El email solo se autorrellena si el nombre del cliente coincide exacto; no hay autocompletado de clientes | `:105-128`, `:835` | Teclear nombre y email completos de un cliente que ya existe |
| F11 | Campos que no aportan: «Empresa» deshabilitado, «Markup» bloqueado, «Fecha» (siempre hoy), casilla de pedido compartido | `:830-832`, `:1038-1043`, `:838-840`, `:856-858` | 4 controles de ruido en el recorrido de tabulación |
| F12 | El resultado ocupa media pantalla con 3 tarjetas, 3 tablas de desglose, 5 botones y 2 gráficos que repiten el desglose | `:1064-1184` | El precio compite con todo; en móvil, 3 pantallas de scroll |
| F13 | Editar un pedido es otro formulario distinto (un diálogo que duplica toda la calculadora) y exige «Recalcular» antes de poder guardar | `Orders.vue:1885-2125`, `:2121-2122` | 2 clics extra; dos formularios que mantener |
| F14 | En escritorio las acciones de un pedido están en una barra de 17 iconos sin texto que actúan sobre la fila seleccionada; la ficha se abre con doble clic | `Orders.vue:1236-1259`, `:1368` | Seleccionar + acertar el icono; el doble clic no se descubre |
| F15 | La solicitud web precarga gramos y horas *estimados* como si fueran reales | `Calculator.vue:444-445` | Riesgo de enviar el precio con la estimación del navegador |
| F16 | El cobro se edita como un total «Cobrado» más un método, no como apuntes | `Orders.vue:1616-1636` | Ambiguo con varios pagos; la web ya tiene libro de cobros |
| F17 | «Ir a Calculadora» en la tabla vacía no hace nada (sin `@click`) | `Orders.vue:1386` | Botón muerto |
| F18 | Periodo de estadísticas: 2 selectores de fecha + 4 botones + desplegable de mes + «Todo» | `Statistics.vue:604-624` | 8 controles para una decisión |

### 1.4 Lo que funciona y se conserva tal cual

- **Campo numérico** que acepta coma y punto, selecciona todo al entrar,
  limpia lo pegado («12,5 g» → 12,5) y lleva la unidad dentro
  (`src/components/CampoNumero.vue:59-68`, `:93-100`, `:115`).
- **Campo de duración** que entiende `2,5`, `2:30`, `2h 30m`, `150 min` y
  enseña debajo la equivalencia mientras se escribe
  (`src/components/CampoTiempo.vue:36-40`, `src/shared/formatos.mjs:45-73`).
- Importe de cada tramo junto a su opción y «× uds» en post-procesado
  (`Calculator.vue:977-1017`).
- En móvil: precio y acción principal en una barra fija abajo
  (`Calculator.vue:1259-1269`); tarjetas en vez de tabla
  (`Orders.vue:1290-1331`).
- Deshacer el borrado de un pedido durante 5,5 s (`Orders.vue:562-587`) y
  el auto-descarte (`Dashboard.vue:175-198`).
- Botones «Anticipo 50 %» y «Pago completo» (`Orders.vue:1625-1636`).
- Comparación «precio actual / nuevo / diferencia» al editar
  (`Orders.vue:2081-2113`).

---

## 2. El admin de la web: qué hay y qué se reutiliza

### 2.1 Sistema visual

| Pieza | Valor | Dónde |
|---|---|---|
| Colores | `--bg` `--surface` `--surface-2` `--accent` `--text` `--muted` `--border` `--border-h`; modo oscuro con la clase `.dark` en `<html>` | `app/globals.css:10-32` |
| Radio | `--r: 4px` en todo | `app/globals.css:21` |
| Tipografías | Barlow (texto), Bebas Neue (títulos y cifras grandes), IBM Plex Mono (etiquetas en mayúsculas de 10-11 px, botones, códigos) | `app/layout.tsx:23-37` |
| Botones | `.btn-primary`, `.btn-outline`: mono, mayúsculas, 12 px | `app/globals.css:190-210` |
| Foco | Anillo de 2 px `--accent` con `:focus-visible`, global | `app/globals.css:343-351` |
| Espaciado | Tarjetas con 14-20 px de relleno, 10-16 px entre tarjetas, 18 px entre campos | `app/admin/admin.css`, `Field.tsx:13` |

### 2.2 Componentes y patrones que ya existen

| Necesidad | Reutilizar | Ruta |
|---|---|---|
| Marco, menú lateral (232 px), barra superior y hoja en móvil (≤ 900 px) | `AdminShell` | `app/admin/_components/AdminNav.tsx:39` |
| Título de página + acciones + línea de introducción | `AdminCabecera` | `AdminNav.tsx:121` |
| Etiqueta + control + ayuda | `Field`, `inputStyle` | `app/admin/_components/Field.tsx` |
| Panel lateral con trampa de foco, aviso de cambios sin guardar y error dentro | `Drawer` | `app/admin/_components/Drawer.tsx` |
| Confirmación (Enter confirma, Esc cancela) | `useConfirm` | `app/admin/_components/useConfirm.tsx` |
| Botón con ciclo Guardar → Guardando… → ✓ Guardado → ! Error | `SaveButton` | `app/admin/_components/SaveButton.tsx` |
| Franja de error (`role="alert"`) e informativa | `ErrorBanner` | `app/admin/_components/ErrorBanner.tsx` |
| Barra de guardado pegada abajo con zona segura | `.tar-guardar` | `app/admin/admin.css:282-290` |
| Tabla que se vuelve tarjetas en móvil con `data-label` | `.adm-tabla`, `.adm-num` | `app/admin/admin.css:148-180` |
| Fila de contadores | `.hoy-kpis` | `app/admin/admin.css:242-254` |
| Listas agrupadas con filas de 48 px | `.hoy-grupo`, `.hoy-fila` | `app/admin/admin.css:255-272` |
| Filtros en píldoras con contador | `.pq-filters`, `.pq-filter` | `app/admin/presupuestos/presupuestos.css:27-39` |
| Estado, pago y origen como etiquetas | `.pq-estado-badge`, `.pq-pago`, `.pq-origen`, `ESTADOS`, `ESTADO_COLOR` | `presupuestos.css:64-97`, `:130-134`; `presupuestos/page.tsx:31-49` |
| Par «Guardar y avisar» + «Guardar» | pie del cajón | `app/admin/presupuestos/page.tsx:503-518` |
| Cobros con justificante | `ReciboPanel` | `app/admin/_components/ReciboPanel.tsx` |
| Envío | `EnvioPanel` | `app/admin/_components/EnvioPanel.tsx` |
| Barra horizontal de un dato | `Bar` | `app/admin/estadisticas/page.tsx:94` |
| Filas y tarjetas activables con teclado | `activable`, `activableRow` | `lib/a11y.ts:24`, `:39` |
| Dinero «1.234,50 €» y fecha «12/08/2026» | `euros`, `fechaCorta` | `lib/recibo/types.ts:74`, `:82` |
| Catálogo de materiales y colores con muestra | `useCatalogoColores` | `lib/useCatalogoColores.ts:25` |
| Lector del laminado | `leerLaminado`, `gcodeDe` | `lib/quote/gcode.ts:60`, `:49` |
| Coste base | `costeHoraMaquina`, `precioKgDe` | `lib/quote/pricing.ts:248`, `:259` |
| PDF imprimible | `buildQuotePdfHtml`, `openQuotePdf` | `lib/quote/pdf.ts:20`, `:54` |
| Abrir un pedido por URL | `?abrir=Q-…` | `app/admin/presupuestos/page.tsx:107-129` |

### 2.3 De dónde sale el «caos» (y qué no repetir)

- **Estilos en línea copiados**: `cardStyle` y `h2Style` están duplicados en
  `tarifas/page.tsx:94-109` y `estadisticas/page.tsx:56-71`; hay dos
  contadores distintos (`.hoy-kpis` y `Kpi` en `estadisticas/page.tsx:73`).
  Las pantallas nuevas no añaden una tercera copia: se crean **dos clases**
  en `admin.css`, `.adm-card` (lo que hoy es `cardStyle`) y `.adm-card-titulo`
  (lo que hoy es `h2Style`), y se usa siempre `.hoy-kpis`.
- **Páginas de una sola columna muy largas** (`tarifas/page.tsx`, 1.031
  líneas; el cajón de presupuestos mezcla ocho bloques).
- **Texto de 13 px en campos** (`Field.tsx:50`): en iOS provoca zoom al
  enfocar. Solo el buscador lo corrige (`presupuestos.css:146-150`).
- **Color como único portador de significado y texto de color sobre fondo
  claro**: el amarillo de «Aceptado» y «Adelanto» (`#eab308`,
  `presupuestos/page.tsx:44`, `presupuestos.css:96`) no llega a contraste 3:1.
- **Sin avisos transitorios**: los mensajes de éxito son un párrafo verde en
  línea (`presupuestos/page.tsx:522-535`); no hay dónde poner un «Deshacer».
- **Botones que saltan 3 px al pasar el ratón** (`globals.css:199`, `:210`):
  pensado para la web pública; en una herramienta distrae. En `admin.css`,
  `.adm .btn-primary:hover, .adm .btn-outline:hover { transform: none; }`.

### 2.4 Lo único nuevo que hay que crear

Cinco piezas, todas en `app/admin/_components/`, porque no existe nada
equivalente:

1. `CampoNumero.tsx` y `CampoTiempo.tsx`: mismo comportamiento que los de la
   Calculadora (§1.4). La lógica pura se porta de `src/shared/formatos.mjs` a
   `lib/quote/formatos.ts` (`parseNumero`, `formatNumero`, `parseHoras`,
   `formatHoras`), con sus casos como test.
2. `Opciones.tsx`: grupo de `<input type="radio">` nativos dentro de un
   `<fieldset>` con `<legend>`, pintados como píldoras (base visual:
   `.pq-filter`). Sustituye a los desplegables de 2-6 opciones.
3. `Aviso.tsx`: franja fija abajo (`role="status"`), un mensaje, una acción
   opcional («Deshacer», «Ver pedido») y cierre solo a los 6 s. Una sola a la
   vez.
4. `ZonaLaminado.tsx`: zona de soltar + botón «Elegir archivo» + resumen de
   lo leído.
5. `Pestanas.tsx`: `role="tablist"` con flechas izquierda/derecha, para la
   ficha del pedido.

---

## 3. «Nuevo encargo» (`/admin/encargo`)

### 3.1 Principios aplicados a esta pantalla

- **Una pantalla, sin pasos ni diálogos.** Formulario a la izquierda,
  precio siempre visible a la derecha (abajo en móvil).
- **El archivo manda.** Soltar el `.gcode` rellena impresora, líneas de
  material, gramos y horas. Lo rellenado por el archivo se marca con una
  etiqueta «del laminado» y sigue siendo editable.
- **Sin datos del laminador no hay precio.** Gramos y horas arrancan
  **vacíos** (no 50 g y 1 h). El panel de precio enseña «—» y qué falta.
- **Precio en vivo.** No hay botón «Calcular». Cada cambio recalcula con
  `lib/quote/encargo.ts` (función pura, sin red).
- **Una opción = un toque.** Diseño, post-procesado, riesgo y urgencia son
  píldoras con su importe a la vista.
- **El último paso es una tecla.** Ctrl+Enter guarda y avisa.

### 3.2 Flujo objetivo y recuento

Mismo punto de partida que §1.2.

| # | Paso | Acciones |
|---|---|---|
| 1 | Abrir «Nuevo encargo» (menú, Alt+N o acceso directo de la PWA). El foco cae en «Cliente» | 1 |
| 2 | Arrastrar el `.gcode` desde la carpeta a cualquier punto de la página | 1 |
| 3 | Cliente: teclear 2-3 letras y elegir de la lista (rellena email y teléfono) | 1 campo |
| 4 | Descripción | 1 campo |
| 5 | Solo si aplica: una píldora de diseño / post-procesado / riesgo | 0-3 toques |
| 6 | Ctrl+Enter («Guardar y avisar») | 1 |

| | Hoy | Objetivo |
|---|---|---|
| Campos tecleados (cliente conocido) | 5 + 2 borrados | **2** |
| Campos tecleados (cliente nuevo) | 5 + 2 borrados | **3-4** (nombre, descripción, email y/o teléfono) |
| Clics / toques | ~20 | **2-5** |
| Diálogos | 2 | **0** |
| Viajes a la ventana de Orca | 2 | **0** |
| Multicolor (2 colores) | +9 clics, +2 campos | **+0** (salen del archivo) |
| Cambios de pantalla | 1 | 1 |

En móvil, sin archivo: 2 campos más (gramos, horas) y un toque por línea de
material. Sigue sin diálogos ni botón de calcular.

### 3.3 Valores por defecto

| Campo | Valor inicial | Origen |
|---|---|---|
| Impresora, líneas de material, gramos, horas | vacío hasta soltar el archivo | `.gcode` |
| Impresora, material y color (sin archivo) | los del último encargo guardado en este dispositivo | `localStorage` `encargo:ultimo` |
| Cantidad | 1 | fijo |
| Diseño | «No necesario» | fijo |
| Post-procesado | «Limpio» | fijo |
| Riesgo | el «error por defecto» de Ajustes → Precios | `quote_settings` |
| Urgencia | Normal | fijo; nunca se hereda |
| Gasto extra | 0 | fijo |
| Email y teléfono | los del último pedido de ese cliente | pedidos ya cargados |
| Fecha | hoy, sin campo | — |

Al elegir un cliente con pedidos anteriores aparece bajo su nombre un enlace
«Repetir su último encargo: *Soporte monitor* (12 oct.)»: un toque copia
descripción, diseño, post-procesado y riesgo. No copia gramos ni horas.

Tras guardar, el formulario queda limpio. Mientras se rellena, el borrador se
guarda en `localStorage` (`encargo:borrador`) para sobrevivir a una recarga;
no se sincroniza con el servidor.

### 3.4 Importar el laminado

**Zona de soltar.** Toda la página acepta el archivo (al arrastrar sobre
ella aparece un velo «Suelta el laminado»). Además hay una franja arriba del
formulario con el texto «Arrastra aquí el `.gcode` de OrcaSlicer» y un botón
«Elegir archivo» (Ctrl+O), que es lo que se usa en móvil y con teclado.
Acepta varios archivos a la vez (varias bandejas): se suman horas y gramos,
y se agrupan las líneas de mismo material y color.

**Tras leerlo**, la franja se convierte en un resumen de una línea:

```
✓ calicat_PLA_1h31m.gcode · Creality K1C · 14,41 g · 1 h 31 min · 2 colores   [Quitar]
```

**Qué rellena cada dato del archivo** (formato en `03-nuevo-encargo.md`, B.2):

| Línea del gcode | Campo |
|---|---|
| `printer_model` | Impresora (si no coincide con ninguna: campo vacío y aviso) |
| `filament used [g]` (ranuras > 0) | Una línea de material por ranura, con sus gramos |
| `filament_type`, misma posición | Material de la línea |
| `filament_colour`, misma posición | Color: el del catálogo de ese material con el tono más cercano; si ninguno se parece, la línea queda en «Elige color» |
| `estimated printing time (normal mode)`, la última | Horas |
| `total filament change` > 0 e impresora K1 | Línea extra «Purga estimada», editable, con etiqueta «estimada» |
| nombre del archivo | Sugerencia de descripción (texto fantasma; Tab la acepta, escribir la sustituye) |

Además propone el riesgo: si horas > 5 o el material no es PLA/PETG, bajo
las píldoras de riesgo aparece «Sugerido: Media (más de 5 h)» como enlace de
un toque. **No se aplica solo.**

**Estados de la zona:**

| Estado | Qué se ve |
|---|---|
| Vacío | Franja punteada con el texto y el botón |
| Arrastrando | Velo sobre toda la página, borde `--accent` |
| Leyendo | «Leyendo calicat.gcode…» (suele ser instantáneo; solo se lee el final del archivo) |
| Leído | Resumen de una línea + «Quitar» |
| Leído a medias | Resumen + franja informativa: «No encuentro las horas en el archivo. Tecléalas.» y foco en ese campo |
| Archivo equivocado (`.3mf` de proyecto, `.stl`) | Error en la franja: «Esto es el proyecto, no el laminado. En Orca: Exportar → Exportar G-code.» No toca el formulario |
| Ya había datos tecleados | Los sustituye y enseña `Aviso` «Datos sustituidos por los del laminado · Deshacer» |

«Quitar» borra el resumen pero deja los valores (ya son del formulario).

### 3.5 Disposición en escritorio (≥ 1100 px)

Dos columnas dentro de `.adm-main`: formulario (máx. 680 px) y panel de
precio (360 px) pegado arriba con `position: sticky; top: 32px`.

```
NUEVO ENCARGO                                                    [Limpiar]
┌──────────────────────────────────────────────┐  ┌─────────────────────────┐
│ ⇣ Arrastra aquí el .gcode de OrcaSlicer      │  │ PRECIO PARA EL CLIENTE  │
│                           [Elegir archivo]   │  │                         │
├──────────────────────────────────────────────┤  │   34,50 €               │
│ CLIENTE                                      │  │   3 uds · 11,50 €/ud    │
│ Nombre [Ana Gar▾        ]  Tel. [600 …     ] │  │   Señal (50 %): 17,25 € │
│ Email  [ana@…           ]                    │  │   Listo antes del       │
│ ↳ Repetir su último encargo: Soporte monitor │  │   vie 14 nov            │
├──────────────────────────────────────────────┤  │─────────────────────────│
│ ENCARGO                                      │  │ INTERNO                 │
│ Descripción [Tapa caja de fusibles        ]  │  │ Coste        8,12 €     │
│ Cantidad    [ 3 ud.]                         │  │ Beneficio   26,38 € 76% │
├──────────────────────────────────────────────┤  │ ▸ Desglose              │
│ LAMINADO                     del laminado ✓  │  │─────────────────────────│
│ Impresora  (K1C) (Kobra X)                   │  │ [ GUARDAR Y AVISAR    ] │
│ ● PLA   [Blanco ▾]   [12,80 g]   0,24 €   ✕ │  │   Guardar sin avisar    │
│ ● PLA   [Negro  ▾]   [ 1,61 g]   0,03 €   ✕ │  │ Se enviará a ana@…      │
│ + Añadir color               Total 14,41 g   │  └─────────────────────────┘
│ Tiempo     [1 h 31 min   ]                   │
├──────────────────────────────────────────────┤
│ TRABAJO                                      │
│ Diseño        (No) (Básico 2,25) (Búsqueda   │
│               3,75) (Medio 7,50) (Alto 15)   │
│               (Por horas)                    │
│ Post-proceso  (Limpio) (Sencillo 5) (Medio   │
│               10) (Avanzado 20)   × 3 uds    │
│ Riesgo        (25 %) (50 %) (100 %) (150 %)  │
│               (200 %)                        │
│ ▸ Más: urgencia, gasto extra                 │
└──────────────────────────────────────────────┘
```

Entre 900 y 1100 px, el panel de precio pasa a ser una barra pegada abajo
(como en móvil) y el formulario ocupa todo el ancho.

**Siempre visible:** zona de laminado, Cliente, Encargo, Laminado, Trabajo
(diseño, post-procesado, riesgo), precio, botón principal.

**Plegado:**

- «Más: urgencia, gasto extra» (`<details>`). Se abre solo si alguno de los
  dos tiene valor (al editar un pedido o al repetir uno).
- «Desglose» del panel de precio (`<details>`): abierto en escritorio,
  cerrado en móvil. Filamento, luz, desgaste, margen, error, diseño,
  post-procesado, urgencia, extra, y la línea «Mínimo aplicado» o «Redondeo»
  cuando actúan.
- Horas de diseño: aparecen solo con «Por horas» elegido.

### 3.6 Disposición en móvil (≤ 900 px)

Una columna, mismo orden. Arriba, bajo la barra del admin, una franja fina
pegada (`position: sticky; top: 56px`) con el precio, que se ve también con
el teclado abierto. Abajo, la barra de acción (reutiliza `.tar-guardar`).

```
┌───────────────────────────────┐
│ 3DCC · NUEVO ENCARGO   [Menú] │  barra del admin (56 px)
├───────────────────────────────┤
│ 34,50 €   · benef. 26,38 €  ▾ │  franja de precio (44 px), ▾ abre desglose
├───────────────────────────────┤
│ [ Elegir laminado (.gcode) ]  │
│ CLIENTE                       │
│ [Nombre                    ]  │
│ [Teléfono                  ]  │
│ [Email                     ]  │
│ ENCARGO                       │
│ [Descripción               ]  │
│ [Cantidad  1 ud.]             │
│ LAMINADO                      │
│ (K1C) (Kobra X)               │
│ ┌ ● PLA  [Blanco ▾]  [    g]┐ │
│ └ 0,00 €              Quitar┘ │
│ + Añadir color                │
│ [Tiempo  2h 30m · 2:30 · 2,5] │
│ TRABAJO                       │
│ Diseño  (No)(Básico)(Búsq.)…  │  píldoras que saltan de línea
│ Post    (Limpio)(Sencillo)…   │
│ Riesgo  (25)(50)(100)(150)…   │
│ ▸ Más: urgencia, gasto extra  │
├───────────────────────────────┤
│ [Sin avisar] [GUARDAR Y AVISAR]│ barra de acción + zona segura
└───────────────────────────────┘
```

- Sin precio todavía, la franja dice «Faltan gramos y horas» y al tocarla
  lleva al primer campo que falta.
- Los campos numéricos abren el teclado numérico (`inputMode="decimal"`);
  nombre con `autoCapitalize="words"`; email y teléfono con su `type`.
- `enterKeyHint="next"` en todos menos el último («done»).
- Sin zona de arrastre; el botón «Elegir laminado» abre el selector de
  archivos del sistema (sirve si el `.gcode` está en Drive o en Descargas).

### 3.7 Campo a campo

| Campo | Control | Obligatorio | Notas |
|---|---|---|---|
| Nombre | texto + `<datalist>` con clientes de pedidos anteriores (nombres únicos, más reciente primero) | Sí | Al coincidir con uno existente rellena email y teléfono si están vacíos |
| Teléfono | `type="tel"` | Uno de los dos | Si el nombre es nuevo y no hay ni email ni teléfono, aviso en línea, no bloqueo |
| Email | `type="email"` | — | Sin email, el botón principal pasa a ser «Guardar» (no hay a quién avisar) |
| Descripción | texto, una línea | Sí | Texto fantasma con el nombre del archivo |
| Cantidad | `CampoNumero`, entero ≥ 1, unidad «ud.» | Sí (1) | Con cantidad > 1 aparece debajo: «El laminado es de: (todo el pedido) (1 unidad → × 3)». Ver Dudas, 9 |
| Impresora | `Opciones` (2 píldoras) | Sí | — |
| Línea de material | muestra de color + material (`<select>` nativo) + color (`<select>` nativo con nombre) + gramos (`CampoNumero`, 2 decimales, «g») + coste en gris + quitar | ≥ 1 línea completa | Una sola lista: 1 línea = un color; no hay casilla «Multicolor». La primera línea no se puede quitar |
| Purga estimada | línea especial, solo gramos | — | Solo K1 con cambios de filamento. Etiqueta «estimada» |
| Tiempo | `CampoTiempo` | Sí | Marcador «2h 30m · 2:30 · 2,5» |
| Diseño | `Opciones`, 6 píldoras con importe | Sí | «Por horas» despliega `CampoTiempo` + «× 15,00 €/h = 22,50 €». Bajo el grupo: «Se cobra una vez por pedido.» |
| Post-procesado | `Opciones`, 4 píldoras con importe por unidad | Sí | Con cantidad > 1: «5,00 € × 3 uds = 15,00 €». Con «Avanzado»: «La pintura va en Gasto extra.» |
| Riesgo | `Opciones`, 5 píldoras: 25 %, 50 %, 100 %, 150 %, 200 % | Sí | Bajo cada cifra, en pequeño: Baja, Media, Alta, Muy alta, Crítica. Enlace «¿Cómo elegir?» despliega en línea los 4 factores (base, material, duración, I+D) como ayuda de lectura, sin diálogo |
| Urgencia | casilla «Urgente (+50 %)» | — | Al marcarla cambia la fecha tope del panel |
| Gasto extra | `CampoNumero`, 2 decimales, «€» | — | Ayuda: «Anillas, pintura, embalaje. Se suma tal cual, sin margen.» |

**Valores guardados.** Las píldoras enseñan etiquetas cortas, pero el pedido
guarda las cadenas exactas de la Calculadora (`'Media (Fusion <1h)'`,
`'Sencillo (lijado)'`, `'Baja (25%)'`…; `src/shared/backend.mjs:39-53`,
`:166-174`), porque la 7.2 las lee por nombre. Sin esto falla el criterio
«aparece en la Calculadora con los mismos importes».

### 3.8 Panel de precio

- **Precio**: Bebas Neue, 56 px en escritorio, 28 px en la franja móvil,
  `font-variant-numeric: tabular-nums`. Sin animación al cambiar.
- Debajo, solo si aplica: «3 uds · 11,50 €/ud», «Señal (50 %): 17,25 €»,
  «Listo antes del vie 14 nov» (fecha tope de la fase 2; con «Urgente»
  cambia en el acto), etiquetas «Mínimo 3 €» y «Urgente».
- **Interno** (separado por una línea y con el rótulo «Interno», para que
  al enseñar la pantalla al cliente quede claro qué no es suyo): coste,
  beneficio y margen en %.
- **Sin datos**: «—» y debajo la lista de lo que falta, cada elemento un
  enlace al campo: «Faltan: gramos · tiempo».
- **Al editar** un pedido: «Antes 32,00 € → Ahora 34,50 € (+2,50 €)».

### 3.9 Guardar

Dos acciones, sin diálogo (sustituyen al diálogo de email de la Calculadora
y siguen el par que ya existe en `presupuestos/page.tsx:503-518`):

- **Guardar y avisar** (principal; Ctrl+Enter). Bajo el botón, siempre a la
  vista: «Se enviará a ana@ejemplo.com con el enlace de seguimiento».
- **Guardar sin avisar** (secundaria; Ctrl+S).

Sin email, solo hay «Guardar» y el texto dice «Sin email: no se avisa».

Al guardar, el panel de precio se sustituye por el resultado:

```
✓ Q-0142 guardado y enviado a ana@ejemplo.com
34,50 € · listo antes del vie 14 nov
[Ver pedido]  [PDF]  [Copiar enlace de seguimiento]
[ NUEVO ENCARGO ]   ← foco aquí; Enter empieza otro
```

| Caso | Qué pasa |
|---|---|
| Guardando | Botón «Guardando…», deshabilitado; el formulario no se bloquea a la vista pero no admite otro envío |
| Guardado, aviso enviado | Bloque de arriba |
| Guardado, el aviso falla | «✓ Q-0142 guardado. **El aviso no salió**: *motivo*. [Reintentar aviso]». El pedido no se duplica al reintentar |
| No se pudo guardar | `ErrorBanner` sobre el formulario con el motivo; el formulario y el borrador intactos |
| Ya hay un pedido activo del mismo cliente con la misma descripción | Franja informativa bajo «Descripción», mientras se escribe: «Ya existe Q-0131 de Ana con esta descripción. [Abrirlo]». No bloquea ni pregunta al guardar |

### 3.10 Editar, recalcular y presupuestar una solicitud web

La misma pantalla, con parámetro (el sitio es una exportación estática:
rutas con `?`, no segmentos dinámicos).

- `/admin/encargo?editar=Q-0142`: título «Editar Q-0142 · Ana García»,
  formulario cargado, comparación antes/ahora en el panel, botones
  «Guardar cambios y avisar» / «Guardar cambios». «Limpiar» pasa a ser
  «Cancelar» (vuelve a la ficha). Si el pedido ya está aceptado y el precio
  cambia, aparece un campo obligatorio «Motivo del cambio» sobre los botones
  (política de precio, §5 del plan; ver Dudas, 8).
- `/admin/encargo?solicitud=Q-0150` (desde «Por presupuestar» en Hoy o desde
  la ficha): cliente, email, teléfono y material precargados. Gramos y horas
  **vacíos**; la estimación de la web se enseña solo como referencia bajo
  «Laminado»: «Estimado por el tasador: 42 g · 2 h 10 min · 18,40 €». Al
  soltar el laminado, esa línea añade el desvío: «real 47 g (+12 %)».

### 3.11 Orden de tabulación y teclado

Orden (el DOM sigue este orden; no se usa `tabindex` positivo):

1. Elegir archivo → 2. Nombre → 3. Teléfono → 4. Email → 5. Descripción →
6. Cantidad → 7. Impresora → 8. por cada línea: material, color, gramos,
quitar → 9. Añadir color → 10. Tiempo → 11. Diseño (→ horas) →
12. Post-procesado → 13. Riesgo → 14. Más (urgencia, extra) →
15. Guardar y avisar → 16. Guardar sin avisar.

Al cargar, el foco va a **Nombre** (el archivo se suelta con el ratón). Tras
soltar el archivo el foco no se mueve. Cada grupo de píldoras es una sola
parada de tabulación; dentro se cambia con las flechas (comportamiento
nativo de los radios).

| Atajo | Acción | Ámbito |
|---|---|---|
| Alt+N | Ir a Nuevo encargo | Todo el admin |
| Ctrl+O | Elegir archivo de laminado | Encargo |
| Ctrl+Enter | Guardar y avisar (o «Guardar» si no hay email) | Encargo |
| Ctrl+S | Guardar sin avisar | Encargo; guardar en la ficha del pedido |
| Flechas | Cambiar de opción dentro de un grupo de píldoras | Encargo |
| Enter en «gramos» de la última línea | Añadir otra línea de color | Encargo |
| Esc | Cierra la ayuda desplegada o el cajón | Todo el admin |
| `/` | Foco en el buscador | Pedidos |

Enter en un campo de texto no envía nada (en la Calculadora calculaba; ya no
hace falta). Los atajos se enseñan en el `title` del botón y, en escritorio,
como texto pequeño junto a él («Ctrl+Enter»).

---

## 4. Pantallas relacionadas

### 4.1 Menú

El del plan (§7): Hoy · Pedidos · Nuevo encargo · Taller · Dinero · Web ·
Ajustes, en `GRUPOS` de `AdminNav.tsx:12-35`.

- «Nuevo encargo» va destacado: en el lateral, como botón `.btn-primary` a
  todo el ancho justo debajo de «Hoy», no como un enlace más.
- En móvil (≤ 900 px), la barra superior gana un botón «+ Encargo» junto a
  «Menú» (`admin.css:11-32` tiene sitio: título a la izquierda, dos botones
  de 44 px a la derecha). Así el alta está siempre a un toque sin abrir la
  hoja.
- «Web» plegado por defecto en el lateral (`<details>`): se toca poco.

### 4.2 Pedidos: lista

```
PEDIDOS                                             [+ NUEVO ENCARGO]
[Buscar por código, cliente o descripción…  ]   Orden [Fecha tope ▾]
(Activos 6) (Por presupuestar 1) (Esperando 2) (Aceptados 1)
(En producción 1) (Listos 1) (Entregados) (Archivados)

 Código   Cliente      Encargo              Tope        Total     Cobro      Estado
 Q-0142   Ana García   Tapa caja fusibles   vie 14 nov  34,50 €   Señal ✓    [En producción ▸]
 Q-0150   Luis P.      soporte.stl ×2 [web] —           18,40 €   Pendiente  [Por presupuestar]
```

- Tabla `.adm-tabla` (tarjetas en móvil sin código nuevo). Fila entera
  activable (`activableRow`): **un clic** abre la ficha, no doble.
- Filtros: las píldoras que ya existen (`.pq-filters`), con contador. Por
  defecto «Activos».
- Origen: etiqueta `.pq-origen` «web» en los del tasador; los encargos no
  llevan etiqueta (son la mayoría).
- Tope en rojo con texto «vence hoy» / «2 días tarde» cuando está en riesgo
  (texto, no solo color).
- **Una acción por fila**: el botón de estado enseña el *siguiente* paso
  («▸ Marcar listo»). Sustituye a la barra de 17 iconos; el resto de
  acciones vive en la ficha.
- El plan pide tablero por columnas en escritorio; ver Dudas, 3.

Estados: vacío con filtro → «Ningún pedido en *Listos*.»; vacío del todo →
«Aún no hay pedidos.» + botón «Nuevo encargo» (que funciona); cargando →
«Cargando…» (como `app/admin/page.tsx`); error → `ErrorBanner` con
«Reintentar».

### 4.3 Pedidos: ficha

En el `Drawer` que ya existe (600 px; pantalla completa en móvil), abierto
por `?abrir=Q-…`. Cabecera fija y cuatro pestañas (`Pestanas`).

```
Q-0142 · Ana García                                             [×]
En producción · Listo antes del vie 14 nov · 34,50 € · cobrado 17,25 €
[ MARCAR LISTO Y AVISAR ]   sin avisar
⚠ Señal del 50 % pendiente                       (solo si aplica)
[Resumen] [Piezas] [Cobros] [Envío]
```

| Pestaña | Contenido | Viene de |
|---|---|---|
| Resumen | Estado (lista de pasos con el actual marcado; se puede saltar a cualquiera con un `<select>`), fecha tope editable (`<input type="date">`), precio / coste / beneficio previsto / beneficio real, contacto (teléfono, email y WhatsApp como enlaces), notas internas, reimpresiones por fallo (− 0 +), y acciones: Editar y recalcular · Duplicar · PDF · Archivar. Abajo, aparte: Eliminar | `Orders.vue:1513-1608` |
| Piezas | Encargo: descripción, impresora, líneas de material con muestra, gramos, horas, diseño, post-procesado, riesgo y desglose. Tasador: archivos y configuración como hoy | `Orders.vue:1675-1753`; `presupuestos/page.tsx:600-770` |
| Cobros | `ReciboPanel` sin cambios, más dos atajos sobre el importe: «Señal 50 % (17,25 €)» y «Resto (17,25 €)» | `ReciboPanel.tsx:419-475`; `Orders.vue:1625-1636` |
| Envío | `EnvioPanel` sin cambios | — |

- El botón principal de la cabecera es siempre **el siguiente paso** del
  pedido con su aviso («Marcar aceptado y avisar», «Marcar listo y avisar»),
  con «sin avisar» al lado como enlace. Sin diálogo. Si el paso no tiene
  plantilla de aviso o el pedido no tiene email, el botón dice solo «Marcar
  listo».
- En móvil, la cabecera se queda pegada arriba y el botón principal baja al
  pie del cajón (`.adm-drawer-pie`).
- «Aceptar» apunta el material gastado sin preguntar; se dice en un `Aviso`:
  «Aceptado. Apuntados 14,41 g de PLA.»
- «Entregado» con todo cobrado archiva solo y lo dice en un `Aviso` con
  «Deshacer» (como `Orders.vue:522-538`).
- Notas, fecha tope y reimpresiones se guardan con `SaveButton` y el aviso
  de cambios sin guardar del `Drawer`. Estado y cobros actúan al momento.

### 4.4 Cobros

No hay pantalla nueva de alta: se cobra en la pestaña Cobros de la ficha.
Desde «Hoy → Por cobrar», cada fila abre la ficha directamente en esa
pestaña (`?abrir=Q-0142&pestana=cobros`).

No se porta el campo «Cobrado total» editable ni el selector de método
suelto (`Orders.vue:1616-1622`): el total sale del libro de cobros.

En «Dinero» hay un listado de solo lectura: tabla `.adm-tabla` con fecha,
pedido (enlace a la ficha), cliente, método, importe y justificante, filtrada
por el mismo periodo que las estadísticas, con el total al pie.

### 4.5 Taller → Filamento

```
FILAMENTO GASTADO
┌ 3,42 kg ─────┐ ┌ 64,90 € ─────┐ ┌ 14 colores ───┐      .hoy-kpis
│ gastado      │ │ equivale a   │ │ 9 con gasto   │
└──────────────┘ └──────────────┘ └───────────────┘
 Color            Material   En pedidos   Ajuste      Total      Equivale
 ● Negro          PLA        812 g        [ 40 g]     852 g      16,18 €
 ● Blanco         PLA        640 g        [  0 g]     640 g      12,15 €
Los colores se dan de alta en Web → Filamentos.
```

- Tabla `.adm-tabla` ordenada por gasto. El **ajuste se edita en la propia
  fila** (`CampoNumero`, guarda al salir del campo, con «✓» breve); sustituye
  al diálogo de `Inventory.vue:273-304`.
- Ayuda bajo la cabecera de «Ajuste»: «Purgas, fallos, bobina estropeada.»
- Sin stock restante ni umbral de compra (fase 5, «No hacer»).
- Vacío: «Aún no hay gasto apuntado. Se suma solo al aceptar pedidos.»

**Taller → Cola de impresión:** lista `.hoy-grupo` de pedidos aceptados y en
producción, ordenada por fecha tope: cliente, encargo, impresora, horas,
tope. Arriba, un dato: «11 h pendientes · 3 días a 4 h/día».

### 4.6 Dinero → Estadísticas

- **Periodo**: una fila de píldoras `.pq-filter` (30 días · 90 días · Este
  mes · Este año · Todo) y un `<input type="month">` para un mes concreto.
  Sustituye a los 8 controles de `Statistics.vue:604-624`.
- **Arriba**, `.hoy-kpis`: facturado (aceptados) · cobrado · beneficio real ·
  pendiente de cobro · € por hora de impresora.
- **Bloques** en `.adm-card`, cada uno con una pregunta como título:
  «¿Cuánto entra y por dónde?» (cobros por método, `Bar`), «¿Quién debe?»
  (lista con enlace a la ficha), «¿Se aceptan los presupuestos?» (por origen
  y por tramo de precio), «¿Se cumplen los plazos?» (puntualidad), «¿Acierta
  el riesgo?» (reimpresiones reales frente al % cobrado), «¿Acierta el
  tasador?» (estimado frente a real).
- Solo barras horizontales con `Bar`; sin tartas ni librería de gráficos.
- Vacío por bloque: «Sin datos en este periodo.»

### 4.7 Ajustes → Precios

Una página, tarjetas `.adm-card` en este orden (de lo que más se toca a lo
que menos), barra de guardado `.tar-guardar`:

| Tarjeta | Campos |
|---|---|
| Margen y riesgo | Margen (× 2,30) · riesgo por defecto |
| Mínimos y redondeo | Mínimo de encargo · mínimo del tasador · redondeo |
| Mano de obra | €/h de diseño · €/h de post-procesado · tabla de tramos (minutos editables, importe calculado al lado, como `Configuration.vue:363-383`) |
| Urgencia | Recargo (%) |
| Materiales | €/kg por material (tabla) |
| Impresoras | Tabla: nombre, precio, consumo, vida útil, mantenimiento → «= 0,38 €/h» calculado en la fila |
| Electricidad | €/kWh |
| Plazos | Horas de impresión al día · días de holgura |
| Envío | Tramos (como hoy en tarifas) |

Cada tarjeta lleva debajo **un ejemplo vivo**: «Un encargo de 50 g y 2 h en
la K1C: coste 1,71 €, precio 3,95 €». Así se ve el efecto antes de guardar.

Los campos de dinero usan `CampoNumero` (coma decimal, unidad dentro), no el
`<input type="number">` de `tarifas/page.tsx:66-91`.

---

## 5. Reglas de componentes

### 5.1 Números

| Dato | Lectura | Entrada |
|---|---|---|
| Dinero | `euros()` → `34,50 €`, `1.234,50 €`. Siempre 2 decimales, `€` detrás con espacio | `CampoNumero` con unidad «€», 2 decimales; coma o punto; sin miles |
| Gramos | Hasta 999 g: `14,4 g` (máx. 1 decimal, sin ceros de relleno). Desde 1.000 g: `1,25 kg` | `CampoNumero` con unidad «g», hasta 2 decimales |
| Horas | `formatHoras` → `1 h 31 min`, `45 min`, `3 h`. Nunca decimales | `CampoTiempo`; al salir se reescribe en ese formato |
| Porcentajes | `25 %`, con espacio | píldoras |
| Fechas | Próximas: `vie 14 nov`. Pasadas y tablas: `fechaCorta` → `14/11/2026` | `<input type="date">` nativo |
| Códigos | `Q-0142`, IBM Plex Mono | — |

Todas las cifras en columnas y en el panel de precio llevan
`font-variant-numeric: tabular-nums` (clase `.adm-num`) y van alineadas a la
derecha en tablas.

### 5.2 Validación

- **En línea y al salir del campo**, nunca al escribir la primera letra ni
  solo al enviar. El error va bajo el campo, en texto (`#991b1b`, como
  `ErrorBanner`), unido con `aria-describedby`, y el campo con
  `aria-invalid`. Desaparece en cuanto el valor es válido.
- **El botón de guardar no se deshabilita** por errores: al pulsarlo con
  errores, el foco salta al primer campo inválido y se desplaza hasta él.
  (Sí se deshabilita mientras guarda.)
- Mensajes concretos, con qué hacer:

| Caso | Mensaje |
|---|---|
| Sin nombre | «Pon el nombre del cliente.» |
| Email mal escrito | «Este email no parece válido.» |
| Sin gramos u horas | «Faltan los gramos. Suelta el laminado o tecléalos.» |
| Duración no reconocida | «No lo entiendo. Prueba 2h 30m, 2:30 o 2,5.» |
| Línea sin color | «Elige el color de esta línea.» (en la Calculadora se descartaba en silencio) |
| Gramos a 0 en una línea | «Pon los gramos o quita la línea.» |

- **Avisos que no bloquean** (texto gris con icono, no rojo): cliente nuevo
  sin email ni teléfono; más de 1 kg o más de 48 h («¿Seguro? Es mucho para
  un encargo»); precio por debajo del coste (solo posible al editar).

### 5.3 Vacío, cargando, error

| Estado | Regla |
|---|---|
| Cargando página | Texto «Cargando…» en `--muted`, como `app/admin/page.tsx`. Sin esqueletos ni spinners |
| Cargando acción | El propio botón cambia de texto («Guardando…», «Avisando…») y se deshabilita |
| Vacío | Una frase que dice qué es y cómo se llena, y el botón que lo hace si existe |
| Error de carga | `ErrorBanner` + «Reintentar» |
| Error de acción | `ErrorBanner` junto a lo que falló (dentro del `Drawer` si es en la ficha); lo tecleado no se pierde |
| Sin conexión | `ErrorBanner` «Sin conexión. Los cambios no se han guardado.» El borrador del encargo sigue en el dispositivo |

### 5.4 Confirmar o deshacer

Regla: **lo reversible se hace y se ofrece deshacer; lo irreversible se
confirma diciendo qué se pierde.**

| Acción | Tratamiento |
|---|---|
| Quitar una línea de color | Inmediato + `Aviso` «Línea quitada · Deshacer» |
| Limpiar el formulario | Inmediato + `Aviso` «Formulario limpio · Deshacer» |
| Soltar un laminado sobre datos tecleados | Inmediato + `Aviso` con «Deshacer» |
| Archivar / recuperar | Inmediato + `Aviso` con «Deshacer» |
| Cambiar de estado | Inmediato; el `<select>` de estado permite volver |
| Eliminar un pedido | Sale de la lista al momento y se borra de verdad a los 6 s; `Aviso` «Q-0142 eliminado · Deshacer» |
| Anular un cobro | `useConfirm`: «Queda registrado como anulado y deja de contar.» |
| Emitir justificante | `useConfirm` (ya existe): no se puede deshacer, solo anular |
| Cerrar con pérdida | `useConfirm` con el importe que se da por perdido |
| Salir del encargo a medias | Sin pregunta: el borrador se conserva |
| Cerrar la ficha con cambios | El aviso que ya hace el `Drawer` |
| Enviar un aviso al cliente | Sin confirmación: el botón ya lo dice («… y avisar») y enseña el destinatario |

### 5.5 Estilo

- Tarjetas: `.adm-card` (fondo `--surface`, borde `--border`, radio `--r`,
  relleno 20 px; 16 px en móvil). Título `.adm-card-titulo` (mono, 11 px,
  mayúsculas, `--accent`).
- Rótulos de campo: `Field`.
- Un solo botón `.btn-primary` por pantalla o panel. Lo demás, `.btn-outline`
  o enlace de texto.
- Estados y etiquetas: borde y punto de color, **texto en `--text`**.
- Sin sombras, degradados ni iconos decorativos. Iconos solo donde sustituyen
  texto en un botón estrecho, y con `aria-label`.
- Modo oscuro: solo variables; ningún color fijo salvo los de estado.

---

## 6. Accesibilidad y uso táctil

- **Rótulos**: todo control con `<label>` (el de `Field` ya envuelve). Los
  grupos de píldoras, `<fieldset>` + `<legend>`. Las líneas de material
  repiten rótulo por línea para lectores de pantalla («Gramos, línea 2»).
- **Precio en vivo**: el panel es `aria-live="polite"` y anuncia el precio
  como mucho una vez por segundo y solo cuando cambia.
- **Teclado**: todo lo de §3.11 sin ratón. La zona de soltar tiene su botón.
  Ninguna acción depende de arrastrar, doble clic ni pasar el ratón.
- **Foco**: visible siempre (ya es global). Tras guardar va a «Nuevo
  encargo»; tras un error, al primer campo inválido; al cerrar el cajón,
  vuelve a la fila (ya lo hace `Drawer`).
- **Contraste**: texto ≥ 4,5:1; bordes de controles y píldoras ≥ 3:1 (usar
  `--border-h`, no `--border`, en campos). El color nunca es la única señal:
  «tarde» se escribe, «estimada» se escribe, el color lleva su nombre.
- **Movimiento**: sin animaciones propias; respetar `prefers-reduced-motion`
  en el cajón (ya lo hace).
- **Objetivos táctiles (≤ 900 px)**: 44 × 44 px como mínimo en botones,
  píldoras, «quitar línea», pestañas y filas; 8 px entre objetivos
  contiguos. Las píldoras suben de los 36 px actuales
  (`presupuestos.css:149`) a 44 px.
- **Texto de campos a 16 px en móvil**, para que iOS no haga zoom.
- **Zona segura**: barra de acción con
  `padding-bottom: calc(12px + env(safe-area-inset-bottom))` (ya en
  `.tar-guardar`).
- **Una mano**: acción principal abajo; nada esencial solo en la esquina
  superior salvo «Menú» y «+ Encargo».
- **Zoom de página** al 200 % sin scroll horizontal (una columna por debajo
  de 900 px lo garantiza).
- Atributos de ayuda al teclado: `autocomplete="off"` en nombre del cliente
  (no es el del usuario), `inputMode`, `enterKeyHint`, `autoCapitalize`.

---

## 7. Qué no se porta o se simplifica

| De la Calculadora | Dónde | Qué se hace | Motivo |
|---|---|---|---|
| Botones «Calcular» y «Recalcular» | `Calculator.vue:1059`, `:1176` | Fuera | El precio es en vivo |
| Valores iniciales 50 g y 1 h | `:139-140` | Vacío | Sin laminado no hay cifra |
| Diálogo «Cuestionario de riesgo» | `:1196-1230` | 5 píldoras + ayuda en línea | 6 clics → 1 |
| Diálogo de aviso por email | `EmailNotifyDialog.vue` | Dos botones de guardar | Un diálogo menos en el paso final |
| Diálogo «Pedido existente» | `Calculator.vue:691-729` | Aviso en línea + modo editar explícito | No interrumpir al guardar |
| Casilla «Multicolor» y mínimo de 2 líneas | `:919`, `:256-266` | Lista única de líneas | Un modo menos |
| Campo «Empresa» | `:830-832` | Fuera | Solo hay una |
| Campo «Fecha» | `:838-840` | Fuera del alta (hoy) | Ver Dudas, 6 |
| Campo «Markup» bloqueado | `:1038-1043` | Línea del desglose; se cambia en Ajustes | No es editable por encargo |
| Pedido compartido y reparto | `:856-876` | Fuera (histórico, solo lectura) | Decisión 2 del plan |
| Tickets de texto y sus PDF | `:747-806`, `:1173-1175` | Fuera; un solo «PDF» con `lib/quote/pdf.ts` | Plan, §8 |
| Gráficos de tarta y barras del resultado | `:1181-1184` | Fuera | Repiten el desglose |
| Tres tarjetas + tres tablas de desglose | `:1064-1169` | Precio + interno + desglose plegable | El precio no compite |
| Restaurar el último cálculo completo | `:393-418` | Solo impresora, material y color; borrador local | Evita arrastrar el cliente anterior |
| Diálogo «Modificar pedido» | `Orders.vue:1885-2125` | Es la pantalla de encargo con `?editar=` | Un solo formulario |
| Barra de 17 iconos y selección de fila | `Orders.vue:1236-1259` | «Siguiente paso» en la fila; resto en la ficha | Acciones con nombre y a un clic |
| Doble clic para abrir | `Orders.vue:1368` | Un clic | Descubrible |
| Cuatro contadores sobre la lista | `Orders.vue:1188-1209` | Contador en cada filtro | Misma información, sin bloque aparte |
| Vista compacta | `Orders.vue:1256` | Fuera | Con ~10 pedidos activos no hace falta |
| «Cobrado total» editable y método suelto | `Orders.vue:1616-1622` | Libro de cobros (`ReciboPanel`) | Una sola fuente del dinero |
| Enlace de pago y «Copiar link» | `Orders.vue:1240-1241`, `:2129` | Fuera | Stripe eliminado |
| Tabla de purgas de la ficha | `Orders.vue:1812-1821` | Fuera | Decisión 15 |
| Imagen de referencia adjunta | `Orders.vue:1594-1607` | Fuera | Solo existía en Electron; no está en el plan |
| Copiar código y cliente con iconos | `Orders.vue:1495-1498` | Fuera; el texto se selecciona | Ruido |
| Banner de estancados con 3 botones | `Orders.vue:1166-1185` | Fuera; recordatorios por `pg_cron` y «Hoy» | Fase 4, paso 6 |
| Diálogo de alta/edición de color | `Inventory.vue:273-304` | Ajuste en la fila; el alta ya está en Web → Filamentos | Un diálogo menos |
| Selector de periodo de 8 controles | `Statistics.vue:604-624` | 5 píldoras + mes | Una decisión, un control |
| Gráficos con librería | `Statistics.vue` | `Bar` del admin | Coherencia; sin dependencia |
| Subpestañas Stripe, Purgas, Notificaciones, Marca/PDF; color de marca; carpeta de PDF; actualizaciones | `Configuration.vue:318-326`, `:355`, `:386`, `:398` | Fuera | No aplican en la web |
| Selector de moneda | `Configuration.vue:347` | Fuera | Siempre euros |
| Conmutador claro/oscuro propio | `App.vue:254` | Se usa el tema del sitio | Ya existe (`app/providers.tsx`) |
| Modo fantasma, inventario del socio, etiquetas de socio | `App.vue:89-111`, `Calculator.vue:209-249` | Fuera | Decisión del usuario |

---

## 8. Notas para quien implemente

- **El lector `lib/quote/gcode.ts` no basta tal como está** para §3.4:
  descarta las ranuras a 0 antes de emparejarlas, así que se pierde la
  posición que une gramos con tipo y color (`:62`); coge la *primera* línea
  de tiempo y no la última, que es la buena en la Kobra X (`:65`); y no lee
  `filament_colour`, `printer_model` ni `total filament change`. Hay que
  ampliarlo (devolver ranuras `{ indice, gramos, tipo, colorHex }`,
  impresora y cambios) sin romper el banco de pruebas que ya lo usa.
- Emparejar color: distancia entre el hex del gcode y los del catálogo de
  ese material; si la menor supera un umbral, dejar «Elige color». Recordar
  en `localStorage` la última elección manual por `filament_settings_id`.
- El teléfono no existe en el pedido de la Calculadora; `quotes` sí lo tiene
  (`lib/types.ts:200`). Guardarlo ahí y, si se añade a `orders.data`, que sea
  un campo que la 7.2 ignore.
- Lista de clientes para el autocompletado: nombres únicos de los pedidos ya
  cargados, con el email y el teléfono del más reciente. Sin tabla nueva.
- La pantalla es un componente cliente; el cálculo es síncrono. No hace falta
  antirrebote para el precio, sí para guardar el borrador (600 ms).

---

## 9. Dudas para el usuario

1. **`.gcode.3mf`.** La fase 3 dice «admitir solo `.gcode`» porque el
   `.gcode.3mf` no está comprobado (03, B.3), pero el lector ya lo abre
   (`lib/quote/gcode.ts:49-58`). Propuesta: aceptarlo en la zona de soltar en
   cuanto se pruebe con un archivo real de cada impresora; hasta entonces,
   solo `.gcode`. ¿Se prueba dentro de la fase 3?
2. **«¿Avisar al cliente?»** El plan habla de una pregunta. Aquí son dos
   botones («Guardar y avisar» / «Guardar sin avisar») y ningún diálogo.
   ¿Vale así, o se quiere la pregunta explícita?
3. **Tablero de pedidos.** La fase 4 pide columnas por estado en escritorio.
   Con ~2 pedidos por semana serían 5 columnas con 0-2 tarjetas, y «Hoy» ya
   agrupa por lo pendiente. Recomiendo lista con filtros (§4.2) y que el
   «tablero» sea «Hoy». Si se mantiene el tablero: mismas tarjetas, sin
   arrastrar, con el botón «siguiente paso» en cada una.
4. **Mínimo de 3 € (encargo) y 7 € (tasador).** Se enseñan los dos en
   Ajustes → Precios y la etiqueta «Mínimo 3 €» en el panel. ¿Se mantienen
   distintos?
5. **Empezar en el PC y terminar en el móvil.** El borrador vive en cada
   dispositivo. Compartirlo exigiría guardarlo en el servidor (la Calculadora
   lo hacía con `calc_state`). ¿Hace falta?
6. **Fecha del pedido.** Se quita del alta (siempre hoy). ¿Se registran
   encargos con fecha atrasada? Si es así, iría dentro de «Más».
7. **Niveles de riesgo.** La Calculadora ofrece 5 (25 % a 200 %), pero el
   motor y Tarifas conocen también «Exenta (0 %)» y «Mínima (10 %)»
   (`src/shared/backend.mjs:167-168`, `app/admin/tarifas/page.tsx:40-46`).
   ¿5 o 7 píldoras?
8. **Motivo al cambiar el precio de un encargo aceptado.** La política dice
   que el precio solo cambia si el cliente cambia el encargo, «con el motivo
   a la vista». Lo he aplicado también a los encargos (campo obligatorio al
   editar uno aceptado). ¿Correcto, o solo para el tasador?
9. **Cantidad y laminado.** Hoy gramos y horas son del pedido entero y la
   cantidad solo reparte el precio y multiplica el post-procesado
   (`Calculator.vue:915-917`). Propongo, con cantidad > 1, la opción «el
   laminado es de 1 unidad → × N», que multiplica al guardar. No cambia la
   fórmula. ¿Se incluye?
10. **WhatsApp.** Muchos encargos llegan por ahí. Tras guardar se podría
    ofrecer «Enviar por WhatsApp» (abre el chat con el enlace de seguimiento
    ya escrito). No está en el plan; es un enlace, sin integración. ¿Se
    añade?
11. **Abrir el `.gcode` con la app instalada.** La PWA de escritorio puede
    registrarse para abrir `.gcode` (doble clic en el archivo → Nuevo
    encargo ya relleno; solo Chrome/Edge). Encaja en la fase 6, que hoy dice
    «pequeña». ¿Interesa?

---

## 10. Criterios de aceptación

### Nuevo encargo

1. Soltar `calicat_PLA_1h31m.gcode` rellena, sin más acciones: impresora
   K1C, dos líneas (12,80 g y 1,61 g) con su material y color, 1 h 31 min, y
   el precio aparece.
2. Soltar el `.gcode` de la Kobra X da el tiempo de la última línea
   `estimated printing time (normal mode)` y no añade purga.
3. En la K1 con `total filament change` > 0 aparece la línea «Purga
   estimada», editable y etiquetada.
4. Soltar un `.3mf` de proyecto o un `.stl` enseña un error que dice qué
   exportar y no modifica el formulario.
5. Con cliente conocido y laminado: de página abierta a pedido guardado y
   avisado en **como mucho 2 campos tecleados y 3 acciones más** (soltar,
   elegir cliente, Ctrl+Enter), sin ningún diálogo.
6. Sin gramos o sin horas el panel enseña «—» y qué falta; no hay precio.
   Los campos de gramos y horas arrancan vacíos.
7. Cualquier cambio en un campo actualiza el precio sin pulsar nada.
8. No existe un botón «Calcular».
9. Todo el flujo se completa solo con teclado; Ctrl+Enter, Ctrl+S, Ctrl+O y
   Alt+N funcionan; cada grupo de píldoras es una parada de tabulación.
10. Elegir un cliente existente rellena email y teléfono.
11. Una línea de material sin color impide guardar y lo dice en la línea.
12. `2,5`, `2.5`, `2:30`, `2h 30m` y `150 min` dan 2 h 30 min; `12,5` y
    `12.5` dan 12,5 g; pegar «12,5 g» deja 12,5.
13. Guardar con errores lleva el foco al primer campo inválido, con su
    mensaje debajo.
14. Si el aviso falla, el pedido queda guardado, se dice, y «Reintentar
    aviso» no crea otro pedido.
15. Tras guardar, el formulario queda limpio y Enter empieza otro encargo.
16. Recargar a medias conserva lo tecleado.
17. `?editar=Q-…` carga el pedido y enseña antes/ahora/diferencia en vivo.
18. `?solicitud=Q-…` no rellena gramos ni horas con la estimación de la web.
19. El pedido guardado se abre en la Calculadora 7.2 con el mismo diseño,
    post-procesado y riesgo (mismas cadenas) y el mismo precio.

### Móvil (375 × 812)

20. Sin scroll horizontal en ninguna pantalla.
21. El precio se ve con el teclado abierto.
22. Botones, píldoras, pestañas y «quitar» miden al menos 44 × 44 px.
23. Enfocar un campo no hace zoom en iOS.
24. Gramos, horas, cantidad y extra abren teclado numérico.
25. La barra de acción no queda tapada por la barra del sistema.

### Pedidos, cobros, filamento, estadísticas, ajustes

26. Un clic en una fila abre la ficha; no hay doble clic ni barra de iconos.
27. Cada fila enseña el siguiente paso y lo ejecuta con un clic.
28. La ficha tiene las pestañas Resumen, Piezas, Cobros y Envío, navegables
    con flechas.
29. «Señal 50 %» y «Resto» rellenan el importe del cobro.
30. Eliminar y archivar ofrecen «Deshacer» durante 6 s; anular un cobro pide
    confirmación.
31. El ajuste de gramos de un color se edita en su fila, sin diálogo.
32. El periodo de estadísticas se cambia con un toque.
33. Ajustes → Precios enseña un ejemplo que cambia al editar, antes de
    guardar.

### Transversales

34. Las pantallas nuevas no añaden estilos en línea para tarjetas ni títulos:
    usan `.adm-card` y `.adm-card-titulo`.
35. Todo importe sale de `euros()`; no hay `toFixed(2)` en lo que ve el
    usuario.
36. Modo claro y oscuro correctos sin colores fijos fuera de los de estado.
37. Todo control tiene rótulo; los errores están unidos al campo con
    `aria-describedby`; el precio se anuncia con `aria-live="polite"`.
38. Ningún significado depende solo del color.
39. `npm run test` y `npm run test:ui` pasan; `lib/quote/formatos.ts` tiene
    test con los casos del criterio 12.
