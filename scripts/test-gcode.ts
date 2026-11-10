// Lector de laminados de Orca: gcode suelto y .gcode.3mf.
//
//   npx tsx scripts/test-gcode.ts

import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { duracionH, leerLaminado } from '../lib/quote/gcode';
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

section('percentil');
eq('mediana', percentil([1, 2, 3, 10], 0.5), 2.5);
eq('p90 interpolado', percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9.1);

section('errores');
let falla = false;
try { leerLaminado(strToU8('G1 X1')); } catch { falla = true; }
check('un gcode sin cifras no se inventa nada', falla);

done();
