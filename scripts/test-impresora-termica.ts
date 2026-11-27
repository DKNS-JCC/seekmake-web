// Protocolo de la impresora térmica MXW01 (lib/impresora-termica.ts) frente a
// lo que se capturó de la impresora real.
//
//   npx tsx scripts/test-impresora-termica.ts

import { ANCHO, crc8, empaquetar, orden } from '../lib/impresora-termica';
import { cuidados, partirLineas } from '../app/admin/presupuestos/ticket';
import { check, done, section } from './_assert';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

section('Órdenes');
check('CRC-8/SMBUS da su valor de referencia', crc8(new TextEncoder().encode('123456789')) === 0xf4);
check('A1 (estado) igual que la que respondió la impresora', hex(orden(0xa1, [0])) === '22 21 a1 00 01 00 00 00 ff', hex(orden(0xa1, [0])));
check('A9 lleva el nº de filas en little-endian', hex(orden(0xa9, [300 & 0xff, 300 >> 8, 0x30, 0])).startsWith('22 21 a9 00 04 00 2c 01 30 00'));

section('Imagen');
const rgba = new Uint8Array(ANCHO * 2 * 4).fill(255);
const negro = (x: number, y: number) => rgba.set([0, 0, 0, 255], (y * ANCHO + x) * 4);
negro(0, 0);
negro(9, 0);
negro(383, 1);
const { filas, datos } = empaquetar(rgba, 2);
check('rellena hasta 90 filas', filas === 90 && datos.length === 90 * 48);
check('píxel 0 → bit 0 del byte 0', datos[0] === 0b1);
check('píxel 9 → bit 1 del byte 1', datos[1] === 0b10);
check('último píxel de la fila 2 → bit 7 del byte 95', datos[48 + 47] === 0x80);
check('el resto, en blanco', datos.reduce((s, b) => s + b, 0) === 1 + 2 + 0x80);

section('Cuidados por material (solo técnicos)');
const mats = (m: (string | null)[]) => cuidados(m).map((c) => c.material).join(',');
check('PLA y PETG no llevan nada', mats(['PLA', 'PETG', null]) === '');
check('ASA avisa de no usar acetona', /nunca con acetona/.test(cuidados(['ASA'])[0]?.texto ?? ''));
check('«TPU, PLA» → solo TPU', mats(['TPU, PLA']) === 'TPU');
check('PA12-CF → nailon y fibra', mats(['PA12-CF']) === 'Nailon,Con fibra');
check('sin repetir aunque haya varias piezas', mats(['ASA', 'asa', 'ASA']) === 'ASA');
check('PLA-CF no cuenta como PLA, pero sí como fibra', mats(['PLA-CF']) === 'Con fibra');
check('«PC» no salta con PETG ni PCTG', mats(['PETG', 'PCTG']) === '');

section('Nombres largos en el ticket');
const medir = (t: string) => t.length * 10; // 10 px por letra
const ls = partirLineas('soporte_pared_estanteria_final_v3', 100, medir);
check('una palabra sin espacios se corta por letras', ls.every((l) => medir(l) <= 100) && ls.join('') === 'soporte_pared_estanteria_final_v3', ls.join('|'));
check('las palabras normales siguen partiendo por espacios', partirLineas('caja de tornillos', 100, medir).join('|') === 'caja de|tornillos');
check('la palabra larga empieza línea nueva', partirLineas('2 × abcdefghijklmno', 100, medir).join('|') === '2 ×|abcdefghij|klmno');

done();
