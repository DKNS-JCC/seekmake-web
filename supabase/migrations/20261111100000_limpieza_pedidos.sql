-- ============================================================================
-- Fase 4 del plan «Calculadora en la web»: limpieza automática de pedidos en
-- el servidor (hasta ahora la hacía la Calculadora al abrirse).
--
--   * Descarte: un presupuesto enviado («revisado») sin respuesta a los 15 días
--     pasa a «rechazado» (la etiqueta «Descartado» de la Calculadora; 0026 lo
--     baja solo al pedido).
--   * Archivado: un pedido entregado y cobrado entero se archiva a los 7 días
--     (el panel ya archiva al entregar si estaba cobrado; esto recoge los que
--     se cobran después). Se archiva también el pedido de taller.
--
-- Sin cambio de esquema: una función y su tarea de pg_cron. El recordatorio al
-- taller a los 3 y 7 días sin respuesta no manda correo (haría falta una Edge
-- Function nueva): lo enseña «Hoy» con los mismos plazos.
-- ============================================================================

create or replace function public.limpieza_pedidos()
returns table (descartados integer, archivados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desc integer;
  v_arch integer;
begin
  -- ponytail: updated_at = último toque de la quote (también lo mueven los
  -- cobros y las notas). Si molesta, guardar la fecha del envío del presupuesto.
  update public.quotes
     set estado = 'rechazado'
   where estado = 'revisado'
     and not archivado
     and updated_at < now() - interval '15 days';
  get diagnostics v_desc = row_count;

  -- Los CTE que modifican datos se ejecutan enteros aunque no se lean.
  with arch as (
    update public.quotes
       set archivado = true
     where estado = 'entregado'
       and pago = 'pagado'
       and not archivado
       and updated_at < now() - interval '7 days'
    returning id
  ), ord as (
    update public.orders o
       set data = jsonb_set(o.data, '{archived}', 'true'::jsonb)
     where o.quote_id in (select id from arch)
       and coalesce((o.data ->> 'archived')::boolean, false) = false
    returning 1
  )
  select count(*) into v_arch from arch;

  return query select v_desc, v_arch;
end;
$$;

-- Solo la ejecuta pg_cron (o el service role): ni anon ni un usuario normal.
revoke all on function public.limpieza_pedidos() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('limpieza-pedidos');
exception when others then
  raise notice 'pg_cron unschedule omitido: %', sqlerrm;
end $$;

do $$
begin
  perform cron.schedule('limpieza-pedidos', '10 5 * * *', 'select public.limpieza_pedidos()');
exception when others then
  raise notice 'pg_cron no disponible, limpieza de pedidos omitida: %', sqlerrm;
end $$;
