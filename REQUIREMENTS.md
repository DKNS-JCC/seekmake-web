# Requisitos de la Aplicación Web — 3DCC Salamanca

> Documento de referencia para migración o reimplementación idéntica de la web.  
> **URL en producción:** https://impresion3dcc.com  
> **Fecha de captura:** febrero 2026

---

## 1. Visión General

Web estática de un servicio de **impresión 3D** (hobby sin ánimo de lucro) en Salamanca.  
Sin backend propio. Toda la lógica corre en el cliente (HTML + JS vanilla).  
Hospedada en **GitHub Pages** (archivo `CNAME` con valor `impresion3dcc.com`).

---

## 2. Stack Tecnológico

| Capa | Tecnología / Fuente |
|------|---------------------|
| Estilos | **Tailwind CSS** via CDN `https://cdn.tailwindcss.com` |
| Estilos | `styles-tailwind.css` (animaciones propias complementarias) |
| Estilos | `styles.css` (hoja CSS legada — presente pero no cargada en las páginas) |
| Scripts | Vanilla JS (`script.js`) — compartido por todas las páginas |
| YAML parser | **js-yaml 4.1.0** via CDN `https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js` |
| Terceros | **SeekMake** iframe de cotización instantánea |
| Terceros | **TrustIndex** widget de reseñas de Google |

### 2.1 Configuración de Tailwind (idéntica en todas las páginas)

```js
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary:   '#2c3e50',
        secondary: '#34495e',
        accent:    '#3498db',
      }
    }
  }
}
```

---

## 3. Paleta de colores y tokens de diseño

| Token | Valor |
|-------|-------|
| `primary` | `#2c3e50` (azul oscuro/marino) |
| `secondary` | `#34495e` |
| `accent` | `#3498db` (azul claro) |
| Dark mode | Estrategia Tailwind `class` + persistencia `localStorage('darkMode')` |

