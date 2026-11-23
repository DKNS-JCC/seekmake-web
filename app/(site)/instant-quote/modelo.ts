// Model files → three.js scene objects for the tasador viewer. No React here.

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ensureUVs } from '@/lib/three/materials';
import { leer3mf, zonificar, type Cuerpo, type Meta3mf } from '@/lib/quote/tresmf';
import { objetosDe } from '@/lib/quote/geometry';
import type { ParsedModel } from '@/lib/quote/types';

export const MAX_FILE_MB = 50;
export const MAX_FILES = 5;
export const ACCEPT = '.stl,.3mf,.obj';

export function disposeModel(model: ParsedModel): void {
  model.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else if (m) (m as THREE.Material).dispose();
    }
  });
}

/** Center on the plate: x/z centered, base resting on y=0. */
export function centrarEnCama(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  box.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
}

/**
 * A 3MF with several plates (or objects scattered far apart) comes laid out
 * wider than one bed. If its objects are separate (no two touch), set them
 * side by side in rows no wider than the bed, so the viewer shows them
 * together and the price sees them as they would really print. An assembly
 * whose objects touch is left exactly as it came.
 */
export function juntarObjetos(root: THREE.Object3D, camaMm: number, hueco = 5): void {
  root.updateMatrixWorld(true);
  const items = objetosDe(root)
    .map((o) => ({ o, b: new THREE.Box3().setFromObject(o) }))
    .filter((x) => !x.b.isEmpty());
  if (items.length < 2) return;
  const total = new THREE.Box3();
  for (const x of items) total.union(x.b);
  if (total.max.x - total.min.x <= camaMm && total.max.y - total.min.y <= camaMm) return;
  const tocan = (a: THREE.Box3, b: THREE.Box3) =>
    a.min.x < b.max.x + 0.5 && b.min.x < a.max.x + 0.5 && a.min.y < b.max.y + 0.5 && b.min.y < a.max.y + 0.5;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) if (tocan(items[i].b, items[j].b)) return;

  // ponytail: shelf packing, rows by depth; good enough to look like one plate.
  const ancho = Math.max(camaMm, ...items.map((x) => x.b.max.x - x.b.min.x));
  items.sort((a, b) => b.b.max.y - b.b.min.y - (a.b.max.y - a.b.min.y));
  let x = 0, y = 0, fila = 0;
  for (const it of items) {
    const w = it.b.max.x - it.b.min.x;
    const d = it.b.max.y - it.b.min.y;
    if (x > 0 && x + w > ancho) {
      x = 0;
      y += fila + hueco;
      fila = 0;
    }
    it.o.position.x += x - it.b.min.x;
    it.o.position.y += y - it.b.min.y;
    x += w + hueco;
    fila = Math.max(fila, d);
  }
  root.updateMatrixWorld(true);
}

export async function parseModel(f: File, ext: string, camaMm = 220): Promise<ParsedModel> {
  const root = new THREE.Group();
  let meta: Meta3mf | null = null;
  if (ext === 'stl') {
    const geometry = new STLLoader().parse(await f.arrayBuffer());
    geometry.computeVertexNormals();
    root.add(new THREE.Mesh(geometry));
  } else if (ext === '3mf') {
    const buf = await f.arrayBuffer();
    const grupo = new ThreeMFLoader().parse(buf);
    grupo.userData.objetos = true; // its children are the build items
    root.add(grupo);
    meta = leer3mf(buf);
    juntarObjetos(root, camaMm); // still Z-up: x/y is the plate
  } else {
    root.add(new OBJLoader().parse(await f.text()));
  }
  // STL/3MF are Z-up by convention; rotate into three.js Y-up.
  if (ext !== 'obj') root.rotation.x = -Math.PI / 2;

  const todas: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) todas.push(mesh);
  });
  for (const mesh of todas) {
    const old = mesh.material;
    if (Array.isArray(old)) old.forEach((m) => m.dispose());
    else if (old) (old as THREE.Material).dispose();
  }
  // One material per zone (part, or filament of a multicolor 3MF).
  const { meshes, zonas } = zonificar(todas, meta);

  // Normals averaged across sharp edges paint gradients and glints on flat
  // faces; split them at 30° so flats stay flat and curves stay smooth.
  // ponytail: ~0.8 s per 400k triangles on upload; a worker if it bites.
  const lisas = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  for (const mesh of meshes) {
    let g = lisas.get(mesh.geometry);
    if (!g) {
      g = toCreasedNormals(mesh.geometry, Math.PI / 6);
      if (g !== mesh.geometry) mesh.geometry.dispose();
      ensureUVs(g);
      lisas.set(mesh.geometry, g);
    }
    mesh.geometry = g;
  }

  centrarEnCama(root);
  return { root, meshes, zonas };
}

/**
 * Each printed body with its bounding box and the zones (colors) it carries,
 * for objetosSeparados. Measured once on upload: a rescale keeps which boxes
 * touch.
 */
export function cuerposDe(model: ParsedModel): Cuerpo[] {
  const mats = model.zonas.map((z) => z.mat);
  return model.meshes.map((mesh) => {
    const box = new THREE.Box3().setFromObject(mesh);
    const m = mesh.material;
    const zonas = (Array.isArray(m) ? m : [m]).map((x) => mats.indexOf(x as THREE.MeshPhysicalMaterial)).filter((i) => i >= 0);
    return { min: box.min.toArray(), max: box.max.toArray(), zonas: [...new Set(zonas)] };
  });
}
