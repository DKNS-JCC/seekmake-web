# 3DCC Web App - Vue.js 3 con Vite

🚀 **Migración completa de la página web 3DCC a Vue.js 3 con Vite**

Proyecto moderno con componentes reutilizables, animaciones fluidas y soporte para GitHub Pages.

## ⚡ Quick Start

```bash
# Instalar dependencias
npm install

# Desarrollo
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview
```

## 📦 Tecnologías

- **Vue 3** - Framework progresivo
- **Vite** - Build tool ultrarrápido
- **Tailwind CSS** - Utility-first CSS
- **GitHub Pages** - Hosting gratuito

## ✨ Características

### 🎯 Componentes Modulares
- Navigation con dark mode
- Hero Section con animaciones
- Service Cards reutilizables
- Portfolio Gallery
- Contact Section interactiva
- Footer responsive

### 🎬 Animaciones Premium
- Fade-in effects
- Slide transitions
- Hover animations
- Scroll triggers
- Transformaciones suaves

### 🌙 Dark Mode
- Toggle light/dark
- Persistencia en localStorage
- Transiciones fluidas
- Sin FOUC (Flash of Unstyled Content)

### 📱 Responsive
- Mobile-first design
- Menú hamburguesa
- Todas las pantallas soportadas
- Optimizado para velocidad

## 🗂️ Estructura

```
src/
├── components/
│   ├── Navigation.vue        # Navegación principal
│   ├── HeroSection.vue       # Sección principal
│   ├── ServicesSection.vue   # Servicios
│   ├── ServiceCard.vue       # Tarjeta servicio
│   ├── PortfolioSection.vue  # Galería
│   ├── PortfolioItem.vue     # Item galería
│   ├── BudgetSection.vue     # Presupuesto
│   ├── ContactSection.vue    # Contacto
│   ├── ContactForm.vue       # Botones contacto
│   └── Footer.vue            # Pie de página
├── App.vue                   # Componente raíz
└── main.js                   # Entrada
```

## 📖 Uso

### Componentes

**ServiceCard:**
```vue
<ServiceCard 
  :icon="svgString"
  title="Impresión Rápida"
  description="Descripción..."
/>
```

**PortfolioItem:**
```vue
<PortfolioItem 
  title="Proyecto"
  description="Desc..."
  image="/path/to/image.jpg"
  category="Categoría"
  :tags="['tag1', 'tag2']"
/>
```

### Dark Mode

```javascript
// Toggle en el componente Navigation
toggleDarkMode() {
  this.isDarkMode = !this.isDarkMode;
  const htmlElement = document.documentElement;
  if (this.isDarkMode) {
    htmlElement.classList.add('dark');
  } else {
    htmlElement.classList.remove('dark');
  }
  localStorage.setItem('darkMode', this.isDarkMode);
}
```

## 🎨 Personalización

### Colores
Modifica en `tailwind.config`:
```javascript
colors: {
  primary: '#2c3e50',
  secondary: '#34495e',
  accent: '#3498db'
}
```

### Animaciones
Añade en `App.vue`:
```css
@keyframes custom {
  from { /* estado inicial */ }
  to { /* estado final */ }
}
```

## 🚀 Deployment

### GitHub Pages

1. Build del proyecto:
```bash
npm run build
```

2. Commit y push:
```bash
git add .
git commit -m "Build para deployment"
git push origin vue-migration
```

3. Deploy automático o manual desde GitHub

El sitio estará disponible en:
```
https://usuario.github.io/seekmake-web/
```

## 📊 Performance

- ⚡ Vite: HMR ultrarápido
- 📦 Bundle size optimizado
- 🖼️ Image optimization
- 🎯 Code splitting automático
- 💨 Minificación

## 🔗 Links

- [Vue 3 Docs](https://vuejs.org/)
- [Vite Docs](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Documentación técnica

## 📝 Notas

- Configurado para `/seekmake-web/` en GitHub Pages
- Dark mode se persiste en localStorage
- Términos y condiciones se guardan
- Botón scroll-to-top aparece después de 300px

## 🤝 Contribuir

1. Branch desde `vue-migration`
2. Haz commits descriptivos
3. Push y abre PR
4. Merge cuando esté listo

## 📄 Licencia

© 2025 3DCC Salamanca - Todos los derechos reservados
