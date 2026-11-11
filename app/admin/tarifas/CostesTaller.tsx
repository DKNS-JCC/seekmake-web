'use client';

// Ajustes → Precios: los costes del taller que usa «Nuevo encargo» (los de la
// Calculadora: empresa_docs 3dcc/config). Solo se tocan las claves de aquí
// (impresoras, €/kg, luz, mano de obra, mínimo): el resto del documento se
// conserva tal cual, porque la Calculadora 7.2 guarda el mismo.
//
// Al guardar, un trigger copia los costes de impresión al tasador (0024).

import { useEffect, useMemo, useState } from 'react';
import { mensajeDeError } from '@/lib/errors';
import { euros } from '@/lib/recibo/types';
import { parseNumero } from '@/lib/quote/formatos';
import { calcularEncargo, riesgoDe, type ConfigCalculadora } from '@/lib/quote/encargo';
import { Field } from '../_components/Field';
import { CampoNumero } from '../_components/Campos';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { ErrorBanner } from '../_components/ErrorBanner';
import { useAdminAuth } from '../_components/useAdminAuth';

type Doc = Record<string, any>;
const txt = (n: unknown) => (n === undefined || n === null || n === '' ? '' : String(n).replace('.', ','));
const num = (s: string) => {
  const n = parseNumero(s);
  return n === null || Number.isNaN(n) ? 0 : n;
};

