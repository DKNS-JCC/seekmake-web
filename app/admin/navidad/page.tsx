'use client';

import { useEffect, useState } from 'react';
import type { CampanaNavidad } from '@/lib/types';
import { Field, inputStyle } from '../_components/Field';
import { SaveButton, SaveState } from '../_components/SaveButton';
import { AdminCabecera } from '../_components/AdminNav';
import { mensajeDeError } from '@/lib/errors';
import { useAdminAuth, AccesoDenegado } from '../_components/useAdminAuth';
import { ErrorBanner } from '../_components/ErrorBanner';

// Plazas de la semana de la campaña. Productos, precios y fechas están en
// lib/campana-navidad.ts. La web lo recoge en el siguiente rebuild.
export default function AdminNavidad() {
  const [fila, setFila] = useState<CampanaNavidad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);
  const { authed, supabase } = useAdminAuth();

  useEffect(() => {
    supabase()
      .from('campana_navidad')
      .select('*')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(mensajeDeError(error, 'No se pudieron cargar las plazas'));
        setFila(data ?? null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(k: 'plazas_semana' | 'plazas_ocupadas', v: number) {
    if (!fila) return;
    setFila({ ...fila, [k]: Math.max(0, v) });
    setDirty(true);
    setState('idle');
  }

  async function save() {
    if (!fila) return;
    if (fila.plazas_ocupadas > fila.plazas_semana) {
      setError('No puede haber más plazas ocupadas que plazas de la semana');
      setState('error');
      return;
    }
    setState('saving');
    setError(null);
    const { error } = await supabase()
      .from('campana_navidad')
      .update({
        plazas_semana: fila.plazas_semana,
        plazas_ocupadas: fila.plazas_ocupadas,
        actualizado_el: new Date().toISOString()
      })
      .eq('id', true);
    if (error) {
      setError(mensajeDeError(error, 'No se pudieron guardar las plazas'));
      setState('error');
      return;
    }
    setState('saved');
    setDirty(false);
  }

  if (authed === false) return <AccesoDenegado />;

  const libres = fila ? fila.plazas_semana - fila.plazas_ocupadas : 0;

  return (
    <div style={{ maxWidth: 520 }}>
      <AdminCabecera titulo="Navidad" />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {fila ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Plazas esta semana" hint="El tope: 15">
              <input type="number" min={0} max={100} value={fila.plazas_semana}
                onChange={(e) => patch('plazas_semana', parseInt(e.target.value, 10) || 0)} style={inputStyle} />
            </Field>
            <Field label="Ya ocupadas">
              <input type="number" min={0} value={fila.plazas_ocupadas}
                onChange={(e) => patch('plazas_ocupadas', parseInt(e.target.value, 10) || 0)} style={inputStyle} />
            </Field>
          </div>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 18px' }}>
            La web dirá: <strong style={{ color: 'var(--text)' }}>
              {libres > 0 ? `quedan ${libres} plazas esta semana` : 'semana completa'}
            </strong>. El lunes, pon las ocupadas a 0.
          </p>
          <SaveButton onClick={save} state={state} dirty={dirty} />
        </>
      ) : (
        !error && <p style={{ color: 'var(--muted)' }}>Cargando…</p>
      )}
    </div>
  );
}
