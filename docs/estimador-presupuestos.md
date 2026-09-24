# Estimador de presupuestos — estudio y solución

**Problema:** el tasador de la web daba precios muy distintos a los reales
(OrcaSlicer + Calculadora). Si se queda corto, se pierde margen; si se pasa,
hay que decirle al cliente que "la web está mal".

## 1. Diagnóstico

La Calculadora fija el precio con los **gramos y horas reales del laminador**:

```
precio = (gramos × €/kg + horas × coste máquina) × (markup 2,3 + error 0,25)
         + post-procesado · mínimo · redondeo al alza a 0,05 €
```

La web, en cambio, *adivinaba* gramos y horas con fórmulas de volumen:

- peso = volumen × densidad × (0,35 + 0,65 × relleno) — ignora la geometría
  (una pieza fina es casi toda pared; un bloque, casi todo relleno);
- tiempo = gramos ÷ 18 g/h + 6 s por capa — 18 g/h es la mitad o un tercio de
  lo que hace la K1 SE, y no existe el tiempo mínimo de capa (12 s en el
  perfil CR-PLA), que domina en piezas pequeñas;
- soportes a 45° hasta la cama, sin orientar la pieza: el STL se presupuestaba
  tal cual lo exportó el cliente;
- N copias = N × una copia (en Orca, 10 piezas en una cama tardan ~3×, no 10×);
- además, otra fórmula de dinero: €/h de 0,30 frente a los 0,80 €/h
  efectivos de la Calculadora, +1,50 € de preparación, mínimo 5 €.

**Medición** contra un laminador de referencia (41 piezas reales: Benchy, 15
figuras, 17 piezas mecánicas Voron, 11 geometrías de control):

| | error medio peso | error medio tiempo | peor caso |
|---|---|---|---|
| Estimador antiguo (0,20 mm, 15 %) | **38 %** | **80 %** | bloque 100×100×50: +141 % peso, +750 % tiempo |

## 2. Cómo lo hacen otros y opciones

| Opción | Quién | Precisión | Coste / pega |
|---|---|---|---|
| Fórmulas de volumen/área | JLC3DP, calculadoras online | baja (±30-80 %) | lo que teníamos |
| Modelos entrenados con histórico | Xometry | alta con miles de pedidos | no hay datos suficientes |
| Laminador real en servidor (Orca CLI) | Printago, PocketSlice, print farms | exacta (mismo motor y perfil) | necesita un servidor (Supabase Edge = 2 s de CPU, no sirve) |
| Laminador compilado a WASM en el navegador | cura-wasm (archivado 2023, AGPL), Kiri:Moto | buena | 10-20 MB, motor distinto a Orca, licencia |
| **Mini-laminado por capas propio en el navegador** | — | **±3-4 %** frente al laminador | ninguno: estático, gratis, 1-8 s |

Se eligió la última: cabe en la web estática, no cuesta nada, es rápida y se
calibra contra tus datos. La opción "Orca en servidor" queda como paso 2
opcional (sección 7).

## 3. Qué hace ahora la web

`lib/quote/estimador/` (en un Web Worker, sin bloquear la página):

1. **Orientación automática** (`orientar.ts`): candidatas = caras planas grandes
   apoyadas en la cama + 6 ejes + la original; prefiltro geométrico y análisis
   ligero de las mejores; gana la más barata con tus tarifas. Se respeta la del
   cliente si cuesta ≤ 3 % más. El visor muestra la pieza tal como se imprimirá
   y el cliente puede volver a su orientación con un clic.
2. **Análisis por capas** (`analizar.ts`): rayos verticales por una rejilla XY
   (intervalos sólidos de cada columna) + corte exacto de triángulos por capa:
   - área, anillo de paredes (distancia al borde), huecos estrechos (gap fill),
     regiones de relleno y las menores de 15 mm² (sólidas, como Orca);
   - pieles superior/inferior por distancia vertical a la superficie, capa
     superior, puentes, puentes internos gruesos;
   - contornos: longitud, bucles, esquinas (con detección de arcos G2/G3) y
     voladizos por inclinación;
   - soportes bajo caras con menos de 30° respecto a la horizontal, más su
     contorno.
3. **Tiempo tipo laminador** (`evaluar.ts`): cada tramo = longitud ÷ velocidad +
   aceleración perdida en arranques y esquinas; velocidades limitadas por el
   caudal máximo del filamento; tiempo mínimo de capa por material; voladizos
   lentos; varias copias comparten capa.
4. **Perfil** (`perfil.ts`): el de Orca «0.20mm Standard @Creality K1 SE_CFS-C»
   y filamentos CR-PLA/PETG/ASA/TPU. Cada calidad puede llevar su perfil
   (p. ej. «Alto detalle» = Orca Fine: 0,12 mm y 3 paredes).
5. **Lotes**: las unidades se reparten en camas de 220×220; el precio por
   unidad baja al agruparlas, como en Orca.

### Precisión frente al laminador de referencia

