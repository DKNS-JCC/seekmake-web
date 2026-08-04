// Shapes shared by the tasador UI and its helper modules.

import type * as THREE from 'three';
import type { Color } from '@/lib/types';
import type { MeshMetrics } from './geometry';

export interface PiezaConfig {
  filamentoId: string;
  mainColor: Color | null;
  multicolor: boolean;
  extraColors: Color[];
  /** Per-part colors — only meaningful for multi-part 3MF pieces. */
  partColors: (Color | null)[];
  resistenciaId: string;
  detalleId: string;
}

export interface Pieza {
  id: string;
  file: File;
  name: string;
  size: number;
  ext: string;
  metrics: MeshMetrics;
  cantidad: number;
  partNames: string[];
  config: PiezaConfig;
}

export interface ParsedModel {
  root: THREE.Group;
  meshes: THREE.Mesh[];
}

export type QuoteStatus =
  | { kind: 'idle' }
  | { kind: 'sending'; progress: string }
  | { kind: 'ok'; codigo: string }
  | { kind: 'err'; message: string };

/** Distinct colors a piece will print with, per its config. */
export function piezaColors(p: Pieza): Color[] {
  const seen = new Map<string, Color>();
  if (p.partNames.length > 1) {
    for (const c of p.config.partColors) if (c) seen.set(c.id, c);
  } else {
    if (p.config.mainColor) seen.set(p.config.mainColor.id, p.config.mainColor);
    if (p.config.multicolor) {
      for (const c of p.config.extraColors) seen.set(c.id, c);
    }
  }
  return [...seen.values()];
}
