'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CampanaRow, CuponRow } from '@/lib/types';
import { Field, inputStyle } from '../_components/Field';
import { useConfirm } from '../_components/useConfirm';
import { mensajeDeError } from '@/lib/errors';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { ErrorBanner } from '../_components/ErrorBanner';
import { AdminCabecera } from '../_components/AdminNav';
import { renderMarkdown } from '@/lib/markdown';

// Campañas por email: se redactan aquí y las envía campana-enviar, un correo
// por persona con su enlace de baja. Audiencia y bajas: campana_audiencia().
type Draft = { id: string | null; asunto: string; cuerpo: string; cupon: string | null };

const PLANTILLAS: { nombre: string; asunto: string; cuerpo: string }[] = [
  {
    nombre: 'Cupón',
    asunto: '{{nombre}}, un descuento para tu próxima impresión',
    cuerpo:
      'Hola {{nombre}},\n\nGracias por confiar en 3DCC. Para tu próximo encargo tienes este código de descuento:\n\n**{{cupon}}**\n\nSe aplica solo desde este enlace: [Calcular mi presupuesto]({{enlace_cupon}})\n\nUn saludo,\nJorge'
  },
  {
    nombre: 'Promoción',
    asunto: 'Novedades en 3DCC Salamanca',
    cuerpo:
      'Hola {{nombre}},\n\nTe cuento una novedad: …\n\nSi te interesa, sube tu pieza y ves el precio al momento: [Calcular presupuesto]({{enlace_cupon}})\n\nUn saludo,\nJorge'
  },
  {
    nombre: 'Aviso',
    asunto: 'Aviso: plazos de entrega para Navidad',
    cuerpo:
      'Hola {{nombre}},\n\nSi quieres algún regalo impreso para Navidad, haz el pedido antes del **…** para tenerlo a tiempo.\n\nUn saludo,\nJorge'
  }
];

const vacio = (): Draft => ({ id: null, asunto: '', cuerpo: '', cupon: null });

