// PBR material recipes shared by the muestrario Visualizer3D and the
// tasador (/instant-quote). Extracted verbatim from Visualizer3D so both
// render filament colors identically.

import * as THREE from 'three';
import type { Acabado, Color, Filamento } from '@/lib/types';
import { esMulticolor, paleta, tipoDe, type MuestraTipo } from '@/lib/color-preview';

// ─── Color helpers ───────────────────────────────────────────────────────

// Lift very dark colors so they don't render as a black blob with no
// visible geometry. Pure black absorbs all diffuse light in PBR — we
// nudge it to a charcoal so the mesh stays readable.
export function liftDark(hex: string): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.l < 0.07) {
    c.setHSL(hsl.h, hsl.s, 0.09);
    return '#' + c.getHexString();
  }
  return hex;
}

export function isCarbonFiber(c: Color, f: Filamento | null): boolean {
  const blob = (
    (c.nombre ?? '') +
    ' ' +
    (f?.nombre ?? '') +
    ' ' +
    (f?.material ?? '')
  ).toLowerCase();
  return /carbono|carbon|fibra|\bcf\b/.test(blob);
}

export function isMarble(c: Color): boolean {
  return /marmol|mármol|marble/i.test(c.nombre ?? '');
}

// ─── UV generation ──────────────────────────────────────────────────────

/**
 * STL files carry no texture coordinates, and without them three.js samples
 * every fragment at texel (0,0) — a textured mesh renders as one flat colour.
 * We build two sets from the bounding box:
 *
 *   uv  (channel 0) — box projection, so surface detail (carbon weave, marble
 *                     speckle) stays undistorted on every face.
 *   uv1 (channel 1) — planar sweep across the two longest axes, so a
 *                     multicolour palette spans the whole piece exactly once.
 *
 * Safe to call repeatedly; an existing `uv` from a 3MF/OBJ is left alone.
 */
export function ensureUVs(geometry: THREE.BufferGeometry): void {
  const pos = geometry.getAttribute('position');
  if (!pos) return;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const nor = geometry.getAttribute('normal');

  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  if (!bb) return;

  const size = new THREE.Vector3();
  bb.getSize(size);
  const s = [size.x || 1, size.y || 1, size.z || 1];
  const min = [bb.min.x, bb.min.y, bb.min.z];
  const p = [0, 0, 0];

  const count = pos.count;
  const needBox = !geometry.getAttribute('uv');
  const box = needBox ? new Float32Array(count * 2) : null;
  const sweep = new Float32Array(count * 2);

  // Longest axis carries the palette, second longest the layer lines.
  const [uAxis, vAxis] = [0, 1, 2].sort((a, b) => s[b] - s[a]);

  for (let i = 0; i < count; i++) {
    p[0] = pos.getX(i);
    p[1] = pos.getY(i);
    p[2] = pos.getZ(i);

    sweep[i * 2] = (p[uAxis] - min[uAxis]) / s[uAxis];
    sweep[i * 2 + 1] = (p[vAxis] - min[vAxis]) / s[vAxis];

    if (box) {
      const nx = Math.abs(nor.getX(i));
      const ny = Math.abs(nor.getY(i));
      const nz = Math.abs(nor.getZ(i));
      // Project along the axis the face points down, using the other two.
      let a: number;
      let b: number;
      if (nx >= ny && nx >= nz) {
        a = 2;
        b = 1;
      } else if (ny >= nx && ny >= nz) {
        a = 0;
        b = 2;
      } else {
        a = 0;
        b = 1;
      }
      box[i * 2] = (p[a] - min[a]) / s[a];
      box[i * 2 + 1] = (p[b] - min[b]) / s[b];
    }
  }

  if (box) geometry.setAttribute('uv', new THREE.BufferAttribute(box, 2));
  geometry.setAttribute('uv1', new THREE.BufferAttribute(sweep, 2));
}

// ─── Procedural textures ────────────────────────────────────────────────

