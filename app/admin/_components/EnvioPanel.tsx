'use client';

// Panel de envío dentro del drawer de un presupuesto (entrega = 'envio').
// Cotiza con Sendcloud (tarifas reales por zona, API v3) y genera la etiqueta
// (PDF) vía la Edge Function `envios-etiqueta`. El secreto vive en la función.

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Quote } from '@/lib/types';
import { Field, inputStyle } from './Field';

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
type EnvioRow = {
  id: string; metodo: string | null; carrier: string | null;
  tracking_number: string | null; tracking_url: string | null;
  estado: string; peso_g: number | null; created_at: string;
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
  const [busy, setBusy] = useState<'' | 'methods' | 'label'>('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase()
      .from('envios')
      .select('id,metodo,carrier,tracking_number,tracking_url,estado,peso_g,created_at')
      .eq('quote_id', quote.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (alive && data) setExistente(data as EnvioRow); });
    return () => { alive = false; };
  }, [quote.id]);

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
      setExistente({
        id: data?.envio_id, metodo: data?.metodo ?? sel.name, carrier: sel.carrier,
        tracking_number: data?.tracking_number, tracking_url: data?.tracking_url,
        estado: data?.label_pdf_base64 ? 'etiqueta' : 'pendiente',
        peso_g: pesoG, created_at: new Date().toISOString()
      });
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo crear la etiqueta.');
    } finally { setBusy(''); }
  }

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📦 Generar envío</div>

      {existente?.tracking_number && (
        <div style={{ ...box, marginTop: 0, marginBottom: 12, background: 'var(--bg)' }}>
          <div style={{ fontSize: 12 }}>
            Ya hay un envío: <strong>{existente.tracking_number}</strong>
            {existente.metodo ? ` · ${existente.metodo}` : ''} · {existente.estado}
          </div>
          {existente.tracking_url && (
            <a href={existente.tracking_url} target="_blank" rel="noreferrer"
               className="btn-outline" style={{ padding: '4px 10px', fontSize: 11, marginTop: 6, display: 'inline-block' }}>
              Ver seguimiento ↗
            </a>
          )}
        </div>
      )}

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
                {m.name}{m.price != null ? ` — ${m.price.toFixed(2)} €` : ''}{m.id == null ? ' (sin etiqueta)' : ''}
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
            : <>Se anunciará el envío con <strong>{sel.name}</strong>{sel.price != null ? ` (~${sel.price.toFixed(2)} €)` : ''} y se facturará en tu cuenta Sendcloud.</>}
        </div>
      )}
      {err && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>⚠ {err}</div>}
      {info && <div style={{ color: '#10b981', fontSize: 12, marginTop: 8 }}>✓ {info}</div>}
    </div>
  );
}
