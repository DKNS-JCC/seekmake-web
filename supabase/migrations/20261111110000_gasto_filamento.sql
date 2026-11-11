-- ============================================================================
-- Fase 5 del plan «Calculadora en la web»: gasto de filamento por color.
--
-- Es filamentUsageByColor + filamentSpendG/Eur de la Calculadora 7.2 hechos
-- vista: gramos de los pedidos con el material ya contabilizado (se apunta al
-- aceptar) más el ajuste manual de cada color (empresa_docs inventory,
-- filament_stock[].ajuste_g: purgas, fallos, bobina estropeada), y su
-- equivalente en euros al precio por kg vigente del material.
--
-- Solo gasto: ni stock restante ni umbral de compra. Sin cambios de esquema
-- (una vista). security_invoker: se ve lo que el usuario puede leer, y orders
-- y empresa_docs solo los lee el admin (20261110150000).
-- ============================================================================

create or replace view public.gasto_filamento
with (security_invoker = true)
as
with lineas as (
  -- Multimaterial: las líneas del desglose; si no, la línea única del pedido.
  select o.id,
         trim(b ->> 'material') as material,
         coalesce(nullif(trim(b ->> 'color'), ''), 'Negro') as color,
         greatest(0, coalesce(public.jsonb_num(b -> 'grams'), 0)) as g
    from public.orders o
   cross join lateral jsonb_array_elements(o.data -> 'material_breakdown') b
   where o.empresa = '3dcc'
     and coalesce((o.data ->> 'material_contabilizado')::boolean, false)
     and coalesce((o.data ->> 'is_multimaterial')::boolean, false)
     and jsonb_typeof(o.data -> 'material_breakdown') = 'array'
     and jsonb_array_length(o.data -> 'material_breakdown') > 0
  union all
  select o.id,
         trim(o.data ->> 'filamento'),
         coalesce(nullif(trim(o.data ->> 'filamento_color'), ''), 'Negro'),
         greatest(0, coalesce(public.jsonb_num(o.data -> 'peso_g'), 0))
    from public.orders o
   where o.empresa = '3dcc'
     and coalesce((o.data ->> 'material_contabilizado')::boolean, false)
     and not (
       coalesce((o.data ->> 'is_multimaterial')::boolean, false)
       and jsonb_typeof(o.data -> 'material_breakdown') = 'array'
       and jsonb_array_length(o.data -> 'material_breakdown') > 0
     )
),
uso as (
  select material, lower(color) as k, min(color) as color, sum(g) as g, count(distinct id) as pedidos
    from lineas
   where material <> '' and g > 0
   group by material, lower(color)
),
ajustes as (
  select trim(s ->> 'material') as material, lower(trim(s ->> 'color')) as k,
         trim(s ->> 'color') as color,
         greatest(0, coalesce(public.jsonb_num(s -> 'ajuste_g'), 0)) as ajuste_g
    from public.empresa_docs d
   cross join lateral jsonb_array_elements(
          case when jsonb_typeof(d.data -> 'filament_stock') = 'array' then d.data -> 'filament_stock' else '[]'::jsonb end) s
   where d.empresa = '3dcc' and d.doc = 'inventory'
),
catalogo as (
  select f.material, lower(c.nombre) as k, c.nombre as color
    from public.filamentos f
    join public.colores c on c.filamento_id = f.id
),
claves as (
  select material, k from uso
  union select material, k from ajustes where material <> ''
  union select material, k from catalogo
),
precios as (
  select trim(t ->> 'name') as material, public.jsonb_num(t -> 'price_per_kg') as precio_kg
    from public.empresa_docs d
   cross join lateral jsonb_array_elements(
          case when jsonb_typeof(d.data -> 'filament_types') = 'array' then d.data -> 'filament_types' else '[]'::jsonb end) t
   where d.empresa = '3dcc' and d.doc = 'config'
)
select c.material,
       coalesce(cat.color, a.color, u.color) as color,
       round(coalesce(u.g, 0), 2) as en_pedidos_g,
       coalesce(u.pedidos, 0)::integer as pedidos,
       coalesce(a.ajuste_g, 0) as ajuste_g,
       round(coalesce(u.g, 0) + coalesce(a.ajuste_g, 0), 2) as total_g,
       coalesce(p.precio_kg, 0) as precio_kg,
       round((coalesce(u.g, 0) + coalesce(a.ajuste_g, 0)) * coalesce(p.precio_kg, 0) / 1000, 2) as equivale_eur
  from claves c
  left join uso u on u.material = c.material and u.k = c.k
  left join ajustes a on a.material = c.material and a.k = c.k
  left join catalogo cat on lower(cat.material) = lower(c.material) and cat.k = c.k
  left join precios p on lower(p.material) = lower(c.material);

revoke all on public.gasto_filamento from public, anon;
grant select on public.gasto_filamento to authenticated;
