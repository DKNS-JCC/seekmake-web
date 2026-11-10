// The tasador's 3D viewer: scene, camera, tap-to-pick a zone, colors on the
// model and the anonymous thumbnail. Same studio as the muestrario.

import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import * as THREE from 'three';
import { createClient } from '@/lib/supabase/client';
import type { Filamento } from '@/lib/types';
import type { ParsedModel, Pieza } from '@/lib/quote/types';
import { createStudio, type Studio } from '@/lib/three/studio';
import { acabadoMaterialProps, applyMaterialUpdate, buildMaterialUpdate } from '@/lib/three/materials';
import { noRastrear } from '@/lib/tracking';
import { disposeModel } from './modelo';
import { SESSION_ID, huellaDe } from './seguimiento';

export interface Visor {
  canvasRef: RefObject<HTMLCanvasElement>;
  wrapRef: RefObject<HTMLDivElement>;
  stateRef: MutableRefObject<Studio | null>;
  /** Parsed models cached per pieza id so switching pieces is instant. */
  modelsRef: MutableRefObject<Map<string, ParsedModel>>;
  shownRef: MutableRefObject<string | null>;
  textureCacheRef: MutableRefObject<Map<string, THREE.Texture>>;
  showModel: (id: string) => void;
}

export function useVisor(setActivePart: (i: number) => void): Visor {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<Studio | null>(null);
  const modelsRef = useRef<Map<string, ParsedModel>>(new Map());
  const shownRef = useRef<string | null>(null);
  const textureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());

  // ─── scene setup (same studio as the muestrario visualizer) ─────────────
  useEffect(() => {
    const studio = createStudio(canvasRef.current, wrapRef.current);
    if (!studio) return;
    stateRef.current = studio;

    // A tap (not an orbit drag) on the model picks the zone under the finger.
    const canvas = studio.renderer.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      const model = shownRef.current ? modelsRef.current.get(shownRef.current) : null;
      if (!d || !model || model.zonas.length < 2) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || e.timeStamp - d.t > 500) return;
      const r = canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1),
        studio.camera
      );
      const hit = ray.intersectObject(model.root, true)[0];
      if (!hit) return;
      const m = (hit.object as THREE.Mesh).material;
      const mat = Array.isArray(m) ? m[hit.face?.materialIndex ?? 0] : m;
      const i = model.zonas.findIndex((z) => z.mat === mat);
      if (i !== -1) setActivePart(i);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);

    const models = modelsRef.current;
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      studio.dispose();
      models.forEach(disposeModel);
      models.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showModel(id: string): void {
    const state = stateRef.current;
    const model = modelsRef.current.get(id);
    if (!state || !model) return;

    if (shownRef.current) {
      const prev = modelsRef.current.get(shownRef.current);
      if (prev) state.scene.remove(prev.root);
    }
    state.scene.add(model.root);
    shownRef.current = id;

    const sphere = new THREE.Sphere();
    new THREE.Box3().setFromObject(model.root).getBoundingSphere(sphere);
    const radius = Math.max(sphere.radius, 5);
    const dist = radius * 2.6;
    state.camera.position.set(dist, dist * 0.75, dist);
    state.camera.near = Math.max(0.1, radius / 100);
    state.camera.far = radius * 50;
    state.camera.updateProjectionMatrix();
    state.controls.target.set(0, radius * 0.5, 0);
    state.controls.update();

    const ground = state.scene.getObjectByName('ground');
    if (ground) ground.scale.setScalar(Math.max(1, radius / 60));
  }

  return { canvasRef, wrapRef, stateRef, modelsRef, shownRef, textureCacheRef, showModel };
}

/**
 * A small picture of each new piece as the viewer shows it (not the file),
 * for /admin/estadisticas. Deleted after 30 days; see /privacidad.
 */
export function useMiniatura(visor: Visor, activeId: string | null, piezasRef: MutableRefObject<Pieza[]>): void {
  const miniaturas = useRef(new Set<string>());
  useEffect(() => {
    if (!activeId) return;
    const t = setTimeout(() => {
      const p = piezasRef.current.find((x) => x.id === activeId);
      const st = visor.stateRef.current;
      if (!p || !st || visor.shownRef.current !== activeId || noRastrear()) return;
      const huella = huellaDe(p.metrics);
      if (miniaturas.current.has(huella)) return;
      miniaturas.current.add(huella);
      st.renderer.render(st.scene, st.camera); // same task as the read: no preserveDrawingBuffer needed
      const src = st.renderer.domElement;
      const w = 320;
      const h = Math.max(1, Math.round((w * src.height) / Math.max(1, src.width)));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#e8e2d9';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(src, 0, 0, w, h);
      c.toBlob(
        (blob) => {
          if (!blob) return;
          void createClient()
            .storage.from('tasador-miniaturas')
            .upload(`${SESSION_ID}/${huella}.jpg`, blob, { contentType: 'image/jpeg' })
            .then(() => undefined, () => undefined);
        },
        'image/jpeg',
        0.72
      );
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);
}

/** Paint the displayed model with the chosen colors (grey where none yet). */
export function useColoresVisor(
  visor: Visor,
  activePieza: Pieza | null,
  activeFilamento: Filamento | null,
  partsMode: boolean
): void {
  useEffect(() => {
    if (!activePieza || !activeFilamento) return;
    const model = visor.modelsRef.current.get(activePieza.id);
    if (!model) return;

    model.zonas.forEach(({ mat }, i) => {
      const c = partsMode ? activePieza.config.partColors[i] : activePieza.config.mainColor;
      if (c) {
        const { props, map } = buildMaterialUpdate(
          { color: c, filamento: activeFilamento },
          visor.textureCacheRef.current
        );
        applyMaterialUpdate(mat, props, map);
      } else {
        applyMaterialUpdate(mat, acabadoMaterialProps('#cccccc', null), null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePieza, activeFilamento, partsMode]);

  useEffect(() => {
    const cache = visor.textureCacheRef.current;
    return () => {
      cache.forEach((t) => t.dispose());
      cache.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