// <input type="datetime-local"> works in local time; the table, in UTC.
const aLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AdminCampanas() {
  const [campanas, setCampanas] = useState<CampanaRow[]>([]);
  const [envios, setEnvios] = useState<Record<string, { ok: number; ko: number }>>({});
  const [cupones, setCupones] = useState<CuponRow[]>([]);
  const [audiencia, setAudiencia] = useState<{ email: string; nombre: string | null }[]>([]);
  const [bajas, setBajas] = useState(0);
  const [draft, setDraft] = useState<Draft>(vacio());
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cuando, setCuando] = useState('');
  const { authed, supabase } = useAdminAuth();
  const { confirmar, dialogo } = useConfirm();

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A new or duplicated draft starts unscheduled.
  const nueva = (d: Draft) => {
    setDraft(d);
    setCuando('');
  };

  async function refresh() {
    const db = supabase();
    const [c, e, cu, a, b] = await Promise.all([
      db.from('campanas').select('*').order('created_at', { ascending: false }),
      db.from('campana_envios').select('campana_id, ok'),
      db.from('cupones').select('*').eq('activo', true).order('created_at', { ascending: false }),
      db.rpc('campana_audiencia'),
      db.from('email_bajas').select('email', { count: 'exact', head: true })
    ]);
    const err = c.error ?? e.error ?? cu.error ?? a.error ?? b.error;
    if (err) setError(mensajeDeError(err, 'No se pudieron cargar las campañas'));
    setCampanas(c.data ?? []);
    const m: Record<string, { ok: number; ko: number }> = {};
    for (const r of e.data ?? []) {
      const x = (m[r.campana_id] ??= { ok: 0, ko: 0 });
      if (r.ok) x.ok++;
      else x.ko++;
    }
    setEnvios(m);
    setCupones(cu.data ?? []);
    setAudiencia(a.data ?? []);
    setBajas(b.count ?? 0);
  }

  const vars = (nombre: string) => ({
    nombre,
    cupon: draft.cupon ?? '(sin código)',
    enlace_cupon: `https://www.impresion3dcc.com/instant-quote/${draft.cupon ? `?cupon=${draft.cupon}` : ''}`
  });
  const conVars = (s: string, v: Record<string, string>) =>
    s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => v[k.toLowerCase()] ?? m);
  const preview = useMemo(
    () => renderMarkdown(conVars(draft.cuerpo, vars('Ana'))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.cuerpo, draft.cupon]
  );
  const usaCupon = /\{\{\s*cupon\s*\}\}/.test(draft.cuerpo + draft.asunto);

  // Saves the draft and returns its id (the function reads it from the table).
  async function guardar(): Promise<string | null> {
    if (!draft.asunto.trim() || !draft.cuerpo.trim()) {
      setError('Falta el asunto o el texto.');
      return null;
    }
    if (usaCupon && !draft.cupon) {
      setError('El texto usa {{cupon}}: elige un código de descuento.');
      return null;
    }
    setError(null);
    const fila = { asunto: draft.asunto.trim(), cuerpo: draft.cuerpo, html: renderMarkdown(draft.cuerpo), cupon: draft.cupon };
    const db = supabase();
    const r = draft.id
      ? await db.from('campanas').update(fila).eq('id', draft.id).select('id').single()
      : await db.from('campanas').insert(fila).select('id').single();
    if (r.error) {
      setError(mensajeDeError(r.error, 'No se pudo guardar la campaña'));
      return null;
    }
    setDraft((d) => ({ ...d, id: r.data.id }));
    refresh();
    return r.data.id;
  }

  async function enviar(prueba: boolean) {
    const id = await guardar();
    if (!id) return;
    if (!prueba) {
      const ok = await confirmar({
        titulo: 'Enviar campaña',
        mensaje: `¿Enviar «${draft.asunto}» a ${audiencia.length} personas?`,
        detalle: 'Un correo por persona, con unos segundos entre cada uno. No se puede deshacer.',
        confirmar: 'Enviar',
        destructivo: false
      });
      if (!ok) return;
    }
    setOcupado(true);
    setError(null);
    let total = 0;
    try {
      // Each call sends what fits in ~100 s; repeat while it makes progress.
      for (;;) {
        setEstado(prueba ? 'Enviando prueba…' : `Enviando… ${total} de ${audiencia.length}`);
        const { data, error } = await supabase().functions.invoke('campana-enviar', { body: { campana_id: id, prueba } });
        if (error) throw error;
        total += data.enviados;
        if (prueba || data.pendientes === 0 || data.enviados === 0) {
          setEstado(
            prueba
              ? 'Prueba enviada a tu correo. Revisa cómo se ve antes de mandarla.'
              : `Enviados ${total}.${data.pendientes ? ` ${data.pendientes} fallaron: vuelve a pulsar Enviar para reintentarlos.` : ''}`
          );
          break;
        }
      }
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo enviar'));
      setEstado(null);
    }
    setOcupado(false);
    refresh();
  }

  async function programar() {
    const fecha = new Date(cuando);
    if (!cuando || isNaN(fecha.getTime()) || fecha.getTime() < Date.now()) {
      setError('Elige un día y una hora en el futuro.');
      return;
    }
    const id = await guardar();
    if (!id) return;
    const ok = await confirmar({
      titulo: 'Programar campaña',
      mensaje: `¿Enviar «${draft.asunto}» el ${fechaHora(fecha.toISOString())}?`,
      detalle: `Saldrá sola (puede tardar unos minutos) a quien esté en la lista ese día, ahora ${audiencia.length} personas. Te llegará un correo cuando termine.`,
      confirmar: 'Programar',
      destructivo: false
    });
    if (!ok) return;
    const { error } = await supabase().from('campanas').update({ programada_at: fecha.toISOString() }).eq('id', id);
    if (error) setError(mensajeDeError(error, 'No se pudo programar'));
    else setEstado(`Programada para el ${fechaHora(fecha.toISOString())}.`);
    refresh();
  }

  async function desprogramar(c: CampanaRow) {
    const { error } = await supabase().from('campanas').update({ programada_at: null }).eq('id', c.id);
    if (error) setError(mensajeDeError(error, 'No se pudo cancelar la programación'));
    refresh();
  }

  async function borrar(c: CampanaRow) {
    if (!(await confirmar({ mensaje: `¿Borrar «${c.asunto}»?`, detalle: 'Se pierde también su registro de envíos.' }))) return;
    const { error } = await supabase().from('campanas').delete().eq('id', c.id);
    if (error) setError(mensajeDeError(error, 'No se pudo borrar'));
    if (draft.id === c.id) nueva(vacio());
    refresh();
  }

  if (authed === false) return <AccesoDenegado />;

  const enviada = campanas.find((c) => c.id === draft.id)?.estado === 'enviada';
  const mini = { padding: '6px 12px', fontSize: 11 };

  return (
    <div style={{ maxWidth: 760 }}>
      {dialogo}
      <AdminCabecera titulo="Campañas por email">
        Llegan a {audiencia.length} clientes con email (solicitudes del tasador y pedidos de 3DCC), sin
        contar las {bajas} bajas. Cada persona recibe su propio correo con un enlace para darse de
        baja; quien se da de baja no vuelve a recibir ninguno. Envía siempre una prueba primero.
      </AdminCabecera>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 32 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <span style={{ color: 'var(--muted)', fontSize: 12, alignSelf: 'center' }}>Empezar desde:</span>
          {PLANTILLAS.map((p) => (
            <button key={p.nombre} type="button" className="btn-outline" style={mini}
              onClick={() => nueva({ ...vacio(), asunto: p.asunto, cuerpo: p.cuerpo, cupon: cupones[0]?.codigo ?? null })}>
              {p.nombre}
            </button>
          ))}
          {draft.id && (
            <button type="button" className="btn-outline" style={mini} onClick={() => nueva(vacio())}>
              Nueva en blanco
            </button>
          )}
        </div>

        <Field label="Asunto" hint="Corto y concreto. Evita MAYÚSCULAS, «GRATIS» y muchos signos de exclamación: es lo que más manda al spam.">
          <input value={draft.asunto} maxLength={150} onChange={(e) => setDraft({ ...draft, asunto: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="Código de descuento" hint="Opcional. Se crean en Códigos de descuento.">
          <select value={draft.cupon ?? ''} onChange={(e) => setDraft({ ...draft, cupon: e.target.value || null })} style={inputStyle}>
            <option value="">Sin código</option>
            {cupones.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} ({c.tipo === 'pct' ? `-${c.valor}%` : `-${c.valor} €`})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Texto" hint="Markdown: **negrita**, [enlace](url). Variables: {{nombre}}, {{cupon}}, {{enlace_cupon}}.">
          <textarea value={draft.cuerpo} rows={10} onChange={(e) => setDraft({ ...draft, cuerpo: e.target.value })}
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }} />
        </Field>

        {draft.cuerpo && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
              Vista previa · {conVars(draft.asunto, vars('Ana'))}
            </div>
            <div style={{ padding: 16, background: '#fff', color: '#222', borderRadius: 6, lineHeight: 1.6, fontSize: 15 }}
              dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        )}

        {estado && <p style={{ fontSize: 13 }}>{estado}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn-outline" disabled={ocupado} onClick={() => guardar()}>Guardar borrador</button>
          <button type="button" className="btn-outline" disabled={ocupado} onClick={() => enviar(true)}>Enviarme una prueba</button>
          <button type="button" className="btn-primary" disabled={ocupado || audiencia.length === 0} onClick={() => enviar(false)}>
            {enviada ? 'Reenviar a los que falten' : `Enviar a ${audiencia.length}`}
          </button>
        </div>

        {!enviada && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <input type="datetime-local" aria-label="Día y hora del envío" value={cuando}
              onChange={(e) => setCuando(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '1 1 200px' }} />
            <button type="button" className="btn-outline" disabled={ocupado || !cuando} onClick={programar}>
              Programar envío
            </button>
          </div>
        )}

        <details style={{ marginTop: 16, fontSize: 13 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Ver destinatarios ({audiencia.length})</summary>
          <ul style={{ columns: 2, paddingLeft: 18 }}>
            {audiencia.map((a) => <li key={a.email}>{a.nombre ? `${a.nombre} · ` : ''}{a.email}</li>)}
          </ul>
        </details>
      </div>

      {campanas.length === 0 && <p style={{ color: 'var(--muted)' }}>Aún no hay campañas.</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {campanas.map((c) => {
          const n = envios[c.id] ?? { ok: 0, ko: 0 };
          return (
            <li key={c.id} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
              <strong>{c.asunto}</strong>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                {c.estado !== 'enviada' && c.programada_at
                  ? `Programada para el ${fechaHora(c.programada_at)}`
                  : c.estado === 'borrador' ? 'Borrador' : c.estado === 'enviando' ? 'A medias' : 'Enviada'}
                {c.enviada_at && ` el ${new Date(c.enviada_at).toLocaleDateString('es-ES')}`}
                {(n.ok > 0 || n.ko > 0) && ` · ${n.ok} enviados${n.ko ? ` · ${n.ko} fallidos` : ''}`}
                {c.cupon && ` · ${c.cupon}`}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn-outline" style={mini}
                  onClick={() => {
                    setDraft({ id: c.id, asunto: c.asunto, cuerpo: c.cuerpo, cupon: c.cupon });
                    setCuando(c.programada_at ? aLocal(c.programada_at) : '');
                  }}>
                  {c.estado === 'borrador' ? 'Editar' : 'Abrir'}
                </button>
                {c.estado !== 'enviada' && c.programada_at && (
                  <button type="button" className="btn-outline" style={mini} onClick={() => desprogramar(c)}>
                    Cancelar programación
                  </button>
                )}
                <button type="button" className="btn-outline" style={mini}
                  onClick={() => nueva({ id: null, asunto: c.asunto, cuerpo: c.cuerpo, cupon: c.cupon })}>
                  Duplicar
                </button>
                <button type="button" className="btn-outline" style={mini} onClick={() => borrar(c)}>Borrar</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
