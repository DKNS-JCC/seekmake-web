'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Acabado, Color, Filamento } from '@/lib/types';

const MAX_FILE_MB = 50;

// ─── Color helpers ───────────────────────────────────────────────────────

// Lift very dark colors so they don't render as a black blob with no
// visible geometry. Pure black absorbs all diffuse light in PBR — we
// nudge it to a charcoal so the mesh stays readable.
function liftDark(hex: string): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.l < 0.07) {
    c.setHSL(hsl.h, hsl.s, 0.09);
    return '#' + c.getHexString();
  }
  return hex;
}

function isCarbonFiber(c: Color, f: Filamento | null): boolean {
  const blob = (
    (c.nombre ?? '') +
    ' ' +
    (f?.nombre ?? '') +
    ' ' +
    (f?.material ?? '')
  ).toLowerCase();
  return /carbono|carbon|fibra|\bcf\b/.test(blob);
}

function isMarble(c: Color): boolean {
  return /marmol|mármol|marble/i.test(c.nombre ?? '');
}

// ─── Procedural textures ────────────────────────────────────────────────

function makeCarbonFiberTexture(hexBase: string): THREE.CanvasTexture {
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

function makeMarbleTexture(hexBase: string): THREE.CanvasTexture {
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

function acabadoMaterialProps(hex: string, acabado: Acabado | null) {
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

// Build a full material update for a given selection. Handles specialty
// materials (carbon fiber, marble) and dark-color lifting.
function buildMaterialUpdate(
  selected: Selected,
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

interface Selected {
  color: Color;
  filamento: Filamento;
}

export function Visualizer3D({
  filamentos,
  colores,
  initialSelected,
  onClose
}: {
  filamentos: Filamento[];
  colores: Color[];
  initialSelected?: { color: Color; filamento: Filamento } | null;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    mesh: THREE.Mesh | null;
    radius: number;
  } | null>(null);
  // Cache of procedural textures (carbon fiber / marble) keyed by hex.
  const textureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());

  const [selected, setSelected] = useState<Selected | null>(initialSelected ?? null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [triCount, setTriCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState('');

  // ─── three.js scene setup ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(
      40,
      wrap.clientWidth / wrap.clientHeight,
      0.1,
      5000
    );
    camera.position.set(80, 60, 80);

    // Lighting — neutral studio. Boosted so very dark colors stay readable.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x555566, 0.85);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(60, 90, 50);
    const fill = new THREE.DirectionalLight(0xffffff, 0.75);
    fill.position.set(-60, 30, -40);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(0, -20, -80);
    const ambient = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(hemi, key, fill, rim, ambient);

    // Subtle ground shadow plane
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.08
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 64), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.name = 'ground';
    scene.add(ground);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 800;

    stateRef.current = { renderer, scene, camera, controls, mesh: null, radius: 50 };

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    };
  }, []);

  // ─── ESC closes ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // ─── File loading ───────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Archivo demasiado grande (>${MAX_FILE_MB} MB).`);
      return;
    }
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'stl') {
      setError('Solo formato STL por ahora.');
      return;
    }
    setLoading(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const loader = new STLLoader();
      const geometry = loader.parse(buf);
      geometry.computeVertexNormals();
      geometry.center();
      geometry.computeBoundingSphere();

      const state = stateRef.current;
      if (!state) return;

      if (state.mesh) {
        state.scene.remove(state.mesh);
        state.mesh.geometry.dispose();
        (state.mesh.material as THREE.Material).dispose();
        state.mesh = null;
      }

      const initialProps = selected
        ? buildMaterialUpdate(selected, textureCacheRef.current)
        : { props: acabadoMaterialProps('#cccccc', null), map: null };
      const material = new THREE.MeshPhysicalMaterial(initialProps.props);
      if (initialProps.map) material.map = initialProps.map;
      const mesh = new THREE.Mesh(geometry, material);

      // Orient STL Z-up → three.js Y-up
      mesh.rotation.x = -Math.PI / 2;
      // Drop the mesh so it sits on the ground after rotation
      const bbox = new THREE.Box3().setFromObject(mesh);
      mesh.position.y -= bbox.min.y;

      state.scene.add(mesh);
      state.mesh = mesh;

      const radius = geometry.boundingSphere?.radius ?? 50;
      state.radius = radius;

      // Reframe camera
      const dist = radius * 2.6;
      state.camera.position.set(dist, dist * 0.75, dist);
      state.camera.near = Math.max(0.1, radius / 100);
      state.camera.far = radius * 50;
      state.camera.updateProjectionMatrix();
      state.controls.target.set(0, radius * 0.5, 0);
      state.controls.update();

      // Ground sits at y=0 because we shifted the mesh up
      const ground = state.scene.getObjectByName('ground');
      if (ground) {
        ground.scale.setScalar(Math.max(1, radius / 60));
        ground.position.y = 0;
      }

      setTriCount(geometry.attributes.position.count / 3);
    } catch (err) {
      console.error(err);
      setError('No se pudo leer el archivo STL.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Update material when selected color changes ────────────────────────
  useEffect(() => {
    const state = stateRef.current;
    if (!state?.mesh || !selected) return;
    const mat = state.mesh.material as THREE.MeshPhysicalMaterial;
    const { props, map } = buildMaterialUpdate(selected, textureCacheRef.current);

    // Reset all relevant fields so switching e.g. Fluorescente → Mate clears
    // emissive, transmission, etc.
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
  }, [selected]);

  // Dispose cached textures on unmount.
  useEffect(() => {
    const cache = textureCacheRef.current;
    return () => {
      cache.forEach((t) => t.dispose());
      cache.clear();
    };
  }, []);

  // ─── Color picker data ──────────────────────────────────────────────────
  const groupedColors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filamentos
      .map((f) => ({
        filamento: f,
        items: colores.filter(
          (c) =>
            c.filamento_id === f.id &&
            (!q ||
              c.nombre.toLowerCase().includes(q) ||
              c.hex.toLowerCase().includes(q))
        )
      }))
      .filter((g) => g.items.length > 0);
  }, [filamentos, colores, query]);

  // ─── DnD handlers ───────────────────────────────────────────────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      className="viz-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="viz-modal">
        <button
          type="button"
          className="viz-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div
          ref={wrapRef}
          className={'viz-canvas-wrap' + (dragging ? ' dragging' : '')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <canvas ref={canvasRef} className="viz-canvas" />
          {!fileName && (
            <div className="viz-drop">
              <div className="viz-drop-icon">
                <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              </div>
              <div className="viz-drop-title">Suelta tu archivo STL aquí</div>
              <div className="viz-drop-sub">o pulsa "Subir archivo"</div>
            </div>
          )}
          {loading && <div className="viz-loading">Cargando…</div>}
          {error && <div className="viz-error">{error}</div>}
          {fileName && triCount !== null && (
            <div className="viz-meta">
              <span>{fileName}</span>
              <span className="viz-meta-sep">·</span>
              <span>{Math.round(triCount).toLocaleString()} triángulos</span>
            </div>
          )}
        </div>

        <aside className="viz-side">
          <div className="viz-side-head">
            <div className="section-tag">Visualizador 3D</div>
            <h3 className="viz-title">Prueba tu modelo en color real</h3>
            <p className="viz-sub">
              Sube un STL y haz clic en cualquier color del muestrario para verlo
              aplicado.
            </p>

            <label className="viz-upload">
              <input
                type="file"
                accept=".stl"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.currentTarget.value = '';
                }}
              />
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              {fileName ? 'Cambiar archivo' : 'Subir archivo'}
            </label>
          </div>

          <div className="viz-search">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Buscar color…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="viz-colors">
            {groupedColors.map(({ filamento, items }) => (
              <div className="viz-fila" key={filamento.id}>
                <div className="viz-fila-head">
                  <span className="viz-fila-name">{filamento.nombre}</span>
                  <span className="viz-fila-count">{items.length}</span>
                </div>
                <div className="viz-swatches">
                  {items.map((c) => {
                    const isActive = selected?.color.id === c.id;
                    return (
                      <button
                        type="button"
                        key={c.id}
                        className={'viz-swatch' + (isActive ? ' active' : '')}
                        style={{ backgroundColor: c.hex }}
                        title={`${c.nombre} · ${filamento.material}`}
                        onClick={() => setSelected({ color: c, filamento })}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className="viz-selected">
              <div
                className="viz-selected-swatch"
                style={{ backgroundColor: selected.color.hex }}
              />
              <div className="viz-selected-info">
                <div className="viz-selected-name">{selected.color.nombre}</div>
                <div className="viz-selected-mat">
                  {selected.filamento.material}
                  {selected.color.acabado && ' · ' + selected.color.acabado}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
