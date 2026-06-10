'use client';

// Tasador propio — replaces the SeekMake embed.
// Flow: drop up to 5 model files → analyze geometry in-browser → configure
// EACH piece independently (material, colors, resistance, detail, quantity;
// the steps panel edits the selected piece) → live price breakdown →
// submit. New pieces inherit the active piece's config so the common
// same-settings order needs zero extra clicks.
// STL/OBJ are gzipped client-side before upload to protect Storage quota.

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createClient } from '@/lib/supabase/client';
import type { Color, Filamento, QuoteEntrega } from '@/lib/types';
import {
  acabadoMaterialProps,
  applyMaterialUpdate,
  buildMaterialUpdate
} from '@/lib/three/materials';
import { analyzeObject, looksDegenerate, type MeshMetrics } from '@/lib/quote/geometry';
import { gzipFile, shouldCompress } from '@/lib/quote/compress';
import {
  computeQuote,
  normalizeSettings,
  DEFAULT_QUOTE_SETTINGS,
  type QuoteSettings
} from '@/lib/quote/pricing';
import './quote.css';

const MAX_FILE_MB = 50;
const MAX_FILES = 5;
const MAX_BED_MM = 256; // largest printable axis before we warn
const ACCEPT = '.stl,.3mf,.obj';
const WHATSAPP = '34665148956';

interface PiezaConfig {
  filamentoId: string;
  mainColor: Color | null;
  multicolor: boolean;
  extraColors: Color[];
  /** Per-part colors — only meaningful for multi-part 3MF pieces. */
  partColors: (Color | null)[];
  resistenciaId: string;
  detalleId: string;
}

interface Pieza {
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

interface ParsedModel {
  root: THREE.Group;
  meshes: THREE.Mesh[];
}

type Status =
  | { kind: 'idle' }
  | { kind: 'sending'; progress: string }
  | { kind: 'ok'; codigo: string }
  | { kind: 'err'; message: string };

function randomPath(ext: string): string {
  const safe = (Math.random().toString(36).slice(2, 8) + Date.now().toString(36)).slice(0, 16);
  return `quotes/${safe}.${ext}`;
}

function disposeModel(model: ParsedModel): void {
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

/** Distinct colors a piece will print with, per its config. */
function piezaColors(p: Pieza): Color[] {
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

export function QuoteClient({
  filamentos,
  colores
}: {
  filamentos: Filamento[];
  colores: Color[];
}) {
  // ─── three.js plumbing ──────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
  } | null>(null);
  // Parsed models cached per pieza id so switching pieces is instant.
  const modelsRef = useRef<Map<string, ParsedModel>>(new Map());
  const shownRef = useRef<string | null>(null);
  const textureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());

  // ─── settings (runtime fetch so tariff edits apply instantly) ───────────
  const [settings, setSettings] = useState<QuoteSettings>(DEFAULT_QUOTE_SETTINGS);

  // ─── model state ────────────────────────────────────────────────────────
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activePart, setActivePart] = useState(0);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [entrega, setEntrega] = useState<QuoteEntrega>('recogida');

  // ─── request form ───────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [calle, setCalle] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [cp, setCp] = useState('');
  const [provincia, setProvincia] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activePieza = piezas.find((p) => p.id === activeId) ?? null;
  const activeFilamento = activePieza
    ? filamentos.find((f) => f.id === activePieza.config.filamentoId) ?? filamentos[0] ?? null
    : null;
  // Per-part coloring for the active piece (multi-part 3MF).
  const partsMode = (activePieza?.partNames.length ?? 0) > 1;

