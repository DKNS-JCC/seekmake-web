// What three's ThreeMFLoader drops from Bambu Studio / OrcaSlicer projects:
// part names and types, the filament each part prints with, and the colors
// painted on single triangles. With it the tasador offers one color per
// filament of the file (a QR's base and code, a painted logo) instead of
// one per mesh, and leaves out the negative parts and modifiers.

import * as THREE from 'three';
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { acabadoMaterialProps } from '@/lib/three/materials';

export interface Parte3mf {
  nombre: string;
  /** normal_part | negative_part | modifier_part | support_blocker | support_enforcer */
  tipo: string;
  extrusor: number;
  /** Painted filament per triangle (0 = the part's own), when painted. */
  pintura: Uint8Array | null;
}

export interface Meta3mf {
  /** One per mesh, in the order ThreeMFLoader builds them. */
  partes: Parte3mf[];
  /** filament_colour of the project, filament N at index N-1. */
  colores: string[];
}

export interface Zona {
  nombre: string;
  /** Color of this filament in the customer's project, if known. */
  sugerido: string | null;
  mat: THREE.MeshPhysicalMaterial;
}

const ENTIDADES: Record<string, string> = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>' };
const xml = (s: string) => s.replace(/&(amp|apos|quot|lt|gt);/g, (_, e) => ENTIDADES[e]);

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/**
 * Filament of one painted triangle. paint_color is the slicer's
 * TriangleSelector tree as hex nibbles, read from the end: a nibble whose two
 * low bits are 0 is a leaf with state = the two high bits, 3 meaning "next
 * nibble + 3"; anything else is a split whose children follow. A split
 * triangle keeps the state most of its leaves have.
 */
export function estadoPintura(code: string): number {
  const votos = new Map<number, number>();
  for (let i = code.length - 1; i >= 0; i--) {
    const n = parseInt(code[i], 16);
    if (n & 3) continue;
    let s = n >> 2;
    if (s === 3) s = parseInt(code[--i] ?? '0', 16) + 3;
    votos.set(s, (votos.get(s) ?? 0) + 1);
  }
  let mejor = 0;
  let max = 0;
  for (const [s, v] of votos) if (v > max) [mejor, max] = [s, v];
  return mejor;
}

