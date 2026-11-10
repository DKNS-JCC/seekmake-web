// The pieces of a tasador order: loading and measuring files, the layer
// analysis in a Web Worker, and each piece's own configuration. New pieces
// inherit the active piece's config so the common same-settings order needs
// zero extra clicks.

import { useEffect, useRef, useState } from 'react';
import type { Color, Filamento } from '@/lib/types';
import type { EstimacionEstado, Pieza, PiezaConfig } from '@/lib/quote/types';
import type { QuoteSettings } from '@/lib/quote/pricing';
import { analyzeObject } from '@/lib/quote/geometry';
import { analizarEnSegundoPlano } from '@/lib/quote/estimador/cliente';
import { IDENTIDAD } from '@/lib/quote/estimador/orientar';
import { triangulosImpresion } from '@/lib/quote/estimador/three';
import { colorParecido } from '@/lib/quote/tresmf';
import { MAX_FILES, MAX_FILE_MB, centrarEnCama, cuerposDe, disposeModel, parseModel } from './modelo';
import { huellaDe, trackEvent } from './seguimiento';
import type { Visor } from './useVisor';

export function usePiezas({
  visor,
  settings,
  settingsLoaded,
  filamentos,
  colores,
  activePart,
  setActivePart,
  alAnadir
}: {
  visor: Visor;
  settings: QuoteSettings;
  settingsLoaded: boolean;
  filamentos: Filamento[];
  colores: Color[];
  activePart: number;
  setActivePart: (i: number) => void;
  /** After new pieces come in (a sent request stays on screen). */
  alAnadir: () => void;
}) {
  const { modelsRef, stateRef, shownRef, showModel } = visor;
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Latest pieces for async callbacks, and a version per piece so a stale
  // analysis (superseded by a rescale or an orientation toggle) is ignored.
  const piezasRef = useRef<Pieza[]>([]);
  piezasRef.current = piezas;
  const versionAnalisis = useRef(new Map<string, number>());
  const analisisIniciados = useRef(new Set<string>());

  const activePieza = piezas.find((p) => p.id === activeId) ?? null;
  const activeFilamento = activePieza
    ? filamentos.find((f) => f.id === activePieza.config.filamentoId) ?? filamentos[0] ?? null
    : null;
  // Per-part coloring for the active piece (multi-part 3MF).
  const partsMode = (activePieza?.partNames.length ?? 0) > 1;

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
            },
            cuerpos: cuerposDe(model)
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
      alAnadir();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    centrarEnCama(model.root);
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

  return {
    piezas,
    piezasRef,
    activeId,
    setActiveId,
    activePieza,
    activeFilamento,
    partsMode,
    loadingFile,
    fileError,
    addFiles,
    removePieza,
    rescalePieza,
    setCantidad,
    patchActiveConfig,
    applyToAll,
    changeMaterial,
    pickColor,
    toggleExtraColor
  };
}

export type Piezas = ReturnType<typeof usePiezas>;
