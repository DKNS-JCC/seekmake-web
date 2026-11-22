'use client';

// Pricing knobs for the tasador — edits the single jsonb row in
// quote_settings — the quote page fetches it at runtime, so changes apply
// instantly (no rebuild needed).

import { useEffect, useMemo, useState } from 'react';
import type { CalibracionTasadorRow, Filamento } from '@/lib/types';
import {
  costeHoraMaquina,
  factorCalculadora,
  normalizeSettings,
  precioKgDe,
  type QuoteSettings,
  type TipoPieza
} from '@/lib/quote/pricing';
import { PERFIL_K1SE, MATERIALES_K1SE, type PerfilImpresora } from '@/lib/quote/estimador';
import { percentil } from '@/lib/quote/estadistica';
import { Field, inputStyle } from '../_components/Field';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { mensajeDeError } from '@/lib/errors';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { AdminCabecera } from '../_components/AdminNav';
import { ErrorBanner } from '../_components/ErrorBanner';
import { useConfirm } from '../_components/useConfirm';
import { CostesTaller } from './CostesTaller';

// Tipos que pueden ser firmes (el multicolor no: lo tasa el taller).
const TIPOS_FIRMES: TipoPieza[] = ['sin soportes', 'con soportes', 'lote'];

const ACABADOS = [
  'Metálico',
  'Fluorescente',
  'Translucido',
  'Textura',
  'Brillante',
  'Purpurina',
  'Mate',
  'Flexible'
];

const numStyle: React.CSSProperties = { ...inputStyle, width: 110 };

// Calculadora's "Probabilidad de error" options (src/shared/backend.mjs).
const PROB_ERROR: [string, number][] = [
  ['Exenta (0 %)', 0],
  ['Mínima (10 %)', 0.1],
  ['Baja (25 %)', 0.25],
  ['Media (50 %)', 0.5],
  ['Alta (100 %)', 1]
];

// Slicer profile fields worth tuning from the admin, with their Orca name.
const CAMPOS_PERFIL: { k: keyof PerfilImpresora; label: string; step: number }[] = [
  { k: 'paredes', label: 'Paredes (wall_loops)', step: 1 },
  { k: 'capasSuperiores', label: 'Capas superiores', step: 1 },
  { k: 'espesorSuperiorMin', label: 'Espesor sup. mín. (mm)', step: 0.1 },
  { k: 'capasInferiores', label: 'Capas inferiores', step: 1 },
  { k: 'alturaPrimeraCapa', label: '1ª capa (mm)', step: 0.02 },
  { k: 'vParedExt', label: 'V. pared ext. (mm/s)', step: 10 },
  { k: 'vParedInt', label: 'V. pared int. (mm/s)', step: 10 },
  { k: 'vRelleno', label: 'V. relleno (mm/s)', step: 10 },
  { k: 'vSolido', label: 'V. sólido (mm/s)', step: 10 },
  { k: 'vSuperior', label: 'V. superior (mm/s)', step: 10 },
  { k: 'vPrimeraCapa', label: 'V. 1ª capa (mm/s)', step: 5 },
  { k: 'aParedExt', label: 'Acel. pared ext.', step: 500 },
  { k: 'aRelleno', label: 'Acel. relleno', step: 500 },
  { k: 'jerk', label: 'Jerk / esquina (mm/s)', step: 1 }
];

function Num({
  value,
  onChange,
  step = 0.01,
  min = 0,
  width = 110,
  disabled = false
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  width?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      step={step}
      min={min}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      style={{ ...numStyle, width, ...(disabled ? { opacity: 0.6 } : {}) }}
    />
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  padding: 20,
  marginBottom: 20
};

const h2Style: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  marginBottom: 14
};