/** null when the file carries no slicer metadata (or can't be read). */
export function leer3mf(buf: ArrayBuffer): Meta3mf | null {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(new Uint8Array(buf), {
      filter: (f) => f.name.endsWith('.model') || f.name.endsWith('.config')
    });
  } catch {
    return null;
  }
  const texto = (n: string) => (zip[n] ? strFromU8(zip[n]) : '');
  const cfg = texto('Metadata/model_settings.config');
  const raiz = Object.keys(zip).find((n) => /^3D\/[^/]*\.model$/.test(n));
  if (!cfg || !raiz) return null;

  // Parts per object: <object id><metadata extruder/><part id subtype>…
  const partes = new Map<string, Omit<Parte3mf, 'pintura'>>();
  for (const [, oid, cuerpo] of cfg.matchAll(/<object id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g)) {
    const extObjeto = Number(cuerpo.split('<part')[0].match(/key="extruder" value="(\d+)"/)?.[1] ?? 1);
    for (const [, tag, dentro] of cuerpo.matchAll(/(<part\b[^>]*>)([\s\S]*?)<\/part>/g)) {
      partes.set(`${oid}/${attr(tag, 'id')}`, {
        nombre: xml(dentro.match(/key="name" value="([^"]*)"/)?.[1] ?? ''),
        tipo: attr(tag, 'subtype') ?? 'normal_part',
        extrusor: Number(dentro.match(/key="extruder" value="(\d+)"/)?.[1] ?? extObjeto)
      });
    }
  }

  // Objects of each .model file, parsed on demand: mesh or components.
  const cache = new Map<string, Map<string, string>>();
  const objetos = (fichero: string) => {
    let m = cache.get(fichero);
    if (!m) {
      m = new Map();
      for (const [, tag, cuerpo] of texto(fichero).matchAll(/(<object\b[^>]*>)([\s\S]*?)<\/object>/g)) {
        m.set(attr(tag, 'id') ?? '', cuerpo);
      }
      cache.set(fichero, m);
    }
    return m;
  };

  // Same walk as ThreeMFLoader: build items → components → meshes.
  const salida: Parte3mf[] = [];
  const recorrer = (id: string, fichero: string, raizId: string) => {
    const cuerpo = objetos(fichero).get(id);
    if (cuerpo === undefined) return;
    if (!cuerpo.includes('<mesh')) {
      for (const [c] of cuerpo.matchAll(/<component\b[^>]*>/g)) {
        recorrer(attr(c, 'objectid') ?? '', (attr(c, 'p:path') ?? '').replace(/^\//, '') || fichero, raizId);
      }
      return;
    }
    const p = partes.get(`${raizId}/${id}`) ?? { nombre: '', tipo: 'normal_part', extrusor: 1 };
    let pintura: Uint8Array | null = null;
    if (cuerpo.includes('paint_color=')) {
      const tris = [...cuerpo.matchAll(/<triangle\b[^>]*>/g)];
      pintura = new Uint8Array(tris.length);
      tris.forEach(([t], i) => {
        const code = attr(t, 'paint_color');
        if (code) pintura![i] = estadoPintura(code);
      });
    }
    salida.push({ ...p, pintura });
  };
  for (const [item] of texto(raiz).matchAll(/<item\b[^>]*>/g)) {
    const id = attr(item, 'objectid') ?? '';
    recorrer(id, raiz, id);
  }

  let colores: string[] = [];
  try {
    colores = JSON.parse(texto('Metadata/project_settings.config')).filament_colour ?? [];
  } catch {
    /* older projects: no suggestions */
  }
  return { partes: salida, colores };
}

// "(Unsaved)" is Bambu's placeholder, not a name.
const limpiar = (s: string) =>
  s.replace(/\.(stl|step|stp|obj|3mf|drc)$/i, '').replace(/^\(Unsaved\)$/, '').trim();

/**
 * Groups the meshes into the zones the customer colors and gives each zone
 * one material shared by its meshes (or triangle groups, when painted).
 * A project that uses several filaments gets one zone per filament;
 * otherwise each mesh is a zone, as before.
 */
export function zonificar(meshesIn: THREE.Mesh[], meta: Meta3mf | null): { meshes: THREE.Mesh[]; zonas: Zona[] } {
  const usar = !!meta && meta.partes.length === meshesIn.length;
  const meshes: THREE.Mesh[] = [];
  const partes: (Parte3mf | null)[] = [];
  meshesIn.forEach((m, i) => {
    const p = usar ? meta!.partes[i] : null;
    // Negative parts, modifiers and support painters aren't printed.
    if (p && p.tipo !== 'normal_part') return void m.removeFromParent();
    const tris = (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3;
    if (p?.pintura && p.pintura.length !== tris) p.pintura = null;
    meshes.push(m);
    partes.push(p);
  });

  const extDe = (p: Parte3mf, s: number) => (s === 0 ? p.extrusor : s);
  const usados = new Set<number>();
  partes.forEach((p) => {
    if (!p) return;
    usados.add(p.extrusor);
    p.pintura?.forEach((s) => usados.add(extDe(p, s)));
  });
  const porFilamento = usados.size > 1 && partes.every(Boolean);

  const zonas: Zona[] = [];
  const indice = new Map<string, number>();
  const nombres: string[][] = [];
  const zona = (clave: string, nombre: string, sugerido: string | null) => {
    let i = indice.get(clave);
    if (i === undefined) {
      i = zonas.length;
      indice.set(clave, i);
      zonas.push({
        nombre: '',
        sugerido,
        mat: new THREE.MeshPhysicalMaterial(acabadoMaterialProps('#cccccc', null))
      });
      nombres.push([]);
    }
    if (nombre && !nombres[i].includes(nombre)) nombres[i].push(nombre);
    return i;
  };

  const hechas = new WeakSet<THREE.BufferGeometry>();
  meshes.forEach((m, mi) => {
    const p = partes[mi];
    const nombre = limpiar(p?.nombre || m.name || '');
    if (!porFilamento) {
      m.material = zonas[zona(`m${mi}`, nombre || `Parte ${mi + 1}`, null)].mat;
      return;
    }
    // The part's name goes to its own filament's zone; paint only adds zones.
    const mat = (e: number) =>
      zonas[zona(`e${e}`, e === p!.extrusor ? nombre : '', meta!.colores[e - 1] ?? null)].mat;
    const pintura = p!.pintura;
    const exts = pintura ? [...new Set(Array.from(pintura, (s) => extDe(p!, s)))] : [p!.extrusor];
    if (exts.length === 1) {
      m.material = mat(exts[0]);
      return;
    }
    // Painted: sort the triangles by filament, one draw group per filament.
    const g = m.geometry;
    m.material = exts.map(mat);
    if (hechas.has(g) || !g.index) return; // shared clone already regrouped
    hechas.add(g);
    const idx = g.index.array;
    const orden = new (idx.constructor as Uint32ArrayConstructor)(idx.length);
    let k = 0;
    exts.forEach((e, gi) => {
      const ini = k;
      for (let t = 0; t < pintura!.length; t++) {
        if (extDe(p!, pintura![t]) !== e) continue;
        orden[k++] = idx[t * 3];
        orden[k++] = idx[t * 3 + 1];
        orden[k++] = idx[t * 3 + 2];
      }
      g.addGroup(ini, k - ini, gi);
    });
    g.setIndex(new THREE.BufferAttribute(orden, 1));
  });

  // "Base", "Base + Código", "Filamento 3" for paint with no part of its own.
  const vistos = new Map<string, number>();
  zonas.forEach((z, i) => {
    const n = nombres[i];
    const ext = [...indice].find(([, v]) => v === i)![0];
    let nombre = n.length
      ? n.slice(0, 2).join(' + ') + (n.length > 2 ? ` y ${n.length - 2} más` : '')
      : `Filamento ${ext.slice(1)}`;
    const rep = (vistos.get(nombre) ?? 0) + 1;
    vistos.set(nombre, rep);
    if (rep > 1) nombre += ` (${rep})`;
    z.nombre = nombre;
  });
  return { meshes, zonas };
}

/** sRGB hex → CIELAB, where distance follows what the eye sees. */
function lab(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const [r, g, b] = [n >> 16, n >> 8, n].map((v) => {
    const c = (v & 255) / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  });
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Closest catalog color to a project color (ΔE76): a dark grey finds black, not olive. */
export function colorParecido<T extends { hex: string }>(hex: string, colores: T[]): T | null {
  const [l1, a1, b1] = lab(hex);
  let mejor: T | null = null;
  let min = Infinity;
  for (const c of colores) {
    const [l2, a2, b2] = lab(c.hex);
    const d = (l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2;
    if (d < min) [mejor, min] = [c, d];
  }
  return mejor;
}