export function makeCarbonFiberTexture(hexBase: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const base = new THREE.Color(hexBase);
  const dark = base.clone().multiplyScalar(0.22);
  const light = base.clone().multiplyScalar(1.0);
  const darkHex = '#' + dark.getHexString();
  const lightHex = '#' + light.getHexString();

  ctx.fillStyle = darkHex;
  ctx.fillRect(0, 0, size, size);

  const cells = 8;
  const cell = size / cells;
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const isHoriz = (row + col) % 2 === 0;
      const x = col * cell;
      const y = row * cell;
      const grad = isHoriz
        ? ctx.createLinearGradient(x, y, x, y + cell)
        : ctx.createLinearGradient(x, y, x + cell, y);
      grad.addColorStop(0, darkHex);
      grad.addColorStop(0.5, lightHex);
      grad.addColorStop(1, darkHex);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, cell, cell);

      // strand sub-streaks
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const steps = 5;
      for (let s = 1; s < steps; s++) {
        const p = (s / steps) * cell;
        if (isHoriz) {
          ctx.moveTo(x, y + p);
          ctx.lineTo(x + cell, y + p);
        } else {
          ctx.moveTo(x + p, y);
          ctx.lineTo(x + p, y + cell);
        }
      }
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeMarbleTexture(hexBase: string): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base
  ctx.fillStyle = hexBase;
  ctx.fillRect(0, 0, size, size);

  // Fine pepper-like specks
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 1.4 + 0.3;
    const a = 0.55 + Math.random() * 0.45;
    ctx.fillStyle = `rgba(15,15,15,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bigger irregular patches (random ellipses for natural look)
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rx = Math.random() * 4 + 1.5;
    const ry = Math.random() * 4 + 1.5;
    const rot = Math.random() * Math.PI;
    ctx.fillStyle = `rgba(20,20,20,${0.35 + Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeMultiColorTexture(
  colors: string[],
  tipo: MuestraTipo = 'bandas'
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const swatches = colors.length > 0 ? colors : ['#cccccc'];

  if (tipo === 'degradado') {
    // Loop back to the first tone so the texture tiles without a seam.
    const loop = [...swatches, swatches[0]];
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    loop.forEach((hex, i) => grad.addColorStop(i / (loop.length - 1), hex));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  } else {
    const step = size / swatches.length;
    for (let i = 0; i < swatches.length; i++) {
      ctx.fillStyle = swatches[i];
      ctx.fillRect(Math.floor(i * step), 0, Math.ceil(step) + 1, size);
    }
  }

  // Faint print layers so the palette reads as an object instead of a decal.
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < size; i += 6) {
    ctx.fillStyle = i % 12 === 0 ? '#ffffff' : '#000000';
    ctx.fillRect(0, i, size, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Rides the planar sweep (uv1) so the palette spans the piece exactly once.
  tex.channel = 1;
  tex.repeat.set(1, 1);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Acabado → material props ────────────────────────────────────────────

export function acabadoMaterialProps(hex: string, acabado: Acabado | null) {
  const color = new THREE.Color(hex);
  switch (acabado) {
    case 'Mate':
      // Baseline clearcoat so dark mattes still pick up light.
      return { color, roughness: 0.92, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.55, transmission: 0 };
    case 'Brillante':
      return { color, roughness: 0.18, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.08, transmission: 0 };
    case 'Metálico':
      return { color, roughness: 0.32, metalness: 0.9, clearcoat: 0.15, clearcoatRoughness: 0.25, transmission: 0 };
    case 'Translucido':
      // Less transparent than v1 — keep some perceived opacity.
      return {
        color,
        roughness: 0.18,
        metalness: 0,
        transmission: 0.5,
        thickness: 3,
        ior: 1.5,
        attenuationDistance: 6,
        attenuationColor: color.clone(),
        clearcoat: 0.2,
        clearcoatRoughness: 0.15
      };
    case 'Fluorescente':
      return {
        color,
        roughness: 0.55,
        metalness: 0,
        emissive: color.clone(),
        emissiveIntensity: 0.55,
        clearcoat: 0.15,
        clearcoatRoughness: 0.3,
        transmission: 0
      };
    case 'Purpurina':
      return { color, roughness: 0.28, metalness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.2, transmission: 0 };
    case 'Textura':
      return { color, roughness: 0.85, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.5, transmission: 0 };
    case 'Flexible':
      return { color, roughness: 0.7, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.35, transmission: 0 };
    default:
      // Plain PLA / PETG — a touch of clearcoat for readability on darks.
      return { color, roughness: 0.55, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.35, transmission: 0 };
  }
}

export interface ColorSelection {
  color: Color;
  filamento: Filamento;
}

// Build a full material update for a given selection. Handles specialty
// materials (carbon fiber, marble) and dark-color lifting.
export function buildMaterialUpdate(
  selected: ColorSelection,
  cache: Map<string, THREE.Texture>
): { props: any; map: THREE.Texture | null } {
  const c = selected.color;
  const f = selected.filamento;

  const hex = liftDark(c.hex);
  const props: any = acabadoMaterialProps(hex, c.acabado);

  const cf = isCarbonFiber(c, f);
  const mb = isMarble(c);
  const multi = esMulticolor(c) ? paleta(c) : [];
  const multiTipo = tipoDe(c);

  let map: THREE.Texture | null = null;
  if (cf) {
    const key = `cf-${hex}`;
    let t = cache.get(key);
    if (!t) {
      t = makeCarbonFiberTexture(hex);
      cache.set(key, t);
    }
    map = t;
    props.color = new THREE.Color(0xffffff); // texture is pre-tinted
    props.roughness = 0.42;
    props.metalness = 0.05;
    props.clearcoat = 0.45;
    props.clearcoatRoughness = 0.18;
  } else if (mb) {
    const key = `mb-${hex}`;
    let t = cache.get(key);
    if (!t) {
      t = makeMarbleTexture(hex);
      cache.set(key, t);
    }
    map = t;
    props.color = new THREE.Color(0xffffff);
    props.roughness = 0.78;
    props.clearcoat = 0.18;
    props.clearcoatRoughness = 0.45;
  } else if (multi.length > 1) {
    const key = `mc-${multiTipo}-${multi.join('|')}`;
    let t = cache.get(key);
    if (!t) {
      t = makeMultiColorTexture(multi, multiTipo);
      cache.set(key, t);
    }
    map = t;
    props.color = new THREE.Color(0xffffff);
    props.roughness = Math.max(props.roughness ?? 0.5, 0.5);
    props.metalness = Math.min(props.metalness ?? 0, 0.08);
  }

  return { props, map };
}

/**
 * Apply a material update in place, resetting every field touched by any
 * acabado so switching e.g. Fluorescente → Mate clears emissive, etc.
 */
export function applyMaterialUpdate(
  mat: THREE.MeshPhysicalMaterial,
  props: any,
  map: THREE.Texture | null
): void {
  mat.color = props.color;
  mat.roughness = props.roughness ?? 0.5;
  mat.metalness = props.metalness ?? 0;
  mat.clearcoat = props.clearcoat ?? 0;
  mat.clearcoatRoughness = props.clearcoatRoughness ?? 0.1;
  mat.transmission = props.transmission ?? 0;
  mat.thickness = props.thickness ?? 0;
  mat.ior = props.ior ?? 1.5;
  mat.attenuationDistance = props.attenuationDistance ?? Infinity;
  mat.attenuationColor = props.attenuationColor ?? new THREE.Color(0xffffff);
  mat.emissive = props.emissive ?? new THREE.Color(0x000000);
  mat.emissiveIntensity = props.emissiveIntensity ?? 0;
  mat.map = map;
  mat.needsUpdate = true;
}
