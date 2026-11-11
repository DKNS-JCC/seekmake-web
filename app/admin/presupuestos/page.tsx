'use client';

// Pedidos: una lista con filtros (no un tablero: «Hoy» hace de tablero). Cada
// fila enseña el siguiente paso y lo ejecuta con un clic; el resto vive en la
// ficha (Ficha.tsx), que se abre con ?abrir=Q-… (y ?pestana=cobros).
//
// Cada pedido es una quote (lo que ve el cliente) más su order (lo que ve el
// taller): siempre 1:1, ver docs/plan-sincronizacion-web-calculadora.md.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Quote, QuoteEstado } from '@/lib/types';
import { normalizeSettings, hoyMadrid, type QuoteSettings } from '@/lib/quote/pricing';
import { euros } from '@/lib/recibo/types';
import { mensajeDeError } from '@/lib/errors';
import { activableRow } from '@/lib/a11y';
import './presupuestos.css';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { AdminCabecera } from '../_components/AdminNav';
import { ErrorBanner } from '../_components/ErrorBanner';
import { useAviso } from '../_components/Aviso';
import { Ficha } from './Ficha';
import {
  AVISABLES, ESTADO_COLOR, ESTADO_LABEL, FILTROS, PAGO_LABEL, SIGUIENTE,
  coincideFiltro, fechaCorta, piezas, plazoDe, type Filtro
} from './estados';
import { contabilizarMaterial, nuevoId, parchearOrden, type PedidoRow } from './orden';

type Orden = 'tope' | 'recientes' | 'importe';

const importe = (q: Quote) => Number(q.precio_final ?? q.precio_total);

