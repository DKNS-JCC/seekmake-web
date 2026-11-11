// Multicolor 3MF: a QR whose base and code are two parts printed with two
// filaments must reach the tasador as two zones, and so must a single mesh
// with painted triangles.
//
//   npx tsx scripts/test-3mf.ts

import * as THREE from 'three';
import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { colorParecido, estadoPintura, leer3mf, objetosSeparados, zonificar } from '../lib/quote/tresmf';
import { cuerposDe } from '../app/(site)/instant-quote/modelo';
import { check, done, section } from './_assert';

section('paint_color');
check('sin pintar → 0', estadoPintura('') === 0);
check('"4" → filamento 1', estadoPintura('4') === 1);
check('"8" → filamento 2', estadoPintura('8') === 2);
check('"0C" → filamento 3', estadoPintura('0C') === 3);
check('"1C" → filamento 4', estadoPintura('1C') === 4);
check('dividido: gana la mayoría', estadoPintura('8883') === 2);

// Two triangles per part are enough: the walk and the counts are what matter.
const malla = (pintura = ['', '']) =>
  `<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/></vertices><triangles>` +
  pintura.map((p, i) => `<triangle v1="0" v2="${i + 1}" v3="${i + 2}"${p ? ` paint_color="${p}"` : ''}/>`).join('') +
  `</triangles></mesh>`;

function proyecto(objetos: string, config: string): ArrayBuffer {
  const z = zipSync({
    '_rels/.rels': strToU8('<Relationships/>'),
    '3D/3dmodel.model': strToU8(
      `<model><resources><object id="9" type="model"><components>` +
        `<component p:path="/3D/Objects/qr.model" objectid="1"/>` +
        `<component p:path="/3D/Objects/qr.model" objectid="2"/>` +
        `<component p:path="/3D/Objects/qr.model" objectid="3"/>` +
        `</components></object></resources><build><item objectid="9"/></build></model>`
    ),
    '3D/Objects/qr.model': strToU8(`<model><resources>${objetos}</resources></model>`),
    'Metadata/model_settings.config': strToU8(`<config><object id="9" auto_drop="1"><metadata key="extruder" value="1"/>${config}</object></config>`),
    'Metadata/project_settings.config': strToU8(JSON.stringify({ filament_colour: ['#FFFFFF', '#000000', '#FF0000'] }))
  });
  return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
}

const parte = (id: number, nombre: string, ext: number, tipo = 'normal_part') =>
  `<part id="${id}" subtype="${tipo}"><metadata key="name" value="${nombre}"/><metadata key="extruder" value="${ext}"/></part>`;

const fakeMeshes = (n: number) => {
  const root = new THREE.Group();
  return Array.from({ length: n }, () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(g);
    root.add(m);
    return m;
  });
};

section('QR: base y código como partes');
{
  const meta = leer3mf(
    proyecto(
      `<object id="1">${malla()}</object><object id="2">${malla()}</object><object id="3">${malla()}</object>`,
      parte(1, 'Base.stl', 1) + parte(2, 'Codigo', 2) + parte(3, 'Texto &apos;26', 1, 'negative_part')
    )
  );
  check('lee tres partes', meta?.partes.length === 3);
  const { meshes, zonas } = zonificar(fakeMeshes(3), meta);
  check('quita la parte negativa', meshes.length === 2);
  check('dos zonas', zonas.length === 2, String(zonas.length));
  check('nombres del archivo', zonas.map((z) => z.nombre).join('|') === 'Base|Codigo', zonas.map((z) => z.nombre).join('|'));
  check('colores sugeridos', zonas.map((z) => z.sugerido).join('|') === '#FFFFFF|#000000');
  check('cada malla con su zona', meshes[0].material === zonas[0].mat && meshes[1].material === zonas[1].mat);
}

