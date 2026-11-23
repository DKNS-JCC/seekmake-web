'use client';

// Tasador propio — replaces the SeekMake embed.
// Flow: drop up to 5 model files → analyze geometry in-browser (a Web
// Worker lays each part on the bed the cheap way and "slices" it into
// per-layer statistics, like the shop does in OrcaSlicer) → configure
// EACH piece independently (material, colors, resistance, detail, quantity;
// the steps panel edits the selected piece) → live price breakdown →
// submit.
//
// This file wires the parts together and owns the order-level state
// (tariffs, delivery, code, request status). The parts:
//   usePiezas    files, layer analysis and each piece's configuration
//   useVisor     the 3D viewer (Visor.tsx draws its box)
//   ListaPiezas  warnings and the list of pieces · ConfigPieza  steps 1-4
//   Resumen      step 5 and the price · Pedir  the request and its answer
//   seguimiento  the anonymous funnel · solicitud  what submit-quote gets

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Color, Filamento, QuoteEntrega } from '@/lib/types';
import { useCatalogoColores } from '@/lib/useCatalogoColores';
import { piezaColors, type QuoteStatus } from '@/lib/quote/types';
import { looksDegenerate, suggestScales } from '@/lib/quote/geometry';
import {
  computeQuote,
  normalizeSettings,
  fechaTope,
  esConsultar,
  DEFAULT_QUOTE_SETTINGS,
  type PiezaInput,
  type QuoteSettings
} from '@/lib/quote/pricing';
import { euros } from '@/lib/recibo/types';
import './quote.css';
import './quote-precio.css';
import { usePrecioVisto, useVisita } from './seguimiento';
import { useColoresVisor, useMiniatura, useVisor } from './useVisor';
import { usePiezas } from './usePiezas';
import { useCupon } from './useCupon';
import { Visor } from './Visor';
import { ListaPiezas } from './ListaPiezas';
import { ConfigPieza } from './ConfigPieza';
import { Entrega, Resumen } from './Resumen';
import { Pedir } from './Pedir';
import { piezaSeparada } from './solicitud';

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

  // ─── settings (runtime fetch so tariff edits apply instantly) ───────────
  const [settings, setSettings] = useState<QuoteSettings>(DEFAULT_QUOTE_SETTINGS);
  // Hours already queued (accepted orders): the deadline counts them.
  const [colaH, setColaH] = useState(0);
  // Don't show prices computed with defaults — wait for the real tariffs so
  // the total never visibly jumps after the fetch resolves.
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [activePart, setActivePart] = useState(0);
  const [entrega, setEntrega] = useState<QuoteEntrega>('recogida');
  const [cp, setCp] = useState(''); // optional, envío only: local vs national traffic
  const [status, setStatus] = useState<QuoteStatus>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phones: a «Pedirlo» pill while the price and its button are off-screen.
  // On a PC they never are: the panel keeps them pinned at its foot.
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

  const cup = useCupon();
  useVisita();
  const visor = useVisor(setActivePart);
  const pz = usePiezas({
    visor,
    settings,
    settingsLoaded,
    filamentos,
    colores,
    activePart,
    setActivePart,
    // A sent request stays on screen; "Calcular otra pieza" starts over.
    alAnadir: () => setStatus((s) => (s.kind === 'ok' ? s : { kind: 'idle' }))
  });
  const { piezas, activeId, activePieza, activeFilamento } = pz;
  useMiniatura(visor, activeId, pz.piezasRef);
  useColoresVisor(visor, activePieza, activeFilamento, pz.partsMode);

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
          detalleId: p.config.detalleId,
          separados: piezaSeparada(p)
        };
      }),
    [piezas, filamentos]
  );

  const quote = useMemo(() => {
    if (!entradas.length || !settingsLoaded) return null;
    return computeQuote(entradas, settings, entrega, cup.cupon);
  }, [entradas, settings, settingsLoaded, entrega, cup.cupon]);

  const maxBedMm = settings.max_bed_mm;
  // Per object: several objects side by side may be wider than the bed.
  const tooBig = piezas.some(
    (p) => (p.metrics.objetoMayorMm ?? Math.max(p.metrics.bboxMm.x, p.metrics.bboxMm.y, p.metrics.bboxMm.z)) > maxBedMm
  );
  const degenerate = piezas.some((p) => looksDegenerate(p.metrics));
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
  const consultar = !!quote && esConsultar(quote, settings);
  const listoAntes = quote ? fechaTope(quote.tiempoH, settings, colaH) : null;
  const cpValido = entrega === 'envio' && /^\d{5}$/.test(cp) ? cp : undefined;

  usePrecioVisto(listo, quote, piezas, entrega, cpValido);
  // Suspiciously tiny model → probably exported in inches/metres.
  const scaleSuggestions = activePieza ? suggestScales(activePieza.metrics) : [];

  // ─── render ─────────────────────────────────────────────────────────────
  return (
    <div className="page-content qt-page">
      <section className={'qt-hero' + (piezas.length ? ' compacto' : '')}>
        <h1>Calcula el precio de tu pieza</h1>
        {!piezas.length && (
          <p className="qt-hero-desc">Sube tu archivo 3D y te decimos el precio al momento. Sin registros.</p>
        )}
      </section>

      <div className="container-3dcc qt-main">
        <Visor
          visor={visor}
          fileInputRef={fileInputRef}
          numPiezas={piezas.length}
          activePieza={activePieza}
          loadingFile={pz.loadingFile}
          fileError={pz.fileError}
          addFiles={pz.addFiles}
        />

        {/* ── options panel ── */}
        <aside className="qt-panel">
          <div className="qt-panel-opciones">
          <ListaPiezas
            pz={pz}
            quote={quote}
            tooBig={tooBig}
            degenerate={degenerate}
            maxBedMm={maxBedMm}
            scaleSuggestions={scaleSuggestions}
            setActivePart={setActivePart}
          />
          <ConfigPieza
            pz={pz}
            filamentos={filamentos}
            materialColors={materialColors}
            activeColors={activeColors}
            activePart={activePart}
            setActivePart={setActivePart}
          />

          {/* entrega — global for the whole order */}
          {piezas.length > 0 && (
            <Entrega settings={settings} entrega={entrega} setEntrega={setEntrega} cp={cp} setCp={setCp} />
          )}
          </div>

          {/* price and button: pinned at the panel's foot on a PC */}
          <div className="qt-panel-pie" ref={totalRef}>
          <Resumen
            settingsLoaded={settingsLoaded}
            numPiezas={piezas.length}
            numAnalizando={analizando.length}
            progresoAnalisis={progresoAnalisis}
            listo={listo}
            quote={quote}
            precioFinal={precioFinal}
            consultar={consultar}
            firmeActivo={firmeActivo}
            listoAntes={listoAntes}
            entrega={entrega}
            cup={cup}
          />

          <Pedir
            piezas={piezas}
            quote={quote}
            listo={listo}
            filamentos={filamentos}
            entrega={entrega}
            cpValido={cpValido}
            consultar={consultar}
            status={status}
            setStatus={setStatus}
            cup={cup}
          />
          </div>
        </aside>
      </div>

      {/* Phones: «Pedirlo» follows the user; tapping it goes to the price and
          opens the form. Hidden once the price is on screen or after sending. */}
      {listo && quote && status.kind !== 'ok' && !totalInView && (
        <button
          type="button"
          className="qt-sticky-price"
          onClick={() => {
            // Open the form, then bring its field into view once it exists.
            document.querySelector<HTMLButtonElement>('#qt-pedirlo')?.click();
            setTimeout(() => document.querySelector('#qt-contacto')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
          }}
        >
          {consultar ? 'Pedirlo' : <>Pedirlo · <strong>{euros(quote.total)}</strong></>}
        </button>
      )}
    </div>
  );
}