export default function AdminPedidos() {
  const { authed, supabase } = useAdminAuth();
  const { avisar, aviso } = useAviso();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [pedidos, setPedidos] = useState<Map<string, PedidoRow>>(new Map());
  const [conPedido, setConPedido] = useState<Set<string>>(new Set());
  const [ajustes, setAjustes] = useState<QuoteSettings>(() => normalizeSettings(null));
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<Filtro>('activos');
  const [query, setQuery] = useState('');
  const [orden, setOrden] = useState<Orden>('tope');
  const [abierta, setAbierta] = useState<string | null>(null); // código
  const [pestana, setPestana] = useState('resumen');
  // Eliminados a la espera de los 6 s: ya no se ven, aún no se han borrado.
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const pendientes = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const refresh = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    const [q, o, cp, s] = await Promise.all([
      supabase().from('quotes').select('*').order('created_at', { ascending: false }),
      supabase().from('orders').select('id, quote_id, data').eq('empresa', '3dcc'),
      supabase().rpc('quotes_con_pedido'),
      supabase().from('quote_settings').select('config').eq('id', 1).maybeSingle()
    ]);
    if (q.error) setErrorCarga(mensajeDeError(q.error, 'No se pudieron cargar los pedidos'));
    setQuotes((q.data as Quote[]) ?? []);
    setPedidos(new Map(((o.data ?? []) as PedidoRow[]).filter((r) => r.quote_id).map((r) => [r.quote_id as string, r])));
    if (!cp.error) setConPedido(new Set((cp.data ?? []).map(String)));
    setAjustes(normalizeSettings(s.data?.config ?? null));
    setCargando(false);
  }, [supabase]);

  // Filtros y ficha abierta viven en la URL: recargar, volver y los enlaces de «Hoy» los conservan.
  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    const e = u.get('estado');
    if (u.get('archivados') === '1') setFiltro('archivados');
    else if (e && FILTROS.some((f) => f.id === e)) setFiltro(e as Filtro);
    setQuery(u.get('q') ?? '');
    setAbierta(u.get('abrir'));
    setPestana(['resumen', 'piezas', 'cobros', 'envio'].includes(u.get('pestana') ?? '') ? (u.get('pestana') as string) : 'resumen');
    if (authed) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);
  useEffect(() => {
    const u = new URLSearchParams();
    if (filtro !== 'activos') u.set('estado', filtro);
    if (query.trim()) u.set('q', query.trim());
    if (abierta) {
      u.set('abrir', abierta);
      if (pestana !== 'resumen') u.set('pestana', pestana);
    }
    const qs = u.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, [filtro, query, abierta, pestana]);

  // Al salir de la pantalla, lo que esperaba su plazo se borra ya.
  useEffect(() => {
    const t = pendientes.current;
    return () => {
      for (const [, id] of t) clearTimeout(id);
    };
  }, []);

  const visibles = useMemo(() => {
    const qq = query.trim().toLowerCase();
    const lista = quotes.filter(
      (q) =>
        !ocultos.has(q.id) &&
        coincideFiltro(q, filtro) &&
        (!qq ||
          q.codigo.toLowerCase().includes(qq) ||
          q.nombre.toLowerCase().includes(qq) ||
          q.email.toLowerCase().includes(qq) ||
          piezas(q).toLowerCase().includes(qq))
    );
    return lista.sort((a, b) => {
      if (orden === 'importe') return importe(b) - importe(a);
      if (orden === 'recientes') return a.created_at < b.created_at ? 1 : -1;
      // Tope más cercano primero; sin fecha, al final y por antigüedad.
      return (a.fecha_prometida ?? '9999').localeCompare(b.fecha_prometida ?? '9999') || (a.created_at < b.created_at ? 1 : -1);
    });
  }, [quotes, ocultos, filtro, query, orden]);

  const cuentas = useMemo(() => {
    const c = {} as Record<Filtro, number>;
    for (const f of FILTROS) c[f.id] = quotes.filter((q) => !ocultos.has(q.id) && coincideFiltro(q, f.id)).length;
    return c;
  }, [quotes, ocultos]);

  const actual = quotes.find((q) => q.codigo === abierta) ?? null;

  // ── Acciones ──

  async function releer(id: string) {
    const [q, o] = await Promise.all([
      supabase().from('quotes').select('*').eq('id', id).single(),
      supabase().from('orders').select('id, quote_id, data').eq('empresa', '3dcc').eq('quote_id', id).maybeSingle()
    ]);
    if (q.data) setQuotes((prev) => prev.map((x) => (x.id === id ? (q.data as Quote) : x)));
    if (o.data) setPedidos((prev) => new Map(prev).set(id, o.data as PedidoRow));
  }

  async function avisarCliente(q: Quote): Promise<string> {
    try {
      const { data, error: err } = await supabase().functions.invoke('notify-quote', { body: { quote_id: q.id } });
      if (err) return `No se pudo avisar a ${q.nombre}: ${mensajeDeError(err)}`;
      if (data?.error) return String(data.error);
      return `${q.nombre} avisado.`;
    } catch {
      return 'Error de red al avisar al cliente.';
    }
  }

  /** Cambia de estado. Aceptar apunta el material; entregar con todo cobrado archiva. */
  async function mover(q: Quote, a: QuoteEstado, conAviso: boolean) {
    setError(null);
    const antes = q.estado;
    const { error: err } = await supabase().from('quotes').update({ estado: a }).eq('id', q.id);
    if (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el estado'));
      return;
    }
    const partes = [`${q.codigo}: ${ESTADO_LABEL[a]}.`];
    if (a === 'aceptado') {
      try {
        const m = await contabilizarMaterial(supabase(), q.id);
        if (m) partes.push(m);
      } catch (e) {
        partes.push('No se pudo apuntar el material: ' + mensajeDeError(e as { message?: string }));
      }
    }
    await releer(q.id);
    // La base de datos puede haber puesto la fecha al aceptar y el cobro manda sobre el pago.
    const { data: fresco } = await supabase().from('quotes').select('pago, archivado').eq('id', q.id).single();
    let archivado = false;
    if (a === 'entregado' && fresco?.pago === 'pagado' && !fresco.archivado) {
      const { error: e2 } = await supabase().from('quotes').update({ archivado: true }).eq('id', q.id);
      if (!e2) {
        archivado = true;
        partes.push('Todo cobrado: archivado.');
        await releer(q.id);
      }
    }
    if (conAviso && q.email && AVISABLES.includes(a)) partes.push(await avisarCliente(q));
    else if (q.email && AVISABLES.includes(a)) partes.push('Cliente sin avisar.');
    avisar(partes.join(' '), {
      label: 'Deshacer',
      run: () => {
        void (async () => {
          await supabase().from('quotes').update({ estado: antes, ...(archivado ? { archivado: false } : {}) }).eq('id', q.id);
          await releer(q.id);
        })();
      }
    });
  }

  async function archivar(q: Quote) {
    const valor = !q.archivado;
    const { error: err } = await supabase().from('quotes').update({ archivado: valor }).eq('id', q.id);
    if (err) return setError(mensajeDeError(err, 'No se pudo archivar el pedido'));
    try {
      await parchearOrden(supabase(), q.id, { archived: valor });
    } catch {
      /* el pedido de taller se pone al día en el siguiente guardado */
    }
    await releer(q.id);
    setAbierta(null);
    avisar(`${q.codigo} ${valor ? 'archivado' : 'recuperado'}.`, {
      label: 'Deshacer',
      run: () => {
        void (async () => {
          await supabase().from('quotes').update({ archivado: !valor }).eq('id', q.id);
          await parchearOrden(supabase(), q.id, { archived: !valor }).catch(() => null);
          await releer(q.id);
        })();
      }
    });
  }

  // Sale de la lista al momento y se borra de verdad a los 6 s, con «Deshacer».
  function eliminar(q: Quote) {
    setAbierta(null);
    setOcultos((s) => new Set(s).add(q.id));
    const t = setTimeout(async () => {
      pendientes.current.delete(q.id);
      const paths = (q.archivos ?? []).map((a) => a.path).filter(Boolean);
      if (paths.length) await supabase().storage.from('quote-uploads').remove(paths);
      // Primero el pedido de taller (si no, queda huérfano); la quote se borra después.
      await supabase().from('orders').delete().eq('empresa', '3dcc').eq('quote_id', q.id);
      const { error: err } = await supabase().from('quotes').delete().eq('id', q.id);
      if (err) {
        setError(mensajeDeError(err, `No se pudo eliminar ${q.codigo}`));
        setOcultos((s) => {
          const n = new Set(s);
          n.delete(q.id);
          return n;
        });
        return;
      }
      setQuotes((prev) => prev.filter((x) => x.id !== q.id));
    }, 6000);
    pendientes.current.set(q.id, t);
    avisar(`${q.codigo} eliminado.`, {
      label: 'Deshacer',
      run: () => {
        clearTimeout(pendientes.current.get(q.id));
        pendientes.current.delete(q.id);
        setOcultos((s) => {
          const n = new Set(s);
          n.delete(q.id);
          return n;
        });
      }
    });
  }

  async function duplicar(q: Quote) {
    const origen = pedidos.get(q.id);
    if (!origen) return;
    const ahora = new Date().toISOString();
    const id = nuevoId();
    const data = {
      ...origen.data,
      id,
      created_at: ahora,
      fecha: hoyMadrid(),
      estado: 'Presupuesto enviado',
      importe_pagado: 0,
      importe_pendiente: Number(origen.data.precio_final) || 0,
      payment_status: 'Pendiente',
      payment_method: '',
      payment_history: [],
      notif_history: [],
      stripe_payment_url: '',
      stripe_session_id: '',
      material_contabilizado: false,
      repeticiones_error: 0,
      archived: false,
      accepted_at: '',
      last_status_update: ahora,
      notif_snooze_until: ''
    };
    const { error: err } = await supabase().from('orders').insert({ empresa: '3dcc', id, data });
    if (err) return setError(mensajeDeError(err, 'No se pudo duplicar el pedido'));
    // La quote la crea el trigger (0027): se vuelve a leer todo para tenerla.
    await refresh();
    const { data: fila } = await supabase().from('orders').select('quotes(codigo)').eq('empresa', '3dcc').eq('id', id).maybeSingle();
    const codigo = (fila as { quotes?: { codigo?: string } | null } | null)?.quotes?.codigo;
    if (codigo) {
      setPestana('resumen');
      setAbierta(codigo);
      avisar(`Duplicado como ${codigo}, en «Presupuestado».`);
    }
  }

  if (authed === false) return <AccesoDenegado />;

  const hoy = hoyMadrid();
  const siguienteBtn = (q: Quote) => {
    if (q.estado === 'nuevo') {
      return (
        <Link href={`/admin/encargo?solicitud=${encodeURIComponent(q.codigo)}`} className="pq-siguiente" onClick={(e) => e.stopPropagation()}>
          Presupuestar ▸
        </Link>
      );
    }
    const s = SIGUIENTE[q.estado];
    if (!s) return null;
    return (
      <button
        type="button"
        className="pq-siguiente"
        onClick={(e) => {
          e.stopPropagation();
          void mover(q, s.a, false);
        }}
      >
        {s.label} ▸
      </button>
    );
  };

  return (
    <div>
      {aviso}
      <AdminCabecera
        titulo="Pedidos"
        acciones={<Link href="/admin/encargo" className="btn-primary">+ Nuevo encargo</Link>}
      />

      <div className="pq-toolbar">
        <input
          className="pq-search"
          type="search"
          aria-label="Buscar pedidos"
          spellCheck={false}
          autoComplete="off"
          placeholder="Buscar por código, cliente o descripción…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="pq-orden">
          <span>Orden</span>
          <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
            <option value="tope">Fecha tope</option>
            <option value="recientes">Más recientes</option>
            <option value="importe">Mayor importe</option>
          </select>
        </label>
      </div>

      <div className="pq-filters" role="group" aria-label="Filtrar por estado">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filtro === f.id}
            className={'pq-filter' + (filtro === f.id ? ' active' : '')}
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
            <span>{cuentas[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {errorCarga && (
        <ErrorBanner>
          {errorCarga}{' '}
          <button type="button" className="pq-reintentar" onClick={() => void refresh()}>Reintentar</button>
        </ErrorBanner>
      )}
      {error && !actual && <ErrorBanner>{error}</ErrorBanner>}
      {cargando && <p style={{ color: 'var(--muted)' }}>Cargando…</p>}
      {!cargando && !errorCarga && visibles.length === 0 && (
        <p className="pq-vacio">
          {quotes.length === 0 ? (
            <>Aún no hay pedidos. <Link href="/admin/encargo" className="btn-primary" style={{ marginLeft: 8 }}>Nuevo encargo</Link></>
          ) : query.trim() ? (
            <>Ningún pedido coincide con «{query.trim()}».</>
          ) : (
            <>Ningún pedido en «{FILTROS.find((f) => f.id === filtro)?.label}».</>
          )}
        </p>
      )}

      {visibles.length > 0 && (
        <table className="adm-tabla pq-lista">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cliente y encargo</th>
              <th>Tope</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Cobro</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((q) => {
              const plazo = plazoDe(q, hoy);
              return (
                <tr
                  key={q.id}
                  className={q.archivado ? 'archived' : ''}
                  {...activableRow(() => { setPestana('resumen'); setAbierta(q.codigo); }, `Abrir el pedido ${q.codigo}`)}
                >
                  <td className="pq-codigo">{q.codigo}</td>
                  <td className="adm-sin-etiqueta pq-cliente">
                    <strong>{q.nombre}</strong>
                    <span>
                      {piezas(q)}
                      {q.origen === 'web' && <span className="pq-origen" style={{ marginLeft: 6 }}>web</span>}
                    </span>
                  </td>
                  <td data-label="Tope" className={'pq-tope' + (plazo.riesgo ? ' pq-riesgo' : '')}>
                    {plazo.riesgo && '⚠ '}
                    {plazo.texto}
                  </td>
                  <td data-label="Total" className="adm-num">{euros(importe(q))}</td>
                  <td data-label="Cobro">
                    <span className={`pq-pago pq-pago--${q.pago ?? 'pendiente'}`}>{PAGO_LABEL[q.pago ?? 'pendiente']}</span>
                  </td>
                  <td data-label="Estado" className="pq-estado-col">
                    <div className="pq-estado-stack">
                    <span className="pq-estado-badge" style={{ borderColor: ESTADO_COLOR[q.estado] }}>
                      <i style={{ background: ESTADO_COLOR[q.estado] }} aria-hidden="true" />
                      {ESTADO_LABEL[q.estado]}
                    </span>
                    {siguienteBtn(q)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Ficha
        q={actual}
        pedido={actual ? pedidos.get(actual.id) ?? null : null}
        conPedido={actual ? conPedido.has(actual.id) : false}
        ajustes={ajustes}
        pestana={pestana}
        onPestana={setPestana}
        onCerrar={() => setAbierta(null)}
        acciones={{
          mover,
          archivar,
          duplicar,
          releer,
          avisar,
          eliminar: async (q) => eliminar(q)
        }}
      />
    </div>
  );
}
