'use client';

// Tasador propio — replaces the SeekMake embed.
// Flow: drop up to 5 model files → analyze geometry in-browser (a Web
// Worker lays each part on the bed the cheap way and "slices" it into
// per-layer statistics, like the shop does in OrcaSlicer) → configure
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
import { createClient } from '@/lib/supabase/client';
import {
  acabadoLabel,
  type Color,
  type Filamento,
  type QuoteEntrega,
  type QuoteEventoTipo
} from '@/lib/types';
import { colorPreviewStyle } from '@/lib/color-preview';
import { useCatalogoColores } from '@/lib/useCatalogoColores';
import {
  piezaColors,
  type ParsedModel,
  type Pieza,
  type PiezaConfig,
  type QuoteStatus
} from '@/lib/quote/types';
import { openQuotePdf } from '@/lib/quote/pdf';
import { createStudio, type Studio } from '@/lib/three/studio';
import {
  acabadoMaterialProps,
  applyMaterialUpdate,
  buildMaterialUpdate,
  ensureUVs
} from '@/lib/three/materials';
import { analyzeObject, looksDegenerate, suggestScales, type MeshMetrics } from '@/lib/quote/geometry';
import { analizarEnSegundoPlano } from '@/lib/quote/estimador/cliente';
import { IDENTIDAD, multiplicar, rotarTriangulos } from '@/lib/quote/estimador/orientar';
import { rotarModelo, transpuesta, triangulosImpresion } from '@/lib/quote/estimador/three';
import type { EstimacionEstado } from '@/lib/quote/types';
import { gzipFile, shouldCompress } from '@/lib/quote/compress';
import {
  computeQuote,
  normalizeSettings,
  DEFAULT_QUOTE_SETTINGS,
  type Cupon,
  type QuoteSettings
} from '@/lib/quote/pricing';
import './quote.css';
import { CONTACTO, ESCRIBENOS, whatsappUrl } from '@/lib/contacto';
import { euros } from '@/lib/recibo/types';

const MAX_FILE_MB = 50;
const MAX_FILES = 5;
const ACCEPT = '.stl,.3mf,.obj';

// Anonymous funnel id for quote_events (never identifies). Kept in
// sessionStorage so a reload in the same tab stays the same visit.
const SESSION_ID = (() => {
  const nuevo = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  try {
    const guardado = sessionStorage.getItem('qt-session');
    if (guardado) return guardado;
    sessionStorage.setItem('qt-session', nuevo);
  } catch {
    // SSR or storage blocked: one id per page load.
  }
  return nuevo;
})();

/**
 * Short id of a piece's shape: the same file gives the same id in any visit,
 * so /admin/estadisticas can tell one piece tried many times from many pieces.
 */
