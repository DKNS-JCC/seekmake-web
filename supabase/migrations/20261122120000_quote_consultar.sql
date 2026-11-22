-- Pedidos grandes "a consultar" (submit-quote guarda desglose.consultar):
-- la página de estado no enseña la cifra automática, solo "por confirmar".
-- Cambia el tipo de retorno: hay que borrarla y crearla de nuevo.

drop function if exists public.get_quote_detalle(text);

create function public.get_quote_detalle(p_codigo text)
returns table (codigo text, origen text, descripcion text, consultar boolean)
language sql
stable
security definer
set search_path = public
as $$
  select q.codigo, q.origen, q.descripcion,
         coalesce((q.desglose->>'consultar')::boolean, false)
    from public.quotes q
   where q.codigo = upper(trim(p_codigo))
     and not q.archivado
   limit 1;
$$;

grant execute on function public.get_quote_detalle(text) to anon, authenticated;
