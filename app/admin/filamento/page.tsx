'use client';

// Taller → Filamento gastado: gramos y euros por color, de los pedidos con el
// material ya apuntado (al aceptarlos) más un ajuste manual por color. Solo
// gasto: sin stock restante ni umbral de compra. Lo calcula la vista SQL
// gasto_filamento; el ajuste vive en empresa_docs 3dcc/inventory
// (filament_stock[].ajuste_g), el mismo sitio que lee la Calculadora 7.2.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { mensajeDeError } from '@/lib/errors';
import { euros } from '@/lib/recibo/types';
import { formatGramos, formatNumero, parseNumero } from '@/lib/quote/formatos';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { AdminCabecera } from '../_components/AdminNav';
import { ErrorBanner } from '../_components/ErrorBanner';
import { CampoNumero } from '../_components/Campos';

type Fila = {
  material: string;
  color: string;
  en_pedidos_g: number;
  pedidos: number;
  ajuste_g: number;
  total_g: number;
  precio_kg: number;
  equivale_eur: number;
};

const clave = (f: Pick<Fila, 'material' | 'color'>) => `${f.material}|${f.color.toLowerCase()}`;

export default function AdminFilamento() {
  const { authed, supabase } = useAdminAuth();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Texto tecleado por fila (el ajuste); guarda al salir del campo.
  const [texto, setTexto] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const aviso = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function cargar() {
    setError(null);
    const { data, error: err } = await supabase().from('gasto_filamento').select('*');
    if (err) {
      setError(mensajeDeError(err, 'No se pudo leer el gasto de filamento'));
      setFilas([]);
      return;
    }
    const f = ((data ?? []) as unknown as Fila[]).map((r) => ({
      ...r,
      en_pedidos_g: Number(r.en_pedidos_g), ajuste_g: Number(r.ajuste_g), total_g: Number(r.total_g),
      precio_kg: Number(r.precio_kg), equivale_eur: Number(r.equivale_eur)
    }));
    setFilas(f);
    setTexto(Object.fromEntries(f.map((r) => [clave(r), r.ajuste_g ? formatNumero(r.ajuste_g) : ''])));
  }

  useEffect(() => {
    if (authed) void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  async function guardarAjuste(f: Fila) {
    const k = clave(f);
    const n = parseNumero(texto[k] ?? '');
    if (n !== null && Number.isNaN(n)) return setError('No entiendo ese número. Prueba con 40 o 12,5.');
    const g = Math.max(0, n ?? 0);
    if (g === f.ajuste_g) return;
    setTrabajando(k);
    setError(null);
    try {
      // Se relee el inventario y se toca solo esta entrada: la Calculadora pudo guardar entre medias.
      const { data: doc, error: e1 } = await supabase().from('empresa_docs').select('data').eq('empresa', '3dcc').eq('doc', 'inventory').maybeSingle();
      if (e1) throw e1;
      const inv = (doc?.data ?? {}) as { filament_stock?: { material: string; color: string; ajuste_g?: number }[] };
      const stock = [...(inv.filament_stock ?? [])];
      const i = stock.findIndex((s) => s.material === f.material && String(s.color).trim().toLowerCase() === f.color.toLowerCase());
      if (i >= 0) stock[i] = { ...stock[i], ajuste_g: g };
      else stock.push({ material: f.material, color: f.color, ajuste_g: g });
      const { error: e2 } = await supabase()
        .from('empresa_docs')
        .upsert({ empresa: '3dcc', doc: 'inventory', data: { ...inv, filament_stock: stock } });
      if (e2) throw e2;
      await cargar();
      setGuardado(k);
      if (aviso.current) clearTimeout(aviso.current);
      aviso.current = setTimeout(() => setGuardado(null), 2000);
    } catch (e) {
      setError(mensajeDeError(e as { message?: string }, 'No se pudo guardar el ajuste'));
    } finally {
      setTrabajando(null);
    }
  }

  const orden = useMemo(
    () => [...(filas ?? [])].sort((a, b) => b.total_g - a.total_g || a.material.localeCompare(b.material) || a.color.localeCompare(b.color)),
    [filas]
  );
  if (authed === false) return <AccesoDenegado />;

  const total = orden.reduce((s, f) => s + f.total_g, 0);
  const eur = orden.reduce((s, f) => s + f.equivale_eur, 0);
  const conGasto = orden.filter((f) => f.total_g > 0).length;

  return (
    <div>
      <AdminCabecera titulo="Filamento gastado">
        Lo que se ha gastado de cada color: los pedidos aceptados más tu ajuste. Los colores se dan de alta en{' '}
        <Link href="/admin/filamentos" style={{ color: 'var(--accent)' }}>Web → Filamentos y colores</Link>.
      </AdminCabecera>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {filas === null && !error ? (
        <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      ) : (
        <>
          <div className="hoy-kpis">
            <div><span>{formatGramos(total)}</span>gastado</div>
            <div><span>{euros(eur)}</span>equivale a</div>
            <div><span>{orden.length}</span>{orden.length === 1 ? 'color' : 'colores'} · {conGasto} con gasto</div>
          </div>
          {total <= 0 && <p className="hoy-vacio">Aún no hay gasto apuntado. Se suma solo al aceptar pedidos.</p>}
          {orden.length > 0 && (
            <table className="adm-tabla">
              <thead>
                <tr>
                  <th>Color</th>
                  <th>Material</th>
                  <th style={{ textAlign: 'right' }}>En pedidos</th>
                  <th title="Purgas, fallos, bobina estropeada.">
                    Ajuste <span style={{ textTransform: 'none', letterSpacing: 0 }}>(purgas, fallos…)</span>
                  </th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Equivale</th>
                </tr>
              </thead>
              <tbody>
                {orden.map((f) => {
                  const k = clave(f);
                  return (
                    <tr key={k}>
                      <td className="fil-color">{f.color}</td>
                      <td data-label="Material">{f.material}</td>
                      <td data-label="En pedidos" className="adm-num">
                        {f.en_pedidos_g > 0 ? formatGramos(f.en_pedidos_g) : '—'}
                        {f.pedidos > 0 && <small className="fil-n"> · {f.pedidos} ped.</small>}
                      </td>
                      <td data-label="Ajuste">
                        <span className="fil-ajuste">
                          <CampoNumero
                            value={texto[k] ?? ''}
                            unidad="g"
                            aria-label={`Ajuste de ${f.color} ${f.material}, en gramos`}
                            placeholder="0"
                            disabled={trabajando === k}
                            enterKeyHint="done"
                            onChange={(v) => setTexto((t) => ({ ...t, [k]: v }))}
                            onBlur={() => void guardarAjuste(f)}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          />
                          <span className="fil-ok" role="status" aria-live="polite">{guardado === k ? '✓' : ''}</span>
                        </span>
                      </td>
                      <td data-label="Total" className="adm-num"><strong>{f.total_g > 0 ? formatGramos(f.total_g) : '—'}</strong></td>
                      <td data-label="Equivale" className="adm-num">{f.total_g > 0 ? euros(f.equivale_eur) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
