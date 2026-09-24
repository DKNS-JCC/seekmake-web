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
--    Los costes son los por defecto de la Calculadora: tras aplicar esto,
--    pulsa "Importar de la Calculadora" en /admin/tarifas y guarda.
--
-- 2. tasador_calibracion(): cruza cada presupuesto web con el pedido de la
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
