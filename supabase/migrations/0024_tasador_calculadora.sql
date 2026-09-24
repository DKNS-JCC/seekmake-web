-- ============================================================================
-- Tasador v4 — precio como la Calculadora + calibración con pedidos reales.
-- (docs/estimador-presupuestos.md)
--
-- 1. quote_settings: pasa el tasador al modo "calculadora". €/g y €/h dejan
--    de ser números a mano: la web los deriva de los costes de la
--    Calculadora (impresora, electricidad, €/kg) × (markup + error), igual
--    que el escritorio. Pedido mínimo 7 €, diseño/preparación no se cobra,
--    redondeo al alza a 0,05 € y sin descuentos por cantidad (las copias ya
--    se calculan compartiendo cama, como en el laminador).
--    Resistencias, calidades, acabados y envío se conservan tal cual.
--    Los costes se copian de la config real de la Calculadora (punto 2).
--
-- 2. Costes con una sola fuente (fase A de
--    docs/plan-sincronizacion-web-calculadora.md): al guardar la config de
--    3DCC en la Calculadora (empresa_docs), un trigger copia a la web la
--    impresora K1 (precio, vida, mantenimiento, consumo), el €/kWh y el €/kg
--    de cada material. Markup, error y post-procesado siguen siendo de la web.
--
-- 3. tasador_calibracion(): cruza cada presupuesto web con el pedido de la
--    Calculadora enlazado (orders.quote_id) → gramos/horas estimados por la
--    web frente a los reales de Orca. Solo admin. /admin/tarifas lo usa
--    para proponer la corrección de peso y tiempo.
-- ============================================================================

update public.quote_settings
set config = config || jsonb_build_object(
  'version', 2,
  'modo_precio', 'calculadora',
  'calculadora', coalesce(config -> 'calculadora', jsonb_build_object(
    'impresora_eur', 738,
    'mantenimiento_eur', 100,
    'vida_h', 3000,
    'consumo_kw', 0.15,
    'precio_kwh', 0.24,
    'precio_kg', jsonb_build_object(
      'PLA', 20, 'PETG', 18, 'PLA SILK/MARBLE', 23, 'ASA', 24, 'TPU', 21
    ),
    'markup', 2.3,
    'error', 0.25,
    'postpro_soportes_eur', 0
  )),
  'precio_minimo', 7,
  'tarifa_preparacion', 0,
  'redondeo', 0.05,
  'descuentos_cantidad', '[]'::jsonb,
  'orientacion_auto', true,
  'orientacion_tolerancia_pct', 3,
  'soporte_tipo', 'normal',
  'soporte_min_g', 1,
  'max_bed_mm', 220
)
where id = 1;

-- ---------------------------------------------------------------------------
-- Costes: Calculadora → web
-- ---------------------------------------------------------------------------
-- Número desde jsonb sin reventar con textos raros ("", "12,5", null).
create or replace function public.jsonb_num(v jsonb)
returns numeric
language sql
immutable
as $$
  select case
    when v is null or jsonb_typeof(v) = 'null' then null
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when (v #>> '{}') ~ '^\s*-?[0-9]+([.,][0-9]+)?\s*$'
      then replace(trim(v #>> '{}'), ',', '.')::numeric
    else null
  end;
$$;

create or replace function public.aplicar_costes_calculadora(cfg jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  imp jsonb;
  kg  jsonb;
  cal jsonb;
begin
  if cfg is null then
    return;
  end if;
  -- La web simula la K1 SE: su impresora si existe, si no la primera.
  select p into imp
    from jsonb_array_elements(coalesce(cfg -> 'printers', '[]'::jsonb)) p
   where p ->> 'name' ilike '%k1%'
   limit 1;
  if imp is null then
    imp := cfg -> 'printers' -> 0;
  end if;
  select coalesce(jsonb_object_agg(f ->> 'name', public.jsonb_num(f -> 'price_per_kg')), '{}'::jsonb)
    into kg
    from jsonb_array_elements(coalesce(cfg -> 'filament_types', '[]'::jsonb)) f
   where coalesce(f ->> 'name', '') <> ''
     and coalesce(public.jsonb_num(f -> 'price_per_kg'), 0) > 0;

  select coalesce(config -> 'calculadora', '{}'::jsonb) into cal
    from public.quote_settings where id = 1;
  if not found then
    return;
  end if;
  cal := cal
    || jsonb_strip_nulls(jsonb_build_object(
         'impresora_eur',     public.jsonb_num(imp -> 'price_eur'),
         'vida_h',            nullif(public.jsonb_num(imp -> 'depreciation_time_h'), 0),
         'mantenimiento_eur', public.jsonb_num(imp -> 'service_costs_life_eur'),
         'consumo_kw',        public.jsonb_num(imp -> 'energy_consumption_kwh'),
         'precio_kwh',        public.jsonb_num(cfg -> 'global_config' -> 'energy_cost_kwh'),
         'impresora',         imp ->> 'name'
       ))
    || jsonb_build_object(
         'precio_kg', coalesce(cal -> 'precio_kg', '{}'::jsonb) || kg,
         'sincronizado', to_jsonb(now())
       );
  update public.quote_settings
     set config = jsonb_set(config, '{calculadora}', cal)
   where id = 1;
end;
$$;

create or replace function public.sync_costes_calculadora()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empresa = '3dcc' and new.doc = 'config' then
    perform public.aplicar_costes_calculadora(new.data);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_costes_calculadora on public.empresa_docs;
create trigger sync_costes_calculadora
  after insert or update of data on public.empresa_docs
  for each row execute function public.sync_costes_calculadora();

-- Primera copia con la config que ya hay.
select public.aplicar_costes_calculadora(data)
  from public.empresa_docs
 where empresa = '3dcc' and doc = 'config';

-- ---------------------------------------------------------------------------
-- Estimación web vs pedido real
-- ---------------------------------------------------------------------------
-- En la Calculadora peso_g y horas son del pedido completo (todas las
-- unidades, como sale del laminador); en la web los archivos llevan cifras
-- por unidad, así que se multiplican por su cantidad.
create or replace function public.tasador_calibracion()
returns table (
  codigo       text,
  fecha        timestamptz,
  estimador    text,
  web_peso_g   numeric,
  web_tiempo_h numeric,
  web_precio   numeric,
  real_peso_g  numeric,
  real_horas   numeric,
  real_precio  numeric,
  impresora    text,
  material     text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.codigo,
    q.created_at,
    (
      select string_agg(distinct coalesce(a -> 'metricas' ->> 'estimador', 'aproximado'), ',')
      from jsonb_array_elements(q.archivos) a
    ),
    (
      select sum(
        nullif(a -> 'metricas' ->> 'peso_g', '')::numeric
        * coalesce(nullif(a ->> 'cantidad', '')::numeric, 1)
      )
      from jsonb_array_elements(q.archivos) a
    ),
    (
      select sum(
        nullif(a -> 'metricas' ->> 'tiempo_h', '')::numeric
        * coalesce(nullif(a ->> 'cantidad', '')::numeric, 1)
      )
      from jsonb_array_elements(q.archivos) a
    ),
    q.precio_total,
    nullif(o.data ->> 'peso_g', '')::numeric,
    nullif(o.data ->> 'horas', '')::numeric,
    nullif(o.data ->> 'precio_final', '')::numeric,
    o.data ->> 'impresora',
    o.data ->> 'filamento'
  from public.quotes q
  join public.orders o on o.quote_id = q.id
  where public.is_admin()
  order by q.created_at desc;
$$;

revoke all on function public.tasador_calibracion() from public;
grant execute on function public.tasador_calibracion() to authenticated;
