# 🚀 Proyecto Vue.js 3DCC - Guía Completa

## 📋 Resumen del Proyecto

Migración completa de la página web 3DCC a **Vue.js 3** con **Vite** como build tool. El proyecto aprovecha componentes reutilizables, animaciones fluidas y está totalmente optimizado para GitHub Pages.

## 🏗️ Estructura del Proyecto

```
vue-app/
├── src/
│   ├── components/                    # Componentes Vue reutilizables
│   │   ├── Navigation.vue             # Navegación con dark mode
│   │   ├── HeroSection.vue            # Sección hero con animaciones
│   │   ├── ServicesSection.vue        # Grid de servicios
│   │   ├── ServiceCard.vue            # Tarjeta de servicio individual
│   │   ├── PortfolioSection.vue       # Galería de trabajos
│   │   ├── PortfolioItem.vue          # Item individual del portfolio
│   │   ├── BudgetSection.vue          # Sección de presupuesto
│   │   ├── ContactSection.vue         # Sección de contacto
│   │   ├── ContactForm.vue            # Formulario con botones de contacto
│   │   └── Footer.vue                 # Pie de página
│   ├── App.vue                        # Componente raíz
│   └── main.js                        # Punto de entrada
├── index.html                         # HTML principal
├── vite.config.js                     # Configuración Vite
├── package.json                       # Dependencias
└── .gitignore

```

## ✨ Características Principales

### 1. **Componentes Reutilizables**
- ✅ Navigation: Menú con dark mode y responsive
- ✅ HeroSection: Sección principal con animaciones
- ✅ ServiceCard: Tarjetas de servicios con hover effects
- ✅ PortfolioItem: Items del portfolio con overlay
- ✅ ContactForm: Botones de contacto interactivos
- ✅ Secciones modulares y escalables

### 2. **Animaciones Avanzadas**
- 🎬 Fade-in al cargar elementos
- 🎬 Slide-in para textos
- 🎬 Zoom y float en backgrounds
- 🎬 Hover effects en tarjetas
- 🎬 Transiciones suaves CSS
- 🎬 Transforms y skew en botones
- 🎬 Animaciones de scroll

### 3. **Dark Mode Inteligente**
- 🌙 Toggle dark/light mode
- 💾 Persistencia en localStorage
- 🎨 Colores optimizados para cada modo
- ⚡ Sin flash de contenido (FOUC)

### 4. **Responsive Design**
- 📱 Mobile first
- 📱 Menú hamburguesa en móviles
- 📱 Grid adaptable
- 📱 Optimizado para todos los tamaños

### 5. **Optimizaciones de Rendimiento**
- ⚡ Lazy loading de imágenes
- ⚡ Code splitting automático
- ⚡ Minificación de assets
- ⚡ Caching inteligente

## 🚀 Comandos Disponibles

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Construir para producción
npm run build

# Preview de build
npm run preview
```

## 📊 Estructura de Datos

### Componentes con Props
```javascript
// ServiceCard
props: {
  icon: String,      // SVG como HTML
  title: String,
  description: String
}

// PortfolioItem
props: {
  title: String,
  description: String,
  image: String,
  category: String,
  tags: Array
}
```

### Data Reactiva
```javascript
// Navigation
- mobileMenuOpen: Boolean
- isDarkMode: Boolean
- scrolled: Boolean
- activeLink: String
- navLinks: Array

// App
- termsAccepted: Boolean
- showScrollTop: Boolean
- colors: Array
```

## 🎨 Paleta de Colores

```css
--primary: #2c3e50      /* Color principal */
--secondary: #34495e    /* Color secundario */
--accent: #3498db       /* Color de acento */
```

## 📱 Breakpoints Responsive

```css
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

## 🔧 Configuración Vite

```javascript
// vite.config.js
- Base: /seekmake-web/         (Para GitHub Pages)
- Build: dist
- Plugin: @vitejs/plugin-vue
```

## 📦 Dependencias

```json
{
  "dependencies": {
    "vue": "^3.3.4"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^4.3.4",
    "vite": "^4.4.9"
  }
}
```

## 🌐 Configuración para GitHub Pages

El proyecto está configurado para desplegarse en:
```
https://usuario.github.io/seekmake-web/
```

**Base Path en vite.config.js:**
```javascript
base: '/seekmake-web/'
```

**URLs de assets:**
```
/seekmake-web/images/main_banner.png
/seekmake-web/icons/favicon.ico
```

## 📝 Métodos Principales

### Navigation.vue
- `toggleDarkMode()` - Cambiar tema
- `handleScroll()` - Detectar scroll
- `scrollToTop()` - Ir al inicio
- `initDarkMode()` - Inicializar modo oscuro

### App.vue
- `checkTermsAcceptance()` - Verificar términos
- `acceptTerms()` - Aceptar términos
- `handleScroll()` - Mostrar botón de scroll
- `scrollToTop()` - Volver arriba
- `getColorName()` - Obtener nombre de color

## 🎯 Próximos Pasos

- [ ] Integrar formulario de contacto real
- [ ] Agregar API de cotización
- [ ] Implementar lazy loading de imágenes
- [ ] Agregar PWA capabilities
- [ ] Optimizar para SEO
- [ ] Agregar i18n para multiidioma
- [ ] Tests unitarios y e2e
- [ ] Performance monitoring

## 🐛 Debugging

### Modo desarrollo
```bash
npm run dev
```
Servidor en: `http://localhost:5173/seekmake-web/`

### Console errors
Revisar la consola del navegador para:
- Errores de rutas de imágenes
- Problemas de components
- Issues de CSS

### DevTools Vue
Instalar [Vue DevTools](https://devtools.vuejs.org/) para debugging

## 💡 Tips y Mejores Prácticas

1. **Componentes**: Mantén cada componente enfocado en una tarea
2. **Props**: Usa typed props con definición clara
3. **Emit**: Comunica eventos hacia arriba del árbol
4. **Composables**: Reutiliza lógica en composables
5. **Performance**: Lazy-load componentes cuando sea posible
6. **Animaciones**: Usa CSS siempre que puedas, evita JS

## 📚 Recursos

- [Vue 3 Documentation](https://vuejs.org/)
- [Vite Guide](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [GitHub Pages](https://pages.github.com/)

---

**Creado:** Noviembre 2025  
**Rama:** `vue-migration`  
**Estado:** ✅ En desarrollo activo
