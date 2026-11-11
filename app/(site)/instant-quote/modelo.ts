// Model files → three.js scene objects for the tasador viewer. No React here.

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ensureUVs } from '@/lib/three/materials';
import { leer3mf, zonificar, type Cuerpo, type Meta3mf } from '@/lib/quote/tresmf';
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

export async function parseModel(f: File, ext: string): Promise<ParsedModel> {
  const root = new THREE.Group();
  let meta: Meta3mf | null = null;
  if (ext === 'stl') {
    const geometry = new STLLoader().parse(await f.arrayBuffer());
    geometry.computeVertexNormals();
    root.add(new THREE.Mesh(geometry));
  } else if (ext === '3mf') {
    const buf = await f.arrayBuffer();
    root.add(new ThreeMFLoader().parse(buf));
    meta = leer3mf(buf);
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
