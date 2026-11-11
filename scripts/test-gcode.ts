// Lector de laminados de Orca: gcode suelto y .gcode.3mf.
//
//   npx tsx scripts/test-gcode.ts

import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { duracionH, leerDatosLaminado, leerLaminado } from '../lib/quote/gcode';
import { percentil } from '../lib/quote/estadistica';
import { check, done, eq, section } from './_assert';

const gcode = `; HEADER_BLOCK_START
; estimated printing time (normal mode) = 1h 31m 20s
; total filament weight [g] : 14.41
;TYPE:Outer wall
G1 X1
;TYPE:Support
G1 X2
; CONFIG_BLOCK_START
; filament used [g] = 12.80, 1.61, 0.00
; layer_height = 0.2
; sparse_infill_density = 15%
; filament_type = PLA;PLA;PETG
`;

section('duración');
eq('1h 31m 20s', duracionH('1h 31m 20s'), 1 + 31 / 60 + 20 / 3600, 1e-9);
eq('1d 2h', duracionH('1d 2h'), 26, 1e-9);

section('gcode suelto');
const l = leerLaminado(strToU8(gcode));
eq('gramos', l.pesoG, 14.41);
eq('horas', l.tiempoH, 1.5222, 1e-3);
check('2 filamentos con gasto → multicolor', l.colores === 2);
check('soportes por extrusión', l.conSoportes);
check('capa 0.2, relleno 15 %, PLA', l.alturaCapa === 0.2 && l.relleno === 0.15 && l.material === 'PLA');

section('.gcode.3mf');
const z = zipSync({ 'Metadata/plate_1.gcode': strToU8(gcode.replace(';TYPE:Support', ';TYPE:Inner wall')) });
const l3 = leerLaminado(z);
eq('gramos desde el zip', l3.pesoG, 14.41);
check('sin extrusión de soportes', !l3.conSoportes);

section('laminados reales del taller (scripts/laminados)');
const real = (f: string) => leerDatosLaminado(readFileSync(join(__dirname, 'laminados', f)));
const k1 = real('k1c-calicat.gcode');
check('K1C: impresora', k1.impresora === 'Creality K1C');
eq('K1C: 1 h 31 min 14 s', k1.tiempoH, 1 + 31 / 60 + 14 / 3600, 1e-9);
check('K1C: 5 ranuras con su posición, también las de 0 g', k1.ranuras.length === 5 && k1.ranuras[3].gramos === 1.61);
check('K1C: dos colores usados, blanco y gris oscuro',
  k1.ranuras.filter((r) => r.gramos > 0).map((r) => `${r.tipo} ${r.colorHex}`).join() === 'PLA #FFFFFF,PLA #383838');
check('K1C: ajustes de filamento', k1.ranuras[0].ajustes === 'SUNLU PLA+ - Tuned' && k1.ranuras[0].densidad === 1.23);
check('K1C: 25 cambios', k1.cambios === 25);
// Ranuras 0 y 3: (210 + 536) / 2 × 0,8.
eq('K1C: purga media por cambio', k1.purgaMm3PorCambio!, ((210 + 536) / 2) * 0.8, 1e-9);
const kx = real('kobrax-calicat.gcode');
check('Kobra X: impresora', kx.impresora === 'Anycubic Kobra X');
eq('Kobra X: la última línea de tiempo (1 h 6 min 32 s), no una de progreso', kx.tiempoH, 1 + 6 / 60 + 32 / 3600, 1e-9);
eq('Kobra X: gramos con purga incluida', kx.pesoG, 22.98);
check('sin gcode de gramos u horas: leerDatosLaminado no lanza', leerDatosLaminado(strToU8('; printer_model = X')).tiempoH === 0);

section('percentil');
eq('mediana', percentil([1, 2, 3, 10], 0.5), 2.5);
eq('p90 interpolado', percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9.1);

section('errores');
let falla = false;
try { leerLaminado(strToU8('G1 X1')); } catch { falla = true; }
check('un gcode sin cifras no se inventa nada', falla);

done();
