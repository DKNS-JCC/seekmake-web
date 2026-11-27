'use client';

// «Nuevo encargo»: la calculadora de taller dentro del admin
// (docs/plan-calculadora/03-nuevo-encargo.md y ux-nuevo-encargo.md).
//
// Camino principal: el taller envía el laminado a la impresora por wifi y no
// exporta el gcode, así que se teclean gramos → Tab → tiempo (el foco está
// ahí al abrir). Si se exporta, soltar el .gcode o .gcode.3mf en cualquier
// punto de la página rellena lo mismo.
//
// El precio es en vivo con lib/quote/encargo.ts (la fórmula de la
// Calculadora 7.2) y la config de la Calculadora (empresa_docs). El pedido se
// guarda en `orders` con la forma y las cadenas de la 7.2; el trigger de 0027
// le crea su quote (Presupuesto enviado → «revisado») y notify-quote avisa.
//
//   /admin/encargo                    alta
//   /admin/encargo?editar=Q-…         editar y recalcular
//   /admin/encargo?solicitud=Q-…      presupuestar una solicitud del tasador

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Color, Filamento } from '@/lib/types';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { AdminCabecera } from '../_components/AdminNav';
import { ErrorBanner } from '../_components/ErrorBanner';
import { CampoNumero, CampoTiempo } from '../_components/Campos';
import { Opciones } from '../_components/Opciones';
import { useAviso } from '../_components/Aviso';
import { euros } from '@/lib/recibo/types';
import { mensajeDeError } from '@/lib/errors';
import { CONTACTO } from '@/lib/contacto';
import {
  calcularEncargo,
  camposPedido,
  diasExtraEncargo,
  DISENO_A_MEDIDA,
  DISENO_MODELADO,
  importeDiseno,
  importePostpro,
  migrarDiseno,
  migrarPostpro,
  POSTPROCESADO,
  PROBABILIDAD_ERROR,
  RIESGOS,
  riesgoDe,
  roundMoney,
  type ConfigCalculadora,
  type EncargoInput,
  type EncargoResultado
} from '@/lib/quote/encargo';
import { formatGramos, formatHoras, formatNumero, parseHoras, parseNumero } from '@/lib/quote/formatos';
import { leerDatosLaminado, type Laminado } from '@/lib/quote/gcode';
import { DEFAULT_QUOTE_SETTINGS, diasPlazo, hoyMadrid, normalizeSettings, sumarLaborables, type QuoteSettings } from '@/lib/quote/pricing';
import { openQuotePdf } from '@/lib/quote/pdf';
import './encargo.css';

// ── Tipos y utilidades ────────────────────────────────────────────────────

type Linea = { id: number; material: string; color: string; gramos: string };

type Form = {
  nombre: string;
  telefono: string;
  email: string;
  descripcion: string;
  cantidad: string;
  /** Con cantidad > 1: el laminado es de una unidad y se multiplica. */
  porUnidad: boolean;
  impresora: string;
  lineas: Linea[];
  tiempo: string;
  /** Horas exactas del pedido cargado mientras no se toque el tiempo. */
  tiempoExacto: number | null;
  /** Cambios de filamento (K1: la purga no va en el gcode). */
  cambios: string;
  /** Purga media por cambio del gcode, mm³; null = la del taller por defecto. */
  purgaMm3: number | null;
  /** Gramos de purga tecleados a mano (vacío = estimada). */
  purgaG: string;
  diseno: string;
  disenoHoras: string;
  postpro: string;
  riesgo: string;
  urgente: boolean;
  extra: string;
  /** € por unidad acordados con el cliente (vacío = la tarifa). */
  pactado: string;
  motivo: string;
};

type QuoteMin = {
  id: string;
  codigo: string;
  estado: string;
  telefono: string;
  email: string;
  fecha_prometida: string | null;
  acepta_token: string | null;
  metricas: Record<string, unknown> | null;
  precio_total: number | null;
};

type Pedido = {
  id: string;
  quote_id: string | null;
  created_at: string;
  data: Record<string, any>;
  quotes: QuoteMin | null;
};

type Resultado = {
  codigo: string | null;
  id: string;
  precio: number;
  fechaTope: string | null;
  email: string;
  token: string | null;
  /** null = no se pidió aviso; '' = enviado; texto = el motivo del fallo. */
  avisoError: string | null;
  avisado: boolean;
  /** Lo que necesita el PDF: el formulario ya se ha limpiado. */
  pdf: { concepto: string; pesoG: number; horas: number };
};

// ponytail: purga por cambio sin gcode = la media de la K1C del taller
// (calicat: (210 + 536) / 2 mm³ × 0,8). Afinar con laminados reales.
const PURGA_MM3_CAMBIO = 298.4;
const DENSIDAD_DEF = 1.24;
const CERRADOS = ['Entregado', 'Descartado'];
const ACEPTADOS = ['Aceptado', 'En producción', 'Post-procesado', 'Listo para entregar', 'Entregado'];
const LS_ULTIMO = 'encargo:ultimo';
const LS_BORRADOR = 'encargo:borrador';

const round4 = (n: number) => Math.round(n * 10000) / 10000;
let idLinea = 1;
const nuevaLinea = (material = '', color = '', gramos = ''): Linea => ({ id: idLinea++, material, color, gramos });

