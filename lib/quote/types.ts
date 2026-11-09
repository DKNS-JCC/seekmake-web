// Shapes shared by the tasador UI and its helper modules.

import type * as THREE from 'three';
import type { Color } from '@/lib/types';
import type { MeshMetrics } from './geometry';
import type { Analisis } from './estimador/analizar';
import type { Zona } from './tresmf';
import type { Matriz3 } from './estimador/orientar';

export interface PiezaConfig {
  filamentoId: string;
  mainColor: Color | null;
  multicolor: boolean;
  extraColors: Color[];
  /** Per-zone colors — only meaningful when the piece has several zones. */
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
  /** Print orientation picked for our slicer, relative to the uploaded file (the viewer never turns). */
  R: Matriz3;
  /** The quoted orientation is the uploaded one. */
  original: boolean;
}

export interface Pieza {
  id: string;
  file: File;
  name: string;
  size: number;
  ext: string;
  metrics: MeshMetrics;
  cantidad: number;
  /** Zones the customer colors: parts, or filaments of a multicolor 3MF. */
  partNames: string[];
  /** Each zone's color in the customer's project, to preselect the closest. */
  sugeridos: (string | null)[];
  config: PiezaConfig;
  estimacion: EstimacionEstado;
}

export interface ParsedModel {
  root: THREE.Group;
  meshes: THREE.Mesh[];
  zonas: Zona[];
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
