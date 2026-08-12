// Guards the fix for "multicolour filaments render flat black in 3D".
//
// STL files carry no UVs. Without them three.js samples every fragment at
// texel (0,0), so a banded palette collapses to its first colour. ensureUVs
// must produce a sweep that spans the model's longest axis.
//
//   npx tsx scripts/test-uv-mapping.ts

import * as THREE from 'three';
import { buildMaterialUpdate, ensureUVs } from '../lib/three/materials';
import type { Color, Filamento } from '../lib/types';
import { check, done, section } from './_assert';

// Minimal canvas stub so the texture builders run outside the browser.
const ctxStub = {
  fillStyle: '',
  globalAlpha: 1,
  fillRect: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} })
};
(globalThis as any).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub })
};

/**
 * A nameplate-ish slab: long in X, medium in Y, thin in Z — like the STL in
 * the report. BoxGeometry ships UVs, so drop them to match what STLLoader
 * actually hands us.
 */
function slab(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(80, 45, 4).toNonIndexed();
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  g.center();
  return g;
}

function range(attr: THREE.BufferAttribute, offset: number) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < attr.count; i++) {
    const v = offset === 0 ? attr.getX(i) : attr.getY(i);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return { lo, hi };
}

section('ensureUVs');
const geo = slab();
check('geometry starts without uv (as an STL does)', !geo.getAttribute('uv'));

ensureUVs(geo);

const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
const uv1 = geo.getAttribute('uv1') as THREE.BufferAttribute;
const pos = geo.getAttribute('position');

check('box-projection uv created', !!uv);
check('sweep uv1 created', !!uv1);
check('uv1 covers every vertex', uv1?.count === pos.count, `${uv1?.count} vs ${pos.count}`);

const u = range(uv1, 0);
const v = range(uv1, 1);
check('sweep U spans the full 0..1 range', u.lo < 0.001 && u.hi > 0.999, `${u.lo}..${u.hi}`);
check('sweep V spans the full 0..1 range', v.lo < 0.001 && v.hi > 0.999, `${v.lo}..${v.hi}`);

const box = range(uv, 0);
check('box U stays inside 0..1', box.lo >= -0.001 && box.hi <= 1.001, `${box.lo}..${box.hi}`);

// The sweep must follow the longest axis (X here), so the palette runs along
// the plate rather than across its 4 mm thickness.
let alignedWithX = true;
for (let i = 0; i < pos.count; i++) {
  const expected = (pos.getX(i) + 40) / 80;
  if (Math.abs(uv1.getX(i) - expected) > 0.001) {
    alignedWithX = false;
    break;
  }
}
check('sweep follows the longest axis', alignedWithX);

// What the shader will actually do: sample a 2-colour band texture.
section('\nband sampling (2 tones, repeat 1x1)');
const seen = new Set<number>();
for (let i = 0; i < pos.count; i++) {
  seen.add(uv1.getX(i) < 0.5 ? 0 : 1);
}
check('both tones are reached', seen.size === 2, `reached ${[...seen].join(',')}`);

// Regression: with no uv1 the shader falls back to (0,0) — one tone only.
const bare = slab();
check('without ensureUVs there is no uv1 (the old bug)', !bare.getAttribute('uv1'));

// A 3MF/OBJ that already carries authored UVs must keep them.
section('\nauthored UVs (3MF / OBJ)');
const authored = new THREE.BoxGeometry(80, 45, 4).toNonIndexed();
authored.computeVertexNormals();
const original = (authored.getAttribute('uv') as THREE.BufferAttribute).clone();
ensureUVs(authored);
const kept = authored.getAttribute('uv') as THREE.BufferAttribute;
let same = kept.count === original.count;
for (let i = 0; same && i < original.count; i++) {
  if (kept.getX(i) !== original.getX(i) || kept.getY(i) !== original.getY(i)) same = false;
}
check('existing uv left untouched', same);
check('uv1 still added alongside', !!authored.getAttribute('uv1'));

// End-to-end wiring: the material the visualizers actually apply.
section('\nbuildMaterialUpdate');

const pla: Filamento = {
  id: 'f1',
  material: 'PLA',
  nombre: 'PLA',
  descripcion: '',
  orden: 0
};
const negroAzul: Color = {
  id: 'c1',
  filamento_id: 'f1',
  nombre: 'Negro + Azul',
  hex: '#111827',
  muestra_colores: ['#111827', '#2563eb'],
  muestra_tipo: 'bandas',
  texto: 'white',
  acabado: null,
  combina_con: [],
  orden: 0
};

const cache = new Map<string, THREE.Texture>();
const banded = buildMaterialUpdate({ color: negroAzul, filamento: pla }, cache);
check('multicolour gets a texture', !!banded.map);
check('texture rides uv1 (channel 1)', banded.map?.channel === 1, `channel ${banded.map?.channel}`);
check(
  'texture spans the piece once',
  banded.map?.repeat.x === 1 && banded.map?.repeat.y === 1,
  `${banded.map?.repeat.x}x${banded.map?.repeat.y}`
);
check(
  'base colour is white so the texture is not tinted dark',
  banded.props.color.getHex() === 0xffffff,
  '#' + banded.props.color.getHexString()
);

const rainbow: Color = {
  ...negroAzul,
  id: 'c2',
  nombre: 'Rainbow',
  hex: '#ef4444',
  muestra_colores: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'],
  muestra_tipo: 'degradado'
};
const grad = buildMaterialUpdate({ color: rainbow, filamento: pla }, cache);
check('gradient gets its own texture', !!grad.map && grad.map !== banded.map);

// Solid colours must not pick up a leftover texture.
const negro: Color = {
  ...negroAzul,
  id: 'c3',
  nombre: 'Negro',
  muestra_colores: [],
  muestra_tipo: 'solido'
};
const plain = buildMaterialUpdate({ color: negro, filamento: pla }, cache);
check('solid colour gets no texture', plain.map === null);

done();
