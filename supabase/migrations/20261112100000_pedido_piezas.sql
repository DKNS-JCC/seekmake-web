-- Fase 8, paso 3: el pedido que nace de una solicitud web conserva el
-- detalle de cada pieza (nombre, unidades, material, colores, gramos y horas
-- por unidad), además de los totales aplanados que ya llevaba (peso_g,
-- horas, filamento, filamento_color), que la Calculadora 7.2 sigue leyendo.
--
-- data.piezas sale de quotes.archivos, donde submit-quote ya guarda por pieza
-- las cifras con las que puso el precio. Se envuelve la función de
-- 20261108120000_cupones (que a su vez envuelve la de 0027) en vez de
-- copiarla: crear_order_para_quote la busca por nombre y recibe esta.
--
-- Solo para pedidos nuevos: los que ya existen no se tocan.

do $r$
begin
  if not exists (select 1 from pg_proc where proname = 'quote_a_order_data_cupon') then
    alter function public.quote_a_order_data(uuid, text) rename to quote_a_order_data_cupon;
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
  d       jsonb := public.quote_a_order_data_cupon(p_quote_id, p_order_id);
  v_piezas jsonb;
begin
  if d is null then
    return d;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'nombre',   coalesce(a ->> 'nombre', ''),
           'cantidad', greatest(1, coalesce(public.jsonb_num(a -> 'cantidad'), 1))::integer,
           'material', coalesce(nullif(a ->> 'material', ''), q.material),
           'colores',  coalesce((
                         select jsonb_agg(jsonb_build_object(
                                  'nombre', c ->> 'nombre',
                                  'hex',    c ->> 'hex',
                                  'parte',  coalesce(c ->> 'parte', '')) order by n)
                           from jsonb_array_elements(
                                  case when jsonb_typeof(a -> 'colores') = 'array'
                                       then a -> 'colores' else '[]'::jsonb end
                                ) with ordinality col(c, n)
                       ), '[]'::jsonb),
           'peso_g',   public.jsonb_num(a -> 'metricas' -> 'peso_g'),
           'horas',    public.jsonb_num(a -> 'metricas' -> 'tiempo_h'),
           'metodo',   a -> 'metricas' ->> 'estimador'
         ) order by i), '[]'::jsonb)
    into v_piezas
    from public.quotes q,
         jsonb_array_elements(
           case when jsonb_typeof(q.archivos) = 'array' then q.archivos else '[]'::jsonb end
         ) with ordinality x(a, i)
   where q.id = p_quote_id;
  return d || jsonb_build_object('piezas', v_piezas);
end;
$$;
