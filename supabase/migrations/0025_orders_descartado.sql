-- ============================================================================
-- Estado 'Descartado' en la Calculadora → 'rechazado' en la quote web.
--
-- La Calculadora auto-descarta los pedidos que llevan 15 días en
-- 'Presupuesto enviado' sin respuesta del cliente. Sin este mapeo,
-- map_order_estado_to_quote() devolvía null para 'Descartado' y la quote
-- enlazada se quedaba en 'revisado' para siempre — el cliente seguía viendo
-- su presupuesto como vivo en /presupuesto.
--
-- Solo se toca la función de mapeo: el trigger project_order_to_quote (0017)
-- ya la usa y sigue igual.
-- ============================================================================

create or replace function public.map_order_estado_to_quote(e text)
returns text
language sql
immutable
as $$
  select case e
    when 'Presupuesto enviado' then 'revisado'
    when 'Aceptado'            then 'aceptado'
    when 'En producción'       then 'imprimiendo'
    when 'Post-procesado'      then 'imprimiendo'
    when 'Listo para entregar' then 'listo'
    when 'Entregado'           then 'entregado'
    when 'Descartado'          then 'rechazado'
    else null                  -- estados desconocidos/legado: no tocar la quote
  end;
$$;
