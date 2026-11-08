'use client';

// Panel de envío dentro del drawer de un presupuesto (entrega = 'envio').
//
// Dos formas de crear el envío:
//   · Sendcloud — cotiza con tarifas reales por zona (API v3) y genera la
//     etiqueta (PDF) vía la Edge Function `envios-etiqueta`. El secreto vive
//     en la función.
//   · Manual — pegas un número de seguimiento que te han dado por otra vía.
//     Escribe directo en `envios` desde el navegador: la RLS de admin ya lo
//     permite y no hace falta pasar por ninguna función.
//
// Debajo, el control de estado: cada botón avanza el envío Y sella su marca
// de tiempo, que es lo que dibuja la línea de tiempo que ve el cliente en
// /presupuesto. Nada de teclear fechas a mano.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Envio, EnvioEstado, PuntoRecogida, Quote } from '@/lib/types';
import { CARRIER_OPCIONES, carrierInfo } from '@/lib/envio/carriers';
import { Field, inputStyle } from './Field';
import { euros } from '@/lib/recibo/types';

const supabase = createClient;

type Metodo = {
  id: number | null;          // id v2 para crear etiqueta (null = solo estimación)
  code: string;
  name: string;
  carrier: string;
  price: number | null;
  service_point?: boolean;
};
type Recipient = {
  name: string; address: string; house_number: string;
  city: string; postal_code: string; country: string;
  telephone: string; email: string;
};
type EnvioRow = Pick<
  Envio,
  | 'id' | 'metodo' | 'carrier' | 'carrier_nombre' | 'tracking_number' | 'tracking_url'
  | 'estado' | 'peso_g' | 'origen' | 'punto_recogida' | 'fecha_estimada' | 'nota_cliente'
  | 'etiqueta_at' | 'transito_at' | 'disponible_at' | 'entregado_at' | 'created_at'
>;

const CAMPOS_ENVIO =
  'id,metodo,carrier,carrier_nombre,tracking_number,tracking_url,estado,peso_g,' +
  'origen,punto_recogida,fecha_estimada,nota_cliente,' +
  'etiqueta_at,transito_at,disponible_at,entregado_at,created_at';

// El orden es el del recorrido real del paquete. Cada paso sella su columna
// *_at al pulsarlo: así la línea de tiempo del cliente sale sola.
const PASOS_ENVIO: { id: EnvioEstado; label: string; sello: keyof EnvioRow | null }[] = [
  { id: 'etiqueta', label: 'Etiqueta creada', sello: 'etiqueta_at' },
  { id: 'en_transito', label: 'En tránsito', sello: 'transito_at' },
  { id: 'disponible', label: 'En el punto', sello: 'disponible_at' },
  { id: 'entregado', label: 'Entregado', sello: 'entregado_at' }
];

const ESTADO_LABEL: Record<EnvioEstado, string> = {
  pendiente: 'Pendiente',
  etiqueta: 'Etiqueta creada',
  en_transito: 'En tránsito',
  disponible: 'En el punto de recogida',
  entregado: 'Entregado',
  incidencia: 'Incidencia',
  cancelado: 'Cancelado'
};

// Peso por defecto: suma del peso de las piezas (× cantidad) o métricas del quote.
function pesoPorDefecto(q: Quote): number {
  const archivos = (q.archivos ?? []) as any[];
  const suma = archivos.reduce((acc, a) => acc + Number(a?.metricas?.peso_g ?? 0) * Number(a?.cantidad ?? 1), 0);
  const m: any = q.metricas ?? {};
  const base = suma > 0 ? suma : Number(m.peso_g ?? 0);
  return base > 0 ? Math.ceil(base) : 500;
}

function descargarPdf(b64: string, filename: string) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const box: React.CSSProperties = {
  marginTop: 10, padding: 14, background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 'var(--r)'
};