section('Una malla con triángulos pintados');
{
  const meta = leer3mf(
    proyecto(`<object id="1">${malla(['', '0C'])}</object>`, parte(1, 'Logo', 1))
  );
  const { meshes, zonas } = zonificar(fakeMeshes(1), meta);
  check('dos zonas: la parte y el pintado', zonas.map((z) => z.nombre).join('|') === 'Logo|Filamento 3', zonas.map((z) => z.nombre).join('|'));
  const g = meshes[0].geometry;
  check('un grupo por filamento', g.groups.length === 2 && g.groups.every((x) => x.count === 3));
  check('material por grupo', Array.isArray(meshes[0].material) && (meshes[0].material as THREE.Material[])[1] === zonas[1].mat);
}

section('Varias partes con un solo filamento: una zona por parte');
{
  const meta = leer3mf(
    proyecto(`<object id="1">${malla()}</object><object id="2">${malla()}</object>`, parte(1, 'Sol', 1) + parte(2, 'Anilla', 1))
  );
  const { zonas } = zonificar(fakeMeshes(2), meta);
  check('dos zonas sin sugerencia', zonas.length === 2 && zonas.every((z) => z.sugerido === null));
}

section('Sin metadatos');
check('un zip cualquiera → null', leer3mf(new ArrayBuffer(8)) === null);
check('mallas sueltas → una zona por malla', zonificar(fakeMeshes(2), null).zonas.length === 2);

section('Color más parecido del muestrario');
const muestrario = [{ hex: '#F5F5F0' }, { hex: '#000000' }, { hex: '#C0392B' }, { hex: '#636B2F' }, { hex: '#75787B' }];
check('blanco', colorParecido('#FFFFFF', muestrario)?.hex === '#F5F5F0');
check('negro', colorParecido('#000000', muestrario)?.hex === '#000000');
check('gris oscuro → negro, no verde oliva', colorParecido('#383838', muestrario)?.hex === '#000000');

section('Objetos separados o pieza de varios colores (fase 1, parte D)');
{
  const c = (x0: number, x1: number, zonas: number[]) => ({ min: [x0, 0, 0], max: [x1, 10, 10], zonas });
  check('dos cuerpos sueltos, un color cada uno: separados', objetosSeparados([c(0, 10, [0]), c(20, 30, [1])], ['negro', 'blanco']));
  check('se tocan: pieza de varios colores', !objetosSeparados([c(0, 10, [0]), c(10, 30, [1])], ['negro', 'blanco']));
  check('se solapan: pieza de varios colores', !objetosSeparados([c(0, 15, [0]), c(10, 30, [1])], ['negro', 'blanco']));
  check('un cuerpo con dos colores: varios colores', !objetosSeparados([c(0, 10, [0, 1]), c(20, 30, [1])], ['negro', 'blanco']));
  check('mismo color tocándose y otro suelto: separados',
    objetosSeparados([c(0, 10, [0]), c(10, 20, [1]), c(40, 50, [2])], ['negro', 'negro', 'blanco']));
  check('una zona sin color: en la duda, varios colores', !objetosSeparados([c(0, 10, [0]), c(20, 30, [1])], ['negro', null]));
  check('un solo cuerpo nunca es «separados»', !objetosSeparados([c(0, 10, [0])], ['negro']));
}

section('Cuerpos de un archivo con dos partes (cajas de three.js)');
{
  const caja = (x: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
    m.position.x = x;
    return m;
  };
  const cuerpos = (x2: number) => {
    const root = new THREE.Group();
    const ms = [caja(0), caja(x2)];
    root.add(...ms);
    const { meshes, zonas } = zonificar(ms, null);
    root.updateMatrixWorld(true);
    return cuerposDe({ root, meshes, zonas });
  };
  const sueltas = cuerpos(30);
  check('una zona por cuerpo', sueltas.length === 2 && sueltas[0].zonas.join() === '0' && sueltas[1].zonas.join() === '1');
  check('separadas 20 mm y de dos colores: objetos separados', objetosSeparados(sueltas, ['a', 'b']));
  check('pegadas (cara con cara): pieza de varios colores', !objetosSeparados(cuerpos(10), ['a', 'b']));
}

done();
