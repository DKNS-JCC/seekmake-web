# Fase 6 — PWA y retirada de la Calculadora

**Estado:** pasos 1 y 2 hechos en local (11 nov. 2026; sin desplegar ni probar la instalación); pasos 3 a 6 pendientes, son del taller · **Tamaño:** pequeña · **Modelo:** Haiku
**Depende de:** fases 3, 4 y 5 · **Índice:** [plan](../plan-calculadora-en-web.md)

## Objetivo

Que el panel se instale como una app en el móvil y en el PC, y dejar de
publicar la Calculadora.

## Qué es aquí una PWA

La misma web, con un icono propio que abre `/admin` a pantalla completa,
sin barra del navegador. No hay tienda, ni APK, ni actualizaciones: cada vez
que se despliega la web, la app ya está al día. Necesita conexión, igual que
la Calculadora hoy.

## Contexto

- Ya hay manifest e iconos: `public/icons/site.webmanifest`,
  `android-chrome-192x192.png`, `android-chrome-512x512.png`, enlazados en
  `app/layout.tsx`. Ese manifest es el de la web pública.
- El sitio es estático (`output: 'export'`) en GitHub Pages.

## Pasos

1. Manifest propio del panel (`public/icons/admin.webmanifest`): nombre
   «3DCC Taller», `start_url` y `scope` en `/admin/`, `display: standalone`,
   mismos iconos, colores del panel.
2. Enlazarlo solo en `app/admin/layout.tsx` (metadata `manifest`).
3. Probar la instalación en el móvil Android (Chrome → «Instalar app») y en
   Windows (Chrome o Edge → icono de instalar). Si algún navegador exige
   service worker para ofrecer la instalación, añadir uno mínimo que no
   cachee nada; si no, no hace falta.
4. Mantener la sesión iniciada: comprobar que el login del admin no caduca
   al cerrar la app.
5. Dos semanas usando las dos en paralelo.
6. Retirada: desinstalar la Calculadora, desactivar el workflow
   `release-apk.yml` y archivar el repo `Calculadora`. No hace falta publicar
   una versión de despedida: solo la usa el taller.

## Hecho cuando

- El panel abre desde un icono en el móvil y en el PC.
- Dos semanas sin abrir la Calculadora.

## No hacer

- No añadir modo sin conexión ni caché de datos.
- No envolver la web en Capacitor ni Electron.
