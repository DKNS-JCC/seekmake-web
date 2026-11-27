-- ============================================================================
-- Fuera la carpeta «Archivados» del panel: cada pedido vive solo en su estado.
-- «Activos» ya deja fuera los entregados y los descartados, así que eso es el
-- archivo. La columna archivado se queda (la usan las vistas públicas y la
-- Calculadora), pero el panel ya no la mira.
--
--   * Los archivados que no estaban entregados ni descartados se recolocan:
--     cobrados → entregados; el resto → descartados.
--   * Una quote de la Calculadora que se queda huérfana (pedido borrado o
--     reenlazado) pasa además a descartada, para que no salga en «Activos».
-- ============================================================================

update public.quotes
   set estado = case when pago = 'pagado' then 'entregado' else 'rechazado' end
 where archivado
   and estado not in ('entregado', 'rechazado');

create or replace function public.archivar_quote_huerfana()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.quote_id is not null
     and (tg_op = 'DELETE' or new.quote_id is distinct from old.quote_id) then
    update public.quotes
       set archivado = true,
           estado = case when estado in ('entregado', 'rechazado') then estado else 'rechazado' end
     where id = old.quote_id and origen = 'calculadora' and not archivado;
  end if;
  return null;
end;
$$;
