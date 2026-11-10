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
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createClient } from '@/lib/supabase/client';
import {
  acabadoLabel,
  type Color,
  type Filamento,
  type QuoteEntrega,
  type QuoteEventoTipo,
  type ResenasResumen
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
import { IDENTIDAD } from '@/lib/quote/estimador/orientar';
import { triangulosImpresion } from '@/lib/quote/estimador/three';
import type { EstimacionEstado } from '@/lib/quote/types';
import { gzipFile, shouldCompress } from '@/lib/quote/compress';
import { colorParecido, leer3mf, zonificar, type Meta3mf } from '@/lib/quote/tresmf';
import {
  computeQuote,
  normalizeSettings,
  fechaLarga,
  fechaTope,
  DEFAULT_QUOTE_SETTINGS,
  type Cupon,
  type PiezaInput,
  type QuoteSettings
} from '@/lib/quote/pricing';
import { plazoRespuesta } from '@/lib/quote/respuesta';
import { noRastrear, origenVisita } from '@/lib/tracking';
import { WhatsAppIcon } from '@/components/WhatsAppFAB';
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

/** The one contact field: an email if it has an @, else a phone of 9+ digits. */
function leerContacto(txt: string): { email: string; telefono: string } | null {
  const t = txt.trim();
  if (t.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? { email: t, telefono: '' } : null;
  return t.replace(/\D/g, '').length >= 9 ? { email: '', telefono: t } : null;
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
  colores: coloresIniciales,
  resenas
}: {
  filamentos: Filamento[];
  colores: Color[];
  resenas: ResenasResumen | null;
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
  // Hours already queued (accepted orders): the deadline counts them.
  const [colaH, setColaH] = useState(0);
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
  // Only a way to reach the customer: name, address and colours are asked
  // when we answer (the long form was where people gave up).
  const [showForm, setShowForm] = useState(false);
  const [contacto, setContacto] = useState('');
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [cp, setCp] = useState(''); // optional, envío only: local vs national traffic
  const [website, setWebsite] = useState(''); // honeypot
  const [status, setStatus] = useState<QuoteStatus>({ kind: 'idle' });
  const successRef = useRef<HTMLDivElement>(null);

  // "Envíame el presupuesto por email" for whoever is not ready to ask yet.
  const [guardarAbierto, setGuardarAbierto] = useState(false);
  const [guardarEmail, setGuardarEmail] = useState('');
  const [guardado, setGuardado] = useState<
    { kind: 'idle' } | { kind: 'sending' } | { kind: 'ok'; email: string } | { kind: 'err'; message: string }
  >({ kind: 'idle' });

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
    createClient()
      .rpc('plazo_cola_horas')
      .then(({ data }) => setColaH(Number(data) || 0), () => undefined);
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
    if (noRastrear()) return;
    void createClient()
      .from('quote_events')
      .insert({ session_id: SESSION_ID, evento, payload })
      .then(() => undefined, () => undefined);
  }

  // One 'visita' per visit, with where it came from and the kind of device.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('qt-visita')) return;
      sessionStorage.setItem('qt-visita', '1');
    } catch {
      // storage blocked: one per page load
    }
    trackEvent('visita', origenVisita());
  }, []);

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
  }, []);

  // ─── file parsing ───────────────────────────────────────────────────────
  async function parseModel(f: File, ext: string): Promise<ParsedModel> {
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

    // Center on the plate: x/z centered, base resting on y=0.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    box.getCenter(center);
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    root.updateMatrixWorld(true);

    return { root, meshes, zonas };
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

  // Zone colors taken from the customer's project, matched to our catalog.
  function sugerirColores(sugeridos: (string | null)[], filamentoId: string): (Color | null)[] {
    const disponibles = colores.filter((c) => c.filamento_id === filamentoId && !c.agotado);
    // A plain grey in the file is a plain color here, not glitter or silk.
    const lisos = disponibles.filter(
      (c) => c.muestra_tipo === 'solido' && (!c.acabado || c.acabado === 'Mate' || c.acabado === 'Brillante')
    );
    const base = lisos.length ? lisos : disponibles;
    return sugeridos.map((h) => (h ? colorParecido(h, base) : null));
  }

  function defaultConfig(sugeridos: (string | null)[]): PiezaConfig {
    // New pieces inherit the active piece's config so a same-settings
    // multi-piece order needs no extra clicks.
    const base = activePieza?.config;
    const filamentoId = base?.filamentoId ?? filamentos[0]?.id ?? '';
    return {
      filamentoId,
      mainColor: base?.mainColor ?? null,
      multicolor: false,
      extraColors: [],
      partColors:
        sugeridos.length > 1
          ? sugerirColores(sugeridos, filamentoId)
          : [base?.mainColor ?? null],
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
            partNames: model.zonas.map((z) => z.nombre),
            sugeridos: model.zonas.map((z) => z.sugerido),
            config: defaultConfig(model.zonas.map((z) => z.sugerido)),
            estimacion: {
              estado: 'pendiente',
              progreso: 0,
              R: [...IDENTIDAD] as EstimacionEstado['R'],
              original: true
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
      // A sent request stays on screen; "Calcular otra pieza" starts over.
      setStatus((s) => (s.kind === 'ok' ? s : { kind: 'idle' }));
    }
  }

  // Start the analysis of new pieces once the real tariffs (and the printer
  // profile they carry) are loaded.
  useEffect(() => {
    if (!settingsLoaded) return;
    for (const p of piezas) {
      if (analisisIniciados.current.has(p.id)) continue;
      analisisIniciados.current.add(p.id);
      lanzarAnalisis(p.id);
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
      if (!p || !st || shownRef.current !== activeId || noRastrear()) return;
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
    lanzarAnalisis(id);
  }

  function patchEstimacion(id: string, patch: Partial<EstimacionEstado>) {
    setPiezas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, estimacion: { ...p.estimacion, ...patch } } : p))
    );
  }

  // Slice-like analysis in the worker, which also picks the cheapest
  // orientation on the bed. That orientation is for our slicer and the
  // price only: the viewer keeps the part as the customer uploaded it.
  function lanzarAnalisis(id: string) {
    const model = modelsRef.current.get(id);
    const pieza = piezasRef.current.find((p) => p.id === id);
    if (!model || !pieza) return;
    const version = (versionAnalisis.current.get(id) ?? 0) + 1;
    versionAnalisis.current.set(id, version);
    const vigente = () => versionAnalisis.current.get(id) === version;

    const tri = triangulosImpresion(model.root); // the viewer shows the file as uploaded
    const fil = filamentos.find((f) => f.id === pieza.config.filamentoId);
    patchEstimacion(id, { estado: 'pendiente', progreso: 0 });

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
        auto: settings.orientacion_auto,
        tolerancia: settings.orientacion_tolerancia_pct / 100
      },
      (f) => {
        if (vigente()) patchEstimacion(id, { progreso: f });
      }
    )
      .then((res) => {
        if (!vigente()) return;
        // Metrics stay those of the file as uploaded, matching what the
        // viewer shows; the layer analysis carries the print orientation.
        setPiezas((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
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

    model.zonas.forEach(({ mat }, i) => {
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

  const entradas = useMemo<PiezaInput[]>(
    () =>
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
    [piezas, filamentos]
  );

  const quote = useMemo(() => {
    if (!entradas.length || !settingsLoaded) return null;
    return computeQuote(entradas, settings, entrega, cupon);
  }, [entradas, settings, settingsLoaded, entrega, cupon]);

  // Small orders pay the minimum: what one more unit of the active piece
  // would add, so the customer can see the order has room left.
  const masUnaUnidad = useMemo(() => {
    if (!quote?.minimoAplicado || !activeId) return null;
    const i = piezas.findIndex((p) => p.id === activeId);
    if (i < 0) return null;
    const otra = computeQuote(
      entradas.map((e, j) => (j === i ? { ...e, cantidad: e.cantidad + 1 } : e)),
      settings,
      entrega,
      cupon
    );
    return { pieza: piezas[i], extra: Math.max(0, Math.round((otra.total - quote.total) * 100) / 100) };
  }, [quote, activeId, piezas, entradas, settings, entrega, cupon]);

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
  // "Final" only when nothing on screen says we still have to look at it.
  // With validated piece types (phase 1) only a firm price is final; with
  // the list empty, the old rule (everything layer-analysed).
  const firmeActivo = settings.tipos_precio_firme.length > 0;
  const precioFinal =
    !!quote && !tooBig && !degenerate &&
    (firmeActivo ? quote.precioFirme : quote.piezas.every((p) => p.metodo === 'capas'));
  const listoAntes = quote ? fechaTope(quote.tiempoH, settings, colaH) : null;
  const cpValido = entrega === 'envio' && /^\d{5}$/.test(cp) ? cp : undefined;

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
      cp: cpValido,
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
      partColors: sugerirColores(activePieza.sugeridos, f.id)
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
  /** What the server needs to price one piece (no file: see submit). */
  function fichaPieza(p: Pieza, i: number): Record<string, unknown> {
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
    const pr = quote?.piezas[i];
    return {
      nombre: p.name,
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
    };
  }

  /** The order-level fields both the request and "envíame el presupuesto" send. */
  function cuerpoPedido(archivos: Record<string, unknown>[]) {
    if (!quote) return null;
    const materiales = [...new Set(archivos.map((a) => a.material as string))];
    const resistencias = [...new Set(piezas.map((p) => p.config.resistenciaId))];
    const detalles = [...new Set(piezas.map((p) => p.config.detalleId))];
    const coloresGlobal = archivos.flatMap((a, i) =>
      (a.colores as any[]).map((c) => ({
        ...c,
        parte: piezas.length > 1 ? `${piezas[i].name}${c.parte ? ` · ${c.parte}` : ''}` : c.parte
      }))
    );
    return {
      website,
      archivos,
      material: materiales.join(', '),
      colores: coloresGlobal,
      resistencia: resistencias.length === 1 ? resistencias[0] : 'mixto',
      detalle: detalles.length === 1 ? detalles[0] : 'mixto',
      cantidad: quote.unidades,
      entrega,
      direccion: cpValido ? { cp: cpValido } : {},
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
    };
  }

  /** The function's own message for a non-2xx answer, if it sent one. */
  async function cuerpoError(error: unknown): Promise<{ error?: string; cupon_invalido?: boolean } | null> {
    return (await (error as { context?: Response }).context?.json().catch(() => null)) ?? null;
  }

  function fallo(message: string, motivo: string) {
    setStatus({ kind: 'err', message });
    trackEvent('formulario_error', { motivo: motivo.slice(0, 80) });
  }

  function abrirFormulario() {
    setShowForm(true);
    trackEvent('formulario_abierto', { total: quote?.total, entrega });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!piezas.length || !quote || !listo || status.kind === 'sending') return;
    const datos = leerContacto(contacto);
    if (!datos) {
      fallo('Escribe un email (tu@email.com) o un móvil de 9 cifras.', 'contacto');
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

        archivos.push({
          ...fichaPieza(p, i),
          url: pub.publicUrl,
          path,
          tamano: blob.size,
          tamano_original: p.size,
          comprimido
        });
      }

      setStatus({ kind: 'sending', progress: 'Registrando solicitud…' });

      // 2. Quote request → Edge Function (inserts row + emails).
      const { data, error } = await supabase.functions.invoke('submit-quote', {
        body: { ...cuerpoPedido(archivos), ...datos, nombre, mensaje }
      });

      if (error) {
        const cuerpo = await cuerpoError(error);
        if (cuerpo?.cupon_invalido) {
          // Expired or ran out since the price was shown: drop it and let the
          // customer see the new total before sending again.
          setCupon(null);
          setCuponError(cuerpo.error ?? null);
          fallo(`${cuerpo.error} Hemos recalculado el precio sin él: revísalo y vuelve a enviar.`, 'cupon');
          return;
        }
        const msg = cuerpo?.error ?? error.message ?? 'No se pudo enviar la solicitud.';
        fallo(msg, msg);
        return;
      }
      if (data?.error) {
        fallo(data.error, data.error);
        return;
      }
      if (!data?.duplicado) {
        trackEvent('solicitud_enviada', {
          codigo: data?.codigo,
          piezas: piezas.length,
          total: quote.total,
          entrega,
          cp: cpValido,
          via: datos.email ? 'email' : 'whatsapp'
        });
      }
      setStatus({ kind: 'ok', codigo: data?.codigo ?? '', duplicado: !!data?.duplicado, porEmail: !!datos.email });
    } catch {
      fallo(`Error de red. Inténtalo de nuevo o ${ESCRIBENOS}.`, 'red');
    }
  }

  // Move focus to the confirmation so screen readers and keyboards land on it.
  useEffect(() => {
    if (status.kind === 'ok') successRef.current?.focus();
  }, [status.kind]);

  async function enviarPorEmail(e: FormEvent) {
    e.preventDefault();
    const email = guardarEmail.trim();
    if (!quote || guardado.kind === 'sending') return;
    if (!leerContacto(email)?.email) {
      setGuardado({ kind: 'err', message: 'Revisa el email: parece que le falta algo.' });
      return;
    }
    setGuardado({ kind: 'sending' });
    try {
      const { data, error } = await createClient().functions.invoke('submit-quote', {
        body: { ...cuerpoPedido(piezas.map(fichaPieza)), accion: 'guardar', email }
      });
      const msg = error ? (await cuerpoError(error))?.error ?? 'No hemos podido enviarlo.' : data?.error;
      setGuardado(msg ? { kind: 'err', message: msg } : { kind: 'ok', email });
    } catch {
      setGuardado({ kind: 'err', message: 'Error de red. Inténtalo de nuevo.' });
    }
  }

  // Printable summary — the browser's "save as PDF" does the heavy lifting,
  // no PDF library needed for a static-export site.
  function downloadPdf() {
    if (!quote) return;
    if (!openQuotePdf(quote, settings, colaH)) return;
    trackEvent('pdf_descargado', { total: quote.total, piezas: piezas.length });
  }

  // Night visitors would rather type than fill a form: the whole order, ready to send.
  const waPedido = quote
    ? [
        'Hola, quiero pedir este presupuesto de la web:',
        ...quote.lineas.map((l) => `• ${l.concepto}: ${euros(l.importe)}`),
        `Total: ${euros(quote.total)} · ${entrega === 'envio' ? `envío${cpValido ? ` a ${cpValido}` : ''}` : 'recogida en Salamanca'}`,
        `Colores: ${piezas
          .map((p) => `${piezas.length > 1 ? `${p.name} → ` : ''}${piezaColors(p).map((c) => c.nombre).join(', ') || 'me ayudáis a elegir'}`)
          .join('; ')}`,
        'Os mando el archivo por aquí.'
      ].join('\n')
    : '';

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
                  <>
                    <p className="qt-step-hint">
                      Elige una parte (o tócala en el visor) y después su color.
                      {activePieza.sugeridos.some(Boolean) &&
                        ' Hemos puesto los colores más parecidos a los de tu archivo; cámbialos si quieres.'}
                    </p>
                    <div className="qt-parts" role="group" aria-label="Partes de la pieza">
                      {activePieza.partNames.map((name, i) => {
                        const c = activePieza.config.partColors[i];
                        return (
                          <button
                            key={i}
                            type="button"
                            className={'qt-part' + (activePart === i ? ' active' : '')}
                            aria-pressed={activePart === i}
                            onClick={() => setActivePart(i)}
                          >
                            <span
                              className={'qt-part-swatch' + (c ? '' : ' vacio')}
                              style={c ? colorPreviewStyle(c) : undefined}
                            />
                            <span className="qt-part-txt">
                              <strong>{name}</strong>
                              <small>{c?.nombre ?? 'Sin color'}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                <div className="qt-swatches">
                  {materialColors.map((c) => {
                    const cfg = activePieza.config;
                    // In parts mode only the selected part's color is marked.
                    const isMain = partsMode
                      ? cfg.partColors[activePart]?.id === c.id
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
                        aria-pressed={isMain || isExtra}
                        aria-label={c.nombre + (c.agotado ? ' (agotado)' : '')}
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
                          cómo repartirlos. Si nos subes un 3MF con cada color como
                          parte (o pintado en Bambu Studio u Orca), podrás elegir el
                          color de cada parte aquí mismo.
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
                  aria-pressed={entrega === 'recogida'}
                  onClick={() => setEntrega('recogida')}
                >
                  <strong>Recogida en Salamanca</strong>
                  <span>Gratis · Plza. Barrio Vidal</span>
                </button>
                <button
                  type="button"
                  className={'qt-card' + (entrega === 'envio' ? ' active' : '')}
                  aria-pressed={entrega === 'envio'}
                  onClick={() => setEntrega('envio')}
                >
                  <strong>Envío nacional</strong>
                  <span>
                    {settings.envio_gratis_desde > 0
                      ? `Gratis desde ${euros(settings.envio_gratis_desde)} · si no, por peso`
                      : 'Coste por peso, incluido en el total'}
                  </span>
                </button>
              </div>
              {entrega === 'envio' && (
                <label className="qt-cp">
                  <span>Código postal <small>(opcional)</small></span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={5}
                    placeholder="37001"
                    value={cp}
                    onChange={(e) => setCp(e.target.value.replace(/\D/g, ''))}
                  />
                </label>
              )}
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
                      <span>{l.importe === 0 ? 'Gratis' : euros(l.importe)}</span>
                    </li>
                  ))}
                </ul>
                <div className="qt-total-row">
                  <span>{precioFinal ? 'Total' : 'Total estimado'}</span>
                  <strong>{euros(quote.total)}</strong>
                </div>

                {/* Trust, right where the number is read */}
                <ul className="qt-trust">
                  <li>
                    <Tick />
                    {precioFinal
                      ? 'Precio final, sin sorpresas'
                      : firmeActivo
                        ? 'Te confirmamos el precio en menos de 24 h'
                        : 'Precio orientativo: lo cerramos al revisar la pieza'}
                  </li>
                  {listoAntes && (
                    <li>
                      <Tick />
                      <span>
                        Listo antes del {fechaLarga(listoAntes)}
                        {entrega === 'envio' ? ' + envío' : ''}.{' '}
                        <a
                          href={whatsappUrl(`Hola, necesito mi pedido antes del ${fechaLarga(listoAntes)}. ¿Se puede?`)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          ¿Lo necesitas antes? Escríbenos
                        </a>
                      </span>
                    </li>
                  )}
                  {resenas && resenas.total > 0 && (
                    <li>
                      <Tick />
                      {resenas.total} reseñas ·{' '}
                      {Number(resenas.media).toLocaleString('es-ES', { maximumFractionDigits: 1 })}★
                    </li>
                  )}
                  <li>
                    <Tick />
                    Recogida en Salamanca o envío a toda España
                  </li>
                </ul>

                {/* Small orders: show the room left inside the same price */}
                {masUnaUnidad && (
                  <div className="qt-upsell">
                    <p>
                      {masUnaUnidad.extra === 0 ? (
                        <>Una unidad más de <strong>{masUnaUnidad.pieza.name}</strong> te sale <strong>gratis</strong>.</>
                      ) : (
                        <>
                          2 unidades de <strong>{masUnaUnidad.pieza.name}</strong> por solo{' '}
                          <strong>+{euros(masUnaUnidad.extra)}</strong>.
                        </>
                      )}
                      {quote.margenMinimo >= 1 && piezas.length < MAX_FILES && (
                        <> O añade otra pieza: hasta {euros(quote.margenMinimo)} entran en el mismo precio.</>
                      )}
                    </p>
                    <div className="qt-upsell-acciones">
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => setCantidad(masUnaUnidad.pieza.id, masUnaUnidad.pieza.cantidad + 1)}
                      >
                        + 1 unidad
                      </button>
                      {piezas.length < MAX_FILES && (
                        <button type="button" className="btn-outline" onClick={() => fileInputRef.current?.click()}>
                          + Otra pieza
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {entrega === 'envio' && quote.faltaEnvioGratis > 0 && (
                  <p className="qt-total-note qt-envio-gratis">
                    Te faltan {euros(quote.faltaEnvioGratis)} para el envío gratis.
                  </p>
                )}

                <div className="qt-cupon">
                  {cupon ? (
                    <p className={quote.cupon ? 'qt-cupon-ok' : 'qt-cupon-aviso'}>
                      {quote.cupon
                        ? `Código ${cupon.codigo} aplicado: −${euros(quote.cuponDescuento)}`
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
                <p className="qt-total-note">
                  Calculado laminando tus piezas como en nuestra impresora
                  (~{Math.round(quote.pesoG)} g, ~{quote.tiempoH.toFixed(1)} h de impresión
                  en total), válido {settings.validez_dias} días.
                  {!precioFinal && ' Alguna pieza necesita que la revisemos; te confirmamos el precio antes de imprimir.'}
                </p>
                {quote.piezas.some((p) => p.metodo === 'aproximado') && (
                  <p className="qt-total-note">
                    Alguna pieza no se pudo laminar en el navegador; su precio es una
                    aproximación por volumen.
                  </p>
                )}
              </>
            )}
          </div>

          {/* request: form, WhatsApp, or keep it for later */}
          {piezas.length > 0 && listo && quote && status.kind !== 'ok' && (
            <div className="qt-pedir">
              {!showForm && (
                <div className="qt-ctas">
                  <button type="button" className="btn-primary qt-cta" onClick={abrirFormulario}>
                    Solicitar presupuesto
                  </button>
                  <a
                    className="btn-outline qt-cta qt-cta-wa"
                    href={whatsappUrl(waPedido)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <WhatsAppIcon />
                    Pedir por WhatsApp
                  </a>
                </div>
              )}
              {!showForm && (
                <p className="qt-step-hint">
                  {piezasSinColor.length > 0
                    ? `¿Sin color para ${piezasSinColor.map((p) => p.name).join(', ')}? Pídelo igual: te ayudamos a elegirlo.`
                    : 'Sin registro: solo un email o tu WhatsApp.'}
                </p>
              )}

              {showForm && (
                <form className="qt-form" onSubmit={submit} noValidate>
                  <label className="qt-form-label" htmlFor="qt-contacto">
                    ¿Dónde te enviamos el presupuesto?
                  </label>
                  <input
                    id="qt-contacto"
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="Email o WhatsApp"
                    autoFocus
                    value={contacto}
                    onChange={(e) => setContacto(e.target.value)}
                    aria-invalid={status.kind === 'err' && !leerContacto(contacto)}
                    aria-describedby="qt-contacto-ayuda"
                  />
                  <p id="qt-contacto-ayuda" className="qt-form-hint">
                    Nada más. Nombre{entrega === 'envio' ? ', dirección' : ''} y colores te los
                    preguntamos al contestarte.
                  </p>
                  <details className="qt-form-mas">
                    <summary>Añadir nombre o notas (opcional)</summary>
                    <input
                      type="text"
                      placeholder="Tu nombre"
                      aria-label="Tu nombre"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      autoComplete="name"
                    />
                    <textarea
                      placeholder="Reparto de colores, plazo, lo que necesites…"
                      aria-label="Notas"
                      value={mensaje}
                      onChange={(e) => setMensaje(e.target.value)}
                    />
                  </details>
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
                    aria-busy={status.kind === 'sending'}
                  >
                    {status.kind === 'sending' ? status.progress : `Enviar solicitud · ${euros(quote.total)}`}
                  </button>
                  <p className="qt-form-legal">
                    Al enviar aceptas los{' '}
                    <a href="/terminos/" target="_blank" rel="noopener noreferrer">Términos</a>. Usamos
                    tus datos y archivos para preparar y gestionar este presupuesto y los borramos
                    periódicamente. También podremos enviarte alguna oferta o aviso a tu email; cada
                    correo trae un enlace para darte de baja. Puedes ejercer tus derechos en{' '}
                    {CONTACTO.email}. Más en la{' '}
                    <a href="/privacidad/">Política de Privacidad</a>.
                  </p>
                </form>
              )}

              {/* Not ready yet: keep it (and a reminder tomorrow) */}
              <div className="qt-guardar">
                {guardado.kind === 'ok' ? (
                  <p className="qt-guardar-ok" role="status">
                    <Tick /> Enviado a {guardado.email}. Mira tu bandeja (o spam).
                  </p>
                ) : guardarAbierto ? (
                  <form className="qt-cupon-form" onSubmit={enviarPorEmail} noValidate>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="tu@email.com"
                      aria-label="Tu email"
                      autoFocus
                      value={guardarEmail}
                      onChange={(e) => setGuardarEmail(e.target.value)}
                    />
                    <button type="submit" className="btn-outline" disabled={guardado.kind === 'sending'}>
                      {guardado.kind === 'sending' ? 'Enviando…' : 'Enviar'}
                    </button>
                  </form>
                ) : (
                  <div className="qt-guardar-opciones">
                    <button type="button" className="qt-cupon-abrir" onClick={() => setGuardarAbierto(true)}>
                      Envíame el presupuesto por email
                    </button>
                    <span aria-hidden="true">·</span>
                    <button type="button" className="qt-cupon-abrir" onClick={downloadPdf}>
                      Descargar PDF
                    </button>
                  </div>
                )}
                {guardarAbierto && guardado.kind !== 'ok' && (
                  <p className="qt-form-hint">
                    Te llega ahora, y mañana un único recordatorio con un pequeño descuento. Nada más.
                  </p>
                )}
                {guardado.kind === 'err' && (
                  <p className="qt-cupon-error" role="alert">{guardado.message}</p>
                )}
              </div>
            </div>
          )}

          {status.kind === 'ok' && (
            <div className="qt-success" role="status" tabIndex={-1} ref={successRef}>
              <svg className="qt-success-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="m8 12 3 3 5-6" />
              </svg>
              <h2 className="qt-success-title">Recibido</h2>
              <p className="qt-success-lead">
                Te contestamos <strong>{plazoRespuesta()}</strong>{' '}
                {status.porEmail ? 'por email' : 'por WhatsApp'}.
              </p>
              <div className="qt-success-code">{status.codigo}</div>
              <p>
                {status.duplicado
                  ? 'Ya teníamos esta misma solicitud: es la de arriba, no hace falta enviarla otra vez.'
                  : status.porEmail
                    ? 'Es tu código. Te hemos mandado un email con el resumen.'
                    : 'Es tu código: guárdalo por si nos escribes.'}
              </p>
              <div className="qt-success-acciones">
                <a className="btn-outline" href={`/presupuesto?codigo=${encodeURIComponent(status.codigo)}`}>
                  Ver estado
                </a>
                <a
                  className="btn-outline"
                  href={whatsappUrl(`Hola, quiero cambiar algo del presupuesto ${status.codigo}: `)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsAppIcon /> Cambiar algo
                </a>
              </div>
              <button type="button" className="qt-cupon-abrir" onClick={() => location.reload()}>
                Calcular otra pieza
              </button>
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
          <span className="qt-sticky-label">{precioFinal ? 'Total' : 'Total estimado'}</span>
          <strong>{euros(quote.total)}</strong>
          {listoAntes && (
            <span className="qt-sticky-days">
              {new Date(`${listoAntes}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

function Tick() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}