function huellaDe(m: MeshMetrics): string {
  const dims = [m.bboxMm.x, m.bboxMm.y, m.bboxMm.z].map((v) => Math.round(v)).sort((a, b) => a - b);
  const txt = `${Math.round(m.volumenCm3 * 10)}|${m.triangulos}|${dims.join('x')}`;
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

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

export function QuoteClient({
  filamentos: filamentosIniciales,
  colores: coloresIniciales
}: {
  filamentos: Filamento[];
  colores: Color[];
}) {
  // Build-time snapshot first, live data as soon as it arrives — otherwise a
  // colour marked agotado stays orderable until the next rebuild.
  const { filamentos, colores } = useCatalogoColores({
    filamentos: filamentosIniciales,
    colores: coloresIniciales
  });

  // ─── three.js plumbing ──────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<Studio | null>(null);
  // Parsed models cached per pieza id so switching pieces is instant.
  const modelsRef = useRef<Map<string, ParsedModel>>(new Map());
  const shownRef = useRef<string | null>(null);
  const textureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());

  // ─── settings (runtime fetch so tariff edits apply instantly) ───────────
  const [settings, setSettings] = useState<QuoteSettings>(DEFAULT_QUOTE_SETTINGS);
  // Don't show prices computed with defaults — wait for the real tariffs so
  // the total never visibly jumps after the fetch resolves.
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ─── model state ────────────────────────────────────────────────────────
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activePart, setActivePart] = useState(0);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [entrega, setEntrega] = useState<QuoteEntrega>('recogida');

  // ─── discount code (validated by validar_cupon, re-checked on submit) ──
  const [cupon, setCupon] = useState<Cupon | null>(null);
  const [cuponTxt, setCuponTxt] = useState('');
  const [cuponAbierto, setCuponAbierto] = useState(false);
  const [cuponError, setCuponError] = useState<string | null>(null);
  const [cuponCargando, setCuponCargando] = useState(false);

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
  const [status, setStatus] = useState<QuoteStatus>({ kind: 'idle' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Latest pieces for async callbacks, and a version per piece so a stale
  // analysis (superseded by a rescale or an orientation toggle) is ignored.
  const piezasRef = useRef<Pieza[]>([]);
  piezasRef.current = piezas;
  const versionAnalisis = useRef(new Map<string, number>());
  const analisisIniciados = useRef(new Set<string>());

  // Sticky price pill: visible only while the real breakdown is off-screen,
  // so the price follows you through the config steps without duplicating.
  const totalRef = useRef<HTMLDivElement>(null);
  const [totalInView, setTotalInView] = useState(true);

  useEffect(() => {
    const el = totalRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setTotalInView(entry.isIntersecting),
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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
        setSettingsLoaded(true);
      });
  }, []);

  async function aplicarCupon(txt: string) {
    const codigo = txt.trim().toUpperCase();
    if (!codigo) return;
    setCuponCargando(true);
    setCuponError(null);
    const { data, error } = await createClient().rpc('validar_cupon', { p_codigo: codigo });
    setCuponCargando(false);
    setCuponAbierto(true);
    const fila = Array.isArray(data) ? data[0] : null;
    if (error) {
      setCuponError('No hemos podido comprobar el código. Inténtalo de nuevo.');
    } else if (!fila) {
      setCuponError(`El código ${codigo} no existe o ya no está activo.`);
    } else {
      setCupon({
        codigo: fila.codigo,
        tipo: fila.tipo,
        valor: Number(fila.valor),
        pedido_minimo: Number(fila.pedido_minimo)
      });
      setCuponTxt('');
    }
  }

  // Campaign links: /instant-quote?cupon=NAVIDAD10 applies it straight away.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('cupon');
    if (c) void aplicarCupon(c);
  }, []);

  // Fire-and-forget funnel event (errors are irrelevant to the customer).
  function trackEvent(evento: Exclude<QuoteEventoTipo, 'aceptado'>, payload: Record<string, unknown> = {}) {
    void createClient()
      .from('quote_events')
      .insert({ session_id: SESSION_ID, evento, payload })
      .then(() => undefined, () => undefined);
  }

  // ─── scene setup (same studio as the muestrario visualizer) ─────────────
  useEffect(() => {
    const studio = createStudio(canvasRef.current, wrapRef.current);
    if (!studio) return;
    stateRef.current = studio;

    const models = modelsRef.current;
    return () => {
      studio.dispose();
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
      ensureUVs(mesh.geometry);
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
            config: defaultConfig(model.meshes.length),
            estimacion: {
              estado: 'pendiente',
              progreso: 0,
              R: [...IDENTIDAD] as EstimacionEstado['R'],
              original: true,
              mantenerOriginal: false
            }
          };
          setPiezas((prev) => [...prev, pieza]);
          count++;
          added = pieza;
          trackEvent('pieza_anadida', {
            ext,
            huella: huellaDe(metrics),
            volumen_cm3: Math.round(metrics.volumenCm3 * 10) / 10,
            triangulos: metrics.triangulos,
            bbox_mm: [metrics.bboxMm.x, metrics.bboxMm.z, metrics.bboxMm.y].map((v) => Math.round(v))
          });
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

  // Start the analysis of new pieces once the real tariffs (and the printer
  // profile they carry) are loaded.
  useEffect(() => {
    if (!settingsLoaded) return;
    for (const p of piezas) {
      if (analisisIniciados.current.has(p.id)) continue;
      analisisIniciados.current.add(p.id);
      lanzarAnalisis(p.id, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piezas, settingsLoaded]);

  // Show the active pieza in the viewer whenever it changes.
  useEffect(() => {
    if (activeId) showModel(activeId);
  }, [activeId]);

  // A small picture of each new piece as the viewer shows it (not the file),
  // for /admin/estadisticas. Deleted after 30 days; see /privacidad.
  const miniaturas = useRef(new Set<string>());
  useEffect(() => {
    if (!activeId) return;
    const t = setTimeout(() => {
      const p = piezasRef.current.find((x) => x.id === activeId);
      const st = stateRef.current;
      if (!p || !st || shownRef.current !== activeId) return;
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
    versionAnalisis.current.delete(id);
    setPiezas((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (activeId === id) {
        setActiveId(next[0]?.id ?? null);
        setActivePart(0);
      }
      return next;
    });
  }

  // Rescale a piece whose file came in non-mm units (inches/metres):
  // scale the model, rest it back on the plate and re-measure.
  function rescalePieza(id: string, factor: number) {
    const model = modelsRef.current.get(id);
    if (!model) return;
    model.root.scale.multiplyScalar(factor);
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.root.position.x -= center.x;
    model.root.position.z -= center.z;
    model.root.position.y -= box.min.y;
    model.root.updateMatrixWorld(true);
    const metrics = analyzeObject(model.root);
    setPiezas((prev) => prev.map((p) => (p.id === id ? { ...p, metrics } : p)));
    if (shownRef.current === id) showModel(id); // refit the camera
    const pieza = piezasRef.current.find((p) => p.id === id);
    lanzarAnalisis(id, pieza?.estimacion.mantenerOriginal ?? false);
  }

  function patchEstimacion(id: string, patch: Partial<EstimacionEstado>) {
    setPiezas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, estimacion: { ...p.estimacion, ...patch } } : p))
    );
  }

  // Slice-like analysis in the worker. With `mantenerOriginal` false the
  // worker also picks the cheapest orientation on the bed, and the viewer
  // is turned to show the part exactly as it will be printed.
  function lanzarAnalisis(id: string, mantenerOriginal: boolean) {
    const model = modelsRef.current.get(id);
    const pieza = piezasRef.current.find((p) => p.id === id);
    if (!model || !pieza) return;
    const version = (versionAnalisis.current.get(id) ?? 0) + 1;
    versionAnalisis.current.set(id, version);
    const vigente = () => versionAnalisis.current.get(id) === version;

    // Mesh as uploaded: undo whatever orientation the viewer shows now.
    const tri = rotarTriangulos(
      triangulosImpresion(model.root),
      transpuesta(pieza.estimacion.R)
    );
    const fil = filamentos.find((f) => f.id === pieza.config.filamentoId);
    patchEstimacion(id, { estado: 'pendiente', progreso: 0, mantenerOriginal });

    analizarEnSegundoPlano(
      {
        id: `${id}:${version}`,
        tri,
        ajustes: settings,
        pieza: {
          material: fil?.material ?? 'PLA',
          resistenciaId: pieza.config.resistenciaId,
          detalleId: pieza.config.detalleId
        },
        auto: settings.orientacion_auto && !mantenerOriginal,
        tolerancia: settings.orientacion_tolerancia_pct / 100
      },
      (f) => {
        if (vigente()) patchEstimacion(id, { progreso: f });
      }
    )
      .then((res) => {
        if (!vigente()) return;
        const m = modelsRef.current.get(id);
        const actual = piezasRef.current.find((p) => p.id === id);
        if (!m || !actual) return;
        rotarModelo(m.root, multiplicar(res.R, transpuesta(actual.estimacion.R)));
        const metrics = analyzeObject(m.root);
        setPiezas((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  metrics,
                  estimacion: {
                    ...p.estimacion,
                    estado: 'ok',
                    progreso: 1,
                    analisis: res.analisis,
                    R: res.R,
                    original: res.original
                  }
                }
              : p
          )
        );
        if (shownRef.current === id) showModel(id);
      })
      .catch((err) => {
        console.error(err);
        if (vigente()) patchEstimacion(id, { estado: 'error', progreso: 1 });
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
    if (!piezas.length || !settingsLoaded) return null;
    return computeQuote(
      piezas.map((p) => {
        const fil = filamentos.find((f) => f.id === p.config.filamentoId);
        return {
          nombre: p.name,
          metrics: p.metrics,
          analisis: p.estimacion.estado === 'ok' ? p.estimacion.analisis : null,
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
      settings,
      entrega,
      cupon
    );
  }, [piezas, filamentos, settings, settingsLoaded, entrega, cupon]);

  const maxBedMm = settings.max_bed_mm;
  const tooBig = piezas.some(
    (p) => Math.max(p.metrics.bboxMm.x, p.metrics.bboxMm.y, p.metrics.bboxMm.z) > maxBedMm
  );
  const degenerate = piezas.some((p) => looksDegenerate(p.metrics));
  const piezasSinColor = piezas.filter((p) => piezaColors(p).length === 0);
  // Pieces still being "sliced": the price waits for them.
  const analizando = piezas.filter((p) => p.estimacion.estado === 'pendiente');
  const progresoAnalisis = analizando.length
    ? analizando.reduce((a, p) => a + p.estimacion.progreso, 0) / analizando.length
    : 1;
  const listo = !!quote && analizando.length === 0;

  // The price on screen: the funnel's "saw the price" step, then again each
  // time it settles on a new figure (3 s without changes), so the last one is
  // what the visitor had when they left. Capped per visit.
  const precioVisto = useRef({ enviados: 0, firma: '' });
  useEffect(() => {
    if (!listo || !quote) return;
    const datos = {
      total: quote.total,
      piezas: piezas.length,
      entrega,
      detalle: quote.piezas.map((r, i) => ({
        h: piezas[i] ? huellaDe(piezas[i].metrics) : '',
        mat: r.material,
        n: r.cantidad,
        g: Math.round(r.pesoG),
        t: Math.round(r.tiempoH * 10) / 10,
        eur: r.subtotal
      }))
    };
    const firma = JSON.stringify(datos);
    const ref = precioVisto.current;
    if (firma === ref.firma || ref.enviados >= 15) return;
    const t = setTimeout(
      () => {
        ref.firma = firma;
        ref.enviados++;
        trackEvent('precio_visto', datos);
      },
      ref.enviados === 0 ? 0 : 3000
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, quote]);
  // Suspiciously tiny model → probably exported in inches/metres.
  const scaleSuggestions = activePieza ? suggestScales(activePieza.metrics) : [];

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
    if (!activePieza || c.agotado) return;
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
    if (!activePieza || c.agotado) return;
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
    if (!piezas.length || !quote || !listo) return;
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
                      ? {
                          nombre: c.nombre,
                          hex: c.hex,
                          muestra_colores: c.muestra_colores,
                          muestra_tipo: c.muestra_tipo,
                          acabado: c.acabado,
                          parte: p.partNames[j]
                        }
                    : null
                )
                .filter(Boolean)
            : piezaColors(p).map((c) => ({
                nombre: c.nombre,
                hex: c.hex,
                muestra_colores: c.muestra_colores,
                muestra_tipo: c.muestra_tipo,
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
            soporte_cm3: Math.round(p.metrics.soporteCm3 * 10) / 10,
            overhang_cm2: Math.round(p.metrics.overhangCm2 * 10) / 10,
            bbox_mm: p.metrics.bboxMm,
            triangulos: p.metrics.triangulos,
            mallas: p.metrics.mallas,
            peso_g: pr?.pesoG ?? null,
            soporte_g: pr?.soporteG ?? null,
            tiempo_h: pr?.tiempoH ?? null,
            relleno_pct: pr?.rellenoPct ?? null,
            // Layer-analysis figures the server prices from (see submit-quote).
            estimador: pr?.metodo === 'capas' ? 'capas-v1' : 'aproximado',
            por_cama: pr?.porCama ?? 1,
            camas: pr?.camas ?? 1,
            con_soportes: pr?.conSoportes ?? false,
            orientacion: p.estimacion.original ? 'original' : 'auto',
            rotacion: p.estimacion.R.map((x) => Math.round(x * 1e4) / 1e4)
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
            minimo_aplicado: quote.minimoAplicado,
            envio: quote.envio
          },
          precio_total: quote.total,
          cupon: quote.cupon ?? undefined
        }
      });

      if (error) {
        // Non-2xx: the function's own message is in the response body.
        const cuerpo = await (error as { context?: Response }).context
          ?.json()
          .catch(() => null);
        if (cuerpo?.cupon_invalido) {
          // Expired or ran out since the price was shown: drop it and let the
          // customer see the new total before sending again.
          setCupon(null);
          setCuponError(cuerpo.error);
          setStatus({
            kind: 'err',
            message: `${cuerpo.error} Hemos recalculado el precio sin él: revísalo y vuelve a enviar.`
          });
          return;
        }
        setStatus({
          kind: 'err',
          message: cuerpo?.error ?? error.message ?? 'No se pudo enviar la solicitud.'
        });
        return;
      }
      if (data?.error) {
        setStatus({ kind: 'err', message: data.error });
        return;
      }
      trackEvent('solicitud_enviada', {
        codigo: data?.codigo,
        piezas: piezas.length,
        total: quote.total
      });
      setStatus({ kind: 'ok', codigo: data?.codigo ?? '' });
    } catch {
      setStatus({
        kind: 'err',
        message: `Error de red. Inténtalo de nuevo o ${ESCRIBENOS}.`
      });
    }
  }

  // Printable summary — the browser's "save as PDF" does the heavy lifting,
  // no PDF library needed for a static-export site.
  function downloadPdf() {
    if (!quote) return;
    if (!openQuotePdf(quote, settings)) return;
    trackEvent('pdf_descargado', { total: quote.total, piezas: piezas.length });
  }

  const waMensaje = `Hola, soy ${nombre}. Acabo de solicitar el presupuesto ${
    status.kind === 'ok' ? status.codigo : ''
  } desde la web.`;

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
              <div className="qt-drop-aviso">
                Tu archivo no sale de tu navegador hasta que nos pides el presupuesto. Para ajustar
                precios guardamos 30 días una miniatura de la pieza y el precio calculado, sin datos
                tuyos (más en la política de privacidad).
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
              {activePieza.estimacion.estado === 'ok' && settings.orientacion_auto && (
                <button
                  type="button"
                  className="qt-meta-orient"
                  onClick={() =>
                    lanzarAnalisis(activePieza.id, !activePieza.estimacion.mantenerOriginal)
                  }
                  title={
                    activePieza.estimacion.original
                      ? 'Buscar la colocación más económica en la cama'
                      : 'Presupuestar la pieza tal y como está en tu archivo'
                  }
                >
                  {activePieza.estimacion.mantenerOriginal
                    ? 'Tu orientación · optimizar'
                    : activePieza.estimacion.original
                      ? 'Orientación óptima'
                      : 'Colocada para imprimir · usar la mía'}
                </button>
              )}
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
          {(tooBig || degenerate || scaleSuggestions.length > 0) && (
            <div className="qt-warn">
              {scaleSuggestions.length > 0 && activePieza && (
                <div>
                  <p>
                    ⚠ <strong>{activePieza.name}</strong> mide solo{' '}
                    {Math.max(
                      activePieza.metrics.bboxMm.x,
                      activePieza.metrics.bboxMm.y,
                      activePieza.metrics.bboxMm.z
                    ).toFixed(1)}{' '}
                    mm. ¿Quizá el archivo no está en milímetros?
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    {scaleSuggestions.map((s) => (
                      <button
                        key={s.unidad}
                        type="button"
                        className="btn-outline"
                        style={{ padding: '6px 14px', fontSize: 11 }}
                        onClick={() => rescalePieza(activePieza.id, s.factor)}
                      >
                        Convertir de {s.unidad} (×{s.factor})
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {tooBig && (
                <p>
                  ⚠ Alguna pieza supera los {maxBedMm} mm en algún eje. Puede que
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
                          <span key={c.id} style={colorPreviewStyle(c)} />
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
                        className={
                          'qt-swatch' +
                          (isMain || isExtra ? ' active' : '') +
                          (c.agotado ? ' agotado' : '')
                        }
                        style={colorPreviewStyle(c)}
                        disabled={c.agotado}
                        title={
                          c.nombre +
                          (c.acabado ? ` · ${acabadoLabel(c.acabado)}` : '') +
                          (c.agotado ? ' · Agotado' : '')
                        }
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
                                    : '') +
                                  (c.agotado ? ' agotado' : '')
                                }
                                style={colorPreviewStyle(c)}
                                disabled={c.agotado}
                                title={c.nombre + (c.agotado ? ' · Agotado' : '')}
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
                        <span style={colorPreviewStyle(c)} />
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
                  <span>Coste estimado por peso, incluido en el total</span>
                </button>
              </div>
            </div>
          )}

          {/* breakdown */}
          <div className="qt-total" ref={totalRef}>
            {!piezas.length && (
              <p className="qt-total-empty">Sube una pieza para ver el precio.</p>
            )}
            {piezas.length > 0 && !settingsLoaded && (
              <p className="qt-total-empty">Cargando tarifas…</p>
            )}
            {piezas.length > 0 && settingsLoaded && analizando.length > 0 && (
              <div className="qt-total-empty qt-analizando" role="status">
                <p>
                  Laminando {analizando.length === 1 ? 'tu pieza' : `${analizando.length} piezas`}{' '}
                  para calcular gramos y horas reales…
                </p>
                <div className="qt-progress">
                  <span style={{ width: `${Math.round(progresoAnalisis * 100)}%` }} />
                </div>
              </div>
            )}
            {piezas.length > 0 && listo && quote && (
              <>
                <ul className="qt-lines">
                  {quote.lineas.map((l, i) => (
                    <li key={i}>
                      <span>{l.concepto}</span>
                      <span>{euros(l.importe)}</span>
                    </li>
                  ))}
                </ul>
                <div className="qt-total-row">
                  <span>Total estimado</span>
                  <strong>{euros(quote.total)}</strong>
                </div>
                {quote.minimoAplicado && (
                  <p className="qt-total-note">Se aplica el pedido mínimo.</p>
                )}
                <div className="qt-cupon">
                  {cupon ? (
                    <p className={quote.cupon ? 'qt-cupon-ok' : 'qt-cupon-aviso'}>
                      {quote.cupon
                        ? `Código ${cupon.codigo} aplicado: −${euros(quote.cuponDescuento)}` +
                          (quote.minimoAplicado
                            ? `, pero el total no baja del pedido mínimo (${euros(settings.precio_minimo)}).`
                            : '')
                        : quote.descuentoPct > 0
                          ? `El descuento por cantidad es mayor que el código ${cupon.codigo}; aplicamos ese.`
                          : `El código ${cupon.codigo} es para pedidos desde ${euros(cupon.pedido_minimo)} en piezas.`}
                      <button type="button" className="qt-cupon-quitar" onClick={() => setCupon(null)}>
                        Quitar
                      </button>
                    </p>
                  ) : cuponAbierto ? (
                    <form
                      className="qt-cupon-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void aplicarCupon(cuponTxt);
                      }}
                    >
                      <input
                        value={cuponTxt}
                        onChange={(e) => setCuponTxt(e.target.value)}
                        placeholder="Código de descuento"
                        aria-label="Código de descuento"
                        autoCapitalize="characters"
                        autoComplete="off"
                        maxLength={30}
                      />
                      <button type="submit" className="btn-outline" disabled={cuponCargando || !cuponTxt.trim()}>
                        {cuponCargando ? '…' : 'Aplicar'}
                      </button>
                    </form>
                  ) : (
                    <button type="button" className="qt-cupon-abrir" onClick={() => setCuponAbierto(true)}>
                      ¿Tienes un código de descuento?
                    </button>
                  )}
                  {cuponError && !cupon && (
                    <p className="qt-cupon-error" role="alert">{cuponError}</p>
                  )}
                </div>
                <p className="qt-total-plazo">
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 3" />
                  </svg>
                  Listo en ~{quote.diasEstimados} día{quote.diasEstimados !== 1 ? 's' : ''} laborables
                  {entrega === 'envio' ? ' + envío' : ''}
                </p>
                {entrega === 'envio' && quote.envio > 0 && (
                  <p className="qt-total-note">
                    Envío estimado por peso incluido en el total — lo confirmamos
                    junto al presupuesto (recogida en Salamanca gratis).
                  </p>
                )}
                <p className="qt-total-note">
                  Calculado laminando tus piezas como en nuestra impresora
                  (~{Math.round(quote.pesoG)} g, ~{quote.tiempoH.toFixed(1)} h de impresión
                  en total), válido {settings.validez_dias} días. Te confirmamos el
                  precio final al revisar las piezas.
                </p>
                {quote.piezas.some((p) => p.metodo === 'aproximado') && (
                  <p className="qt-total-note">
                    Alguna pieza no se pudo laminar en el navegador; su precio es una
                    aproximación por volumen.
                  </p>
                )}
                <button
                  type="button"
                  className="btn-outline qt-pdf"
                  style={{ marginTop: 10, padding: '8px 16px', fontSize: 11 }}
                  onClick={downloadPdf}
                >
                  Descargar resumen (PDF)
                </button>
              </>
            )}
          </div>

          {/* request */}
          {piezas.length > 0 && listo && status.kind !== 'ok' && !showForm && (
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
                  <a href="/terminos/" target="_blank" rel="noopener noreferrer">
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
                derechos escribiendo a {CONTACTO.email}. Más información en
                nuestra <a href="/privacidad/">Política de Privacidad</a>.
              </p>
            </form>
          )}

          {status.kind === 'ok' && (
            <div className="qt-success" role="status">
              <div className="qt-success-code">{status.codigo}</div>
              <p>
                ¡Solicitud recibida! Te hemos enviado un email de confirmación con
                el resumen y un enlace personal para aceptar el presupuesto cuando
                lo revisemos. Puedes consultar el estado cuando quieras en{' '}
                <a
                  href={`/presupuesto?codigo=${encodeURIComponent(status.codigo)}`}
                  style={{ color: 'var(--accent)' }}
                >
                  {CONTACTO.dominio}/presupuesto
                </a>
                .
              </p>
              <a
                className="btn-outline"
                href={whatsappUrl(waMensaje)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Continuar por WhatsApp
              </a>
            </div>
          )}
        </aside>
      </div>

      {/* Sticky price — follows the user while configuring; tapping it jumps
          to the full breakdown. Hidden once the breakdown itself is visible
          or after the request is sent. */}
      {listo && quote && status.kind !== 'ok' && !totalInView && (
        <button
          type="button"
          className="qt-sticky-price"
          onClick={() =>
            totalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
          aria-label="Ver desglose del precio"
        >
          <span className="qt-sticky-label">Total estimado</span>
          <strong>{euros(quote.total)}</strong>
          <span className="qt-sticky-days">~{quote.diasEstimados} d</span>
        </button>
      )}
    </div>
  );
}
