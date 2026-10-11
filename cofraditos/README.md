# Cofraditos · prototipo de configurador

Página independiente (un solo `index.html`, sin compilar ni servidor) para diseñar cofraditos en 3D,
pedirlos por WhatsApp y generar los archivos de impresión. No depende del resto de la web: se puede
mover a otro repo o subir tal cual a cualquier hosting estático (Netlify, GitHub Pages, una carpeta de la web…).

## Probarlo en local

Hace falta servirlo por http, porque los módulos ES no cargan desde `file://`:

```bash
npx serve cofraditos      # o: python3 -m http.server -d cofraditos
```

## Qué hace

- **Cliente**: elige el color del capirote, la forma del capirote (normal, alto o capucha), el color de la túnica, el cíngulo (sí/no y color), el formato (figura de 3, 4,5 o 6 cm, imán, pin, capuchón de lápiz o llavero), la cantidad y la entrega. El modelo 3D se actualiza al momento y el precio se calcula solo.
- **Pedido**: el botón abre WhatsApp con el resumen y un código del tipo `COF1.roj.neg.roj.normal.figura.p.25`. No hay pasarela de pago.
- **Taller** (botón arriba a la derecha): pega el mensaje o el código y descarga un `.zip` con:
  - `bandeja-N_XXuds.3mf`: proyecto con una pieza por color y todas las copias colocadas en la bandeja elegida (formato de proyecto de PrusaSlicer, con el filamento asignado a cada pieza);
  - `stl_una_figura/`: una STL por color de una sola figura, como plan B para cualquier laminador;
  - `LEEME.txt`: tabla de filamentos (F1, F2…), medidas, bandejas y montaje (imán 10×2 mm, broche, anilla).

La geometría se genera en el navegador con three.js, y la misma malla sirve para la vista previa y para imprimir.

## Dónde se cambian las cosas

Todo está al principio del `<script type="module">` de `index.html`:

| Qué | Constante |
|---|---|
| Número de WhatsApp del taller, URL pública, envío, precios por tramo | `CONFIG` |
| Colores disponibles (nombre y hex) | `COLORES` |
| Formatos y su recargo | `FORMATOS` |
| Tamaños de la figura | `TAMANOS` |
| Colores por cofradía (aproximados: confirmarlos con cada una) | `COFRADIAS` |
| Impresoras / tamaño de bandeja | `BANDEJAS` |
| Hueco del lápiz | `HUECO` |
| Forma de la figura | `perfilTunica`, `perfilArriba`, `construir` |

## Pendiente

- Probar el 3MF en vuestro laminador. Su estructura y sus mallas están validadas (piezas cerradas, bien orientadas, lib3mf lo lee sin errores), pero aún no se ha abierto en PrusaSlicer, OrcaSlicer ni Bambu Studio.
- Imprimir una prueba del tamaño mini (3 cm) para ajustar ojos, cíngulo y holguras.
- Poner el número de WhatsApp en `CONFIG.whatsapp`.