**Tipografía:** sistema (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, …`)  
Excepto `qr.html` que carga **Inter** desde Google Fonts.

---

## 4. Estructura de Ficheros

```
/
├── index.html            — Página principal (landing)
├── muestrario.html       — Muestrario de colores y materiales
├── catalogo.html         — Catálogo de productos Pokémon
├── instant-quote.html    — Calculadora de precio (iframe SeekMake)
├── terminos.html         — Términos y Condiciones
├── success.html          — Confirmación de compra/pedido
├── cancel.html           — Cancelación de pago
├── qr.html               — Página QR / link-in-bio
├── script.js             — JS compartido (navegación, scroll, animaciones)
├── styles.css            — CSS legado (no cargado actualmente)
├── styles-tailwind.css   — Complemento CSS de Tailwind
├── filamentos.yaml       — Datos de materiales y colores
├── productos.yaml        — Catálogo de productos
├── CNAME                 — impresion3dcc.com
├── icons/
│   ├── android-chrome-192x192.png
│   ├── android-chrome-512x512.png
│   └── site.webmanifest
└── images/
    ├── main_banner.png
    ├── poke_banner.png
    └── examples/
        ├── corporativa.jpg
        ├── Decoracion.jpeg
        └── repuesto.png
```

---

## 5. Componente Shared: Navegación

Presente en todas las páginas excepto `qr.html` y `terminos.html` (versión reducida).

### 5.1 Estructura HTML

```
<nav id="navbar">                          ← fixed top, bg-white dark:bg-gray-900
  <div class="max-w-7xl …">
    <!-- Logo: icono redondeado + texto "3DCC | Impresión 3D" -->

    <!-- Botón hamburguesa (visible solo en móvil < lg) -->
    <button id="navToggle">
      <span></span><span></span><span></span>   ← 3 líneas que animan a "X"
    </button>

    <!-- Menú desktop (oculto < lg) -->
    <ul id="navMenu">
      Inicio | Muestrario | Catálogo | Algunos Trabajos | Contacto
      + botón dark mode (sun/moon SVG)
      + CTA "Obtener Precio" / "Calculadora de Precio" → instant-quote.html
    </ul>

    <!-- Menú mobile (oculto por defecto, flex column al abrirse) -->
    <div id="navMenuMobile">
      Mismos enlaces + botón dark mode mobile (#darkModeToggleMobile)
      + CTA en ancho completo
    </div>
  </div>
</nav>
```

### 5.2 Comportamiento (script.js)

- **Toggle hamburguesa:** `navMenuMobile` alterna `hidden`/`flex`. Las 3 `<span>` se transforman (`rotate(45deg)`, `opacity: 0`, `rotate(-45deg)`) formando una X.
- **Cierre al hacer clic en un enlace:** todos los `.nav-link` cierran el menú mobile.
- **Sombra al hacer scroll:** si `pageYOffset > 50` → añade `shadow-lg` al navbar.
- **Enlace activo:** IntersectionObserver sobre `section[id]` → añade clase `active border-b-2 border-accent` al `.nav-link` correspondiente.
- **Smooth scroll:** para `a[href^="#"]` con offset de 70 px.

### 5.3 Dark Mode

- **Prevención de FOUC:** `<script>` inline en `<head>` antes de cargar nada:  
  `if (localStorage.getItem('darkMode') === 'true') document.documentElement.classList.add('dark')`
- **Toggle desktop** (`#darkModeToggle`) y **mobile** (`#darkModeToggleMobile`): alternan clase `dark` en `<html>` y persisten en `localStorage('darkMode')`.
- Iconos: sol SVG visible en dark, luna SVG visible en light.

---

## 6. Componente Shared: Footer

```html
<footer class="bg-primary dark:bg-gray-950 text-white text-center py-8">
  © 2025 Impresión 3DCC Salamanca. Todos los derechos reservados.
  <a href="terminos.html">Términos y Condiciones</a> |
  Servicio ofrecido como hobby sin ánimo de lucro
</footer>
```

---

## 7. Componente Shared: Banner de Términos (solo index.html)

- `id="cookieBanner"` — posición `fixed bottom-0`, borde superior `border-accent`.
- Empieza oculto con `translate-y-full`. Aparece a los 500 ms si `localStorage('termsAccepted')` no existe.
- **Botón "Aceptar"** (`#acceptTerms`): guarda `termsAccepted=true` en localStorage y desliza el banner hacia abajo.
- **Botón X** (`#closeTerms`): cierra sin aceptar (volverá a aparecer).

---

## 8. Componente Shared: Animaciones de aparición (script.js)

```js
// IntersectionObserver: threshold 0.1, rootMargin '0px 0px -100px 0px'
// Elementos objetivo: .service-card, .portfolio-item, .contact-item, .quote-feature
// Inicio: opacity 0, translateY(30px), transition 0.6s
// Al intersectar: opacity 1, translateY(0)
```

---

## 9. Páginas — Requisitos Detallados

### 9.1 `index.html` — Homepage

**SEO:**
- `<title>`: `3DCC Salamanca | Impresión 3D`
- Meta description, keywords, author, robots index/follow
- Canonical: `https://impresion3dcc.com/`
- Open Graph completo (type, url, title, description, image, locale)
- Twitter Card (summary_large_image)
- Schema.org JSON-LD tipo `LocalBusiness` con address, geo, telephone, email, openingHours, hasOfferCatalog

**Secciones (en orden):**

#### Hero `#inicio`
- `min-h-screen`, fondo: `images/main_banner.png` + overlay gradient `from-white/90 via-white/80 to-gray-100/85` (dark: equivalente gris)
- Texto centrado, máx 4xl:
  - H1 en dos líneas: "Impresión 3DCC" / "Diseño y Prototipado"
  - Subtítulo con localización y envíos
- Dos botones: **"Calcular Precio"** → `instant-quote.html`, **"Contactar"** → `#contacto`
- Indicador de scroll animado (bounce) en la parte inferior

#### Servicios
- `py-20 bg-white dark:bg-gray-800`
- Grid `1/2/4 cols` (responsive)
- 4 tarjetas (`.service-card`) con animación de entrada (IntersectionObserver):
  1. **Impresión Rápida** — icono rayo SVG
  2. **Amplia Variedad** — icono paleta SVG
  3. **Envío Nacional** — icono caja SVG
  4. **Calculadora de Precio Online** — icono billete SVG

#### Muestrario Preview
- `py-20 bg-gray-50 dark:bg-gray-900`
- 6 muestras de color inline: negro, blanco, rojo, azul, verde, naranja
- CTA outline → `muestrario.html`

#### Trabajos `#trabajos`
- `py-20 bg-white dark:bg-gray-800`
- Grid 3 columnas (`.portfolio-item`):
  1. corporativa.jpg — "Productos corporativos"
  2. Decoracion.jpeg — "Figuras Decorativas"
  3. repuesto.png — "Repuestos y Recambios"
- Cada tarjeta: imagen 64-high + info debajo

#### Reseñas de Clientes `#resenas`
- `py-20 bg-gray-50 dark:bg-gray-900`
- Script externo TrustIndex:  
  `<script defer async src='https://cdn.trustindex.io/loader.js?03664c36382e1088a39602d4c28'></script>`

#### Cálculo de Precio `#presupuesto`
- `py-20 bg-gradient-to-br from-primary to-secondary text-white`
- Texto + botón blanco → `instant-quote.html`

#### Contacto `#contacto`
- `py-20 bg-gray-50 dark:bg-gray-900`
- **Grid 2 columnas** (izq: info, der: acciones):
  - Info: WhatsApp/Llamadas (+34 923 793 123), Email (impresion3dslmc@gmail.com), Web (impresion3dcc.com), Ubicación (Plza. Barrio Vidal, Salamanca 37006)
  - Acciones (3 botones a ancho completo):
    - "Enviar email" → `mailto:impresion3dslmc@gmail.com`
    - "Llamar" → `tel:+34923793123`
    - "WhatsApp" → `https://wa.me/34923793123?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20impresi%C3%B3n%203D`

---

### 9.2 `muestrario.html` — Muestrario de Colores

**Datos:** cargados desde `filamentos.yaml` vía `fetch` + `jsyaml.load()`.

**Estructura YAML de filamentos:**
```yaml
filamentos:
  PLA:
    nombre: string
    descripcion: string
    colores:
      - nombre: string
        hex: "#RRGGBB"
        texto: "black" | "white"   # color de texto sobre el swatch
        acabado: string (opcional) # Metálico | Fluorescente | Translucido |
                                   # Textura | Brillante | Purpurina | Mate | Flexible
```
Materiales disponibles: **PLA** (26 colores), **PETG** (4 colores), **ASA** (1 color), **TPU** (1 color).

**Secciones:**

#### Hero
- Fondo gradient `from-gray-50 to-white` (dark: gray-800 → gray-900)
- H1 + subtítulo + info-box azul "solicitar foto real"

#### Test interactivo "¿Cuál es tu material ideal?"
- Panel `bg-white dark:bg-gray-800` con header azul gradient
- 4 preguntas secuenciales con barra de progreso:
  1. ¿Exterior o interior?
  2. ¿Flexible o rígida?
  3. ¿Con calor o resistencia química?
  4. Prioridad: precio / detalle / flexibilidad / resistencia
- Resultado: muestra el material recomendado con descripción y botón para desplazarse a esa sección
- Lógica de decisión árbol (ver script en `muestrario.html`)

#### Nav de materiales (sticky top-[72px])
- Tab por cada material del YAML (PLA, PETG, ASA, TPU)
- Badge con recuento de colores
- Al hacer clic → scroll suave`a la sección `#material-{clave}`
- Tab activo resaltado con `bg-accent text-white`

#### Buscador de colores
- Input de texto que filtra las tarjetas en tiempo real
- Tarjetas no coincidentes → clase `.dimmed` (opacity 0.15, scale 0.96, pointer-events none)

#### Grid de colores por material (secciones `.material-section`)
- Cada sección: título del material + descripción + grid responsive de `.color-card`
- **Color card:**
  - Swatch cuadrado con color de fondo (`hex`)
  - Overlays CSS según `acabado`:
    - `Metálico` → shimmer animation (`.finish-overlay-metallic::before`)
    - `Fluorescente` → glow box-shadow (`.finish-overlay-fluorescente`)
    - `Translucido` → patrón ajedrez semitransparente
    - `Textura` → ruido SVG fractal
    - `Brillante` → highlight diagonal
    - `Purpurina` → sparkle animation (dots radial-gradient)
    - `Mate` → overlay oscuro sutil
    - `Flexible` → rayas horizontales
  - Badge de acabado (si existe)
  - Nombre del color (color de texto según campo `texto`)
  - Código hex copiable con tooltip y efecto `.copied` (fondo verde 500ms)
  - Hover: `translateY(-4px)` + sombra
- Animación de entrada via IntersectionObserver (`material-section.visible`)

#### Modal 3D Preview (`#modal3D`)
- Abre al hacer clic en una tarjeta de color
- Muestra el color seleccionado en un objeto 3D simulado con CSS
- Aplica el finish overlay correspondiente
- Botón cerrar y cierre con ESC
- En móvil: ocupa pantalla completa (border-radius 0)

---

### 9.3 `catalogo.html` — Catálogo de Productos

**Datos:** cargados desde `productos.yaml` vía `fetch` + `jsyaml.load()`.

**Estructura YAML de productos:**
```yaml
productos:
  - id: number
    nombre: string
    descripcion: string
    precio: float           # en euros
    categoria: "Keycaps" | "Figuras"
    material: string
    colores: string[]
    dimensiones: string     # e.g. "3x3x3 cm"
    peso: string            # e.g. "15g"
    imagen: string (URL)
    destacado: boolean
    etiquetas: string[]
```
Total productos en el YAML: ~41 (Keycaps de Pokémon + Figuras coleccionables).

**Secciones:**

#### Hero
- Fondo: `images/poke_banner.png` + overlay oscuro `from-black/60`
- H1: "Catálogo Pokémon", subtítulo + nota "En colaboración con TCG Tracker" en amarillo

#### Barra de filtros (sticky `top-20` en escritorio)
- `#searchInput` — búsqueda por nombre, descripción, etiquetas
- `#categoryFilter` — todas / Keycaps / Figuras
- `#sortFilter` — Destacados / Precio menor-mayor / Precio mayor-menor / Nombre A-Z
- `#resetFilters` — resetea todos los filtros
- `#resultCount` — contador de productos mostrados

#### Grid de productos (`#productosGrid`)
- Responsive: 1 / 2 / 3 / 4 columnas
- **Product card** (`.product-card`):
  - Badge "⭐ Destacado" (absoluto, gradient naranja-naranja, si `destacado: true`)
  - Imagen `h-48` con `object-cover` (o icono placeholder)
  - Nombre, descripción truncada (`.line-clamp-2`)
  - Badge de categoría (accent), texto de material
  - Precio en `text-accent font-bold text-2xl`
  - Botón "Ver detalles" → abre modal
- Clic en toda la tarjeta también abre modal
- Loading spinner inicial hasta que se cargan los datos
- Mensaje vacío si no hay resultados (`#noResults`)

#### Modal de producto (`#productModal`)
- Header gradient `from-primary to-secondary` con botón cierre
- Grid 2 columnas: imagen | detalles
- Detalles: descripción, precio, material, colores, dimensiones, peso
- Botones: "Solicitar" → `index.html#contacto`, "Ver Colores" → `muestrario.html`
- Cierre con ESC o botón cerrar

#### CTA inferior
- Gradient `from-primary to-secondary`, 2 botones: Contactar + Calcular precio personalizado

**Lógica JS:**
- `cargarProductos()`: fetch → jsyaml → render
- `aplicarFiltros()`: filtra por texto y categoría, ordena, re-renderiza
- `renderizarProductos()`: genera HTML de tarjetas
- `abrirModalProducto(id)`: busca producto, rellena modal, muestra
- `cerrarModal()`: oculta modal

---

### 9.4 `instant-quote.html` — Calculadora de Precio

**Muy simple.** Sólo contiene:

```html
<iframe
  sandbox="allow-downloads allow-scripts allow-same-origin allow-forms allow-popups"
  id="seekmake-embed-iq"
  src="https://seekmake.com/instant-quote/?isEmbed=true&manufacturer=68dc31e8d996e3f4cdd284c2"
  style="width: 100%; height: 100vh; border: 0px"
  scrolling="no"
></iframe>
```

Script adicional: `<script src="https://seekmake.com/assets/public/iq-api-latest.js"></script>`

---

### 9.5 `terminos.html` — Términos y Condiciones

- Navegación simplificada: solo logo + enlace "Volver al inicio"
- Sin dark mode
- Contenido estático (última actualización: 9 de octubre de 2025):
  1. Naturaleza del Servicio (hobby, cubre solo costes)
  2. Aceptación de los Términos
  3. Limitación de Responsabilidad
  4. Propiedad intelectual
  5. Privacidad y datos personales
  6. Proceso y pago
  7. (más secciones a preservar íntegramente)

---

### 9.6 `success.html` — Confirmación de Pedido

- Mensaje de éxito tras completar un pedido/pago
- Navegación completa con dark mode
- Botones de retorno a catálogo e inicio

---

### 9.7 `cancel.html` — Pago Cancelado

- Mensaje informando la cancelación
- Navegación completa con dark mode
- Botones de retorno

---

### 9.8 `qr.html` — Página QR / Link-in-Bio

- **`noindex, nofollow`** (uso offline / folletos)
- Sin nav normal, diseño standalone
- Fuente: **Inter** (Google Fonts)
- Fondo: animated gradient
- Contenido:
  - Logo + nombre de la marca
  - Links a: Web principal, WhatsApp, Email, Catálogo, Muestrario, Calculadora de precio
  - CTA para dejar reseña en Google
  - Información de contacto

---

## 10. Ficheros de Datos

### `filamentos.yaml`

```
filamentos:
  PLA:    26 colores (planos, metálicos, fluorescentes, purpurina, textura)
  PETG:   4 colores (brillante, translucido, textura fibra de carbono)
  ASA:    1 color (negro, mate)
  TPU:    1 color (negro, flexible)
```

### `productos.yaml`

41 productos Pokémon en 2 categorías:
- **Keycaps** (~7 productos): Pikachu, Flareon, Charizard, Ditto, Charmander, Gengar, Snorlax — precio unitario **7,00 €**
- **Figuras** (~34 productos): legendarios, iniciales, coleccionables — precios entre **21 €** y **65 €**

Todas las imágenes son URLs externas de **Printables** o **MakerWorld (Bambu Lab)**.

---

## 11. Datos de Negocio / Contacto

| Campo | Valor |
|-------|-------|
| Nombre | 3DCC Salamanca |
| Teléfono | +34 923 793 123 |
| Email | impresion3dslmc@gmail.com |
| Dirección | Plza. Barrio Vidal, Salamanca 37006, España |
| WebApp | https://impresion3dcc.com |
| WA deep-link | `https://wa.me/34923793123?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20impresi%C3%B3n%203D` |
| Google Maps geo | lat: 40.9701, lng: -5.6635 |
| Horario Schema | Mo-Su 09:00-21:00 |
| Precio Schema | €€ |

---

## 12. Integraciones de Terceros

| Servicio | Uso | Identificador |
|----------|-----|---------------|
| **SeekMake** | Calculadora de precio instantánea (iframe) | `manufacturer=68dc31e8d996e3f4cdd284c2` |
| **TrustIndex** | Widget de reseñas Google | `loader.js?03664c36382e1088a39602d4c28` |
| **js-yaml 4.1.0** | Parseo de YAML en cliente | CDN jsDelivr |
| **Tailwind CSS CDN** | Framework CSS | `https://cdn.tailwindcss.com` |
| **Google Fonts** | Inter (solo qr.html) | |

---

## 13. Comportamientos Globales Clave

| # | Comportamiento | Mecanismo |
|---|---------------|-----------|
| 1 | Dark mode sin flash (FOUC) | Script `<head>` inline lee `localStorage('darkMode')` antes del primer render |
| 2 | Persistencia dark mode | `localStorage('darkMode')` = 'true' / 'false' |
| 3 | Banner de términos | `localStorage('termsAccepted')` — aparece si no existe, desaparece al aceptar |
| 4 | Animaciones de entrada | `IntersectionObserver` (threshold 0.1, rootMargin -100px) sobre `.service-card`, `.portfolio-item`, `.contact-item`, `.quote-feature` |
| 5 | Smooth scroll offset | `offsetTop - 70px` para anclar correctamente bajo el navbar fijo |
| 6 | Hamburguesa → X | Transform CSS sobre 3 `<span>` del botón |
| 7 | Enlace activo en nav | `IntersectionObserver` sobre todas las `section[id]` |
| 8 | Carga de datos YAML | `fetch` + `jsyaml.load()` → render dinámico (muestrario, catálogo) |

---

## 14. SEO — Solo index.html

El único fichero con SEO completo es `index.html`. El resto tienen meta básico.

- **Schema.org** LocalBusiness con `hasOfferCatalog` (3 servicios)
- Canonical URL
- Open Graph + Twitter Card
- `robots: index, follow` (excepto qr.html que es `noindex, nofollow`)

---

## 15. Assets de Imágenes

| Ruta | Uso |
|------|-----|
| `icons/android-chrome-192x192.png` | Favicon 192px + logo nav |
| `icons/android-chrome-512x512.png` | Favicon 512px |
| `icons/site.webmanifest` | PWA manifest |
| `images/main_banner.png` | Hero de index.html |
| `images/poke_banner.png` | Hero de catalogo.html |
| `images/examples/corporativa.jpg` | Portfolio item 1 |
| `images/examples/Decoracion.jpeg` | Portfolio item 2 |
| `images/examples/repuesto.png` | Portfolio item 3 |

Imágenes de productos en `productos.yaml`: **URLs externas** (Printables, MakerWorld).

---

## 16. Lista de Comprobación para Migración

Para garantizar que la aplicación migrada es **funcionalmente idéntica**, verificar:

- [ ] Todas las rutas de página funcionan (8 páginas HTML)
- [ ] Los 2 archivos YAML son accesibles via `fetch` (misma ruta relativa o equivalente)
- [ ] Dark mode no produce flash al recargar en modo oscuro
- [ ] El banner de términos aparece la primera visita y persiste la aceptación
- [ ] Hamburguesa mobile anima a X y cierra al hacer clic en enlace
- [ ] El enlace activo del nav cambia al hacer scroll entre secciones
- [ ] Las tarjetas de servicios/portfolio animan al entrar en viewport
- [ ] El muestrario carga todos los materiales del YAML con sus acabados visuales
- [ ] El test de material (4 preguntas) navega correctamente y da resultado
- [ ] La búsqueda en muestrario filtra/atenúa en tiempo real
- [ ] El catálogo carga productos, filtra, ordena y abre modal
- [ ] Modal de catálogo se cierra con ESC
- [ ] El iframe de SeekMake carga con el manufacturer correcto
- [ ] El widget de TrustIndex carga las reseñas
- [ ] Todos los enlaces de contacto (tel:, mailto:, wa.me) son correctos
- [ ] Footer enlaza a `terminos.html`
- [ ] `qr.html` es independiente (sin nav estándar) y tiene `noindex`
- [ ] `CNAME` contiene `impresion3dcc.com`
- [ ] Favicons y webmanifest accesibles en `/icons/`