PrusaSlicer 2.7 configurado con los valores del perfil Orca de la K1 SE
(Orca no se puede ejecutar en este entorno; Prusa es su antecesor y comparte
estimador de tiempos):

| | error medio peso | p90 | error medio tiempo | p90 |
|---|---|---|---|---|
| Nuevo, 7 configuraciones (0,12/0,20/0,28 mm; 10-100 % relleno), 273 casos | **2,9 %** | 6,7 % | **3,9 %** | 8,0 % |
| Con soportes normales | 3,1 % | | 3,5 % | |
| Con soportes en árbol | 5,7 % | | 5,5 % | |
| 10 copias de un cubo de 20 mm | | | 60 min (ref. 55; antes 200) | |

Orientación: partiendo de cada pieza girada al azar, las mecánicas recuperan
su orientación buena (±4 % de coste) y en figuras suele encontrar una más
barata que la de referencia.

## 4. Precio igual que la Calculadora

`lib/quote/pricing.ts`, modo `calculadora` (por defecto):

- €/g = €/kg ÷ 1000 × (markup + error); €/h = (kW × €/kWh + (impresora +
  mantenimiento) ÷ vida útil) × (markup + error). Con los valores por defecto de
  la Calculadora: PLA 0,051 €/g y 0,804 €/h.
- Diseño/preparación no se cobra (0 €), mínimo 7 €, redondeo al alza a 0,05 €,
  sin descuentos por cantidad (el lote ya se calcula por camas).
- Post-procesado opcional por pieza con soportes (0 € = «Limpio»).
- Impresora, electricidad y €/kg se copian solos de la Calculadora al
  guardar su configuración (trigger en `empresa_docs`); en /admin/tarifas se
  ven de solo lectura. Allí se ajustan markup, error, mínimo, paredes por
  calidad, perfil de impresora, tipo de soporte, orientación y correcciones.

El servidor (`submit-quote`) recalcula el dinero con la misma fórmula; como no
puede laminar (2 s de CPU), acepta los gramos/horas del navegador solo si son
plausibles para el volumen de la pieza y si no usa la estimación antigua.
`scripts/test-paridad-servidor.ts` carga el código real de la función y
comprueba que cliente y servidor coinciden al céntimo.

## 5. Calibración con tus datos reales

La referencia es PrusaSlicer, no tu Orca: puede quedar un sesgo de unos pocos
puntos. Dos formas de eliminarlo:

1. **Automática** (recomendada): cada presupuesto web que conviertes en pedido
   en la Calculadora guarda los gramos/horas reales. La función
   `tasador_calibracion()` (migración 0024) los cruza y el panel «Precisión del
   tasador» de /admin/tarifas propone la corrección; con ≥ 3 pedidos, un clic
   en «Aplicar corrección» y Guardar.
2. **Manual**: lamina unas cuantas piezas en Orca, anota gramos y minutos en
   `orca.csv` y ejecuta `npx tsx scripts/benchmark-estimador.ts <carpeta>`.

## 6. Puesta en marcha

Automatizado al llegar a `main`:

- **Deploy Supabase** (`.github/workflows/deploy-supabase.yml`): aplica las
  migraciones *nuevas* (aquí la 0024: modo Calculadora, mínimo 7 €, sin
  preparación ni descuentos, copia automática de costes y función de
  calibración) y despliega las funciones cambiadas (`submit-quote`). Necesita
  dos secretos del repositorio: `SUPABASE_ACCESS_TOKEN` y
  `SUPABASE_DB_PASSWORD`. Después relanza la publicación de la web.
- **Deploy to GitHub Pages**: antes de publicar comprueba que `submit-quote`
  ya es la versión nueva (cabecera `x-tasador-version`); si no, no publica y
  la web anterior sigue en marcha. Así nunca conviven web nueva y servidor
  viejo (el cliente vería un precio y le llegaría otro).

A mano (equivalente, desde tu equipo):
`node scripts/apply-migration.mjs supabase/migrations/0024_tasador_calculadora.sql`
y `supabase functions deploy submit-quote`; la web se publica en la
siguiente pasada programada (≤ 15 min).

## 7. Límites conocidos y siguientes pasos

- **Kobra X:** la web simula la K1 SE; los pedidos de la Kobra X no sirven
  para calibrar (el panel los excluye por defecto).
- **Multicolor con CFS:** se mantiene el recargo porcentual; no se modelan las
  purgas ni los ~2 min por cambio de color.
- **Soportes en árbol:** menos predecibles (±6 %).
- **Paso 2 opcional — Orca real en servidor:** contenedor con OrcaSlicer CLI
  (`--orient --slice 0` + tus perfiles exportados) en un mini-PC en casa o en
  Google Cloud Run (el nivel gratuito, 180 000 vCPU·s al mes, sobra), llamado
  por una Edge Function al recibir la solicitud: te daría gramos/horas exactos
  en el correo y en la Calculadora sin cambiar el precio instantáneo.
