// Printing profile the estimator simulates. Defaults mirror the OrcaSlicer
// system presets for the shop's printer:
//   process  "0.20mm Standard @Creality K1 SE_CFS-C 0.4 nozzle"
//   machine  "Creality K1 SE_CFS-C 0.4 nozzle"
//   filament "CR-PLA @K1 SE_CFS-C" (and siblings for PETG/ASA/TPU)
// Field comments name the Orca key each value comes from, so re-syncing
// after tweaking a profile in Orca is a copy job.

export interface PerfilImpresora {
  /** Printable volume (printable_area / printable_height), mm. */
  cama: { x: number; y: number; z: number };
  /** initial_layer_print_height, mm. */
  alturaPrimeraCapa: number;
  /** wall_loops. */
  paredes: number;
  /** outer_wall_line_width / inner_wall_line_width, mm. */
  anchoParedExt: number;
  anchoParedInt: number;
  /** sparse_infill_line_width / internal_solid_infill_line_width, mm. */
  anchoRelleno: number;
  anchoSolido: number;
  /** top_shell_layers / top_shell_thickness (mm) / bottom_shell_layers. */
  capasSuperiores: number;
  espesorSuperiorMin: number;
  capasInferiores: number;
  /** minimum_sparse_infill_area, mm² — smaller sparse regions print solid. */
  areaMinRelleno: number;
  /** infill_wall_overlap resolved to mm (30 % of the sparse line width). */
  solapeRelleno: number;
  /**
   * thick_internal_bridges: the first solid layer over sparse infill is
   * laid as round nozzle-sized beads, so it deposits this much material
   * (mm of equivalent thickness) whatever the layer height.
   */
  espesorPuenteInterno: number;

  // Speeds, mm/s.
  vParedExt: number; // outer_wall_speed
  vParedInt: number; // inner_wall_speed
  vRelleno: number; // sparse_infill_speed
  vSolido: number; // internal_solid_infill_speed
  vSuperior: number; // top_surface_speed
  vPuente: number; // bridge_speed
  vPuenteInterno: number; // internal_bridge_speed (resolved, 150% of bridge)
  vPrimeraCapa: number; // initial_layer_speed
  vSoporte: number; // support_speed
  vSoporteInterfaz: number; // support_interface_speed
  vViaje: number; // travel_speed
  /** overhang_2_4 / 3_4 / 4_4 speeds (25-50 %, 50-75 %, 75-100 % overhang). */
  vVoladizo: [number, number, number];

  // Accelerations, mm/s².
  aParedExt: number; // outer_wall_acceleration
  aParedInt: number; // inner_wall_acceleration
  aRelleno: number; // sparse_infill_acceleration (resolved)
  aSolido: number; // internal_solid_infill_acceleration (resolved)
  aSuperior: number; // top_surface_acceleration
  aPrimeraCapa: number; // initial_layer_acceleration
  aViaje: number; // travel_acceleration
  /** Corner speed (outer_wall_jerk / default_jerk), mm/s. */
  jerk: number;

  /** retraction_length / retraction_speed, and z_hop (mm). */
  retraccionMm: number;
  vRetraccion: number;
  zHop: number;

  // Supports (enable_support is decided per part: only if it needs them).
  /** support_threshold_angle: faces flatter than this (from horizontal) get support. */
  soporteAngulo: number;
  /** Sparse density of the support body (0.42 / (0.42 + 2.5 spacing)). */
  soporteDensidad: number;
  /** support_interface_top_layers and its density (0.42 / (0.42 + 0.5)). */
  soporteInterfazCapas: number;
  soporteInterfazDensidad: number;
  /** support_top_z_distance, mm. */
  soporteDistZ: number;
  /**
   * Material factor for the support style actually used: ~1 for normal
   * (grid/snug) supports, lower for tree supports that only touch the
   * overhang where needed.
   */
  soporteFactor: number;
}

export interface PerfilMaterial {
  /** filament_density, g/cm³. */
  densidad: number;
  /** filament_flow_ratio (Orca scales every extrusion by it). */
  flujo: number;
  /** filament_max_volumetric_speed, mm³/s. */
  volMax: number;
  /** slow_down_layer_time, s — layers faster than this get slowed down. */
  tiempoMinCapa: number;
  /** slow_down_min_speed, mm/s — floor for that slowdown. */
  vMin: number;
}

export const PERFIL_K1SE: PerfilImpresora = {
  cama: { x: 220, y: 220, z: 250 },
  alturaPrimeraCapa: 0.2,
  paredes: 2,
  anchoParedExt: 0.42,
  anchoParedInt: 0.45,
  anchoRelleno: 0.45,
  anchoSolido: 0.42,
  capasSuperiores: 5,
  espesorSuperiorMin: 0.8,
  capasInferiores: 3,
  areaMinRelleno: 15,
  solapeRelleno: 0.135,
  espesorPuenteInterno: 0.28,
  vParedExt: 200,
  vParedInt: 300,
  vRelleno: 270,
  vSolido: 250,
  vSuperior: 150,
  vPuente: 50,
  vPuenteInterno: 75,
  vPrimeraCapa: 60,
  vSoporte: 150,
  vSoporteInterfaz: 80,
  vViaje: 500,
  vVoladizo: [50, 25, 10],
  aParedExt: 5000,
  aParedInt: 5000,
  aRelleno: 10000,
  aSolido: 10000,
  aSuperior: 2000,
  aPrimeraCapa: 1000,
  aViaje: 10000,
  jerk: 10,
  retraccionMm: 0.8,
  vRetraccion: 30,
  zHop: 0.4,
  soporteAngulo: 30,
  soporteDensidad: 0.144,
  soporteInterfazCapas: 2,
  soporteInterfazDensidad: 0.456,
  soporteDistZ: 0.2,
  soporteFactor: 1
};

/** Filament presets (Orca "CR-* @K1 SE_CFS-C" / "Creality Generic * @K1"). */
export const MATERIALES_K1SE: Record<string, PerfilMaterial> = {
  PLA: { densidad: 1.24, flujo: 0.95, volMax: 18, tiempoMinCapa: 12, vMin: 20 },
  PETG: { densidad: 1.23, flujo: 0.95, volMax: 9, tiempoMinCapa: 8, vMin: 10 },
  ASA: { densidad: 1.04, flujo: 0.926, volMax: 12, tiempoMinCapa: 3, vMin: 20 },
  TPU: { densidad: 1.24, flujo: 1, volMax: 3.5, tiempoMinCapa: 5, vMin: 10 }
};

/**
 * Solid shell thickness (mm) a layer height implies: top (whole layers,
 * at least the minimum thickness), bottom over air, and bottom on the bed
 * (the first layer has its own height).
 */
export function espesoresPiel(
  p: PerfilImpresora,
  h: number
): { sup: number; inf: number; infCama: number } {
  const nSup = Math.max(p.capasSuperiores, Math.ceil(p.espesorSuperiorMin / h - 1e-6));
  return {
    sup: nSup * h,
    inf: p.capasInferiores * h,
    infCama: p.alturaPrimeraCapa + Math.max(0, p.capasInferiores - 1) * h
  };
}

/** Horizontal thickness of the wall ring (all loops, extrusion spacing), mm. */
export function espesorParedes(p: PerfilImpresora, h: number): number {
  const sp = (w: number) => w - h * (1 - Math.PI / 4);
  return sp(p.anchoParedExt) + Math.max(0, p.paredes - 1) * sp(p.anchoParedInt);
}
