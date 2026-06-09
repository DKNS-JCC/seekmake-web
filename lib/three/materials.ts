// PBR material recipes shared by the muestrario Visualizer3D and the
// tasador (/instant-quote). Extracted verbatim from Visualizer3D so both
// render filament colors identically.

import * as THREE from 'three';
import type { Acabado, Color, Filamento } from '@/lib/types';

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
