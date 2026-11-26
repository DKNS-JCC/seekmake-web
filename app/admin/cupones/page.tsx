'use client';

import { useEffect, useState } from 'react';
import type { CuponRow } from '@/lib/types';
import { Field, inputStyle } from '../_components/Field';
import { useConfirm } from '../_components/useConfirm';
import { mensajeDeError } from '@/lib/errors';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { ErrorBanner } from '../_components/ErrorBanner';
import { AdminCabecera } from '../_components/AdminNav';
import { euros } from '@/lib/recibo/types';
import { enlaceCupon } from '@/lib/contacto';

// Códigos de descuento del tasador. Un uso = una solicitud con el código que
// no esté rechazada (validar_cupon). Un código usado no se borra: se apaga.
type Draft = Omit<CuponRow, 'created_at'>;
type Uso = { usos: number; descontado: number; facturado: number };

const vacio = (): Draft => ({
  codigo: '',
  tipo: 'pct',
  valor: 10,
  pedido_minimo: 0,
  max_usos: null,
  valido_hasta: null,
  activo: true,
  nota: ''
});

export default function AdminCupones() {
  const [cupones, setCupones] = useState<CuponRow[]>([]);
  const [usos, setUsos] = useState<Record<string, Uso>>({});
  const [draft, setDraft] = useState<Draft>(vacio());
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const { authed, supabase } = useAdminAuth();
  const { confirmar, dialogo } = useConfirm();

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const [c, q] = await Promise.all([
      supabase().from('cupones').select('*').order('created_at', { ascending: false }),
      supabase().from('quotes').select('cupon, estado, desglose, precio_total, precio_final').not('cupon', 'is', null)
    ]);
    if (c.error || q.error) setError(mensajeDeError(c.error ?? q.error, 'No se pudieron cargar los códigos'));
    setCupones(c.data ?? []);
    const u: Record<string, Uso> = {};
    for (const r of q.data ?? []) {
      if (!r.cupon || r.estado === 'rechazado') continue;
      const x = (u[r.cupon] ??= { usos: 0, descontado: 0, facturado: 0 });
      x.usos++;
      x.descontado += Number((r.desglose as { cupon_descuento?: number })?.cupon_descuento) || 0;
      x.facturado += Number(r.precio_final ?? r.precio_total) || 0;
    }
    setUsos(u);
  }

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const codigo = draft.codigo.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) {
      setError('El código: de 3 a 30 letras sin tilde, números, - o _.');
      return;
    }
    if (!(draft.valor > 0) || (draft.tipo === 'pct' && draft.valor > 100)) {
      setError(draft.tipo === 'pct' ? 'El % va de 1 a 100.' : 'El importe tiene que ser mayor que 0.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error } = await supabase()
      .from('cupones')
      .insert({ ...draft, codigo, nota: draft.nota?.trim() || null });
    setGuardando(false);
    if (error) {
      setError(
        error.code === '23505'
          ? `Ya existe el código ${codigo}.`
          : mensajeDeError(error, 'No se pudo crear el código')
      );
      return;
    }
    setDraft(vacio());
    refresh();
  }

  async function alternar(c: CuponRow) {
    const { error } = await supabase().from('cupones').update({ activo: !c.activo }).eq('codigo', c.codigo);
    if (error) setError(mensajeDeError(error, 'No se pudo cambiar el código'));
    refresh();
  }

  async function borrar(c: CuponRow) {
    if (!(await confirmar({ mensaje: `¿Borrar el código ${c.codigo}?`, detalle: 'No se puede deshacer.' }))) return;
    const { error } = await supabase().from('cupones').delete().eq('codigo', c.codigo);
    if (error) {
      setError(
        error.code === '23503'
          ? `${c.codigo} ya se ha usado en alguna solicitud: desactívalo en vez de borrarlo.`
          : mensajeDeError(error, 'No se pudo borrar el código')
      );
      return;
    }
    refresh();
  }

  if (authed === false) return <AccesoDenegado />;

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ maxWidth: 720 }}>
      {dialogo}
      <AdminCabecera titulo="Códigos de descuento">
        Se aplican en el tasador sobre el pedido ya con el mínimo, así que pueden dejarlo por debajo
        de él; el envío no se descuenta. No se suman al descuento por cantidad: gana el que deja
        menos que pagar. Para un importe fijo, pon un «Desde» para no regalar pedidos pequeños.
      </AdminCabecera>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <form onSubmit={crear} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 16px' }}>
          <Field label="Código">
            <input value={draft.codigo} onChange={(e) => patch('codigo', e.target.value.toUpperCase())}
              placeholder="NAVIDAD10" maxLength={30} style={{ ...inputStyle, fontFamily: 'monospace' }} />
          </Field>
          <Field label="Tipo">
            <select value={draft.tipo} onChange={(e) => patch('tipo', e.target.value as Draft['tipo'])} style={inputStyle}>
              <option value="pct">Porcentaje</option>
              <option value="fijo">Importe fijo</option>
            </select>
          </Field>
          <Field label={draft.tipo === 'pct' ? 'Descuento (%)' : 'Descuento (€)'}>
            {/* El navegador solo acepta min + n·step: min tiene que ser múltiplo del step. */}
            <input type="number" min={draft.tipo === 'pct' ? 1 : 0.05} max={draft.tipo === 'pct' ? 100 : undefined}
              step={draft.tipo === 'pct' ? 1 : 0.05} value={draft.valor}
              onChange={(e) => patch('valor', Number(e.target.value))} style={inputStyle} />
          </Field>
          <Field label="Desde (€ en piezas)" hint="0 = cualquier pedido">
            <input type="number" min={0} step={0.01} value={draft.pedido_minimo}
              onChange={(e) => patch('pedido_minimo', Number(e.target.value) || 0)} style={inputStyle} />
          </Field>
          <Field label="Usos máximos" hint="Vacío = sin límite">
            <input type="number" min={1} value={draft.max_usos ?? ''}
              onChange={(e) => patch('max_usos', e.target.value ? Math.max(1, parseInt(e.target.value, 10)) : null)} style={inputStyle} />
          </Field>
          <Field label="Último día" hint="Vacío = no caduca">
            <input type="date" min={hoy} value={draft.valido_hasta ?? ''}
              onChange={(e) => patch('valido_hasta', e.target.value || null)} style={inputStyle} />
          </Field>
        </div>
        <Field label="Nota interna">
          <input value={draft.nota ?? ''} onChange={(e) => patch('nota', e.target.value)}
            placeholder="Campaña de Instagram, cliente…" style={inputStyle} />
        </Field>
        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando ? 'Creando…' : 'Crear código'}
        </button>
      </form>

      {cupones.length === 0 && <p style={{ color: 'var(--muted)' }}>Aún no hay códigos.</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cupones.map((c) => {
          const u = usos[c.codigo] ?? { usos: 0, descontado: 0, facturado: 0 };
          const caducado = c.valido_hasta !== null && c.valido_hasta < hoy;
          const agotado = c.max_usos !== null && u.usos >= c.max_usos;
          const vivo = c.activo && !caducado && !agotado;
          return (
            <li key={c.codigo} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--r)', opacity: vivo ? 1 : 0.6 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px' }}>
                <strong style={{ fontFamily: 'monospace', fontSize: 16 }}>{c.codigo}</strong>
                <span>{c.tipo === 'pct' ? `-${c.valor}%` : `-${euros(Number(c.valor))}`}</span>
                {c.pedido_minimo > 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>desde {euros(Number(c.pedido_minimo))}</span>}
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {!c.activo ? 'desactivado' : caducado ? 'caducado' : agotado ? 'agotado' : 'activo'}
                  {c.valido_hasta && ` · hasta el ${new Date(c.valido_hasta + 'T12:00').toLocaleDateString('es-ES')}`}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                {u.usos}{c.max_usos ? ` / ${c.max_usos}` : ''} usos · −{euros(u.descontado)} descontados ·{' '}
                {euros(u.facturado)} en presupuestos
                {c.nota && <> · {c.nota}</>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn-outline" style={{ padding: '6px 12px', fontSize: 11 }}
                  onClick={() => navigator.clipboard?.writeText(enlaceCupon(c.codigo))}>
                  Copiar enlace
                </button>
                <button type="button" className="btn-outline" style={{ padding: '6px 12px', fontSize: 11 }} onClick={() => alternar(c)}>
                  {c.activo ? 'Desactivar' : 'Activar'}
                </button>
                {u.usos === 0 && (
                  <button type="button" className="btn-outline" style={{ padding: '6px 12px', fontSize: 11 }} onClick={() => borrar(c)}>
                    Borrar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
