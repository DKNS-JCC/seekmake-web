'use client';

// Pricing knobs for the tasador — edits the single jsonb row in
// quote_settings — the quote page fetches it at runtime, so changes apply
// instantly (no rebuild needed).

import { useEffect, useMemo, useState } from 'react';
import type { Filamento } from '@/lib/types';
import {
  normalizeSettings,
  type QuoteSettings
} from '@/lib/quote/pricing';
import { Field, inputStyle } from '../_components/Field';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { mensajeDeError } from '@/lib/errors';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';

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

function Num({
  value,
  onChange,
  step = 0.01,
  min = 0,
  width = 110
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  width?: number;
}) {
  return (
    <input
      type="number"
      step={step}
      min={min}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      style={{ ...numStyle, width }}
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

export default function AdminTarifas() {
  const [settings, setSettings] = useState<QuoteSettings | null>(null);
  const [filamentos, setFilamentos] = useState<Filamento[]>([]);
  const [save, setSave] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { authed, supabase } = useAdminAuth();

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

  function patch(updater: (s: QuoteSettings) => QuoteSettings) {
    setSettings((s) => (s ? updater(structuredClone(s)) : s));
    setDirty(true);
    setSave('idle');
  }

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

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8
        }}
      >
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 36,
            letterSpacing: '0.02em'
          }}
        >
          Tarifas del tasador
        </h1>
        <SaveButton onClick={persist} state={save} dirty={dirty} />
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>
        Los cambios se aplican al instante en la calculadora — no hace falta
        reconstruir la web.
      </p>
      {error && (
        <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}

      {/* Materiales */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Materiales</h2>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'left' }}>
              <th style={{ padding: '4px 16px 4px 0' }}>Material</th>
              <th style={{ padding: '4px 16px 4px 0' }}>€ / gramo</th>
              <th style={{ padding: '4px 16px 4px 0' }}>Densidad (g/cm³)</th>
              <th style={{ padding: '4px 16px 4px 0' }}>Velocidad (×PLA)</th>
            </tr>
          </thead>
          <tbody>
            {materialKeys.map((key) => {
              const m = settings.materiales[key] ?? { precio_g: 0.05, densidad: 1.24 };
              return (
                <tr key={key}>
                  <td style={{ padding: '6px 16px 6px 0', fontWeight: 600 }}>{key}</td>
                  <td style={{ padding: '6px 16px 6px 0' }}>
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
                      value={m.factor_velocidad ?? 1}
                      step={0.05}
                      width={80}
                      onChange={(v) =>
                        patch((s) => {
                          s.materiales[key] = { ...m, factor_velocidad: v };
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
      </section>

      {/* Costes base */}
      <section style={cardStyle}>
        <h2 style={h2Style}>Costes base</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <Field label="€ / hora de máquina">
            <Num value={settings.precio_hora} onChange={(v) => patch((s) => ({ ...s, precio_hora: v }))} />
          </Field>
          <Field label="Preparación y laminado (€)">
            <Num value={settings.tarifa_preparacion} onChange={(v) => patch((s) => ({ ...s, tarifa_preparacion: v }))} />
          </Field>
          <Field label="Pedido mínimo (€)">
            <Num value={settings.precio_minimo} onChange={(v) => patch((s) => ({ ...s, precio_minimo: v }))} />
          </Field>
          <Field label="Caudal de impresión (g/h)" hint="Gramos por hora a calidad estándar — calibra con piezas reales">
            <Num value={settings.caudal_g_h} step={1} onChange={(v) => patch((s) => ({ ...s, caudal_g_h: v }))} />
          </Field>
          <Field label="Fracción de pared (0-1)" hint="Parte del volumen que imprime sólida (paredes/tapas)">
            <Num value={settings.fraccion_pared} step={0.05} onChange={(v) => patch((s) => ({ ...s, fraccion_pared: Math.min(1, v) }))} />
          </Field>
          <Field label="Tiempo por capa (s)" hint="Sobrecoste fijo por capa: Z-hop, arranques de perímetro, viajes">
            <Num value={settings.tiempo_capa_s} step={1} onChange={(v) => patch((s) => ({ ...s, tiempo_capa_s: v }))} />
          </Field>
          <Field label="Relleno de soportes (0-1)" hint="Densidad de los soportes estimados (laminadores ≈ 0.15)">
            <Num value={settings.soporte_relleno} step={0.05} onChange={(v) => patch((s) => ({ ...s, soporte_relleno: Math.min(1, v) }))} />
          </Field>
          <Field label="Cama máxima (mm)" hint="Eje imprimible más largo — por encima se avisa al cliente">
            <Num value={settings.max_bed_mm} step={1} onChange={(v) => patch((s) => ({ ...s, max_bed_mm: v }))} />
          </Field>
          <Field label="Validez del presupuesto (días)" hint="Ventana para aceptar; pasada la fecha caduca">
            <Num value={settings.validez_dias} step={1} onChange={(v) => patch((s) => ({ ...s, validez_dias: Math.max(1, Math.round(v)) }))} />
          </Field>
          <Field label="Horas de impresión / día" hint="Para el plazo estimado que ve el cliente">
            <Num value={settings.plazo_horas_dia} step={1} onChange={(v) => patch((s) => ({ ...s, plazo_horas_dia: v }))} />
          </Field>
          <Field label="Días de margen" hint="Preparación y cola, se suman a todo plazo">
            <Num value={settings.plazo_dias_margen} step={1} onChange={(v) => patch((s) => ({ ...s, plazo_dias_margen: v }))} />
          </Field>
        </div>
      </section>

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
            <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--muted)' }}>× tiempo</span>
          </div>
        ))}
      </section>

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
      </section>

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

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SaveButton onClick={persist} state={save} dirty={dirty} />
      </div>
    </div>
  );
}
