'use client';

// Taller → Entregas: pickup slots in Salamanca. The admin opens slots, the
// customer asks for one from /presupuesto (order «listo» for pickup), and here
// it is confirmed (appointment email + .ics) or freed (asks for another).

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { mensajeDeError } from '@/lib/errors';
import { hoyMadrid } from '@/lib/quote/pricing';
import { LUGAR_RECOGIDA, citaCorta, diasEntre, madridISO, parseFranjas } from '@/lib/recogida';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { AdminCabecera } from '../_components/AdminNav';
import { ErrorBanner } from '../_components/ErrorBanner';
import { useConfirm } from '../_components/useConfirm';

const DIAS: [number, string][] = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];

type Hueco = {
  id: string;
  inicio: string;
  lugar: string;
  confirmada: boolean;
  quote_id: string | null;
  quotes: { codigo: string; nombre: string; email: string | null; telefono: string | null; estado: string } | null;
};

export default function AdminEntregas() {
  const { authed, supabase } = useAdminAuth();
  const { confirmar, dialogo } = useConfirm();
  const [huecos, setHuecos] = useState<Hueco[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [desde, setDesde] = useState(hoyMadrid());
  const [hasta, setHasta] = useState(hoyMadrid());
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [franjas, setFranjas] = useState('');
  const [cada, setCada] = useState('30');
  const [lugar, setLugar] = useState(LUGAR_RECOGIDA);

  async function cargar() {
    const { data, error: err } = await supabase()
      .from('huecos_recogida')
      .select('id, inicio, lugar, confirmada, quote_id, quotes(codigo, nombre, email, telefono, estado)')
      .gte('inicio', new Date(Date.now() - 12 * 3600_000).toISOString())
      .order('inicio');
    if (err) setError(mensajeDeError(err, 'No se pudieron cargar los huecos'));
    setHuecos((data ?? []) as unknown as Hueco[]);
  }

  useEffect(() => {
    if (authed) void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // Timetable → one slot per day × time. Already existing ones are skipped.
  async function crear(e: FormEvent) {
    e.preventDefault();
    const hs = parseFranjas(franjas, Number(cada));
    if (!hs) return setError('Horario no válido. Ejemplo: 10:00-14:00, 20:00-21:30');
    if (hasta < desde) return setError('«Hasta» es anterior a «Desde».');
    if (hasta > maxFecha) return setError('Como mucho 60 días vista: los clientes no ven más allá.');
    const ds = diasEntre(desde, hasta, dias);
    if (!ds.length) return setError('Ningún día en ese rango con los días marcados.');
    const filas = ds
      .flatMap((d) => hs.map((h) => ({ inicio: madridISO(d, h), lugar: lugar.trim() || LUGAR_RECOGIDA })))
      .filter((f) => Date.parse(f.inicio) > Date.now());
    if (!filas.length) return setError('Todas esas horas ya han pasado.');
    setError(null);
    const { error: err } = await supabase()
      .from('huecos_recogida')
      .upsert(filas, { onConflict: 'inicio,lugar', ignoreDuplicates: true });
    if (err) return setError(mensajeDeError(err, 'No se pudieron crear los huecos'));
    setAviso(`Horario aplicado: ${filas.length} hueco${filas.length === 1 ? '' : 's'} en ${ds.length} día${ds.length === 1 ? '' : 's'}.`);
    void cargar();
  }

  // Timetable changed: drop the FREE slots in the range; booked ones stay.
  async function vaciar() {
    const fin = new Date(Date.parse(madridISO(hasta, '00:00')) + 86400000).toISOString();
    // Supabase returns «+00:00», not «Z»: compare as dates, not strings.
    const t = (iso: string) => Date.parse(iso);
    const n = (huecos ?? []).filter((h) => !h.quote_id && t(h.inicio) >= t(madridISO(desde, '00:00')) && t(h.inicio) < t(fin)).length;
    if (!n) return setAviso('No hay huecos libres en esas fechas.');
    if (!(await confirmar({ mensaje: `¿Borrar ${n} hueco${n === 1 ? '' : 's'} libre${n === 1 ? '' : 's'} del ${desde} al ${hasta}?`, detalle: 'Los que ya ha pedido un cliente se quedan.' }))) return;
    const { error: err } = await supabase()
      .from('huecos_recogida')
      .delete()
      .is('quote_id', null)
      .gte('inicio', madridISO(desde, '00:00'))
      .lt('inicio', fin);
    if (err) setError(mensajeDeError(err, 'No se pudieron borrar'));
    else setAviso(`${n} hueco${n === 1 ? '' : 's'} libre${n === 1 ? '' : 's'} borrado${n === 1 ? '' : 's'}.`);
    void cargar();
  }

  // Email to the customer; the slot change is already saved even if this fails.
  async function avisar(quoteId: string, cita: 'confirmada' | 'otra') {
    const { data, error: err } = await supabase().functions.invoke('notify-quote', { body: { quote_id: quoteId, cita } });
    if (err || data?.error) {
      setError(`Guardado, pero no se pudo enviar el email: ${data?.error ?? err?.message}. Avísale por WhatsApp.`);
      return false;
    }
    return true;
  }

  async function confirmarCita(h: Hueco) {
    if (Date.parse(h.inicio) < Date.now()) return setError('Esa hora ya ha pasado: pide otra hora al cliente.');
    setOcupado(h.id);
    setError(null);
    const { error: err } = await supabase().from('huecos_recogida').update({ confirmada: true }).eq('id', h.id);
    if (err) setError(mensajeDeError(err, 'No se pudo confirmar'));
    else if (await avisar(h.quote_id!, 'confirmada')) setAviso(`Cita enviada a ${h.quotes?.nombre}.`);
    setOcupado(null);
    void cargar();
  }

  // Frees the slot and asks the customer to choose again. `borrar` also deletes it.
  async function liberar(h: Hueco, borrar: boolean) {
    // Only ask for another slot while the order still waits for pickup and the slot hasn't passed.
    const avisable = !!h.quote_id && h.quotes?.estado === 'listo' && Date.parse(h.inicio) > Date.now();
    if (avisable) {
      const ok = await confirmar({
        mensaje: borrar ? `¿Borrar el hueco de ${h.quotes?.nombre}?` : `¿Pedir a ${h.quotes?.nombre} otra hora?`,
        detalle: 'Le llega un email para que elija otro hueco.',
        confirmar: borrar ? 'Borrar y avisar' : 'Pedir otra hora',
        destructivo: borrar
      });
      if (!ok) return;
    }
    setOcupado(h.id);
    setError(null);
    const q = supabase().from('huecos_recogida');
    const { error: err } = borrar
      ? await q.delete().eq('id', h.id)
      : await q.update({ quote_id: null, confirmada: false, pedida_at: null }).eq('id', h.id);
    if (err) setError(mensajeDeError(err, 'No se pudo guardar'));
    else if (!avisable || (await avisar(h.quote_id!, 'otra'))) setAviso(avisable ? 'Cliente avisado.' : 'Hueco borrado.');
    setOcupado(null);
    void cargar();
  }

  if (authed === false) return <AccesoDenegado />;
  const pedidos = (huecos ?? []).filter((h) => h.quote_id && !h.confirmada);
  const maxFecha = new Date(Date.parse(`${hoyMadrid()}T12:00:00Z`) + 60 * 86400000).toISOString().slice(0, 10);

  return (
    <div>
      {dialogo}
      <AdminCabecera titulo="Entregas">
        Abre huecos de recogida. Al marcar «Listo» un pedido de recogida, el cliente elige uno y tú lo confirmas aquí.
      </AdminCabecera>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {aviso && <p role="status" style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>{aviso}</p>}

      <form onSubmit={crear} className="adm-card" style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        <p className="adm-card-titulo">Horario de recogida</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label>
            Desde <input type="date" value={desde} min={hoyMadrid()} max={maxFecha} onChange={(e) => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value); }} required />
          </label>
          <label>
            Hasta <input type="date" value={hasta} min={desde} max={maxFecha} onChange={(e) => setHasta(e.target.value)} required />
          </label>
        </div>
        <fieldset style={{ border: 0, padding: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <legend style={{ fontSize: 13, marginBottom: 4 }}>Días</legend>
          {DIAS.map(([n, l]) => (
            <label key={n} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={dias.includes(n)}
                onChange={(e) => setDias((d) => (e.target.checked ? [...d, n] : d.filter((x) => x !== n)))}
              />
              {l}
            </label>
          ))}
        </fieldset>
        <label>
          Franjas en las que puedes entregar{' '}
          <input value={franjas} onChange={(e) => setFranjas(e.target.value)} placeholder="10:00-14:00, 20:00-21:30" required autoComplete="off" />
        </label>
        <label>
          Un hueco cada{' '}
          <select value={cada} onChange={(e) => setCada(e.target.value)}>
            {['15', '20', '30', '45', '60'].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
        <label>
          Lugar <input value={lugar} onChange={(e) => setLugar(e.target.value)} maxLength={200} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="btn-primary">Aplicar horario</button>
          <button type="button" className="adm-menu-btn" onClick={vaciar}>Borrar huecos libres de esas fechas</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          ¿Cambia tu horario? Borra los huecos libres de esas fechas y aplica el nuevo. Las citas ya pedidas no se tocan.
        </p>
      </form>

      {huecos === null && !error ? (
        <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      ) : (
        <>
          <section className="hoy-grupo" aria-label="Por confirmar" style={{ marginBottom: 16 }}>
            <h2>Por confirmar <span className="hoy-n">{pedidos.length}</span></h2>
            {pedidos.length === 0 && <p className="hoy-vacio">Ningún cliente esperando confirmación.</p>}
            <ul>
              {pedidos.map((h) => (
                <li key={h.id} className="hoy-fila">
                  <span className="hoy-fila-txt">
                    <strong>{citaCorta(h.inicio)} · {h.quotes?.nombre}</strong>
                    <span>
                      <Link href={`/admin/presupuestos?abrir=${encodeURIComponent(h.quotes?.codigo ?? '')}`}>{h.quotes?.codigo}</Link>
                      {' · '}{h.lugar}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn-primary" disabled={ocupado === h.id} onClick={() => confirmarCita(h)}>
                      Confirmar
                    </button>
                    <button type="button" className="adm-menu-btn" disabled={ocupado === h.id} onClick={() => liberar(h, false)}>
                      Otra hora
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="hoy-grupo" aria-label="Huecos">
            <h2>Próximos huecos <span className="hoy-n">{huecos?.length ?? 0}</span></h2>
            {huecos?.length === 0 && <p className="hoy-vacio">No hay huecos abiertos.</p>}
            <ul>
              {(huecos ?? []).map((h) => (
                <li key={h.id} className="hoy-fila">
                  <span className="hoy-fila-txt">
                    <strong>{citaCorta(h.inicio)}</strong>
                    <span>
                      {h.quote_id ? `${h.confirmada ? 'Confirmada' : 'Pedida'} · ${h.quotes?.nombre} · ${h.quotes?.codigo}` : 'Libre'}
                      {' · '}{h.lugar}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {h.confirmada && (
                      <button type="button" className="adm-menu-btn" disabled={ocupado === h.id} onClick={() => avisar(h.quote_id!, 'confirmada').then((ok) => ok && setAviso('Cita reenviada.'))}>
                        Reenviar cita
                      </button>
                    )}
                    <button type="button" className="adm-menu-btn" disabled={ocupado === h.id} onClick={() => liberar(h, true)}>
                      Borrar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