function leerLS<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function escribirLS(k: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/** Id de pedido como los de la Calculadora: 8 caracteres en mayúsculas. */
const nuevoId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();

/** Familia de un material: «PLA SILK/MARBLE» → «PLA», «PETG CF» → «PETG». */
const familia = (m: string) => m.trim().split(/[\s/+-]+/)[0].toUpperCase();

function hexRgb(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** «vie 14 nov». */
function fechaCortaProxima(iso: string): string {
  return new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace(/\./g, '')
    .replace(',', '');
}

function formVacio(cfg: ConfigCalculadora | null, riesgo: string): Form {
  const ultimo = leerLS<{ impresora: string; material: string; color: string }>(LS_ULTIMO);
  const impresora =
    (ultimo && cfg?.printers.some((p) => p.name === ultimo.impresora) && ultimo.impresora) || cfg?.printers[0]?.name || '';
  const material =
    (ultimo && cfg?.filament_types.some((t) => t.name === ultimo.material) && ultimo.material) ||
    cfg?.filament_types[0]?.name ||
    'PLA';
  return {
    nombre: '',
    telefono: '',
    email: '',
    descripcion: '',
    cantidad: '1',
    porUnidad: false,
    impresora,
    lineas: [nuevaLinea(material, ultimo?.material === material ? ultimo.color : '')],
    tiempo: '',
    tiempoExacto: null,
    cambios: '',
    purgaMm3: null,
    purgaG: '',
    diseno: 'No necesario',
    disenoHoras: '',
    postpro: 'Limpio',
    riesgo,
    urgente: false,
    extra: '',
    pactado: '',
    motivo: ''
  };
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Página ────────────────────────────────────────────────────────────────

export default function NuevoEncargo() {
  const { authed, supabase } = useAdminAuth();
  const { avisar, aviso } = useAviso();

  const [cfg, setCfg] = useState<ConfigCalculadora | null>(null);
  const [settings, setSettings] = useState<QuoteSettings>(DEFAULT_QUOTE_SETTINGS);
  const [catalogo, setCatalogo] = useState<{ filamentos: Filamento[]; colores: Color[] }>({ filamentos: [], colores: [] });
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [colaH, setColaH] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [f, setF] = useState<Form>(() => formVacio(null, 'Baja (25%)'));
  const [editando, setEditando] = useState<Pedido | null>(null);
  const [solicitud, setSolicitud] = useState(false);
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [laminado, setLaminado] = useState<{ nombre: string; l: Laminado; faltan: string[] } | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [sugerenciaDesc, setSugerenciaDesc] = useState('');
  const [ayudaRiesgo, setAyudaRiesgo] = useState(false);

  const archivoRef = useRef<HTMLInputElement>(null);
  const gramosRef = useRef<HTMLInputElement>(null);
  const nuevoRef = useRef<HTMLButtonElement>(null);
  const masRef = useRef<HTMLDetailsElement>(null);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v })), []);
  const tocar = (k: string) => setTocados((s) => (s.has(k) ? s : new Set(s).add(k)));
  const setLinea = (id: number, patch: Partial<Linea>) =>
    setF((p) => ({ ...p, lineas: p.lineas.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  // ── Carga ──
  async function cargar() {
    setCargando(true);
    setErrorCarga(null);
    const sb = supabase();
    const [conf, ajustes, fil, col, ord, cola] = await Promise.all([
      sb.from('empresa_docs').select('data').eq('empresa', '3dcc').eq('doc', 'config').maybeSingle(),
      sb.from('quote_settings').select('config').eq('id', 1).maybeSingle(),
      sb.from('filamentos').select('*').order('orden'),
      sb.from('colores').select('*').order('orden'),
      sb
        .from('orders')
        .select('id, quote_id, created_at, data, quotes(id, codigo, estado, telefono, email, fecha_prometida, acepta_token, metricas, precio_total)')
        .eq('empresa', '3dcc')
        .order('created_at', { ascending: false }),
      sb.rpc('plazo_cola_horas', {})
    ]);
    const c = conf.data?.data as unknown as ConfigCalculadora | undefined;
    if (conf.error || !c?.printers?.length || !c?.filament_types?.length) {
      setErrorCarga(
        conf.error
          ? mensajeDeError(conf.error, 'No se pudo leer la configuración de la Calculadora')
          : 'No encuentro la configuración de la Calculadora (impresoras y materiales).'
      );
      setCargando(false);
      return;
    }
    const s = normalizeSettings(ajustes.data?.config);
    setCfg(c);
    setSettings(s);
    setCatalogo({ filamentos: fil.data ?? [], colores: col.data ?? [] });
    const ps = (ord.data ?? []) as unknown as Pedido[];
    setPedidos(ps);
    if (!cola.error) setColaH(Number(cola.data) || 0);

    // Modo: alta, edición o solicitud.
    const u = new URLSearchParams(window.location.search);
    const codigo = u.get('editar') ?? u.get('solicitud');
    const p = codigo ? ps.find((x) => x.quotes?.codigo === codigo.toUpperCase()) : null;
    if (codigo && !p) setErrorCarga(`No encuentro el pedido ${codigo}.`);
    if (p) {
      cargarPedido(p, u.has('solicitud'), c, s);
    } else {
      const borrador = leerLS<Form>(LS_BORRADOR);
      setF(borrador?.lineas?.length ? { ...formVacio(c, riesgoDe(s.calculadora.error)), ...borrador } : formVacio(c, riesgoDe(s.calculadora.error)));
    }
    setCargando(false);
  }

  useEffect(() => {
    if (authed) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // Foco en los gramos al abrir (entrada rápida: gramos → Tab → tiempo).
  useEffect(() => {
    if (!cargando && cfg && !resultado) gramosRef.current?.focus();
  }, [cargando, cfg, resultado]);

  function cargarPedido(p: Pedido, esSolicitud: boolean, c: ConfigCalculadora, s: QuoteSettings) {
    const d = p.data;
    const tipos = c.filament_types.map((t) => t.name);
    const materialDe = (m: string) =>
      tipos.find((t) => t === m) ?? tipos.find((t) => t.toUpperCase() === String(m).toUpperCase()) ?? tipos[0];
    const desglose: { material: string; color: string; grams: number }[] =
      d.is_multimaterial && Array.isArray(d.material_breakdown) ? d.material_breakdown : [];
    const purga = desglose.find((l) => l.color === 'Purga');
    const lineas = desglose.length
      ? desglose.filter((l) => l !== purga).map((l) => nuevaLinea(l.material, l.color, formatNumero(Number(l.grams), 2)))
      : [nuevaLinea(materialDe(d.filamento), d.filamento_color ?? '', formatNumero(Number(d.peso_g), 2))];
    if (esSolicitud) lineas.forEach((l) => (l.gramos = ''));
    const horas = Number(d.horas) || 0;
    const riesgo = PROBABILIDAD_ERROR[d.probabilidad_error_label] !== undefined
      ? d.probabilidad_error_label
      : riesgoDe(Number(d.error_rate ?? s.calculadora.error));
    setEditando(p);
    setSolicitud(esSolicitud);
    setF({
      nombre: d.cliente ?? '',
      telefono: p.quotes?.telefono || d.cliente_telefono || '',
      email: d.cliente_email ?? '',
      descripcion: esSolicitud && /^Q-\S+ · /.test(d.descripcion ?? '') ? '' : d.descripcion ?? '',
      cantidad: String(Math.max(1, Number(d.cantidad) || 1)),
      porUnidad: false,
      impresora: c.printers.some((x) => x.name === d.impresora) ? d.impresora : c.printers[0].name,
      lineas,
      tiempo: esSolicitud || !horas ? '' : formatHoras(horas),
      tiempoExacto: esSolicitud || !horas ? null : horas,
      cambios: '',
      purgaMm3: null,
      purgaG: purga && !esSolicitud ? formatNumero(Number(purga.grams), 2) : '',
      diseno: migrarDiseno(d.diseno_modelado, d.busqueda_modelos),
      disenoHoras: d.diseno_horas ? formatHoras(Number(d.diseno_horas)) : '',
      postpro: migrarPostpro(d.postprocesado_label, d.eliminacion_soportes),
      riesgo,
      urgente: d.urgencia_nivel === 'Urgente',
      extra: Number(d.gasto_misc) > 0 ? formatNumero(Number(d.gasto_misc), 2) : '',
      pactado: Number(d.precio_pactado_ud) > 0 ? formatNumero(Number(d.precio_pactado_ud), 2) : '',
      motivo: ''
    });
    if (esSolicitud && d.descripcion) setSugerenciaDesc(String(d.descripcion).replace(/^Q-\S+ · /, ''));
  }

  // Borrador local (solo en el alta), sin antirrebote para el precio.
  useEffect(() => {
    if (cargando || editando || resultado) return;
    const t = setTimeout(() => escribirLS(LS_BORRADOR, f), 600);
    return () => clearTimeout(t);
  }, [f, cargando, editando, resultado]);

  // ── Derivados ──
  const esK1 = /k1/i.test(f.impresora);
  const cantidad = Math.max(1, Math.floor(parseNumero(f.cantidad) || 1));
  const mult = f.porUnidad && cantidad > 1 ? cantidad : 1;
  const horasTecleadas = f.tiempoExacto ?? parseHoras(f.tiempo);
  const cambios = Math.max(0, Math.round(parseNumero(f.cambios) || 0));
  const densidad =
    laminado?.l.ranuras.find((r) => r.gramos > 0)?.densidad ?? DENSIDAD_DEF;
  const purgaEstimada = esK1 && cambios > 0 ? round2((cambios * (f.purgaMm3 ?? PURGA_MM3_CAMBIO) * densidad) / 1000) : 0;
  const purgaManual = f.purgaG.trim() ? parseNumero(f.purgaG) : null;
  const purgaG = purgaManual !== null && !Number.isNaN(purgaManual) ? purgaManual : purgaEstimada;
  const verPurga = esK1 && (f.lineas.length > 1 || cambios > 0 || !!f.purgaG.trim());

  const colores = catalogo.colores;
  const filPorId = useMemo(() => new Map(catalogo.filamentos.map((x) => [x.id, x])), [catalogo.filamentos]);
  const coloresDe = useCallback(
    (material: string) =>
      colores.filter((c) => {
        const fil = filPorId.get(c.filamento_id);
        return fil && familia(fil.material) === familia(material);
      }),
    [colores, filPorId]
  );

  const clientes = useMemo(() => {
    const m = new Map<string, { nombre: string; email: string; telefono: string; ultimo: Pedido }>();
    for (const p of pedidos) {
      const n = String(p.data.cliente ?? '').trim();
      if (!n || m.has(n.toLowerCase())) continue;
      m.set(n.toLowerCase(), {
        nombre: n,
        email: String(p.data.cliente_email ?? ''),
        telefono: p.quotes?.telefono || String(p.data.cliente_telefono ?? ''),
        ultimo: p
      });
    }
    return m;
  }, [pedidos]);
  const cliente = clientes.get(f.nombre.trim().toLowerCase());

  const duplicado = useMemo(() => {
    const n = f.nombre.trim().toLowerCase();
    const d = f.descripcion.trim().toLowerCase();
    if (!n || !d) return null;
    return (
      pedidos.find(
        (p) =>
          p.id !== editando?.id &&
          !p.data.archived &&
          !CERRADOS.includes(String(p.data.estado)) &&
          String(p.data.cliente ?? '').trim().toLowerCase() === n &&
          String(p.data.descripcion ?? '').trim().toLowerCase() === d
      ) ?? null
    );
  }, [pedidos, f.nombre, f.descripcion, editando]);

  // Entrada del motor y precio.
  const calculo = useMemo((): { faltan: string[]; input?: EncargoInput; r?: EncargoResultado; error?: string } => {
    const faltan: string[] = [];
    const gramos = f.lineas.map((l) => parseNumero(l.gramos));
    if (gramos.some((g) => g === null || Number.isNaN(g) || g <= 0)) faltan.push('gramos');
    if (horasTecleadas === null || Number.isNaN(horasTecleadas) || horasTecleadas <= 0) faltan.push('tiempo');
    if (faltan.length || !cfg) return { faltan };
    const lineas = f.lineas.map((l, i) => ({ material: l.material, color: l.color, gramos: round2(gramos[i]! * mult) }));
    if (purgaG > 0) lineas.push({ material: f.lineas[0].material, color: 'Purga', gramos: round2(purgaG * mult) });
    const dh = parseHoras(f.disenoHoras);
    const input: EncargoInput = {
      impresora: f.impresora,
      lineas,
      horas: round4(horasTecleadas! * mult),
      cantidad,
      diseno: f.diseno,
      disenoHoras: f.diseno === DISENO_A_MEDIDA && dh && !Number.isNaN(dh) ? round4(dh) : 0,
      postprocesado: f.postpro,
      riesgo: f.riesgo,
      urgente: f.urgente,
      gastoExtra: Math.max(0, parseNumero(f.extra) || 0),
      precioPactado: Math.max(0, parseNumero(f.pactado) || 0)
    };
    try {
      return { faltan, input, r: calcularEncargo(input, cfg, settings.urgencia_recargo_pct) };
    } catch (e) {
      return { faltan, error: (e as Error).message };
    }
  }, [f, cfg, settings, horasTecleadas, mult, cantidad, purgaG]);
  const r = calculo.r;

  const fechaTope = useMemo(() => {
    if (!calculo.input) return null;
    // Un pedido ya aceptado tiene su fecha guardada (la fijó la base de datos).
    if (editando?.quotes?.fecha_prometida && ACEPTADOS.includes(String(editando.data.estado))) {
      return editando.quotes.fecha_prometida;
    }
    const extra = diasExtraEncargo(f.diseno, calculo.input.disenoHoras, f.postpro);
    return sumarLaborables(hoyMadrid(), diasPlazo(calculo.input.horas, settings, f.urgente ? 0 : colaH, extra));
  }, [calculo.input, f.diseno, f.postpro, f.urgente, settings, colaH, editando]);

  const precioAntes = editando && !solicitud ? roundMoney(Number(editando.data.precio_final)) : null;
  const aceptado = !!editando && ACEPTADOS.includes(String(editando.data.estado));
  const pideMotivo = aceptado && r && precioAntes !== null && Math.round(r.precio * 100) !== Math.round(precioAntes * 100);

  // Errores de validación (se enseñan al salir del campo o al intentar guardar).
  const errores = useMemo(() => {
    const e: Record<string, string> = {};
    if (!f.nombre.trim()) e.nombre = 'Pon el nombre del cliente.';
    if (f.email.trim() && !EMAIL_OK.test(f.email.trim())) e.email = 'Este email no parece válido.';
    if (!f.descripcion.trim() && !sugerenciaDesc) e.descripcion = 'Describe el encargo.';
    f.lineas.forEach((l, i) => {
      const g = parseNumero(l.gramos);
      if (g === null || Number.isNaN(g) || g <= 0)
        e[`g${i}`] = f.lineas.length > 1 && i > 0 ? 'Pon los gramos o quita la línea.' : 'Faltan los gramos. Suelta el laminado o tecléalos.';
      if (!l.material) e[`m${i}`] = 'Elige el material.';
      if (!l.color.trim()) e[`c${i}`] = 'Elige el color de esta línea.';
    });
    const h = parseHoras(f.tiempo);
    if (f.tiempoExacto === null) {
      if (h === null) e.tiempo = 'Falta el tiempo. Suelta el laminado o tecléalo.';
      else if (Number.isNaN(h)) e.tiempo = 'No lo entiendo. Prueba 1h31, 1:31, 91 (min) o 1,5 (h).';
      else if (h <= 0) e.tiempo = 'Falta el tiempo.';
    }
    if (f.diseno === DISENO_A_MEDIDA) {
      const dh = parseHoras(f.disenoHoras);
      if (dh === null || Number.isNaN(dh) || dh <= 0) e.disenoHoras = 'Pon las horas de diseño.';
    }
    if (f.extra.trim() && Number.isNaN(parseNumero(f.extra))) e.extra = 'Pon un importe, p. ej. 4,50.';
    if (f.pactado.trim() && !((parseNumero(f.pactado) ?? 0) > 0)) e.pactado = 'Pon el precio por unidad, p. ej. 11.';
    if (f.purgaG.trim() && Number.isNaN(parseNumero(f.purgaG))) e.purga = 'Pon los gramos de purga.';
    if (pideMotivo && !f.motivo.trim()) e.motivo = 'El pedido ya está aceptado: di por qué cambia el precio.';
    if (calculo.error) e.calculo = calculo.error;
    return e;
  }, [f, sugerenciaDesc, pideMotivo, calculo.error]);
  const ver = (k: string) => (intentado || tocados.has(k) ? errores[k] : undefined);
  const ORDEN_CAMPOS = ['g0', 'tiempo', ...f.lineas.flatMap((_, i) => [`m${i}`, `c${i}`, `g${i}`]), 'purga', 'nombre', 'email', 'descripcion', 'disenoHoras', 'extra', 'pactado', 'motivo'];
  const ID: Record<string, string> = { tiempo: 'enc-tiempo', nombre: 'enc-nombre', email: 'enc-email', descripcion: 'enc-desc', disenoHoras: 'enc-dh', extra: 'enc-extra', motivo: 'enc-motivo', purga: 'enc-purga' };
  const idDe = (k: string) => ID[k] ?? `enc-${k[0]}-${k.slice(1)}`;

  // Aviso del precio a lectores de pantalla, como mucho una vez por segundo.
  const [precioAnunciado, setPrecioAnunciado] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setPrecioAnunciado(r ? `Precio ${euros(r.precio)}` : ''), 1000);
    return () => clearTimeout(t);
  }, [r?.precio]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Laminado (arrastrar o elegir) ──
  async function abrirArchivos(files: FileList | File[]) {
    setErrorArchivo(null);
    const lista = Array.from(files);
    if (!lista.length || !cfg) return;
    const malo = lista.find((x) => !/\.gcode(\.3mf)?$/i.test(x.name));
    if (malo) {
      setErrorArchivo(
        /\.3mf$/i.test(malo.name)
          ? 'Esto es el proyecto, no el laminado. En Orca: Exportar → Exportar G-code (o «archivo laminado de la bandeja»).'
          : `«${malo.name}» no es un laminado. Hace falta el .gcode o el .gcode.3mf que exporta el laminador.`
      );
      return;
    }
    let leidos: { nombre: string; l: Laminado }[];
    try {
      leidos = await Promise.all(
        lista.map(async (x) => {
          // El .gcode trae las cifras al final: basta leer la cola. El .3mf es un zip entero.
          const blob = /\.3mf$/i.test(x.name) ? x : x.slice(Math.max(0, x.size - 256 * 1024));
          return { nombre: x.name, l: leerDatosLaminado(new Uint8Array(await blob.arrayBuffer())) };
        })
      );
    } catch (e) {
      setErrorArchivo(`No he podido leer el laminado: ${(e as Error).message}.`);
      return;
    }
    aplicarLaminados(leidos);
  }

  function aplicarLaminados(leidos: { nombre: string; l: Laminado }[]) {
    if (!cfg) return;
    const antes = f;
    const primero = leidos[0].l;
    // Impresora: la de más palabras en común con printer_model.
    const palabras = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
    let impresora = f.impresora;
    let impOk = false;
    if (primero.impresora) {
      const pm = palabras(primero.impresora);
      const puntos = cfg.printers.map((p) => palabras(p.name).filter((w) => pm.includes(w)).length);
      const max = Math.max(...puntos);
      if (max > 0 && puntos.filter((x) => x === max).length === 1) {
        impresora = cfg.printers[puntos.indexOf(max)].name;
        impOk = true;
      }
    }
    // Líneas: una por ranura usada; mismo material y color de varias bandejas se suman.
    const lineas: Linea[] = [];
    let horas = 0;
    let cambiosTot = 0;
    for (const { l } of leidos) {
      horas += l.tiempoH;
      cambiosTot += l.cambios;
      for (const rn of l.ranuras.filter((x) => x.gramos > 0)) {
        const material = materialDeRanura(rn.tipo, rn.ajustes);
        const color = colorMasCercano(material, rn.colorHex);
        const ya = lineas.find((x) => x.material === material && x.color === color && color);
        if (ya) ya.gramos = formatNumero((parseNumero(ya.gramos) || 0) + rn.gramos, 2);
        else lineas.push(nuevaLinea(material, color, formatNumero(rn.gramos, 2)));
      }
    }
    const faltan: string[] = [];
    if (!lineas.length) faltan.push('los gramos');
    if (!(horas > 0)) faltan.push('las horas');
    if (!primero.impresora) faltan.push('la impresora');
    else if (!impOk) faltan.push(`una impresora que coincida con «${primero.impresora}» (elígela)`);
    const habiaDatos = f.lineas.some((l) => l.gramos.trim()) || f.tiempo.trim();
    setF((p) => ({
      ...p,
      impresora,
      lineas: lineas.length ? lineas : p.lineas,
      tiempo: horas > 0 ? formatHoras(horas) : p.tiempo,
      tiempoExacto: horas > 0 ? round4(horas) : p.tiempoExacto,
      cambios: cambiosTot > 0 ? String(cambiosTot) : '',
      purgaMm3: primero.purgaMm3PorCambio,
      purgaG: ''
    }));
    setLaminado({ nombre: leidos.map((x) => x.nombre).join(' + '), l: primero, faltan });
    if (!f.descripcion.trim()) {
      // «calicat_PLA_1h31m.gcode», «1110-0137-calicat_plate(01)_PLA_0.2_1h6m32s.gcode» → «calicat».
      setSugerenciaDesc(
        leidos[0].nombre
          .replace(/\.gcode(\.3mf)?$/i, '')
          .replace(/^\d{4}-\d{4}-/, '')
          .replace(/_plate\(\d+\)/i, '')
          .replace(/_(PLA|PETG|ASA|TPU|PA|ABS|NYLON)(_.*)?$/i, '')
          .replace(/_\d+h\d*m?\d*s?$/i, '')
          .replace(/[_-]+/g, ' ')
          .trim()
      );
    }
    if (habiaDatos) avisar('Datos sustituidos por los del laminado', { label: 'Deshacer', run: () => setF(antes) });
    if (faltan.includes('las horas')) setTimeout(() => document.getElementById('enc-tiempo')?.focus(), 0);
  }

  function materialDeRanura(tipo: string | null, ajustes: string | null): string {
    const tipos = cfg!.filament_types.map((t) => t.name);
    const t = (tipo ?? '').toUpperCase();
    if (/silk|marble|m[aá]rmol/i.test(ajustes ?? '')) {
      const silk = tipos.find((x) => /silk|marble/i.test(x) && familia(x) === familia(t || 'PLA'));
      if (silk) return silk;
    }
    return (
      tipos.find((x) => x.toUpperCase() === t) ??
      tipos.find((x) => familia(x) === familia(t || 'PLA')) ??
      tipos[0]
    );
  }

  function colorMasCercano(material: string, hex: string | null): string {
    const rgb = hex ? hexRgb(hex) : null;
    if (!rgb) return '';
    let mejor = '';
    let dist = Infinity;
    for (const c of coloresDe(material)) {
      const o = hexRgb(c.hex);
      if (!o) continue;
      const d = Math.hypot(o[0] - rgb[0], o[1] - rgb[1], o[2] - rgb[2]);
      if (d < dist) [dist, mejor] = [d, c.nombre];
    }
    // ponytail: umbral fijo en RGB; si se equivoca a menudo, recordar la
    // elección manual por filament_settings_id (guía UX, §8).
    return dist <= 80 ? mejor : '';
  }

  // Arrastrar sobre toda la página.
  useEffect(() => {
    const conArchivos = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    let n = 0;
    const enter = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      n++;
      setArrastrando(true);
    };
    const leave = () => {
      n = Math.max(0, n - 1);
      if (!n) setArrastrando(false);
    };
    const over = (e: DragEvent) => conArchivos(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      e.preventDefault();
      n = 0;
      setArrastrando(false);
      if (e.dataTransfer?.files.length) abrirArchivos(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  });

  // ── Guardar ──
  async function guardar(conAviso: boolean) {
    if (guardando) return;
    setIntentado(true);
    setErrorGuardar(null);
    const primero = ORDEN_CAMPOS.find((k) => errores[k]);
    if (primero || errores.calculo || !calculo.r || !calculo.input || !cfg) {
      if (primero) {
        const el = document.getElementById(idDe(primero));
        el?.focus();
        el?.scrollIntoView({ block: 'center' });
      } else if (errores.calculo) setErrorGuardar(errores.calculo);
      return;
    }
    const { input, r: res } = calculo;
    const descripcion = f.descripcion.trim() || sugerenciaDesc;
    const email = f.email.trim();
    const telefono = f.telefono.trim();
    const ahora = new Date().toISOString();
    const campos = camposPedido(input, res);
    setGuardando(true);
    try {
      const sb = supabase();
      let id: string;
      if (editando) {
        id = editando.id;
        const d = editando.data;
        const data: Record<string, any> = {
          ...d,
          cliente: f.nombre.trim(),
          cliente_email: email,
          cliente_telefono: telefono,
          descripcion,
          ...campos
        };
        if (String(d.estado) === 'Nuevo') {
          data.estado = 'Presupuesto enviado';
          data.last_status_update = ahora;
        }
        // Como recalculateOrder de la 7.2: el cambio de precio queda en el historial.
        const antes = roundMoney(Number(d.precio_final));
        const delta = Math.round((campos.precio_final - antes) * 100) / 100;
        if (delta !== 0) {
          data.payment_history = [
            ...(Array.isArray(d.payment_history) ? d.payment_history : []),
            {
              id: nuevoId(),
              created_at: ahora,
              method: 'Modificación',
              amount: 0,
              note:
                `Precio modificado: ${antes.toFixed(2)} → ${campos.precio_final.toFixed(2)} (${delta > 0 ? '+' : ''}${delta.toFixed(2)})` +
                (f.motivo.trim() ? ` · ${f.motivo.trim()}` : ''),
              source: 'recalculation'
            }
          ];
        }
        const { error } = await sb.from('orders').update({ data }).eq('empresa', '3dcc').eq('id', id);
        if (error) throw error;
      } else {
        id = nuevoId();
        const data = {
          id,
          created_at: ahora,
          fecha: hoyMadrid(),
          empresa: '3DCC',
          cliente: f.nombre.trim(),
          cliente_email: email,
          // La 7.2 no tiene teléfono: lo ignora y lo conserva.
          cliente_telefono: telefono,
          descripcion,
          ...campos,
          estado: 'Presupuesto enviado',
          importe_pagado: 0,
          importe_pendiente: campos.precio_final,
          payment_status: 'Pendiente',
          payment_method: '',
          payment_history: [],
          notif_history: [],
          material_contabilizado: false,
          is_shared: false,
          shared_split: null,
          stripe_payment_url: '',
          stripe_session_id: '',
          notes: '',
          repeticiones_error: 0,
          imagen_path: '',
          archived: false,
          accepted_at: '',
          last_status_update: ahora,
          notif_snooze_until: ''
        };
        const { error } = await sb.from('orders').insert({ empresa: '3dcc', id, data });
        if (error) throw error;
      }

      // La quote la crea el trigger (0027): se relee para el código y el enlace.
      const { data: fila } = await sb
        .from('orders')
        .select('quote_id, quotes(codigo, acepta_token, fecha_prometida)')
        .eq('empresa', '3dcc')
        .eq('id', id)
        .maybeSingle();
      const q = (fila as any)?.quotes as { codigo: string; acepta_token: string | null; fecha_prometida: string | null } | null;
      if (fila?.quote_id) {
        await sb.from('quotes').update({ telefono, urgente: f.urgente }).eq('id', fila.quote_id);
      }

      escribirLS(LS_ULTIMO, { impresora: f.impresora, material: f.lineas[0].material, color: f.lineas[0].color });
      if (!editando) escribirLS(LS_BORRADOR, null);

      const res2: Resultado = {
        codigo: q?.codigo ?? null,
        id,
        precio: res.precio,
        fechaTope: q?.fecha_prometida ?? fechaTope,
        email,
        token: q?.acepta_token ?? null,
        avisoError: null,
        avisado: false,
        pdf: { concepto: `${descripcion}${cantidad > 1 ? ` · ${cantidad} uds` : ''}`, pesoG: res.pesoG, horas: input.horas }
      };
      setResultado(res2);
      // El formulario queda limpio: «Nuevo encargo» (o Enter) empieza otro.
      limpiarForm();
      if (conAviso && email) await enviarAviso(res2);
      // Para que la lista (clientes, duplicados) vea el pedido nuevo.
      const { data: ps } = await sb
        .from('orders')
        .select('id, quote_id, created_at, data, quotes(id, codigo, estado, telefono, email, fecha_prometida, acepta_token, metricas, precio_total)')
        .eq('empresa', '3dcc')
        .order('created_at', { ascending: false });
      if (ps) setPedidos(ps as unknown as Pedido[]);
    } catch (e) {
      setErrorGuardar(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'Sin conexión. Los cambios no se han guardado. El borrador sigue en este dispositivo.'
          : mensajeDeError(e as { message?: string }, 'No se pudo guardar el encargo')
      );
    } finally {
      setGuardando(false);
    }
  }

  async function enviarAviso(res: Resultado) {
    setResultado({ ...res, avisoError: null, avisado: false });
    let fallo = '';
    try {
      const { data, error } = await supabase().functions.invoke('notify-quote', {
        body: { empresa: '3dcc', order_id: res.id }
      });
      if (error) fallo = mensajeDeError(error, 'No se pudo avisar al cliente');
      else if (data?.error) fallo = String(data.error);
    } catch {
      fallo = 'Error de red al avisar al cliente.';
    }
    setResultado({ ...res, avisoError: fallo || '', avisado: !fallo });
  }

  function limpiarForm() {
    setEditando(null);
    setSolicitud(false);
    setLaminado(null);
    setSugerenciaDesc('');
    setIntentado(false);
    setTocados(new Set());
    setF(formVacio(cfg, riesgoDe(settings.calculadora.error)));
    window.history.replaceState(null, '', window.location.pathname);
  }

  function limpiar() {
    const antes = { f, laminado, sugerenciaDesc };
    setF(formVacio(cfg, riesgoDe(settings.calculadora.error)));
    setLaminado(null);
    setSugerenciaDesc('');
    setIntentado(false);
    setTocados(new Set());
    avisar('Formulario limpio', {
      label: 'Deshacer',
      run: () => {
        setF(antes.f);
        setLaminado(antes.laminado);
        setSugerenciaDesc(antes.sugerenciaDesc);
      }
    });
    gramosRef.current?.focus();
  }

  function quitarLinea(id: number) {
    const antes = f.lineas;
    setF((p) => ({ ...p, lineas: p.lineas.filter((l) => l.id !== id) }));
    avisar('Línea quitada', { label: 'Deshacer', run: () => setF((p) => ({ ...p, lineas: antes })) });
  }

  function anadirLinea() {
    const m = f.lineas[f.lineas.length - 1]?.material || cfg?.filament_types[0]?.name || 'PLA';
    const l = nuevaLinea(m);
    setF((p) => ({ ...p, lineas: [...p.lineas, l] }));
    setTimeout(() => document.getElementById(`enc-c-${f.lineas.length}`)?.focus(), 0);
  }

  // Atajos de la pantalla.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'Enter' && !resultado) {
        e.preventDefault();
        guardar(!!f.email.trim());
      } else if (e.key.toLowerCase() === 's' && !resultado) {
        e.preventDefault();
        guardar(false);
      } else if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        archivoRef.current?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Abre «Más» si urgencia, extra o precio pactado tienen valor (al editar o repetir).
  useEffect(() => {
    if (masRef.current && (f.urgente || f.extra.trim() || f.pactado.trim())) masRef.current.open = true;
  }, [f.urgente, f.extra, f.pactado]);

  // ── Render ──
  if (authed === false) return <AccesoDenegado />;
  if (authed === null || cargando) return <p style={{ color: 'var(--muted)' }}>Cargando…</p>;
  if (!cfg)
    return (
      <>
        <AdminCabecera titulo="Nuevo encargo" />
        <ErrorBanner>{errorCarga}</ErrorBanner>
        <button type="button" className="btn-outline" onClick={cargar}>Reintentar</button>
      </>
    );

  const titulo = editando
    ? `${solicitud ? 'Presupuestar' : 'Editar'} ${editando.quotes?.codigo ?? editando.id} · ${editando.data.cliente ?? ''}`
    : 'Nuevo encargo';
  const hayEmail = !!f.email.trim();
  const textoGuardar = editando ? (hayEmail ? 'Guardar cambios y avisar' : 'Guardar cambios') : hayEmail ? 'Guardar y avisar' : 'Guardar';
  const desgloseLineas: [string, number][] = r
    ? ([
        ['Filamento', r.desglose.filamento],
        ['Luz', r.desglose.electricidad],
        ['Desgaste de impresora', r.desglose.deterioro_impresora],
        // Coste × 2,3 = coste + margen.
        ['Margen (+130 %)', r.costeImpresion * 1.3],
        [`Error (${formatNumero(r.errorRate * 100, 0)} %)`, r.costeImpresion * r.errorRate],
        ['Diseño', r.desglose.diseno_modelado],
        ['Post-procesado', r.desglose.postprocesado],
        ['Urgencia', r.recargoUrgencia],
        ['Gasto extra', r.desglose.gasto_misc]
      ] as [string, number][]).filter(([, v], i) => i < 3 || v > 0)
    : [];
  const metricasWeb = solicitud ? (editando?.quotes?.metricas as { peso_g?: number; tiempo_h?: number } | null) : null;
  const gramosLaminado = r?.pesoG ?? 0;
  const horas = calculo.input?.horas ?? 0;
  const riesgosOpc = RIESGOS.includes(f.riesgo) ? RIESGOS : [...RIESGOS, f.riesgo];
  const sugerencia =
    horas > 5 ? 'Media (50%)' : f.lineas.some((l) => !['PLA', 'PETG'].includes(familia(l.material))) ? 'Media (50%)' : null;
  const motivoSug = horas > 5 ? 'más de 5 h' : 'material delicado';

  return (
    <div className={'enc' + (arrastrando ? ' enc-arrastrando' : '')}>
      {arrastrando && <div className="enc-velo" aria-hidden="true">Suelta el laminado</div>}

      {/* Franja de precio (móvil y pantallas medianas) */}
      <button
        type="button"
        className="enc-franja adm-num"
        onClick={() =>
          r
            ? document.getElementById('enc-panel')?.scrollIntoView({ block: 'start' })
            : document.getElementById(calculo.faltan[0] === 'tiempo' ? 'enc-tiempo' : 'enc-g-0')?.focus()
        }
      >
        {r ? (
          <>
            <strong>{euros(r.precio)}</strong>
            <span>· benef. {euros(r.beneficioReal)}</span>
            <span aria-hidden="true">▾</span>
          </>
        ) : (
          <span>{calculo.faltan.length ? `Faltan ${calculo.faltan.join(' y ')}` : calculo.error ?? '—'}</span>
        )}
      </button>

      <AdminCabecera
        titulo={titulo}
        acciones={
          editando ? (
            <Link className="btn-outline" href={`/admin/presupuestos?abrir=${editando.quotes?.codigo ?? ''}`}>Cancelar</Link>
          ) : (
            <button type="button" className="btn-outline" onClick={limpiar}>Limpiar</button>
          )
        }
      />
      {errorCarga && <ErrorBanner>{errorCarga}</ErrorBanner>}

      <div className="enc-grid">
        <form
          className="enc-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          {errorGuardar && <ErrorBanner>{errorGuardar}</ErrorBanner>}

          {/* ── Laminado ── */}
          <section className="adm-card" aria-labelledby="t-laminado">
            <h2 id="t-laminado" className="adm-card-titulo">
              Laminado {laminado && <span className="enc-etq">del laminado ✓</span>}
            </h2>
            <div className="enc-rapida">
              <label className="enc-campo">
                <span className="enc-rotulo">{f.lineas.length > 1 ? 'Gramos, línea 1' : 'Gramos'}</span>
                <CampoNumero
                  ref={gramosRef}
                  id="enc-g-0"
                  unidad="g"
                  enterKeyHint="next"
                  value={f.lineas[0].gramos}
                  invalido={!!ver('g0')}
                  aria-describedby={ver('g0') ? 'err-g0' : undefined}
                  onChange={(v) => setLinea(f.lineas[0].id, { gramos: v })}
                  onBlur={() => tocar('g0')}
                />
                {ver('g0') && <span id="err-g0" className="enc-error">{ver('g0')}</span>}
              </label>
              <label className="enc-campo">
                <span className="enc-rotulo">Tiempo</span>
                <CampoTiempo
                  id="enc-tiempo"
                  idEquivalencia="eq-tiempo"
                  enterKeyHint="next"
                  placeholder="1h31"
                  value={f.tiempo}
                  invalido={!!ver('tiempo')}
                  aria-describedby={ver('tiempo') ? 'err-tiempo eq-tiempo' : 'eq-tiempo'}
                  onChange={(v) => setF((p) => ({ ...p, tiempo: v, tiempoExacto: null }))}
                  onBlur={() => tocar('tiempo')}
                />
                {ver('tiempo') && <span id="err-tiempo" className="enc-error">{ver('tiempo')}</span>}
              </label>
            </div>
            {cantidad > 1 && (
              <Opciones
                legend="El laminado es de"
                name="porunidad"
                value={f.porUnidad ? 'unidad' : 'todo'}
                onChange={(v) => set('porUnidad', v === 'unidad')}
                opciones={[
                  { value: 'todo', label: 'todo el pedido' },
                  { value: 'unidad', label: `1 unidad → × ${cantidad}` }
                ]}
              />
            )}

            <Opciones
              legend="Impresora"
              name="impresora"
              value={f.impresora}
              onChange={(v) => set('impresora', v)}
              opciones={cfg.printers.map((p) => ({ value: p.name, label: p.name }))}
            />

            <div className="enc-lineas">
              {f.lineas.map((l, i) => {
                const opc = coloresDe(l.material);
                const muestra = opc.find((c) => c.nombre === l.color)?.hex;
                const g = parseNumero(l.gramos);
                const kg = cfg.filament_types.find((t) => t.name === l.material)?.price_per_kg ?? 0;
                return (
                  <div key={l.id} className="enc-linea">
                    <span className="enc-muestra" style={{ background: muestra ?? 'transparent' }} aria-hidden="true" />
                    <label className="enc-campo">
                      <span className="enc-rotulo">Material{f.lineas.length > 1 ? `, línea ${i + 1}` : ''}</span>
                      <select
                        id={`enc-m-${i}`}
                        className="enc-input"
                        value={l.material}
                        onChange={(e) => setLinea(l.id, { material: e.target.value, color: '' })}
                      >
                        {cfg.filament_types.map((t) => (
                          <option key={t.name} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="enc-campo">
                      <span className="enc-rotulo">Color{f.lineas.length > 1 ? `, línea ${i + 1}` : ''}</span>
                      <select
                        id={`enc-c-${i}`}
                        className="enc-input"
                        value={l.color}
                        aria-invalid={!!ver(`c${i}`) || undefined}
                        aria-describedby={ver(`c${i}`) ? `err-c${i}` : undefined}
                        onChange={(e) => setLinea(l.id, { color: e.target.value })}
                        onBlur={() => tocar(`c${i}`)}
                      >
                        <option value="">Elige color</option>
                        {opc.map((c) => (
                          <option key={c.id} value={c.nombre}>{c.nombre}</option>
                        ))}
                        {l.color && !opc.some((c) => c.nombre === l.color) && <option value={l.color}>{l.color}</option>}
                      </select>
                      {ver(`c${i}`) && <span id={`err-c${i}`} className="enc-error">{ver(`c${i}`)}</span>}
                    </label>
                    {i > 0 && (
                      <label className="enc-campo enc-campo-g">
                        <span className="enc-rotulo">Gramos, línea {i + 1}</span>
                        <CampoNumero
                          id={`enc-g-${i}`}
                          unidad="g"
                          enterKeyHint={i === f.lineas.length - 1 ? 'done' : 'next'}
                          value={l.gramos}
                          invalido={!!ver(`g${i}`)}
                          aria-describedby={ver(`g${i}`) ? `err-g${i}` : undefined}
                          onChange={(v) => setLinea(l.id, { gramos: v })}
                          onBlur={() => tocar(`g${i}`)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && i === f.lineas.length - 1) {
                              e.preventDefault();
                              anadirLinea();
                            }
                          }}
                        />
                        {ver(`g${i}`) && <span id={`err-g${i}`} className="enc-error">{ver(`g${i}`)}</span>}
                      </label>
                    )}
                    <span className="enc-linea-coste adm-num">
                      {g && g > 0 ? euros((g * mult * kg) / 1000) : ''}
                    </span>
                    {i > 0 && (
                      <button type="button" className="enc-quitar" aria-label={`Quitar línea ${i + 1}`} onClick={() => quitarLinea(l.id)}>
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="enc-fila">
              <button type="button" className="enc-enlace" onClick={anadirLinea}>+ Añadir color</button>
              {f.lineas.length > 1 && r && (
                <span className="enc-gris adm-num">Total {formatGramos(gramosLaminado)}</span>
              )}
            </div>

            {verPurga && (
              <div className="enc-purga">
                <label className="enc-campo">
                  <span className="enc-rotulo">Cambios de color</span>
                  <CampoNumero id="enc-cambios" value={f.cambios} onChange={(v) => set('cambios', v)} />
                </label>
                <label className="enc-campo">
                  <span className="enc-rotulo">Purga <span className="enc-etq">estimada</span></span>
                  <CampoNumero
                    id="enc-purga"
                    unidad="g"
                    placeholder={purgaEstimada ? formatNumero(purgaEstimada, 2) : '0'}
                    value={f.purgaG}
                    invalido={!!ver('purga')}
                    onChange={(v) => set('purgaG', v)}
                    onBlur={() => tocar('purga')}
                  />
                </label>
                <span className="enc-gris">La K1 no cuenta la purga en el laminado.</span>
              </div>
            )}

            {laminado ? (
              <p className="enc-leido">
                ✓ {laminado.nombre} · {laminado.l.impresora ?? 'impresora ?'} · {formatGramos(laminado.l.pesoG)} ·{' '}
                {formatHoras(laminado.l.tiempoH)} · {laminado.l.colores} {laminado.l.colores > 1 ? 'colores' : 'color'}{' '}
                <button type="button" className="enc-enlace" onClick={() => setLaminado(null)}>Quitar</button>
              </p>
            ) : null}
            {laminado?.faltan.length ? (
              <ErrorBanner tone="info">No encuentro {laminado.faltan.join(' ni ')} en el archivo. Tecléalo.</ErrorBanner>
            ) : null}
            {errorArchivo && <ErrorBanner>{errorArchivo}</ErrorBanner>}
            <p className="enc-gris enc-ayuda-archivo">
              ¿Exportaste el .gcode? Suéltalo en la página o{' '}
              <button type="button" className="enc-enlace" title="Ctrl+O" onClick={() => archivoRef.current?.click()}>
                elige el archivo
              </button>
              .
            </p>
            <input
              ref={archivoRef}
              type="file"
              accept=".gcode,.3mf"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) abrirArchivos(e.target.files);
                e.target.value = '';
              }}
            />
            {metricasWeb && (
              <p className="enc-gris">
                Estimado por el tasador: {formatGramos(Number(metricasWeb.peso_g) || 0)} · {formatHoras(Number(metricasWeb.tiempo_h) || 0)}
                {editando?.quotes?.precio_total ? ` · ${euros(editando.quotes.precio_total)}` : ''}
                {r && Number(metricasWeb.peso_g) > 0 &&
                  ` · real ${formatGramos(gramosLaminado)} (${gramosLaminado >= Number(metricasWeb.peso_g) ? '+' : ''}${formatNumero(
                    (gramosLaminado / Number(metricasWeb.peso_g) - 1) * 100,
                    0
                  )} %)`}
              </p>
            )}
            {r && (r.pesoG > 1000 || horas > 48) && <p className="enc-nota">¿Seguro? Es mucho para un encargo.</p>}
          </section>

          {/* ── Cliente ── */}
          <section className="adm-card" aria-labelledby="t-cliente">
            <h2 id="t-cliente" className="adm-card-titulo">Cliente</h2>
            <div className="enc-dos">
              <label className="enc-campo">
                <span className="enc-rotulo">Nombre</span>
                <input
                  id="enc-nombre"
                  className="enc-input"
                  list="enc-clientes"
                  autoComplete="off"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={f.nombre}
                  aria-invalid={!!ver('nombre') || undefined}
                  aria-describedby={ver('nombre') ? 'err-nombre' : undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    const c = clientes.get(v.trim().toLowerCase());
                    setF((p) => ({
                      ...p,
                      nombre: v,
                      email: c && !p.email ? c.email : p.email,
                      telefono: c && !p.telefono ? c.telefono : p.telefono
                    }));
                  }}
                  onBlur={() => tocar('nombre')}
                />
                <datalist id="enc-clientes">
                  {[...clientes.values()].map((c) => (
                    <option key={c.nombre} value={c.nombre} />
                  ))}
                </datalist>
                {ver('nombre') && <span id="err-nombre" className="enc-error">{ver('nombre')}</span>}
              </label>
              <label className="enc-campo">
                <span className="enc-rotulo">Teléfono</span>
                <input
                  id="enc-tel"
                  className="enc-input"
                  type="tel"
                  autoComplete="off"
                  enterKeyHint="next"
                  value={f.telefono}
                  onChange={(e) => set('telefono', e.target.value)}
                />
              </label>
            </div>
            <label className="enc-campo">
              <span className="enc-rotulo">Email</span>
              <input
                id="enc-email"
                className="enc-input"
                type="email"
                autoComplete="off"
                enterKeyHint="next"
                value={f.email}
                aria-invalid={!!ver('email') || undefined}
                aria-describedby={ver('email') ? 'err-email' : undefined}
                onChange={(e) => set('email', e.target.value)}
                onBlur={() => tocar('email')}
              />
              {ver('email') && <span id="err-email" className="enc-error">{ver('email')}</span>}
            </label>
            {!cliente && f.nombre.trim() && !f.email.trim() && !f.telefono.trim() && tocados.has('nombre') && (
              <p className="enc-nota">Cliente nuevo sin email ni teléfono: no podremos avisarle.</p>
            )}
            {cliente && !editando && cliente.ultimo.data.descripcion && (
              <p className="enc-gris">
                ↳{' '}
                <button
                  type="button"
                  className="enc-enlace"
                  onClick={() => {
                    const d = cliente.ultimo.data;
                    setF((p) => ({
                      ...p,
                      descripcion: String(d.descripcion ?? ''),
                      diseno: migrarDiseno(d.diseno_modelado, d.busqueda_modelos),
                      disenoHoras: d.diseno_horas ? formatHoras(Number(d.diseno_horas)) : '',
                      postpro: migrarPostpro(d.postprocesado_label, d.eliminacion_soportes),
                      riesgo: PROBABILIDAD_ERROR[d.probabilidad_error_label] !== undefined ? d.probabilidad_error_label : p.riesgo
                    }));
                  }}
                >
                  Repetir su último encargo: <em>{String(cliente.ultimo.data.descripcion)}</em> (
                  {fechaCortaProxima(String(cliente.ultimo.data.fecha || cliente.ultimo.created_at).slice(0, 10))})
                </button>
              </p>
            )}
          </section>

          {/* ── Encargo ── */}
          <section className="adm-card" aria-labelledby="t-encargo">
            <h2 id="t-encargo" className="adm-card-titulo">Encargo</h2>
            <div className="enc-dos enc-dos-desc">
              <label className="enc-campo">
                <span className="enc-rotulo">Descripción</span>
                <input
                  id="enc-desc"
                  className="enc-input"
                  enterKeyHint="next"
                  placeholder={sugerenciaDesc}
                  value={f.descripcion}
                  aria-invalid={!!ver('descripcion') || undefined}
                  aria-describedby={ver('descripcion') ? 'err-desc' : duplicado ? 'dup-desc' : undefined}
                  onChange={(e) => set('descripcion', e.target.value)}
                  onKeyDown={(e) => {
                    // Tab acepta la sugerencia (el nombre del archivo).
                    if (e.key === 'Tab' && !e.shiftKey && !f.descripcion && sugerenciaDesc) set('descripcion', sugerenciaDesc);
                  }}
                  onBlur={() => tocar('descripcion')}
                />
                {ver('descripcion') && <span id="err-desc" className="enc-error">{ver('descripcion')}</span>}
              </label>
              <label className="enc-campo">
                <span className="enc-rotulo">Cantidad</span>
                <CampoNumero id="enc-cant" unidad="ud." enterKeyHint="next" value={f.cantidad} onChange={(v) => set('cantidad', v)} />
              </label>
            </div>
            {duplicado && (
              <p id="dup-desc" className="enc-nota">
                Ya existe {duplicado.quotes?.codigo ?? duplicado.id} de {String(duplicado.data.cliente)} con esta descripción.{' '}
                {duplicado.quotes?.codigo && (
                  <Link className="enc-enlace" href={`/admin/presupuestos?abrir=${duplicado.quotes.codigo}`}>Abrirlo</Link>
                )}
              </p>
            )}
          </section>

          {/* ── Trabajo ── */}
          <section className="adm-card" aria-labelledby="t-trabajo">
            <h2 id="t-trabajo" className="adm-card-titulo">Trabajo</h2>
            <Opciones
              legend="Diseño"
              name="diseno"
              value={f.diseno}
              onChange={(v) => set('diseno', v)}
              opciones={Object.keys(DISENO_MODELADO).map((k) => ({
                value: k,
                label: k === 'No necesario' ? 'No' : k === DISENO_A_MEDIDA ? 'Por horas' : k.replace(/ \(.*\)$/, '').replace('Búsqueda de modelos', 'Búsqueda'),
                sub: k === DISENO_A_MEDIDA ? undefined : euros(importeDiseno(cfg, k))
              }))}
            >
              {f.diseno === DISENO_A_MEDIDA && (
                <label className="enc-campo enc-dh">
                  <span className="enc-rotulo">Horas de diseño</span>
                  <CampoTiempo
                    id="enc-dh"
                    idEquivalencia="eq-dh"
                    value={f.disenoHoras}
                    invalido={!!ver('disenoHoras')}
                    aria-describedby={ver('disenoHoras') ? 'err-dh eq-dh' : 'eq-dh'}
                    onChange={(v) => set('disenoHoras', v)}
                    onBlur={() => tocar('disenoHoras')}
                  />
                  {ver('disenoHoras') && <span id="err-dh" className="enc-error">{ver('disenoHoras')}</span>}
                  {calculo.input && calculo.input.disenoHoras > 0 && (
                    <span className="enc-gris">
                      × {euros(importeDiseno(cfg, DISENO_A_MEDIDA, 1))}/h = {euros(importeDiseno(cfg, DISENO_A_MEDIDA, calculo.input.disenoHoras))}
                    </span>
                  )}
                </label>
              )}
              <p className="enc-gris">Se cobra una vez por pedido.</p>
            </Opciones>

            <Opciones
              legend="Post-procesado"
              name="postpro"
              value={f.postpro}
              onChange={(v) => set('postpro', v)}
              opciones={Object.keys(POSTPROCESADO).map((k) => ({
                value: k,
                label: k.replace(/ \(.*\)$/, ''),
                sub: k === 'Limpio' ? undefined : euros(importePostpro(cfg, k))
              }))}
            >
              {cantidad > 1 && f.postpro !== 'Limpio' && (
                <p className="enc-gris">
                  {euros(importePostpro(cfg, f.postpro))} × {cantidad} uds = {euros(importePostpro(cfg, f.postpro) * cantidad)}
                </p>
              )}
              {f.postpro === 'Avanzado (+ pintura)' && <p className="enc-gris">La pintura va en Gasto extra.</p>}
            </Opciones>

            <Opciones
              legend="Riesgo"
              name="riesgo"
              value={f.riesgo}
              onChange={(v) => set('riesgo', v)}
              opciones={riesgosOpc.map((k) => ({
                value: k,
                label: `${formatNumero(PROBABILIDAD_ERROR[k] * 100, 0)} %`,
                sub: k.replace(/ \(.*\)$/, '')
              }))}
            >
              {sugerencia && sugerencia !== f.riesgo && PROBABILIDAD_ERROR[f.riesgo] < PROBABILIDAD_ERROR[sugerencia] && (
                <p className="enc-gris">
                  <button type="button" className="enc-enlace" onClick={() => set('riesgo', sugerencia)}>
                    Sugerido: Media ({motivoSug})
                  </button>
                </p>
              )}
              <button type="button" className="enc-enlace" aria-expanded={ayudaRiesgo} onClick={() => setAyudaRiesgo((v) => !v)}>
                ¿Cómo elegir?
              </button>
              {ayudaRiesgo && (
                <ul className="enc-ayuda" onKeyDown={(e) => e.key === 'Escape' && setAyudaRiesgo(false)}>
                  <li><strong>Base:</strong> pieza conocida y sin sorpresas, Baja.</li>
                  <li><strong>Material:</strong> PETG fino, TPU, ASA o nylon suben un nivel.</li>
                  <li><strong>Duración:</strong> más de 5 h sube un nivel; más de 15 h, dos.</li>
                  <li><strong>I+D:</strong> si es la primera vez que la imprimimos o hay que probar, Alta o más.</li>
                </ul>
              )}
            </Opciones>

            <details ref={masRef} className="enc-mas">
              <summary>Más: urgencia, gasto extra, precio pactado</summary>
              <label className="enc-check">
                <input type="checkbox" checked={f.urgente} onChange={(e) => set('urgente', e.target.checked)} />
                Urgente (+{formatNumero(settings.urgencia_recargo_pct, 0)} %)
              </label>
              <label className="enc-campo">
                <span className="enc-rotulo">Gasto extra</span>
                <CampoNumero
                  id="enc-extra"
                  unidad="€"
                  enterKeyHint="done"
                  value={f.extra}
                  invalido={!!ver('extra')}
                  aria-describedby="ayuda-extra"
                  onChange={(v) => set('extra', v)}
                  onBlur={() => tocar('extra')}
                />
                <span id="ayuda-extra" className="enc-gris">
                  {ver('extra') ?? 'Anillas, pintura, embalaje. Se suma tal cual, sin margen.'}
                </span>
              </label>
              <label className="enc-campo">
                <span className="enc-rotulo">Precio pactado por unidad</span>
                <CampoNumero
                  id="enc-pactado"
                  unidad="€"
                  enterKeyHint="done"
                  value={f.pactado}
                  invalido={!!ver('pactado')}
                  aria-describedby="ayuda-pactado"
                  onChange={(v) => set('pactado', v)}
                  onBlur={() => tocar('pactado')}
                />
                <span id="ayuda-pactado" className="enc-gris">
                  {ver('pactado') ??
                    (r?.pactado
                      ? `La tarifa daría ${euros(r.precioTarifa)}. Gramos y tiempo siguen contando para coste y plazo.`
                      : 'Lo acordado con el cliente. Sustituye al precio calculado.')}
                </span>
              </label>
            </details>
          </section>
        </form>

        {/* ── Panel de precio ── */}
        <aside id="enc-panel" className="enc-panel adm-card" aria-label="Precio">
          {resultado ? (
            <div className="enc-hecho">
              <p className="enc-hecho-titulo">
                ✓ {resultado.codigo ?? resultado.id} guardado
                {resultado.avisado ? ` y enviado a ${resultado.email}` : ''}
              </p>
              {resultado.avisoError ? (
                <ErrorBanner>
                  <strong>El aviso no salió</strong>: {resultado.avisoError}{' '}
                  <button type="button" className="enc-enlace" onClick={() => enviarAviso(resultado)}>Reintentar aviso</button>
                </ErrorBanner>
              ) : null}
              <p className="adm-num">
                {euros(resultado.precio)}
                {resultado.fechaTope ? ` · listo antes del ${fechaCortaProxima(resultado.fechaTope)}` : ''}
              </p>
              <div className="enc-hecho-acciones">
                {resultado.codigo && (
                  <Link className="btn-outline" href={`/admin/presupuestos?abrir=${resultado.codigo}`}>Ver pedido</Link>
                )}
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => {
                    if (!resultado.fechaTope) return;
                    openQuotePdf(
                      {
                        lineas: [{ concepto: resultado.pdf.concepto, importe: resultado.precio }],
                        total: resultado.precio,
                        pesoG: resultado.pdf.pesoG,
                        tiempoH: resultado.pdf.horas
                      },
                      settings,
                      0,
                      { fechaTope: resultado.fechaTope, codigo: resultado.codigo ?? undefined }
                    );
                  }}
                >
                  PDF
                </button>
                {resultado.codigo && (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={async () => {
                      const url =
                        `${CONTACTO.sitio}/presupuesto?codigo=${encodeURIComponent(resultado.codigo!)}` +
                        (resultado.token ? `&token=${encodeURIComponent(resultado.token)}` : '');
                      try {
                        await navigator.clipboard.writeText(url);
                        avisar('Enlace de seguimiento copiado');
                      } catch {
                        avisar(url);
                      }
                    }}
                  >
                    Copiar enlace de seguimiento
                  </button>
                )}
              </div>
              <button ref={nuevoRef} type="button" className="btn-primary enc-nuevo" autoFocus onClick={() => setResultado(null)}>
                Nuevo encargo
              </button>
            </div>
          ) : (
            <>
              <p className="adm-card-titulo">Precio para el cliente</p>
              <div aria-live="polite" className="enc-sr">{precioAnunciado}</div>
              {r ? (
                <>
                  <p className="enc-precio adm-num">{euros(r.precio)}</p>
                  {precioAntes !== null && Math.round(r.precio * 100) !== Math.round(precioAntes * 100) && (
                    <p className="enc-antes adm-num">
                      Antes {euros(precioAntes)} → Ahora {euros(r.precio)} ({r.precio > precioAntes ? '+' : '−'}
                      {euros(Math.abs(r.precio - precioAntes))})
                    </p>
                  )}
                  <ul className="enc-datos adm-num">
                    {cantidad > 1 && <li>{cantidad} uds · {euros(r.precioUnitario)}/ud</li>}
                    <li>Señal (50 %): {euros(Math.round(r.precio * 50) / 100)}</li>
                    {fechaTope && <li>Listo antes del {fechaCortaProxima(fechaTope)}</li>}
                    {r.minimoAplicado && <li><span className="enc-etq">Mínimo {euros(r.precioMinimo)}</span></li>}
                    {r.pactado && (
                      <li>
                        <span className="enc-etq">Pactado</span> tarifa {euros(r.precioTarifa)} ({r.precio >= r.precioTarifa ? '+' : '−'}
                        {euros(Math.abs(r.precio - r.precioTarifa))})
                      </li>
                    )}
                    {f.urgente && <li><span className="enc-etq">Urgente</span></li>}
                  </ul>
                  <div className="enc-interno">
                    <p className="adm-card-titulo">Interno</p>
                    <dl className="adm-num">
                      <dt>Coste</dt>
                      <dd>{euros(r.costeReal)}</dd>
                      <dt>Beneficio</dt>
                      <dd>
                        {euros(r.beneficioReal)} · {formatNumero(r.margen * 100, 0)} %
                      </dd>
                    </dl>
                    {r.beneficioReal < 0 && <p className="enc-nota">El precio no cubre el coste.</p>}
                    <details className="enc-desglose" open={typeof window !== 'undefined' && window.innerWidth > 900}>
                      <summary>Desglose</summary>
                      <dl className="adm-num">
                        {desgloseLineas.map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{euros(v)}</dd>
                          </div>
                        ))}
                        {r.minimoAplicado && (
                          <div>
                            <dt>Mínimo aplicado</dt>
                            <dd>{euros(r.precioMinimo)}</dd>
                          </div>
                        )}
                        {r.redondeo >= 0.005 && !r.minimoAplicado && (
                          <div>
                            <dt>Redondeo</dt>
                            <dd>{euros(r.redondeo)}</dd>
                          </div>
                        )}
                        {r.pactado && (
                          <div>
                            <dt>Ajuste pactado</dt>
                            <dd>{r.precio >= r.precioTarifa ? '+' : '−'}{euros(Math.abs(r.precio - r.precioTarifa))}</dd>
                          </div>
                        )}
                      </dl>
                    </details>
                  </div>
                </>
              ) : (
                <>
                  <p className="enc-precio adm-num">—</p>
                  {calculo.faltan.length ? (
                    <p className="enc-gris">
                      Faltan:{' '}
                      {calculo.faltan.map((k, i) => (
                        <span key={k}>
                          {i > 0 && ' · '}
                          <button
                            type="button"
                            className="enc-enlace"
                            onClick={() => document.getElementById(k === 'tiempo' ? 'enc-tiempo' : idDe(`g${f.lineas.findIndex((l) => !(parseNumero(l.gramos)! > 0))}`))?.focus()}
                          >
                            {k}
                          </button>
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="enc-error">{calculo.error}</p>
                  )}
                </>
              )}

              <div className="enc-acciones">
                {pideMotivo && (
                  <label className="enc-campo enc-motivo">
                    <span className="enc-rotulo">Motivo del cambio</span>
                    <input
                      id="enc-motivo"
                      className="enc-input"
                      value={f.motivo}
                      aria-invalid={!!ver('motivo') || undefined}
                      aria-describedby={ver('motivo') ? 'err-motivo' : undefined}
                      onChange={(e) => set('motivo', e.target.value)}
                      onBlur={() => tocar('motivo')}
                    />
                    {ver('motivo') && <span id="err-motivo" className="enc-error">{ver('motivo')}</span>}
                  </label>
                )}
                <div className="enc-botones">
                  {hayEmail && (
                    <button type="button" className="btn-outline" disabled={guardando} title="Ctrl+S" onClick={() => guardar(false)}>
                      {editando ? 'Guardar sin avisar' : 'Sin avisar'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={guardando}
                    title={hayEmail ? 'Ctrl+Enter' : 'Ctrl+Enter · Ctrl+S'}
                    onClick={() => guardar(hayEmail)}
                  >
                    {guardando ? 'Guardando…' : textoGuardar}
                  </button>
                </div>
                <p className="enc-gris enc-destino">
                  {hayEmail
                    ? `Se enviará a ${f.email.trim()} con el enlace de seguimiento · Ctrl+Enter`
                    : 'Sin email: no se avisa · Ctrl+Enter'}
                </p>
              </div>
            </>
          )}
        </aside>
      </div>
      {aviso}
    </div>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