export function CostesTaller({ errorDefecto }: { errorDefecto: number }) {
  const { supabase } = useAdminAuth();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [vacio, setVacio] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [save, setSave] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase()
      .from('empresa_docs')
      .select('data')
      .eq('empresa', '3dcc')
      .eq('doc', 'config')
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) setError(mensajeDeError(err, 'No se pudieron leer los costes del taller'));
        else if (!data?.data?.printers) setVacio(true);
        else setDoc(data.data as Doc);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editar = (fn: (d: Doc) => void) => {
    setDoc((d) => {
      if (!d) return d;
      const c = structuredClone(d);
      fn(c);
      return c;
    });
    setDirty(true);
    setSave('idle');
  };

  // Ejemplo vivo: 50 g y 2 h en la primera impresora, con el primer material.
  const ejemplo = useMemo(() => {
    if (!doc?.printers?.length || !doc?.filament_types?.length) return null;
    const p = doc.printers.find((x: Doc) => /k1/i.test(x.name)) ?? doc.printers[0];
    try {
      const r = calcularEncargo(
        {
          impresora: p.name,
          lineas: [{ material: doc.filament_types[0].name, color: '', gramos: 50 }],
          horas: 2, cantidad: 1, diseno: 'No necesario', disenoHoras: 0,
          postprocesado: 'Limpio', riesgo: riesgoDe(errorDefecto), urgente: false, gastoExtra: 0
        },
        doc as ConfigCalculadora
      );
      return `Un encargo de 50 g y 2 h en ${p.name} (${doc.filament_types[0].name}): coste ${euros(r.costeImpresion)}, precio ${euros(r.precio)}.`;
    } catch {
      return null;
    }
  }, [doc, errorDefecto]);

  async function guardar() {
    if (!doc) return;
    setSave('saving');
    setError(null);
    // Se relee y se mezclan solo las claves de aquí: la Calculadora pudo guardar entre medias.
    const { data: fresco, error: e1 } = await supabase().from('empresa_docs').select('data').eq('empresa', '3dcc').eq('doc', 'config').maybeSingle();
    if (e1 || !fresco) {
      setError(mensajeDeError(e1, 'No se pudo guardar'));
      return setSave('error');
    }
    const nuevo = {
      ...(fresco.data as Doc),
      printers: doc.printers,
      filament_types: doc.filament_types,
      global_config: { ...(fresco.data as Doc).global_config, ...doc.global_config }
    };
    const { error: e2 } = await supabase().from('empresa_docs').update({ data: nuevo }).eq('empresa', '3dcc').eq('doc', 'config');
    if (e2) {
      setError(mensajeDeError(e2, 'No se pudieron guardar los costes del taller'));
      return setSave('error');
    }
    setDoc(nuevo);
    setDirty(false);
    setSave('saved');
  }

  if (vacio) return <section className="adm-card"><h2 className="adm-card-titulo">Costes del taller</h2><p className="pq-nota">No hay configuración de la Calculadora para 3DCC.</p></section>;
  if (!doc) return error ? <ErrorBanner>{error}</ErrorBanner> : <p style={{ color: 'var(--muted)' }}>Cargando…</p>;
  const gc: Doc = doc.global_config ?? {};
  const setGc = (k: string, v: string) => editar((d) => { d.global_config = { ...d.global_config, [k]: num(v) }; });

  return (
    <section className="adm-card" aria-labelledby="ct-t">
      <h2 id="ct-t" className="adm-card-titulo">Costes del taller (encargos a medida)</h2>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div className="ct-rejilla">
        <Field label="Electricidad"><CampoNumero value={txt(gc.energy_cost_kwh)} onChange={(v) => setGc('energy_cost_kwh', v)} unidad="€/kWh" /></Field>
        <Field label="Mano de obra: diseño"><CampoNumero value={txt(gc.labor_cost_h)} onChange={(v) => setGc('labor_cost_h', v)} unidad="€/h" /></Field>
        <Field label="Mano de obra: post-procesado"><CampoNumero value={txt(gc.postproc_cost_h)} onChange={(v) => setGc('postproc_cost_h', v)} unidad="€/h" /></Field>
        <Field label="Precio mínimo de un encargo"><CampoNumero value={txt(gc.precio_minimo)} onChange={(v) => setGc('precio_minimo', v)} unidad="€" /></Field>
      </div>

      <h3 className="ct-sub">Materiales</h3>
      <div className="ct-rejilla">
        {doc.filament_types.map((t: Doc, i: number) => (
          <Field key={t.name} label={t.name}>
            <CampoNumero value={txt(t.price_per_kg)} unidad="€/kg" onChange={(v) => editar((d) => { d.filament_types[i].price_per_kg = num(v); })} />
          </Field>
        ))}
      </div>

      <h3 className="ct-sub">Impresoras</h3>
      {doc.printers.map((p: Doc, i: number) => {
        const set = (k: string) => (v: string) => editar((d) => { d.printers[i][k] = num(v); });
        const vida = Math.max(1, Number(p.depreciation_time_h) || 1);
        const porHora = (Number(p.energy_consumption_kwh) || 0) * (Number(gc.energy_cost_kwh) || 0) + ((Number(p.price_eur) || 0) + (Number(p.service_costs_life_eur) || 0)) / vida;
        return (
          <fieldset key={p.name} className="ct-impresora">
            <legend>{p.name} <span className="adm-num">= {euros(porHora)}/h</span></legend>
            <div className="ct-rejilla">
              <Field label="Precio"><CampoNumero value={txt(p.price_eur)} onChange={set('price_eur')} unidad="€" /></Field>
              <Field label="Vida útil"><CampoNumero value={txt(p.depreciation_time_h)} onChange={set('depreciation_time_h')} unidad="h" /></Field>
              <Field label="Mantenimiento"><CampoNumero value={txt(p.service_costs_life_eur)} onChange={set('service_costs_life_eur')} unidad="€" /></Field>
              <Field label="Consumo"><CampoNumero value={txt(p.energy_consumption_kwh)} onChange={set('energy_consumption_kwh')} unidad="kW" /></Field>
            </div>
          </fieldset>
        );
      })}

      {ejemplo && <p className="ct-ejemplo" aria-live="polite">{ejemplo}</p>}
      <div className="ct-pie">
        <span>{dirty ? 'Cambios sin guardar.' : save === 'saved' ? 'Costes guardados.' : ''}</span>
        <SaveButton onClick={guardar} state={save} dirty={dirty} label="Guardar costes" />
      </div>
    </section>
  );
}
