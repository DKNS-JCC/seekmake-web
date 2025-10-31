# 3DCC Web App - Vue.js Migration

Proyecto de migración de la página web 3DCC a Vue.js con soporte para GitHub Pages.

## Instalación

```bash
npm install
```

## Desarrollo

Para iniciar el servidor de desarrollo:

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:5173`

## Build

Para crear la versión optimizada para producción:

```bash
npm run build
```

Los archivos compilados estarán en la carpeta `dist/`

## Configuración para GitHub Pages

Este proyecto está configurado para desplegarse en GitHub Pages con la ruta base `/seekmake-web/`.

El archivo `vite.config.js` contiene la configuración necesaria para que funcione correctamente.

## Estructura del Proyecto

```
vue-app/
├── src/
│   ├── components/    (Componentes Vue)
│   ├── pages/         (Páginas principales)
│   ├── App.vue        (Componente raíz)
│   └── main.js        (Punto de entrada)
├── index.html
├── vite.config.js
└── package.json
```

## Próximos Pasos

- [ ] Crear componentes principales (Header, Footer, Navigation)
- [ ] Migrar estilos CSS
- [ ] Implementar páginas (Inicio, Muestrario, Enlaces, etc.)
- [ ] Configurar rutas con Vue Router
- [ ] Optimizar assets