  useEffect(() => {
    createClient()
      .from('quote_settings')
      .select('config')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.config) setSettings(normalizeSettings(data.config));
      });
  }, []);

  // ─── scene setup (same studio as the muestrario visualizer) ─────────────
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

    const hemi = new THREE.HemisphereLight(0xffffff, 0x555566, 0.85);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(60, 90, 50);
    const fill = new THREE.DirectionalLight(0xffffff, 0.75);
    fill.position.set(-60, 30, -40);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(0, -20, -80);
    const ambient = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(hemi, key, fill, rim, ambient);

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

    stateRef.current = { renderer, scene, camera, controls };

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

    const models = modelsRef.current;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      models.forEach(disposeModel);
      models.clear();
    };
  }, []);

  // ─── file parsing ───────────────────────────────────────────────────────
  async function parseModel(f: File, ext: string): Promise<ParsedModel> {
    const root = new THREE.Group();
    if (ext === 'stl') {
      const geometry = new STLLoader().parse(await f.arrayBuffer());
      geometry.computeVertexNormals();
      root.add(new THREE.Mesh(geometry));
    } else if (ext === '3mf') {
      root.add(new ThreeMFLoader().parse(await f.arrayBuffer()));
    } else {
      root.add(new OBJLoader().parse(await f.text()));
    }
    // STL/3MF are Z-up by convention; rotate into three.js Y-up.
    if (ext !== 'obj') root.rotation.x = -Math.PI / 2;

    const meshes: THREE.Mesh[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
    });
    for (const mesh of meshes) {
      const old = mesh.material;
      if (Array.isArray(old)) old.forEach((m) => m.dispose());
      else if (old) (old as THREE.Material).dispose();
      mesh.material = new THREE.MeshPhysicalMaterial(
        acabadoMaterialProps('#cccccc', null)
      );
    }

    // Center on the plate: x/z centered, base resting on y=0.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    box.getCenter(center);
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    root.updateMatrixWorld(true);

    return { root, meshes };
  }

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

  function defaultConfig(partCount: number): PiezaConfig {
    // New pieces inherit the active piece's config so a same-settings
    // multi-piece order needs no extra clicks.
    const base = activePieza?.config;
    return {
      filamentoId: base?.filamentoId ?? filamentos[0]?.id ?? '',
      mainColor: base?.mainColor ?? null,
      multicolor: false,
      extraColors: [],
      partColors: new Array(partCount).fill(
        partCount > 1 ? null : (base?.mainColor ?? null)
      ),
      resistenciaId: base?.resistenciaId ?? 'estandar',
      detalleId: base?.detalleId ?? 'estandar'
    };
  }

  async function addFiles(files: FileList | File[]) {
    setFileError(null);
    const list = Array.from(files);
    const errors: string[] = [];
    let added: Pieza | null = null;
    let count = piezas.length;

    setLoadingFile(true);
    try {
      for (const f of list) {
        if (count >= MAX_FILES) {
          errors.push(`Máximo ${MAX_FILES} piezas por presupuesto.`);
          break;
        }
        if (f.size > MAX_FILE_MB * 1024 * 1024) {
          errors.push(`${f.name}: supera los ${MAX_FILE_MB} MB.`);
          continue;
        }
        const ext = f.name.toLowerCase().split('.').pop() ?? '';
        if (!['stl', '3mf', 'obj'].includes(ext)) {
          errors.push(`${f.name}: formato no soportado (STL, 3MF, OBJ).`);
          continue;
        }

        try {
          const model = await parseModel(f, ext);
          if (!model.meshes.length) {
            errors.push(`${f.name}: no contiene ninguna malla imprimible.`);
            disposeModel(model);
            continue;
          }
          const metrics = analyzeObject(model.root);
          const id = Math.random().toString(36).slice(2, 10);
          modelsRef.current.set(id, model);

          const pieza: Pieza = {
            id,
            file: f,
            name: f.name,
            size: f.size,
            ext,
            metrics,
            cantidad: 1,
            partNames: model.meshes.map(
              (m, i) => m.name?.trim() || `Parte ${i + 1}`
            ),
            config: defaultConfig(model.meshes.length)
          };
          setPiezas((prev) => [...prev, pieza]);
          count++;
          added = pieza;
        } catch (err) {
          console.error(err);
          errors.push(`${f.name}: no se pudo leer (¿archivo dañado?).`);
        }
      }
    } finally {
      setLoadingFile(false);
    }

    if (errors.length) setFileError(errors.join(' · '));
    if (added) {
      setActiveId(added.id);
      setActivePart(0);
      setStatus({ kind: 'idle' });
    }
  }

  // Show the active pieza in the viewer whenever it changes.
  useEffect(() => {
    if (activeId) showModel(activeId);
  }, [activeId]);

  function removePieza(id: string) {
    const model = modelsRef.current.get(id);
    if (model) {
      const state = stateRef.current;
      if (state && shownRef.current === id) {
        state.scene.remove(model.root);
        shownRef.current = null;
      }
      disposeModel(model);
      modelsRef.current.delete(id);
    }
    setPiezas((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (activeId === id) {
        setActiveId(next[0]?.id ?? null);
        setActivePart(0);
      }
      return next;
    });
  }

  function setCantidad(id: string, v: number) {
    setPiezas((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, cantidad: Math.max(1, Math.min(999, v)) } : p
      )
    );
  }

  function patchActiveConfig(patch: Partial<PiezaConfig>) {
    if (!activeId) return;
    setPiezas((prev) =>
      prev.map((p) => (p.id === activeId ? { ...p, config: { ...p.config, ...patch } } : p))
    );
  }

  function applyToAll() {
    if (!activePieza) return;
    const src = activePieza.config;
    setPiezas((prev) =>
      prev.map((p) => {
        if (p.id === activePieza.id) return p;
        return {
          ...p,
          config: {
            filamentoId: src.filamentoId,
            mainColor: src.mainColor,
            multicolor: src.multicolor,
            extraColors: [...src.extraColors],
            // Other pieces keep one color per part: paint everything in the
            // source's main color (the customer can refine per piece).
            partColors: p.partNames.map(() => src.mainColor),
            resistenciaId: src.resistenciaId,
            detalleId: src.detalleId
          }
        };
      })
    );
  }

  // ─── apply colors to the displayed model ────────────────────────────────
  useEffect(() => {
    if (!activePieza || !activeFilamento) return;
    const model = modelsRef.current.get(activePieza.id);
    if (!model) return;

    model.meshes.forEach((mesh, i) => {
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      const c = partsMode ? activePieza.config.partColors[i] : activePieza.config.mainColor;
      if (c) {
        const { props, map } = buildMaterialUpdate(
          { color: c, filamento: activeFilamento },
          textureCacheRef.current
        );
        applyMaterialUpdate(mat, props, map);
      } else {
        applyMaterialUpdate(mat, acabadoMaterialProps('#cccccc', null), null);
      }
    });
  }, [activePieza, activeFilamento, partsMode]);

  useEffect(() => {
    const cache = textureCacheRef.current;
    return () => {
      cache.forEach((t) => t.dispose());
      cache.clear();
    };
  }, []);

  // ─── derived data ───────────────────────────────────────────────────────
  const materialColors = useMemo(
    () =>
      activeFilamento
        ? colores.filter((c) => c.filamento_id === activeFilamento.id)
        : [],
    [colores, activeFilamento]
  );

  const activeColors = activePieza ? piezaColors(activePieza) : [];

  const quote = useMemo(() => {
    if (!piezas.length) return null;
    return computeQuote(
      piezas.map((p) => {
        const fil = filamentos.find((f) => f.id === p.config.filamentoId);
        return {
          nombre: p.name,
          metrics: p.metrics,
          cantidad: p.cantidad,
          material: fil?.material ?? 'PLA',
          colores: piezaColors(p).map((c) => ({
            nombre: c.nombre,
            hex: c.hex,
            acabado: c.acabado
          })),
          resistenciaId: p.config.resistenciaId,
          detalleId: p.config.detalleId
        };
      }),
      settings
    );
  }, [piezas, filamentos, settings]);

  const tooBig = piezas.some(
    (p) => Math.max(p.metrics.bboxMm.x, p.metrics.bboxMm.y, p.metrics.bboxMm.z) > MAX_BED_MM
  );
  const degenerate = piezas.some((p) => looksDegenerate(p.metrics));
  const piezasSinColor = piezas.filter((p) => piezaColors(p).length === 0);

  // ─── interactions ───────────────────────────────────────────────────────
  function changeMaterial(f: Filamento) {
    if (!activePieza || f.id === activePieza.config.filamentoId) return;
    patchActiveConfig({
      filamentoId: f.id,
      mainColor: null,
      extraColors: [],
      partColors: activePieza.partNames.map(() => null)
    });
  }

  function pickColor(c: Color) {
    if (!activePieza) return;
    if (partsMode) {
      const next = [...activePieza.config.partColors];
      next[activePart] = c;
      patchActiveConfig({ partColors: next });
      // Jump to the next part without a color yet.
      const idx = next.findIndex((x, i) => i !== activePart && x === null);
      if (idx !== -1) setActivePart(idx);
    } else {
      patchActiveConfig({
        mainColor: c,
        partColors: activePieza.partNames.map(() => c)
      });
    }
  }

  function toggleExtraColor(c: Color) {
    if (!activePieza) return;
    const prev = activePieza.config.extraColors;
    if (prev.some((x) => x.id === c.id)) {
      patchActiveConfig({ extraColors: prev.filter((x) => x.id !== c.id) });
    } else if (prev.length < 3) {
      patchActiveConfig({ extraColors: [...prev, c] }); // main + 3 extras max
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) void addFiles(e.target.files);
    e.target.value = '';
  }

  // ─── submit ─────────────────────────────────────────────────────────────
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!piezas.length || !quote) return;
    if (piezasSinColor.length) {
      setStatus({
        kind: 'err',
        message: `Falta elegir color en: ${piezasSinColor.map((p) => p.name).join(', ')}.`
      });
      return;
    }

    const supabase = createClient();

    try {
      // 1. Upload every model file (gzipped when it pays off).
      const archivos: Record<string, unknown>[] = [];
      for (let i = 0; i < piezas.length; i++) {
        const p = piezas[i];
        setStatus({
          kind: 'sending',
          progress: `Subiendo pieza ${i + 1} de ${piezas.length}…`
        });

        let blob: Blob = p.file;
        let path = randomPath(p.ext);
        let comprimido = false;
        if (shouldCompress(p.ext)) {
          const gz = await gzipFile(p.file);
          if (gz && gz.size < p.size) {
            blob = gz;
            path += '.gz';
            comprimido = true;
          }
        }

        const { error: upErr } = await supabase.storage
          .from('quote-uploads')
          .upload(path, blob, {
            contentType: 'application/octet-stream',
            upsert: false
          });
        if (upErr) {
          setStatus({
            kind: 'err',
            message: `No se pudo subir ${p.name}: ${upErr.message}`
          });
          return;
        }
        const { data: pub } = supabase.storage.from('quote-uploads').getPublicUrl(path);

        const fil = filamentos.find((f) => f.id === p.config.filamentoId);
        const coloresPieza =
          p.partNames.length > 1
            ? p.config.partColors
                .map((c, j) =>
                  c
                    ? { nombre: c.nombre, hex: c.hex, acabado: c.acabado, parte: p.partNames[j] }
                    : null
                )
                .filter(Boolean)
            : piezaColors(p).map((c) => ({
                nombre: c.nombre,
                hex: c.hex,
                acabado: c.acabado,
                parte: ''
              }));

        const pr = quote.piezas[i];
        archivos.push({
          nombre: p.name,
          url: pub.publicUrl,
          path,
          tamano: blob.size,
          tamano_original: p.size,
          comprimido,
          cantidad: p.cantidad,
          material: fil?.material ?? 'PLA',
          colores: coloresPieza,
          resistencia: p.config.resistenciaId,
          detalle: p.config.detalleId,
          metricas: {
            volumen_cm3: Math.round(p.metrics.volumenCm3 * 100) / 100,
            area_cm2: Math.round(p.metrics.areaCm2 * 10) / 10,
            bbox_mm: p.metrics.bboxMm,
            triangulos: p.metrics.triangulos,
            mallas: p.metrics.mallas,
            peso_g: pr?.pesoG ?? null,
            tiempo_h: pr?.tiempoH ?? null,
            relleno_pct: pr?.rellenoPct ?? null
          }
        });
      }

      setStatus({ kind: 'sending', progress: 'Registrando solicitud…' });

      // Top-level summary fields (the per-piece detail lives in archivos).
      const materiales = [...new Set(archivos.map((a) => a.material as string))];
      const resistencias = [...new Set(piezas.map((p) => p.config.resistenciaId))];
      const detalles = [...new Set(piezas.map((p) => p.config.detalleId))];
      const coloresGlobal = archivos.flatMap((a, i) =>
        (a.colores as any[]).map((c) => ({
          ...c,
          parte: piezas.length > 1 ? `${piezas[i].name}${c.parte ? ` · ${c.parte}` : ''}` : c.parte
        }))
      );

      // 2. Quote request → Edge Function (inserts row + emails).
      const { data, error } = await supabase.functions.invoke('submit-quote', {
        body: {
          nombre,
          email,
          telefono,
          mensaje,
          website,
          archivos,
          material: materiales.join(', '),
          colores: coloresGlobal,
          resistencia: resistencias.length === 1 ? resistencias[0] : 'mixto',
          detalle: detalles.length === 1 ? detalles[0] : 'mixto',
          cantidad: quote.unidades,
          entrega,
          direccion:
            entrega === 'envio' ? { calle, ciudad, cp, provincia } : {},
          metricas: {
            peso_g: quote.pesoG,
            tiempo_h: quote.tiempoH,
            dias_estimados: quote.diasEstimados,
            piezas: quote.piezas.length
          },
          desglose: {
            lineas: quote.lineas,
            descuento_pct: quote.descuentoPct,
            minimo_aplicado: quote.minimoAplicado
          },
          precio_total: quote.total
        }
      });

      if (error) {
        setStatus({ kind: 'err', message: error.message ?? 'No se pudo enviar la solicitud.' });
        return;
      }
      if (data?.error) {
        setStatus({ kind: 'err', message: data.error });
        return;
      }
      setStatus({ kind: 'ok', codigo: data?.codigo ?? '' });
    } catch {
      setStatus({
        kind: 'err',
        message: 'Error de red. Inténtalo de nuevo o escríbenos a info@impresion3dcc.com.'
      });
    }
  }

  const waText = encodeURIComponent(
    `Hola, soy ${nombre}. Acabo de solicitar el presupuesto ${
      status.kind === 'ok' ? status.codigo : ''
    } desde la web.`
  );

  // ─── render ─────────────────────────────────────────────────────────────
  return (
    <div className="page-content qt-page">
      <section className="qt-hero">
        <div className="section-tag" style={{ justifyContent: 'center' }}>
          Calculadora de precio
        </div>
        <h1>Calcula el precio de tu pieza</h1>
        <p className="qt-hero-desc">
          Sube tus modelos 3D, configura cada pieza con material y color del
          muestrario real y obtén una estimación al instante. Sin registros, sin
          esperas.
        </p>
      </section>

      <div className="container-3dcc qt-main">
        {/* ── 3D viewer ── */}
        <div
          ref={wrapRef}
          className={'qt-viewer' + (dragging ? ' dragging' : '')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <canvas ref={canvasRef} className="qt-canvas" />

          {!piezas.length && !loadingFile && (
            <button
              type="button"
              className="qt-drop"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="qt-drop-icon">
                <svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              </div>
              <div className="qt-drop-title">Arrastra aquí tus archivos 3D</div>
              <div className="qt-drop-sub">
                STL · 3MF · OBJ — hasta {MAX_FILE_MB} MB · máx. {MAX_FILES} piezas
              </div>
            </button>
          )}
          {loadingFile && <div className="qt-overlay-msg">Analizando pieza…</div>}
          {fileError && <div className="qt-overlay-err">{fileError}</div>}

          {activePieza && (
            <div className="qt-meta">
              <span className="qt-meta-file" title={activePieza.name}>
                {activePieza.name}
              </span>
              <span>
                {activePieza.metrics.bboxMm.x} × {activePieza.metrics.bboxMm.z} ×{' '}
                {activePieza.metrics.bboxMm.y} mm
              </span>
              <span>{activePieza.metrics.volumenCm3.toFixed(1)} cm³</span>
            </div>
          )}

          {piezas.length > 0 && piezas.length < MAX_FILES && (
            <button
              type="button"
              className="qt-changefile"
              onClick={() => fileInputRef.current?.click()}
            >
              + Añadir pieza
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={onPick}
            style={{ display: 'none' }}
          />
        </div>

        {/* ── options panel ── */}
        <aside className="qt-panel">
          {(tooBig || degenerate) && (
            <div className="qt-warn">
              {tooBig && (
                <p>
                  ⚠ Alguna pieza supera los {MAX_BED_MM} mm en algún eje. Puede que
                  haya que imprimirla en varias partes — te lo confirmamos al revisar.
                </p>
              )}
              {degenerate && (
                <p>
                  ⚠ Alguna malla parece abierta o dañada; la estimación de peso puede
                  no ser fiable. La revisaremos manualmente.
                </p>
              )}
            </div>
          )}

          {/* piezas */}
          {piezas.length > 0 && (
            <div className="qt-step">
              <div className="qt-step-label">Tus piezas</div>
              <ul className="qt-piezas">
                {piezas.map((p) => (
                  <li
                    key={p.id}
                    className={'qt-pieza' + (p.id === activeId ? ' active' : '')}
                  >
                    <button
                      type="button"
                      className="qt-pieza-name"
                      title={p.name}
                      onClick={() => {
                        setActiveId(p.id);
                        setActivePart(0);
                      }}
                    >
                      {p.name}
                      <span className="qt-pieza-dots">
                        {piezaColors(p).slice(0, 4).map((c) => (
                          <span key={c.id} style={{ backgroundColor: c.hex }} />
                        ))}
                      </span>
                    </button>
                    <div className="qt-pieza-qty">
                      <button
                        type="button"
                        onClick={() => setCantidad(p.id, p.cantidad - 1)}
                        aria-label="Menos"
                      >
                        −
                      </button>
                      <span>{p.cantidad}</span>
                      <button
                        type="button"
                        onClick={() => setCantidad(p.id, p.cantidad + 1)}
                        aria-label="Más"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="qt-pieza-remove"
                      onClick={() => removePieza(p.id)}
                      aria-label={`Quitar ${p.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              {quote && quote.descuentoPct > 0 && (
                <p className="qt-step-hint" style={{ color: 'var(--accent)' }}>
                  -{quote.descuentoPct}% por cantidad ({quote.unidades} unidades en total)
                </p>
              )}
            </div>
          )}

          {!piezas.length && (
            <div className="qt-step">
              <p className="qt-step-hint">
                Sube una o varias piezas para configurar material, color y acabado
                de cada una.
              </p>
            </div>
          )}

          {activePieza && (
            <>
              {piezas.length > 1 && (
                <div className="qt-configuring">
                  <span>
                    Configurando: <strong>{activePieza.name}</strong>
                  </span>
                  <button type="button" onClick={applyToAll}>
                    Aplicar a todas
                  </button>
                </div>
              )}

              {/* material */}
              <div className="qt-step">
                <div className="qt-step-label">1 · Material</div>
                <div className="qt-pills">
                  {filamentos.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={
                        'qt-pill' + (activePieza.config.filamentoId === f.id ? ' active' : '')
                      }
                      onClick={() => changeMaterial(f)}
                    >
                      {f.material}
                    </button>
                  ))}
                </div>
                {activeFilamento?.descripcion && (
                  <p className="qt-step-hint">{activeFilamento.descripcion}</p>
                )}
              </div>

              {/* color */}
              <div className="qt-step">
                <div className="qt-step-label">
                  2 · Color{partsMode ? ' por parte' : ''}
                </div>

                {partsMode && (
                  <div className="qt-parts">
                    {activePieza.partNames.map((name, i) => (
                      <button
                        key={i}
                        type="button"
                        className={'qt-part' + (activePart === i ? ' active' : '')}
                        onClick={() => setActivePart(i)}
                      >
                        <span
                          className="qt-part-swatch"
                          style={{
                            backgroundColor:
                              activePieza.config.partColors[i]?.hex ?? 'transparent'
                          }}
                        />
                        {name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="qt-swatches">
                  {materialColors.map((c) => {
                    const cfg = activePieza.config;
                    const isMain = partsMode
                      ? cfg.partColors.some((x) => x?.id === c.id)
                      : cfg.mainColor?.id === c.id;
                    const isExtra =
                      !partsMode && cfg.multicolor && cfg.extraColors.some((x) => x.id === c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={'qt-swatch' + (isMain || isExtra ? ' active' : '')}
                        style={{ backgroundColor: c.hex }}
                        title={c.nombre + (c.acabado ? ` · ${c.acabado}` : '')}
                        onClick={() => pickColor(c)}
                      />
                    );
                  })}
                </div>

                {!partsMode && (
                  <>
                    <label className="qt-toggle">
                      <input
                        type="checkbox"
                        checked={activePieza.config.multicolor}
                        onChange={(e) =>
                          patchActiveConfig({
                            multicolor: e.target.checked,
                            extraColors: e.target.checked
                              ? activePieza.config.extraColors
                              : []
                          })
                        }
                      />
                      Quiero combinar varios colores en esta pieza
                    </label>
                    {activePieza.config.multicolor && (
                      <div className="qt-extra">
                        <p className="qt-step-hint">
                          Marca hasta 3 colores adicionales y cuéntanos en el mensaje
                          cómo repartirlos. Si tu archivo es un 3MF por piezas, los
                          colores se asignan automáticamente a cada parte.
                        </p>
                        <div className="qt-swatches">
                          {materialColors
                            .filter((c) => c.id !== activePieza.config.mainColor?.id)
                            .map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className={
                                  'qt-swatch' +
                                  (activePieza.config.extraColors.some((x) => x.id === c.id)
                                    ? ' active'
                                    : '')
                                }
                                style={{ backgroundColor: c.hex }}
                                title={c.nombre}
                                onClick={() => toggleExtraColor(c)}
                              />
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeColors.length > 0 && (
                  <div className="qt-chosen">
                    {activeColors.map((c) => (
                      <span key={c.id} className="qt-chosen-chip">
                        <span style={{ backgroundColor: c.hex }} />
                        {c.nombre}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* resistencia */}
              <div className="qt-step">
                <div className="qt-step-label">3 · ¿Cómo de resistente la necesitas?</div>
                <div className="qt-cards">
                  {settings.resistencia.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={
                        'qt-card' + (activePieza.config.resistenciaId === r.id ? ' active' : '')
                      }
                      onClick={() => patchActiveConfig({ resistenciaId: r.id })}
                    >
                      <strong>{r.nombre}</strong>
                      <span>{r.descripcion}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* detalle */}
              <div className="qt-step">
                <div className="qt-step-label">4 · ¿Cuánto detalle?</div>
                <div className="qt-cards">
                  {settings.detalle.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={
                        'qt-card' + (activePieza.config.detalleId === d.id ? ' active' : '')
                      }
                      onClick={() => patchActiveConfig({ detalleId: d.id })}
                    >
                      <strong>{d.nombre}</strong>
                      <span>{d.descripcion}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* entrega — global for the whole order */}
          {piezas.length > 0 && (
            <div className="qt-step">
              <div className="qt-step-label">5 · Entrega del pedido</div>
              <div className="qt-cards">
                <button
                  type="button"
                  className={'qt-card' + (entrega === 'recogida' ? ' active' : '')}
                  onClick={() => setEntrega('recogida')}
                >
                  <strong>Recogida en Salamanca</strong>
                  <span>Gratis · Plza. Barrio Vidal</span>
                </button>
                <button
                  type="button"
                  className={'qt-card' + (entrega === 'envio' ? ' active' : '')}
                  onClick={() => setEntrega('envio')}
                >
                  <strong>Envío nacional</strong>
                  <span>Coste a convenir — te lo confirmamos junto al presupuesto</span>
                </button>
              </div>
            </div>
          )}

          {/* breakdown */}
          <div className="qt-total">
            {!piezas.length && (
              <p className="qt-total-empty">Sube una pieza para ver el precio.</p>
            )}
            {piezas.length > 0 && quote && (
              <>
                <ul className="qt-lines">
                  {quote.lineas.map((l, i) => (
                    <li key={i}>
                      <span>{l.concepto}</span>
                      <span>{l.importe.toFixed(2)} €</span>
                    </li>
                  ))}
                </ul>
                <div className="qt-total-row">
                  <span>Total estimado</span>
                  <strong>{quote.total.toFixed(2)} €</strong>
                </div>
                {quote.minimoAplicado && (
                  <p className="qt-total-note">Se aplica el pedido mínimo.</p>
                )}
                <p className="qt-total-plazo">
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 3" />
                  </svg>
                  Listo en ~{quote.diasEstimados} día{quote.diasEstimados !== 1 ? 's' : ''} laborables
                  {entrega === 'envio' ? ' + envío' : ''}
                </p>
                {entrega === 'envio' && (
                  <p className="qt-total-note">
                    El coste del envío no está incluido: te lo confirmamos junto al
                    presupuesto (recogida en Salamanca gratis).
                  </p>
                )}
                <p className="qt-total-note">
                  Estimación orientativa con ~{quote.tiempoH.toFixed(1)} h de impresión
                  en total. Te confirmamos el precio final al revisar las piezas.
                </p>
              </>
            )}
          </div>

          {/* request */}
          {piezas.length > 0 && quote && status.kind !== 'ok' && !showForm && (
            <>
              <button
                type="button"
                className="btn-primary qt-cta"
                disabled={piezasSinColor.length > 0}
                onClick={() => setShowForm(true)}
              >
                Solicitar este presupuesto
              </button>
              {piezasSinColor.length > 0 && (
                <p className="qt-step-hint">
                  Falta elegir color en:{' '}
                  {piezasSinColor.map((p) => p.name).join(', ')}.
                </p>
              )}
            </>
          )}

          {showForm && status.kind !== 'ok' && (
            <form className="qt-form" onSubmit={submit}>
              <input
                type="text"
                placeholder="Tu nombre"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="name"
              />
              <input
                type="email"
                placeholder="Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <input
                type="tel"
                placeholder="Teléfono"
                required
                minLength={9}
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                autoComplete="tel"
              />
              {entrega === 'envio' && (
                <>
                  <input
                    type="text"
                    placeholder="Dirección (calle y número)"
                    required
                    value={calle}
                    onChange={(e) => setCalle(e.target.value)}
                    autoComplete="street-address"
                  />
                  <div className="qt-form-row">
                    <input
                      type="text"
                      placeholder="Ciudad"
                      required
                      value={ciudad}
                      onChange={(e) => setCiudad(e.target.value)}
                      autoComplete="address-level2"
                    />
                    <input
                      type="text"
                      placeholder="C.P."
                      required
                      pattern="[0-9]{5}"
                      title="Código postal de 5 dígitos"
                      value={cp}
                      onChange={(e) => setCp(e.target.value)}
                      autoComplete="postal-code"
                    />
                    <input
                      type="text"
                      placeholder="Provincia"
                      required
                      value={provincia}
                      onChange={(e) => setProvincia(e.target.value)}
                      autoComplete="address-level1"
                    />
                  </div>
                </>
              )}
              <textarea
                placeholder="Notas: reparto de colores, plazo, lo que necesites…"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
              />
              <label className="qt-toggle qt-terms">
                <input
                  type="checkbox"
                  required
                  checked={aceptaTerminos}
                  onChange={(e) => setAceptaTerminos(e.target.checked)}
                />
                <span>
                  He leído y acepto los{' '}
                  <a href="/terminos" target="_blank" rel="noopener noreferrer">
                    Términos y Condiciones
                  </a>
                </span>
              </label>
              {/* honeypot */}
              <div className="qt-honeypot" aria-hidden="true">
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              {status.kind === 'err' && (
                <div className="qt-msg err" role="alert">{status.message}</div>
              )}

              <button
                type="submit"
                className="btn-primary qt-cta"
                disabled={status.kind === 'sending'}
              >
                {status.kind === 'sending' ? status.progress : 'Enviar solicitud'}
              </button>
              <p className="qt-form-legal">
                Tus datos y tus archivos se usan únicamente para preparar y gestionar
                este presupuesto, y se eliminan periódicamente. Puedes ejercer tus
                derechos escribiendo a info@impresion3dcc.com. Más información en
                nuestra <a href="/privacidad">Política de Privacidad</a>.
              </p>
            </form>
          )}

          {status.kind === 'ok' && (
            <div className="qt-success" role="status">
              <div className="qt-success-code">{status.codigo}</div>
              <p>
                ¡Solicitud recibida! Te hemos enviado un email de confirmación con
                el resumen. Puedes consultar el estado cuando quieras en{' '}
                <a href="/presupuesto" style={{ color: 'var(--accent)' }}>
                  impresion3dcc.com/presupuesto
                </a>{' '}
                con tu código.
              </p>
              <a
                className="btn-outline"
                href={`https://wa.me/${WHATSAPP}?text=${waText}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Continuar por WhatsApp
              </a>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