export function EnvioPanel({ quote }: { quote: Quote }) {
  const [recipient, setRecipient] = useState<Recipient>({
    name: quote.nombre ?? '',
    address: quote.direccion?.calle ?? '',
    house_number: '',
    city: quote.direccion?.ciudad ?? '',
    postal_code: quote.direccion?.cp ?? '',
    country: 'ES',
    telephone: quote.telefono ?? '',
    email: quote.email ?? ''
  });
  const [pesoG, setPesoG] = useState<number>(() => pesoPorDefecto(quote));
  const [metodos, setMetodos] = useState<Metodo[]>([]);
  const [codeSel, setCodeSel] = useState<string>('');
  const [existente, setExistente] = useState<EnvioRow | null>(null);
  const [busy, setBusy] = useState<'' | 'methods' | 'label' | 'manual' | 'estado'>('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tab, setTab] = useState<'sendcloud' | 'manual'>('sendcloud');

  const recargar = useCallback(async () => {
    const { data } = await supabase()
      .from('envios')
      .select(CAMPOS_ENVIO)
      .eq('quote_id', quote.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setExistente((data as unknown as EnvioRow) ?? null);
  }, [quote.id]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const set = (k: keyof Recipient) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRecipient((r) => ({ ...r, [k]: e.target.value }));

  const sel = useMemo(() => metodos.find((m) => m.code === codeSel) ?? null, [metodos, codeSel]);

  async function verTarifas() {
    if (!recipient.postal_code.trim()) { setErr('Falta el código postal de destino.'); return; }
    setErr(null); setInfo(null); setBusy('methods');
    try {
      const { data, error } = await supabase().functions.invoke('envios-etiqueta', {
        body: {
          action: 'methods', quote_id: quote.id, weight_g: pesoG,
          country: recipient.country, postal_code: recipient.postal_code
        }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const ops: Metodo[] = data?.opciones ?? [];
      setMetodos(ops);
      const primero = ops.find((o) => o.id != null) ?? ops[0];
      setCodeSel(primero?.code ?? '');
      if (!ops.length) setInfo('Sin métodos para ese peso/destino. ¿Carriers activados en Sendcloud?');
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudieron cargar las tarifas.');
    } finally { setBusy(''); }
  }

  async function crearEtiqueta() {
    if (!sel) { setErr('Elige un método.'); return; }
    if (sel.id == null) { setErr('Ese método es solo estimación (sin etiqueta). Elige otro.'); return; }
    setErr(null); setInfo(null); setBusy('label');
    try {
      const { data, error } = await supabase().functions.invoke('envios-etiqueta', {
        body: {
          action: 'label', quote_id: quote.id, method_id: sel.id,
          weight_g: pesoG, country: recipient.country, coste: sel.price,
          recipient: { ...recipient, order_number: quote.codigo }
        }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.label_pdf_base64) {
        descargarPdf(data.label_pdf_base64, `etiqueta-${data.tracking_number ?? quote.codigo}.pdf`);
        setInfo(`Etiqueta generada. Tracking: ${data.tracking_number ?? '—'}`);
      } else {
        setInfo(data?.aviso ?? 'Envío creado, pero sin PDF.');
      }
      // La fila la ha insertado la Edge Function: se relee en vez de
      // reconstruirla a mano para no inventar campos (carrier_nombre, sellos).
      if (data?.envio_id) {
        await supabase()
          .from('envios')
          .update({
            carrier_nombre: carrierInfo(sel.carrier).nombre,
            etiqueta_at: new Date().toISOString()
          })
          .eq('id', data.envio_id);
      }
      await recargar();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo crear la etiqueta.');
    } finally { setBusy(''); }
  }

  // ── Alta manual ────────────────────────────────────────────────────────
  // Para cuando el envío no sale de Sendcloud: un número que te pasan por
  // WhatsApp, una etiqueta impresa en la oficina, un InPost comprado aparte.
  const [mCarrier, setMCarrier] = useState('inpost');
  const [mMetodo, setMMetodo] = useState('InPost Parcels 48h');
  const [mTracking, setMTracking] = useState('');
  const [mUrl, setMUrl] = useState('');
  const [mFecha, setMFecha] = useState('');
  const [mNota, setMNota] = useState('');
  const [mPunto, setMPunto] = useState<PuntoRecogida>({});

  const setPunto = (k: keyof PuntoRecogida) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setMPunto((p) => ({ ...p, [k]: e.target.value }));

  async function guardarManual() {
    const tracking = mTracking.trim();
    if (!tracking) { setErr('Falta el número de seguimiento.'); return; }
    setErr(null); setInfo(null); setBusy('manual');
    try {
      // Se limpian las claves vacías: un punto_recogida con strings en blanco
      // haría que la tarjeta del cliente pintase un bloque vacío.
      const punto = Object.fromEntries(
        Object.entries(mPunto).filter(([, v]) => String(v ?? '').trim() !== '')
      );
      const { error } = await supabase().from('envios').insert({
        quote_id: quote.id,
        proveedor: 'manual',
        origen: 'manual',
        carrier: mCarrier,
        carrier_nombre: carrierInfo(mCarrier).nombre,
        metodo: mMetodo.trim() || null,
        cp_destino: recipient.postal_code || null,
        pais: (recipient.country || 'ES').toUpperCase(),
        peso_g: pesoG,
        tracking_number: tracking,
        tracking_url: mUrl.trim() || null,
        estado: 'etiqueta',
        etiqueta_at: new Date().toISOString(),
        punto_recogida: punto,
        fecha_estimada: mFecha || null,
        nota_cliente: mNota.trim()
      });
      if (error) throw new Error(error.message);
      setInfo(`Envío registrado. El cliente ya lo ve en /presupuesto con el código ${quote.codigo}.`);
      setMTracking(''); setMUrl(''); setMNota('');
      await recargar();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo registrar el envío.');
    } finally { setBusy(''); }
  }

  // ── Control de estado ──────────────────────────────────────────────────
  async function marcarEstado(paso: EnvioEstado, sello: keyof EnvioRow | null) {
    if (!existente) return;
    setErr(null); setInfo(null); setBusy('estado');
    try {
      const patch: Partial<Envio> = { estado: paso };
      // Solo se sella la primera vez: volver atrás y avanzar de nuevo no debe
      // reescribir una fecha que el cliente ya vio.
      if (sello && !existente[sello]) {
        (patch as Record<string, string>)[sello] = new Date().toISOString();
      }
      const { error } = await supabase().from('envios').update(patch).eq('id', existente.id);
      if (error) throw new Error(error.message);
      await recargar();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo cambiar el estado.');
    } finally { setBusy(''); }
  }

  const tabStyle = (activa: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: activa ? 700 : 400,
    background: activa ? 'var(--bg)' : 'transparent',
    color: activa ? 'var(--text)' : 'var(--muted)',
    border: '1px solid ' + (activa ? 'var(--border-h)' : 'transparent'),
    borderRadius: 'var(--r)',
    cursor: 'pointer'
  });

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>📦 Envío</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button type="button" style={tabStyle(tab === 'sendcloud')} onClick={() => setTab('sendcloud')}>
            Sendcloud
          </button>
          <button type="button" style={tabStyle(tab === 'manual')} onClick={() => setTab('manual')}>
            Manual
          </button>
        </div>
      </div>

      {existente && (
        <div style={{ ...box, marginTop: 0, marginBottom: 12, background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
            <span
              style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                background: carrierInfo(existente.carrier).color
              }}
            />
            <strong>{existente.carrier_nombre ?? carrierInfo(existente.carrier).nombre}</strong>
            {existente.tracking_number && (
              <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                {existente.tracking_number}
              </code>
            )}
            {existente.metodo && <span style={{ color: 'var(--muted)' }}>{existente.metodo}</span>}
            {existente.origen === 'manual' && (
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>· alta manual</span>
            )}
            {existente.tracking_url && (
              <a href={existente.tracking_url} target="_blank" rel="noreferrer"
                 className="btn-outline"
                 style={{ padding: '3px 9px', fontSize: 11, marginLeft: 'auto' }}>
                Seguimiento ↗
              </a>
            )}
          </div>

          {/* Control de estado: avanzar sella la fecha que verá el cliente. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {PASOS_ENVIO.map((p) => {
              const activo = existente.estado === p.id;
              const hecho = !!(p.sello && existente[p.sello]);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy !== ''}
                  onClick={() => void marcarEstado(p.id, p.sello)}
                  title={activo ? 'Estado actual' : `Marcar como "${p.label}"`}
                  style={{
                    padding: '5px 11px',
                    fontSize: 11,
                    borderRadius: 'var(--r)',
                    cursor: busy === '' ? 'pointer' : 'default',
                    border: '1px solid ' + (activo ? 'var(--accent)' : 'var(--border)'),
                    background: activo ? 'var(--accent)' : 'transparent',
                    color: activo ? '#fff' : hecho ? 'var(--text)' : 'var(--muted)',
                    fontWeight: activo ? 700 : 400
                  }}
                >
                  {hecho && !activo ? '✓ ' : ''}
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              disabled={busy !== ''}
              onClick={() => void marcarEstado('incidencia', null)}
              style={{
                padding: '5px 11px', fontSize: 11, borderRadius: 'var(--r)', cursor: 'pointer',
                border: '1px solid ' + (existente.estado === 'incidencia' ? '#ef4444' : 'var(--border)'),
                background: existente.estado === 'incidencia' ? '#ef4444' : 'transparent',
                color: existente.estado === 'incidencia' ? '#fff' : 'var(--muted)'
              }}
            >
              Incidencia
            </button>
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            Estado actual: <strong>{ESTADO_LABEL[existente.estado] ?? existente.estado}</strong>
            {' · '}el cliente lo ve en /presupuesto con su código.
          </div>
        </div>
      )}

      {tab === 'manual' ? (
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
            Para envíos que no salen de Sendcloud. Con guardar el número, el cliente ya
            ve el seguimiento en su página de estado.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Transportista">
              <select
                style={inputStyle}
                value={mCarrier}
                onChange={(e) => {
                  setMCarrier(e.target.value);
                  // El método suele repetir el nombre del carrier: se propone.
                  if (e.target.value === 'inpost') setMMetodo('InPost Parcels 48h');
                }}
              >
                {CARRIER_OPCIONES.map((c) => (
                  <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
                ))}
              </select>
            </Field>
            <Field label="Servicio" hint="Texto libre, se muestra al cliente">
              <input style={inputStyle} value={mMetodo} onChange={(e) => setMMetodo(e.target.value)} />
            </Field>
            <Field label="Nº de seguimiento">
              <input
                style={inputStyle}
                value={mTracking}
                placeholder="620012345678"
                onChange={(e) => setMTracking(e.target.value)}
              />
            </Field>
            <Field label="Entrega estimada">
              <input style={inputStyle} type="date" value={mFecha} onChange={(e) => setMFecha(e.target.value)} />
            </Field>
          </div>

          <Field
            label="URL de seguimiento (opcional)"
            hint={
              carrierInfo(mCarrier).pideCp
                ? `Si la dejas vacía se enlaza a ${carrierInfo(mCarrier).nombre}, que además pedirá el código postal.`
                : 'Si la dejas vacía se enlaza a la página del transportista.'
            }
          >
            <input
              style={inputStyle}
              value={mUrl}
              placeholder="https://…"
              onChange={(e) => setMUrl(e.target.value)}
            />
          </Field>

          <div style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 6px' }}>
            Punto de recogida (déjalo vacío si es entrega a domicilio)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Nombre del punto">
              <input style={inputStyle} value={mPunto.nombre ?? ''} placeholder="Locker Carrefour Torres Villarroel" onChange={setPunto('nombre')} />
            </Field>
            <Field label="Dirección">
              <input style={inputStyle} value={mPunto.direccion ?? ''} onChange={setPunto('direccion')} />
            </Field>
            <Field label="Horario">
              <input style={inputStyle} value={mPunto.horario ?? ''} placeholder="Abierto 24 h" onChange={setPunto('horario')} />
            </Field>
            <Field label="Hasta cuándo">
              <input style={inputStyle} value={mPunto.hasta ?? ''} placeholder="3 días para recogerlo" onChange={setPunto('hasta')} />
            </Field>
          </div>

          <Field label="Nota para el cliente (opcional)">
            <input
              style={inputStyle}
              value={mNota}
              placeholder="Te lo dejo en el locker porque el portal estaba cerrado"
              onChange={(e) => setMNota(e.target.value)}
            />
          </Field>

          <button
            type="button"
            className="btn-primary"
            style={{ padding: '7px 14px', fontSize: 12 }}
            disabled={busy !== ''}
            onClick={() => void guardarManual()}
          >
            {busy === 'manual' ? 'Guardando…' : 'Registrar envío'}
          </button>

          {err && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>⚠ {err}</div>}
          {info && <div style={{ color: '#10b981', fontSize: 12, marginTop: 8 }}>✓ {info}</div>}
        </div>
      ) : (
      <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Nombre"><input style={inputStyle} value={recipient.name} onChange={set('name')} /></Field>
        <Field label="Teléfono"><input style={inputStyle} value={recipient.telephone} onChange={set('telephone')} /></Field>
        <Field label="Dirección"><input style={inputStyle} value={recipient.address} onChange={set('address')} /></Field>
        <Field label="Nº"><input style={inputStyle} value={recipient.house_number} onChange={set('house_number')} /></Field>
        <Field label="CP"><input style={inputStyle} value={recipient.postal_code} onChange={set('postal_code')} /></Field>
        <Field label="Ciudad"><input style={inputStyle} value={recipient.city} onChange={set('city')} /></Field>
        <Field label="País"><input style={inputStyle} value={recipient.country} onChange={set('country')} /></Field>
        <Field label="Peso (g)">
          <input style={inputStyle} type="number" min={1} value={pesoG}
                 onChange={(e) => setPesoG(Math.max(1, Number(e.target.value)))} />
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" className="btn-outline" style={{ padding: '7px 14px', fontSize: 12 }}
                onClick={verTarifas} disabled={busy !== ''}>
          {busy === 'methods' ? 'Cargando…' : 'Ver tarifas'}
        </button>

        {metodos.length > 0 && (
          <select value={codeSel} onChange={(e) => setCodeSel(e.target.value)}
                  style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 200 }}>
            {metodos.map((m, i) => (
              <option key={`m-${i}`} value={m.code}>
                {m.name}{m.price != null ? ` — ${euros(m.price)}` : ''}{m.id == null ? ' (sin etiqueta)' : ''}
              </option>
            ))}
          </select>
        )}

        <button type="button" className="btn-primary" style={{ padding: '7px 14px', fontSize: 12 }}
                onClick={crearEtiqueta} disabled={busy !== '' || !sel || sel.id == null}>
          {busy === 'label' ? 'Creando…' : 'Crear etiqueta'}
        </button>
      </div>

      {sel && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          {sel.id == null
            ? `${sel.name}: solo estimación (este producto no permite crear etiqueta desde aquí).`
            : <>Se anunciará el envío con <strong>{sel.name}</strong>{sel.price != null ? ` (~${euros(sel.price)})` : ''} y se facturará en tu cuenta Sendcloud.</>}
        </div>
      )}
      {err && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>⚠ {err}</div>}
      {info && <div style={{ color: '#10b981', fontSize: 12, marginTop: 8 }}>✓ {info}</div>}
      </>
      )}
    </div>
  );
}
