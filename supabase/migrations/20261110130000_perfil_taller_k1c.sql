-- ============================================================================
-- Fase 1 del plan Calculadora → web: banco de pruebas real
--
-- 1. El perfil que simula el estimador pasa a ser el del taller (K1C 0.4,
--    "SUNLU PLA+ - Tuned", proyecto calicat.3mf de OrcaSlicer 2.5.0-dev).
--    Vive en quote_settings, no en el código: se cambia desde /admin/tarifas.
--    Solo se tocan los campos que el taller ha dado; el resto se queda como
--    esté (por defecto, el preset K1 SE de lib/quote/estimador/perfil.ts).
--      pared interior 300 → 250 mm/s · superficie superior 150 → 200 mm/s
--      aceleración pared exterior 5000 → 3000 · soportes de árbol
--      PLA: densidad 1,23 · flujo 0,987 · caudal máx. 12 mm³/s · capa mín. 4 s
--
-- 2. tasador_tipos(): tipo de pieza de cada presupuesto (sin soportes / con
--    soportes / multicolor / lote) para medir la precisión por tipo, no en
--    global. Función aparte para no cambiar el tipo devuelto de
--    tasador_calibracion() (0024), que otras migraciones re-aplican.
-- ============================================================================

update public.quote_settings
set config = config || jsonb_build_object(
  'soporte_tipo', 'arbol',
  'perfil', coalesce(config -> 'perfil', '{}'::jsonb) || jsonb_build_object(
    'vParedInt', 250,
    'vSuperior', 200,
    'aParedExt', 3000,
    -- Como lamina el taller (wall_loops, top/bottom_shell_layers de sus proyectos).
    -- Medido con 18 proyectos laminados: sin esto el estimador da ~8 % de gramos de más.
    'paredes', 2,
    'capasSuperiores', 5,
    'capasInferiores', 3
  ),
  'materiales', jsonb_set(
    coalesce(config -> 'materiales', '{}'::jsonb),
    '{PLA}',
    coalesce(config -> 'materiales' -> 'PLA', '{}'::jsonb) || jsonb_build_object(
      'densidad', 1.23,
      'flujo', 0.987,
      'vol_max', 12,
      'tiempo_min_capa', 4
    )
  )
)
where id = 1;

create or replace function public.tasador_tipos()
returns table (codigo text, tipo text)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.codigo,
    -- Un solo tipo por presupuesto; manda el más difícil de acertar.
    case
      when exists (
        select 1 from jsonb_array_elements(q.archivos) a
        where (select count(distinct c ->> 'nombre')
               from jsonb_array_elements(coalesce(a -> 'colores', '[]'::jsonb)) c) > 1
      ) then 'multicolor'
      when exists (
        select 1 from jsonb_array_elements(q.archivos) a
        where coalesce(nullif(a ->> 'cantidad', '')::numeric, 1) > 1
      ) then 'lote'
      when exists (
        select 1 from jsonb_array_elements(q.archivos) a
        where a -> 'metricas' ->> 'con_soportes' = 'true'
      ) then 'con soportes'
      else 'sin soportes'
    end
  from public.quotes q
  where public.is_admin();
$$;

revoke all on function public.tasador_tipos() from public;
grant execute on function public.tasador_tipos() to authenticated;