export function Tarifas({ modo }: { modo: 'precios' | 'tasador' }) {
  const P = modo === 'precios';
  const T = !P;
  const [settings, setSettings] = useState<QuoteSettings | null>(null);
  const [filamentos, setFilamentos] = useState<Filamento[]>([]);
  const [save, setSave] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { authed, supabase } = useAdminAuth();
  const { confirmar, dialogo } = useConfirm();

  useEffect(() => {
    Promise.all([
      supabase().from('quote_settings').select('config').eq('id', 1).maybeSingle(),
      supabase().from('filamentos').select('*').order('orden')
    ]).then(([sres, fres]) => {
      setSettings(normalizeSettings(sres.data?.config ?? null));
      setFilamentos(fres.data ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every material in the muestrario gets a pricing row (defaults if new).
  const materialKeys = useMemo(() => {
    const keys = new Set<string>(Object.keys(settings?.materiales ?? {}));
    for (const f of filamentos) keys.add(f.material);
    return [...keys];
  }, [settings, filamentos]);

  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [calib, setCalib] = useState<CalibracionTasadorRow[] | null>(null);
  const [tipos, setTipos] = useState<Record<string, string>>({});
  const [calibErr, setCalibErr] = useState<string | null>(null);
  const [todasImpresoras, setTodasImpresoras] = useState(false);

  // Web estimates vs the real Orca figures of the linked Calculadora orders.
  useEffect(() => {
    supabase()
      .rpc('tasador_calibracion')
      .then(({ data, error: err }) => {
        if (err) setCalibErr(mensajeDeError(err, 'Falta aplicar la migración 0024'));
        else setCalib(data ?? []);
      });
    supabase()
      .rpc('tasador_tipos')
      .then(({ data }) => setTipos(Object.fromEntries((data ?? []).map((r) => [r.codigo, r.tipo]))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filasCalib = useMemo(
    () =>
      (calib ?? []).filter(
        (r) =>
          (r.estimador ?? '').includes('capas') &&
          (todasImpresoras || /k1/i.test(r.impresora ?? '')) &&
          Number(r.web_peso_g) > 0 && Number(r.real_peso_g) > 0 &&
          Number(r.web_tiempo_h) > 0 && Number(r.real_horas) > 0
      ),
    [calib, todasImpresoras]
  );
  const mediana = (xs: number[]) => percentil(xs, 0.5);
  const precision = useMemo(() => {
    if (!filasCalib.length) return { n: 0, peso: 1, tiempo: 1 };
    return {
      n: filasCalib.length,
      peso: mediana(filasCalib.map((r) => Number(r.real_peso_g) / Number(r.web_peso_g))),
      tiempo: mediana(filasCalib.map((r) => Number(r.real_horas) / Number(r.web_tiempo_h)))
    };
  }, [filasCalib]);
  // Real ÷ web por tipo de pieza: mediana y percentil 90, nunca una media global.
  const porTipo = useMemo(
    () =>
      ['sin soportes', 'con soportes', 'multicolor', 'lote'].map((tipo) => {
        const f = filasCalib.filter((r) => (tipos[r.codigo] ?? 'sin soportes') === tipo);
        const col = (num: (r: CalibracionTasadorRow) => number) => {
          const xs = f.map(num).filter((x) => Number.isFinite(x) && x > 0);
          return xs.length ? { med: percentil(xs, 0.5), p90: percentil(xs, 0.9) } : null;
        };
        return {
          tipo,
          n: f.length,
          peso: col((r) => Number(r.real_peso_g) / Number(r.web_peso_g)),
          tiempo: col((r) => Number(r.real_horas) / Number(r.web_tiempo_h)),
          precio: col((r) => Number(r.real_precio) / Number(r.web_precio))
        };
      }),
    [filasCalib, tipos]
  );

  // Re-normalise on every edit so the derived €/g and €/h stay current.
  function patch(updater: (s: QuoteSettings) => QuoteSettings) {
    setSettings((s) => (s ? normalizeSettings(updater(structuredClone(s))) : s));
    setDirty(true);
    setSave('idle');
  }

  // Pull printer costs, €/kg and minimum from the desktop Calculadora's own
  // config (empresa_docs, same Supabase). Needs the admin to be a 3DCC
  // Calculadora user; otherwise RLS returns nothing.
  async function importarCalculadora() {
    setImportMsg(null);
    const { data, error: err } = await supabase()
      .from('empresa_docs')
      .select('data')
      .eq('empresa', '3dcc')
      .eq('doc', 'config')
      .maybeSingle();
    const cfg = (data?.data ?? null) as {
      printers?: { name: string; price_eur: number; depreciation_time_h: number; service_costs_life_eur: number; energy_consumption_kwh: number }[];
      filament_types?: { name: string; price_per_kg: number }[];
      global_config?: { energy_cost_kwh?: number; precio_minimo?: number };
    } | null;
    if (err || !cfg) {
      setImportMsg('No se pudo leer la configuración de la Calculadora (¿este usuario no es de 3DCC en la Calculadora?). Introduce los valores a mano.');
      return;
    }
    const imp = cfg.printers?.find((x) => /k1/i.test(x.name)) ?? cfg.printers?.[0];
    patch((s) => {
      if (imp) {
        s.calculadora.impresora_eur = Number(imp.price_eur) || s.calculadora.impresora_eur;
        s.calculadora.vida_h = Number(imp.depreciation_time_h) || s.calculadora.vida_h;
        s.calculadora.mantenimiento_eur = Number(imp.service_costs_life_eur) || 0;
        s.calculadora.consumo_kw = Number(imp.energy_consumption_kwh) || s.calculadora.consumo_kw;
      }
      if (cfg.global_config?.energy_cost_kwh) s.calculadora.precio_kwh = Number(cfg.global_config.energy_cost_kwh);
      for (const f of cfg.filament_types ?? []) {
        if (f.name && f.price_per_kg > 0) s.calculadora.precio_kg[f.name] = Number(f.price_per_kg);
      }
      return s;
    });
    setImportMsg(`Importado${imp ? ` (${imp.name})` : ''}. Revisa y guarda.`);
  }

  // Leaving or reloading with unsaved tariffs.
  useEffect(() => {
    if (!dirty) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [dirty]);

  async function persist() {
    if (!settings) return;
    setSave('saving');
    setError(null);
    const { error: err } = await supabase()
      .from('quote_settings')
      .upsert({ id: 1, config: settings as unknown as Record<string, unknown> });
    if (err) {
      setError(mensajeDeError(err, 'No se pudieron guardar las tarifas'));
      setSave('error');
      return;
    }
    setSave('saved');
    setDirty(false);
  }

  if (authed === false) return <AccesoDenegado />;
  if (!settings) return <p style={{ color: 'var(--muted)' }}>Cargando…</p>;
  // Costs copied from the Calculadora by the database are edited there.
  const sincronizado = !!settings.calculadora.sincronizado;

  return (
    <div>
      {dialogo}
      <AdminCabecera titulo={P ? 'Precios' : 'Tasador'}>
        {P
          ? 'Costes del taller y precios: lo que cuesta imprimir, el mínimo, los plazos, la urgencia y el envío. Los costes del taller se guardan aparte.'
          : 'Cómo estima la web una pieza: precio firme, resistencia, detalle y el laminador del navegador. Se aplica al instante al guardar.'}
      </AdminCabecera>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {P && <CostesTaller errorDefecto={settings.calculadora.error} />}
      {P && (
      <>
      {/* Costes base */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Pedido mínimo, plazos y urgencia</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {settings.modo_precio === 'tarifa' && (
            <Field label="€ / hora de máquina">
              <Num value={settings.precio_hora} onChange={(v) => patch((s) => ({ ...s, precio_hora: v }))} />
            </Field>
          )}
          <Field label="Preparación / diseño (€)" hint="Por pedido. 0 = no se cobra (el cliente trae el archivo)">
            <Num value={settings.tarifa_preparacion} onChange={(v) => patch((s) => ({ ...s, tarifa_preparacion: v }))} />
          </Field>
          <Field label="Pedido mínimo (€)">
            <Num value={settings.precio_minimo} onChange={(v) => patch((s) => ({ ...s, precio_minimo: v }))} />
          </Field>
          <Field label="Redondeo al alza (€)" hint="La Calculadora redondea a 0.05. 0 = sin redondeo">
            <Num value={settings.redondeo} step={0.05} onChange={(v) => patch((s) => ({ ...s, redondeo: v }))} />
          </Field>
          <Field label="Cama máxima (mm)" hint="Eje imprimible más largo — por encima se avisa al cliente">
            <Num value={settings.max_bed_mm} step={1} onChange={(v) => patch((s) => ({ ...s, max_bed_mm: v }))} />
          </Field>
          <Field label="Precio a consultar desde (€)" hint="Pedido grande: el cliente no ve precio, se lo mandas tú. 0 = nunca">
            <Num value={settings.consultar_desde_eur} step={10} onChange={(v) => patch((s) => ({ ...s, consultar_desde_eur: Math.max(0, v) }))} />
          </Field>
          <Field label="Precio a consultar desde (h de impresión)" hint="Igual, por horas totales de impresión. 0 = nunca">
            <Num value={settings.consultar_desde_h} step={5} onChange={(v) => patch((s) => ({ ...s, consultar_desde_h: Math.max(0, v) }))} />
          </Field>
          <Field label="Validez del presupuesto (días)" hint="Ventana para aceptar; pasada la fecha caduca">
            <Num value={settings.validez_dias} step={1} onChange={(v) => patch((s) => ({ ...s, validez_dias: Math.max(1, Math.round(v)) }))} />
          </Field>
          <Field label="Horas de impresión / día" hint="Fecha tope: (cola + este pedido) ÷ estas horas">
            <Num value={settings.plazo_horas_dia} step={1} onChange={(v) => patch((s) => ({ ...s, plazo_horas_dia: v }))} />
          </Field>
          <Field label="Holgura (días laborables)" hint="Se suma a toda fecha tope para cumplirla siempre">
            <Num value={settings.plazo_holgura_dias} step={1} onChange={(v) => patch((s) => ({ ...s, plazo_holgura_dias: Math.max(0, Math.round(v)) }))} />
          </Field>
          <Field label="Recargo de urgencia (%)" hint="Solo en el admin; el tasador no ofrece urgencia">
            <Num value={settings.urgencia_recargo_pct} step={5} onChange={(v) => patch((s) => ({ ...s, urgencia_recargo_pct: Math.max(0, v) }))} />
          </Field>
        </div>
      </section>
      </>
      )}
      {T && (
      <>
      <section style={cardStyle}>
        <h2 style={h2Style}>Precio firme y estimación de respaldo</h2>
        <Field
          label="Precio firme por tipo de pieza"
          hint="Marca un tipo solo cuando el banco de pruebas real lo respalde (fase 1). Sin ninguno marcado, el tasador funciona como siempre. El multicolor nunca es firme."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14 }}>
            {TIPOS_FIRMES.map((t) => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  style={{ accentColor: 'var(--accent)' }}
                  checked={settings.tipos_precio_firme.includes(t)}
                  onChange={(e) =>
                    patch((s) => ({
                      ...s,
                      tipos_precio_firme: e.target.checked
                        ? [...s.tipos_precio_firme, t]
                        : s.tipos_precio_firme.filter((x) => x !== t)
                    }))
                  }
                />
                {t}
              </label>
            ))}
          </div>
        </Field>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>
            Estimación de respaldo (solo si una pieza no se puede laminar)
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 14 }}>
            <Field label="Caudal de impresión (g/h)">
              <Num value={settings.caudal_g_h} step={1} onChange={(v) => patch((s) => ({ ...s, caudal_g_h: v }))} />
            </Field>
            <Field label="Fracción de pared (0-1)">
              <Num value={settings.fraccion_pared} step={0.05} onChange={(v) => patch((s) => ({ ...s, fraccion_pared: Math.min(1, v) }))} />
            </Field>
            <Field label="Tiempo por capa (s)">
              <Num value={settings.tiempo_capa_s} step={1} onChange={(v) => patch((s) => ({ ...s, tiempo_capa_s: v }))} />
            </Field>
            <Field label="Relleno de soportes (0-1)">
              <Num value={settings.soporte_relleno} step={0.05} onChange={(v) => patch((s) => ({ ...s, soporte_relleno: Math.min(1, v) }))} />
            </Field>
          </div>
        </details>
      </section>
      </>
      )}

      {P && (
      <>
      {/* Envío */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Envío nacional (tramos por peso)</h2>
        {settings.envio_tramos.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Hasta</span>
            <Num
              value={t.max_g}
              step={100}
              width={100}
              onChange={(v) =>
                patch((s) => {
                  s.envio_tramos[i].max_g = Math.max(1, Math.round(v));
                  return s;
                })
              }
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>g →</span>
            <Num
              value={t.precio}
              step={0.1}
              width={90}
              onChange={(v) =>
                patch((s) => {
                  s.envio_tramos[i].precio = v;
                  return s;
                })
              }
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>€</span>
            <button
              type="button"
              onClick={() =>
                patch((s) => {
                  s.envio_tramos.splice(i, 1);
                  return s;
                })
              }
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                color: 'var(--muted)',
                width: 28,
                height: 28
              }}
              aria-label="Eliminar tramo de envío"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-outline"
          style={{ padding: '8px 16px', fontSize: 11 }}
          onClick={() =>
            patch((s) => {
              const last = s.envio_tramos[s.envio_tramos.length - 1];
              s.envio_tramos.push({
                max_g: (last?.max_g ?? 500) * 2,
                precio: (last?.precio ?? 4.5) + 2
              });
              return s;
            })
          }
        >
          + Añadir tramo
        </button>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          El último tramo hace de tope: cualquier pedido más pesado usa su precio.
        </p>
        <Field label="Envío gratis desde (€, 0 = nunca)">
          <Num
            value={settings.envio_gratis_desde}
            step={1}
            onChange={(v) => patch((s) => ({ ...s, envio_gratis_desde: Math.max(0, v) }))}
          />
        </Field>
      </section>
      </>
      )}

      {P && (
      <>
      {/* Recargos */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Recargos</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', marginBottom: 18 }}>
          {ACABADOS.map((a) => (
            <Field key={a} label={`${a} (+%)`}>
              <Num
                value={settings.recargo_acabado_pct[a] ?? 0}
                step={1}
                width={80}
                onChange={(v) =>
                  patch((s) => {
                    s.recargo_acabado_pct[a] = v;
                    return s;
                  })
                }
              />
            </Field>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <Field label="Multicolor: recargo base (+%)">
            <Num
              value={settings.recargo_multicolor.base_pct}
              step={1}
              onChange={(v) =>
                patch((s) => {
                  s.recargo_multicolor.base_pct = v;
                  return s;
                })
              }
            />
          </Field>
          <Field label="Multicolor: € por color extra">
            <Num
              value={settings.recargo_multicolor.por_color_extra}
              step={0.5}
              onChange={(v) =>
                patch((s) => {
                  s.recargo_multicolor.por_color_extra = v;
                  return s;
                })
              }
            />
          </Field>
        </div>
      </section>
      </>
      )}

      {P && (
      <>
      {/* Descuentos */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Descuentos por cantidad</h2>
        {settings.descuentos_cantidad.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>A partir de</span>
            <Num
              value={t.min}
              step={1}
              min={2}
              width={80}
              onChange={(v) =>
                patch((s) => {
                  s.descuentos_cantidad[i].min = Math.max(2, Math.round(v));
                  return s;
                })
              }
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>unidades →</span>
            <Num
              value={t.pct}
              step={1}
              width={80}
              onChange={(v) =>
                patch((s) => {
                  s.descuentos_cantidad[i].pct = v;
                  return s;
                })
              }
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>% dto.</span>
            <button
              type="button"
              onClick={() =>
                patch((s) => {
                  s.descuentos_cantidad.splice(i, 1);
                  return s;
                })
              }
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                color: 'var(--muted)',
                width: 28,
                height: 28
              }}
              aria-label="Eliminar tramo"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-outline"
          style={{ padding: '8px 16px', fontSize: 11 }}
          onClick={() =>
            patch((s) => {
              const last = s.descuentos_cantidad[s.descuentos_cantidad.length - 1];
              s.descuentos_cantidad.push({ min: (last?.min ?? 1) + 10, pct: (last?.pct ?? 0) + 5 });
              return s;
            })
          }
        >
          + Añadir tramo
        </button>
      </section>
      </>
      )}

      {T && (
      <>
      {/* Cómo se calcula */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Cómo se calcula el precio</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14, maxWidth: 760 }}>
          La web lamina cada pieza en el navegador (perfil de la impresora más abajo) para
          obtener gramos y horas, y los valora igual que la Calculadora:{' '}
          <strong>(material + horas de máquina) × (markup + probabilidad de error)</strong>.
          El diseño no se cobra: el cliente trae el archivo.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          {(['calculadora', 'tarifa'] as const).map((m) => (
            <label key={m} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input
                type="radio"
                checked={settings.modo_precio === m}
                onChange={() => patch((s) => ({ ...s, modo_precio: m }))}
              />
              {m === 'calculadora' ? 'Como la Calculadora (recomendado)' : '€/g y €/h a mano'}
            </label>
          ))}
        </div>
        {settings.modo_precio === 'calculadora' && (
          <>
            {sincronizado && (
              <p style={{ fontSize: 13, marginBottom: 12 }}>
                Impresora, electricidad y €/kg se copian solos de la Calculadora al guardar su
                configuración
                {settings.calculadora.impresora ? ` (${settings.calculadora.impresora})` : ''}; última
                copia: {new Date(settings.calculadora.sincronizado!).toLocaleString('es-ES')}. Para
                cambiarlos, hazlo allí.
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <Field label="Precio impresora (€)">
                <Num disabled={sincronizado} value={settings.calculadora.impresora_eur} step={10} onChange={(v) => patch((s) => { s.calculadora.impresora_eur = v; return s; })} />
              </Field>
              <Field label="Mantenimiento en su vida (€)">
                <Num disabled={sincronizado} value={settings.calculadora.mantenimiento_eur} step={10} onChange={(v) => patch((s) => { s.calculadora.mantenimiento_eur = v; return s; })} />
              </Field>
              <Field label="Vida útil (h)">
                <Num disabled={sincronizado} value={settings.calculadora.vida_h} step={100} onChange={(v) => patch((s) => { s.calculadora.vida_h = v; return s; })} />
              </Field>
              <Field label="Consumo (kW)">
                <Num disabled={sincronizado} value={settings.calculadora.consumo_kw} step={0.01} onChange={(v) => patch((s) => { s.calculadora.consumo_kw = v; return s; })} />
              </Field>
              <Field label="Electricidad (€/kWh)">
                <Num disabled={sincronizado} value={settings.calculadora.precio_kwh} step={0.01} onChange={(v) => patch((s) => { s.calculadora.precio_kwh = v; return s; })} />
              </Field>
              <Field label="Markup (×)" hint="Calculadora: Normal (230 %) = 2.3">
                <Num value={settings.calculadora.markup} step={0.1} onChange={(v) => patch((s) => { s.calculadora.markup = v; return s; })} />
              </Field>
              <Field label="Probabilidad de error">
                <select
                  value={String(settings.calculadora.error)}
                  onChange={(e) => patch((s) => { s.calculadora.error = Number(e.target.value); return s; })}
                  style={{ ...inputStyle, width: 150 }}
                >
                  {PROB_ERROR.map(([l, v]) => (
                    <option key={l} value={String(v)}>{l}</option>
                  ))}
                  {!PROB_ERROR.some(([, v]) => v === settings.calculadora.error) && (
                    <option value={String(settings.calculadora.error)}>{settings.calculadora.error}</option>
                  )}
                </select>
              </Field>
              <Field label="Retirar soportes (€/ud)" hint="Se suma a las piezas que llevan soportes. 0 = Limpio">
                <Num value={settings.calculadora.postpro_soportes_eur} step={0.5} onChange={(v) => patch((s) => { s.calculadora.postpro_soportes_eur = v; return s; })} />
              </Field>
            </div>
            <p style={{ fontSize: 13, marginTop: 4 }}>
              Máquina: <strong>{costeHoraMaquina(settings.calculadora).toFixed(4)} €/h</strong> de coste ×{' '}
              {factorCalculadora(settings.calculadora).toFixed(2)} ={' '}
              <strong>{settings.precio_hora.toFixed(3)} €/h</strong> cobrados.
            </p>
            {!sincronizado && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn-outline" style={{ padding: '8px 16px', fontSize: 11 }} onClick={importarCalculadora}>
                  Importar de la Calculadora
                </button>
                {importMsg && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{importMsg}</span>}
              </div>
            )}
          </>
        )}
      </section>
      </>
      )}

      {P && (
      <>
      {/* Materiales */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Materiales</h2>
        <div className="adm-scroll">
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'left' }}>
              <th style={{ padding: '4px 16px 4px 0' }}>Material</th>
              {settings.modo_precio === 'calculadora' && (
                <th style={{ padding: '4px 16px 4px 0' }}>€ / kg (coste)</th>
              )}
              <th style={{ padding: '4px 16px 4px 0' }}>€ / gramo</th>
              <th style={{ padding: '4px 16px 4px 0' }}>Densidad (g/cm³)</th>
              <th style={{ padding: '4px 16px 4px 0' }} title="slow_down_layer_time del filamento en Orca">
                T. mín. capa (s)
              </th>
              <th style={{ padding: '4px 16px 4px 0' }} title="filament_max_volumetric_speed en Orca">
                Caudal máx. (mm³/s)
              </th>
            </tr>
          </thead>
          <tbody>
            {materialKeys.map((key) => {
              const m = settings.materiales[key] ?? { precio_g: 0.05, densidad: 1.24 };
              const familia = MATERIALES_K1SE[key.toUpperCase()] ?? MATERIALES_K1SE[
                ['PETG', 'ASA', 'TPU'].find((f) => key.toUpperCase().includes(f)) ?? 'PLA'
              ];
              const kg = precioKgDe(settings.calculadora, key);
              return (
                <tr key={key}>
                  <td style={{ padding: '6px 16px 6px 0', fontWeight: 600 }}>{key}</td>
                  {settings.modo_precio === 'calculadora' && (
                    <td style={{ padding: '6px 16px 6px 0' }}>
                      <Num
                        disabled={sincronizado && kg !== undefined}
                        value={kg ?? 0}
                        step={0.5}
                        width={90}
                        onChange={(v) =>
                          patch((s) => {
                            s.calculadora.precio_kg[key] = v;
                            s.materiales[key] = { ...m };
                            return s;
                          })
                        }
                      />
                    </td>
                  )}
                  <td style={{ padding: '6px 16px 6px 0' }}>
                    {settings.modo_precio === 'calculadora' ? (
                      <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
                        {m.precio_g.toFixed(4)}
                      </span>
                    ) : (
                      <Num
                        value={m.precio_g}
                        step={0.005}
                        onChange={(v) =>
                          patch((s) => {
                            s.materiales[key] = { ...m, precio_g: v };
                            return s;
                          })
                        }
                      />
                    )}
                  </td>
                  <td style={{ padding: '6px 16px 6px 0' }}>
                    <Num
                      value={m.densidad}
                      step={0.01}
                      onChange={(v) =>
                        patch((s) => {
                          s.materiales[key] = { ...m, densidad: v };
                          return s;
                        })
                      }
                    />
                  </td>
                  <td style={{ padding: '6px 16px 6px 0' }}>
                    <Num
                      value={m.tiempo_min_capa ?? familia.tiempoMinCapa}
                      step={1}
                      width={80}
                      onChange={(v) =>
                        patch((s) => {
                          s.materiales[key] = { ...m, tiempo_min_capa: v };
                          return s;
                        })
                      }
                    />
                  </td>
                  <td style={{ padding: '6px 16px 6px 0' }}>
                    <Num
                      value={m.vol_max ?? familia.volMax}
                      step={0.5}
                      width={80}
                      onChange={(v) =>
                        patch((s) => {
                          s.materiales[key] = { ...m, vol_max: v };
                          return s;
                        })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>
      </>
      )}

      {T && (
      <>
      {/* Resistencia */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Opciones de resistencia (relleno)</h2>
        {settings.resistencia.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
            <input
              style={{ ...inputStyle, width: 140 }}
              value={r.nombre}
              onChange={(e) =>
                patch((s) => {
                  s.resistencia[i].nombre = e.target.value;
                  return s;
                })
              }
            />
            <input
              style={{ ...inputStyle, flex: 1, minWidth: 220 }}
              value={r.descripcion}
              onChange={(e) =>
                patch((s) => {
                  s.resistencia[i].descripcion = e.target.value;
                  return s;
                })
              }
            />
            <Num
              value={r.relleno_pct}
              step={5}
              width={90}
              onChange={(v) =>
                patch((s) => {
                  s.resistencia[i].relleno_pct = Math.min(100, v);
                  return s;
                })
              }
            />
            <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--muted)' }}>% relleno</span>
          </div>
        ))}
      </section>
      </>
      )}

      {T && (
      <>
      {/* Detalle */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Opciones de detalle (calidad)</h2>
        {settings.detalle.map((d, i) => (
          <div key={d.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
            <input
              style={{ ...inputStyle, width: 140 }}
              value={d.nombre}
              onChange={(e) =>
                patch((s) => {
                  s.detalle[i].nombre = e.target.value;
                  return s;
                })
              }
            />
            <input
              style={{ ...inputStyle, flex: 1, minWidth: 220 }}
              value={d.descripcion}
              onChange={(e) =>
                patch((s) => {
                  s.detalle[i].descripcion = e.target.value;
                  return s;
                })
              }
            />
            <Num
              value={d.altura_capa_mm}
              step={0.04}
              width={90}
              onChange={(v) =>
                patch((s) => {
                  s.detalle[i].altura_capa_mm = v;
                  return s;
                })
              }
            />
            <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--muted)' }}>mm capa</span>
            <Num
              value={d.paredes ?? settings.perfil.paredes ?? PERFIL_K1SE.paredes}
              step={1}
              width={70}
              onChange={(v) =>
                patch((s) => {
                  s.detalle[i].paredes = Math.max(1, Math.round(v));
                  return s;
                })
              }
            />
            <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--muted)' }}>paredes</span>
            <Num
              value={d.factor_tiempo}
              step={0.1}
              width={90}
              onChange={(v) =>
                patch((s) => {
                  s.detalle[i].factor_tiempo = v;
                  return s;
                })
              }
            />
            <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--muted)' }} title="Solo para la estimación de respaldo">× tiempo (resp.)</span>
          </div>
        ))}
      </section>
      </>
      )}

      {T && (
      <>
      {/* Avanzado: lo que solo se toca al calibrar el laminador */}
      <details className="tar-avanzado">
        <summary>Avanzado: laminador y precisión del tasador</summary>
      {/* Estimador */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Laminado en el navegador</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <Field label="Orientación automática" hint="Coloca la pieza en la cama de la forma más barata, como harías en Orca">
            <input
              type="checkbox"
              checked={settings.orientacion_auto}
              onChange={(e) => patch((s) => ({ ...s, orientacion_auto: e.target.checked }))}
            />
          </Field>
          <Field label="Respetar la del cliente si cuesta ≤ (+%)">
            <Num value={settings.orientacion_tolerancia_pct} step={1} width={80} onChange={(v) => patch((s) => ({ ...s, orientacion_tolerancia_pct: v }))} />
          </Field>
          <Field label="Tipo de soportes">
            <select
              value={settings.soporte_tipo}
              onChange={(e) => patch((s) => ({ ...s, soporte_tipo: e.target.value === 'arbol' ? 'arbol' : 'normal' }))}
              style={{ ...inputStyle, width: 150 }}
            >
              <option value="normal">Normales</option>
              <option value="arbol">Árbol</option>
            </select>
          </Field>
          <Field label="Soportes desde (g/ud)" hint="Por debajo no merece la pena activarlos">
            <Num value={settings.soporte_min_g} step={0.5} width={80} onChange={(v) => patch((s) => ({ ...s, soporte_min_g: v }))} />
          </Field>
          <Field label="Corrección peso (%)" hint="Si Orca te da sistemáticamente más/menos gramos">
            <Num
              value={Math.round(((settings.calibracion.peso ?? 1) - 1) * 1000) / 10}
              step={1}
              min={-50}
              width={80}
              onChange={(v) => patch((s) => { s.calibracion.peso = 1 + v / 100; return s; })}
            />
          </Field>
          <Field label="Corrección tiempo (%)" hint="Ídem con las horas (ver docs/estimador-presupuestos.md)">
            <Num
              value={Math.round(((settings.calibracion.tiempo ?? 1) - 1) * 1000) / 10}
              step={1}
              min={-50}
              width={80}
              onChange={(v) => patch((s) => { s.calibracion.tiempo = 1 + v / 100; return s; })}
            />
          </Field>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>
            Perfil de impresora (por defecto: Orca «0.20mm Standard @Creality K1 SE»)
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', marginTop: 14 }}>
            {CAMPOS_PERFIL.map(({ k, label, step }) => (
              <Field key={k} label={label}>
                <Num
                  value={Number(settings.perfil[k] ?? PERFIL_K1SE[k])}
                  step={step}
                  width={90}
                  onChange={(v) => patch((s) => ({ ...s, perfil: { ...s.perfil, [k]: v } }))}
                />
              </Field>
            ))}
          </div>
          <button
            type="button"
            className="btn-outline"
            style={{ padding: '6px 14px', fontSize: 11 }}
            onClick={async () => {
              if (await confirmar({ mensaje: '¿Restablecer el perfil de impresora al de la K1 SE?', detalle: 'Se pierden los ajustes que hayas cambiado en el perfil (hasta que guardes, puedes recargar la página).', confirmar: 'Restablecer' })) {
                patch((s) => ({ ...s, perfil: {} }));
              }
            }}
          >
            Restablecer perfil K1 SE
          </button>
        </details>
      </section>

      {/* Precisión */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Precisión del tasador (pedidos reales)</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12, maxWidth: 760 }}>
          Cada presupuesto web que conviertes en pedido desde la Calculadora guarda los gramos
          y horas reales de Orca. Aquí se comparan con lo que estimó la web.
        </p>
        {calibErr && <p style={{ fontSize: 13, color: '#ef4444' }}>{calibErr}</p>}
        {calib && (
          <>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 10 }}>
              <input type="checkbox" checked={todasImpresoras} onChange={(e) => setTodasImpresoras(e.target.checked)} />
              Incluir pedidos de otras impresoras (la web simula la K1 SE)
            </label>
            {precision.n === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                Aún no hay pedidos enlazados con estimación por capas. Aparecerán en cuanto conviertas
                presupuestos web nuevos en la Calculadora.
              </p>
            ) : (
              <>
                <p style={{ fontSize: 13 }}>
                  {precision.n} pedido{precision.n !== 1 ? 's' : ''}: Orca da de mediana{' '}
                  <strong>{((precision.peso - 1) * 100).toFixed(1)} %</strong> de gramos y{' '}
                  <strong>{((precision.tiempo - 1) * 100).toFixed(1)} %</strong> de horas respecto a la web.
                </p>
                <div className="adm-scroll">
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
                    <thead>
                      <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                        {['Tipo de pieza', 'Pedidos', 'Gramos (med · p90)', 'Horas (med · p90)', 'Precio (med · p90)'].map((h) => (
                          <th key={h} style={{ padding: '4px 14px 4px 0' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {porTipo.map((t) => {
                        const c = (x: { med: number; p90: number } | null) => (x ? `${x.med.toFixed(2)} · ${x.p90.toFixed(2)}` : '—');
                        return (
                          <tr key={t.tipo} style={t.n > 0 && t.n < 5 ? { color: 'var(--muted)' } : undefined} title={t.n > 0 && t.n < 5 ? 'Menos de 5 pedidos: aún no es fiable' : ''}>
                            <td style={{ padding: '3px 14px 3px 0' }}>{t.tipo}</td>
                            <td style={{ padding: '3px 14px 3px 0' }}>{t.n}</td>
                            <td style={{ padding: '3px 14px 3px 0' }}>{c(t.peso)}</td>
                            <td style={{ padding: '3px 14px 3px 0' }}>{c(t.tiempo)}</td>
                            <td style={{ padding: '3px 14px 3px 0' }}>{c(t.precio)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                  Real ÷ web: 1,00 acierta; más de 1, la web se queda corta. El percentil 90 es el caso malo habitual.
                  La corrección global de abajo no debe usarse para arreglar un solo tipo de pieza.
                </p>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ padding: '8px 16px', fontSize: 11, marginTop: 8 }}
                  disabled={precision.n < 3}
                  title={precision.n < 3 ? 'Con menos de 3 pedidos no es fiable' : ''}
                  onClick={() =>
                    patch((s) => {
                      s.calibracion.peso = (s.calibracion.peso ?? 1) * precision.peso;
                      s.calibracion.tiempo = (s.calibracion.tiempo ?? 1) * precision.tiempo;
                      return s;
                    })
                  }
                >
                  Aplicar corrección
                </button>
              </>
            )}
            {calib.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>
                  Ver pedidos ({calib.length})
                </summary>
                <div className="adm-scroll">
                <table style={{ borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
                  <thead>
                    <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                      {['Código', 'Impresora', 'Web g', 'Real g', 'Web h', 'Real h', 'Web €', 'Real €'].map((h) => (
                        <th key={h} style={{ padding: '4px 14px 4px 0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calib.slice(0, 40).map((r) => (
                      <tr key={r.codigo}>
                        <td style={{ padding: '3px 14px 3px 0' }}>{r.codigo}</td>
                        <td style={{ padding: '3px 14px 3px 0' }}>{r.impresora ?? '—'}</td>
                        <td style={{ padding: '3px 14px 3px 0' }}>{r.web_peso_g != null ? Number(r.web_peso_g).toFixed(0) : '—'}</td>
                        <td style={{ padding: '3px 14px 3px 0' }}>{r.real_peso_g ?? '—'}</td>
                        <td style={{ padding: '3px 14px 3px 0' }}>{r.web_tiempo_h != null ? Number(r.web_tiempo_h).toFixed(1) : '—'}</td>
                        <td style={{ padding: '3px 14px 3px 0' }}>{r.real_horas ?? '—'}</td>
                        <td style={{ padding: '3px 14px 3px 0' }}>{r.web_precio != null ? Number(r.web_precio).toFixed(2) : '—'}</td>
                        <td style={{ padding: '3px 14px 3px 0' }}>{r.real_precio != null ? Number(r.real_precio).toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </details>
            )}
          </>
        )}
      </section>

      </details>
      </>
      )}
      <div className={'tar-guardar' + (dirty || save !== 'idle' ? ' visible' : '')} role="region" aria-label="Guardar tarifas">
        <span>{dirty ? 'Tienes cambios sin guardar.' : save === 'saved' ? 'Tarifas guardadas.' : ''}</span>
        <SaveButton onClick={persist} state={save} dirty={dirty} label="Guardar tarifas" />
      </div>
    </div>
  );
}
