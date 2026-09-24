// Shapes shared by the tasador UI and its helper modules.

import type * as THREE from 'three';
import type { Color } from '@/lib/types';
import type { MeshMetrics } from './geometry';
import type { Analisis } from './estimador/analizar';
import type { Matriz3 } from './estimador/orientar';

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

/** Layer analysis of a piece (runs in a Web Worker after upload). */
export interface EstimacionEstado {
  estado: 'pendiente' | 'ok' | 'error';
  /** 0-1 while pendiente. */
  progreso: number;
  analisis?: Analisis;
  /** Rotation shown in the viewer, relative to the uploaded file (print frame). */
  R: Matriz3;
  /** The quoted orientation is the uploaded one. */
  original: boolean;
  /** The customer asked to keep their own orientation. */
  mantenerOriginal: boolean;
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
  estimacion: EstimacionEstado;
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
