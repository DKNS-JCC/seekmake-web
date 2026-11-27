-- El pedido que nace de una solicitud web con varios materiales o colores
-- lleva también el desglose de la Calculadora 7.2 (is_multimaterial +
-- material_breakdown), sacado de data.piezas (20261112100000).
--
-- Sin él, todo lo que lee el desglose veía una sola línea con el texto
-- aplanado de filamento («TPU, PLA») y el primer color: «Editar y recalcular»
-- caía en PLA negro, y el gasto de filamento apuntaba los gramos a un
-- material que no existe.
--
-- Se envuelve quote_a_order_data otra vez (como cupones y pedido_piezas) y se
-- corrigen los pedidos web que aún no lo tienen y no se han guardado desde el
-- encargo (markup_label lo escribe camposPedido: el desglose ya es el suyo).

-- Líneas {material, color, grams} de data.piezas: gramos = peso × unidades,
-- sumados por material y color, en el orden en que aparecen.
-- ponytail: una pieza de varias partes reparte sus gramos a partes iguales
-- entre sus colores (el tasador no da gramos por parte); afinar si el
-- tasador llega a medir cada parte.
create or replace function public.desglose_de_piezas(p_piezas jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('material', material, 'color', color, 'grams', grams) order by orden), '[]'::jsonb)
    from (
      select material, color, round(sum(g), 2) as grams, min(orden) as orden
        from (
          select trim(coalesce(p ->> 'material', '')) as material,
                 trim(coalesce(c ->> 'nombre', '')) as color,
                 coalesce(public.jsonb_num(p -> 'peso_g'), 0)
                   * greatest(1, coalesce(public.jsonb_num(p -> 'cantidad'), 1))
                   / greatest(1, jsonb_array_length(k.cols)) as g,
                 i * 1000 + coalesce(n, 0) as orden
            from jsonb_array_elements(
                   case when jsonb_typeof(p_piezas) = 'array' then p_piezas else '[]'::jsonb end
                 ) with ordinality x(p, i)
           cross join lateral (
                 select case when jsonb_typeof(p -> 'colores') = 'array' then p -> 'colores' else '[]'::jsonb end as cols
               ) k
            left join lateral jsonb_array_elements(k.cols) with ordinality y(c, n) on true
        ) l
       where material <> '' and g > 0
       group by material, color
    ) t;
$$;

do $r$
begin
  if not exists (select 1 from pg_proc where proname = 'quote_a_order_data_piezas') then
    alter function public.quote_a_order_data(uuid, text) rename to quote_a_order_data_piezas;
  end if;
end
$r$;

create or replace function public.quote_a_order_data(p_quote_id uuid, p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d jsonb := public.quote_a_order_data_piezas(p_quote_id, p_order_id);
  b jsonb;
begin
  if d is null then
    return d;
  end if;
  b := public.desglose_de_piezas(d -> 'piezas');
  -- Una sola línea: filamento y filamento_color ya la cuentan bien.
  if jsonb_array_length(b) > 1 then
    d := d || jsonb_build_object('is_multimaterial', true, 'material_breakdown', b);
  end if;
  return d;
end;
$$;

-- Pedidos que ya existen (también los duplicados, que copian data tal cual).
update public.orders o
   set data = o.data || jsonb_build_object(
         'is_multimaterial', true,
         'material_breakdown', public.desglose_de_piezas(o.data -> 'piezas'))
 where o.empresa = '3dcc'
   and jsonb_typeof(o.data -> 'piezas') = 'array'
   and not coalesce((o.data ->> 'is_multimaterial')::boolean, false)
   and not (o.data ? 'markup_label')
   and jsonb_array_length(public.desglose_de_piezas(o.data -> 'piezas')) > 1;
