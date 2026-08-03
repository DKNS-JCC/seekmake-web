-- ============================================================================
-- Calculadora — rechazar solicitudes web desde la bandeja.
-- Los usuarios de la Calculadora solo tienen LECTURA de quotes (0017); este
-- RPC security definer les da la única escritura permitida: marcar una
-- solicitud activa como rechazada. Cualquier otro cambio sigue vetado.
-- ============================================================================

create or replace function public.calc_reject_quote(p_quote_id uuid)
returns table (ok boolean, estado text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if public.user_empresa() is distinct from '3dcc' and not public.is_admin() then
    raise exception 'Solo usuarios de 3DCC pueden rechazar solicitudes web.';
  end if;

  update public.quotes q
     set estado = 'rechazado'
   where q.id = p_quote_id
     and q.estado in ('nuevo', 'revisado', 'aceptado')
     and not q.archivado
  returning q.estado into v_estado;

  if v_estado is null then
    return query select false, null::text;
  else
    return query select true, v_estado;
  end if;
end;
$$;

grant execute on function public.calc_reject_quote(uuid) to authenticated;
