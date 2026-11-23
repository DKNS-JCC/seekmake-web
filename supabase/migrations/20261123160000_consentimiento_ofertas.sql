-- Casilla «Quiero recibir ofertas» en el tasador, y la audiencia de las
-- campañas pasa a respetarla.
--
--   * quotes.acepta_ofertas: true/false desde que existe la casilla; null en
--     las solicitudes anteriores (no se les preguntó).
--   * Audiencia = quien marcó la casilla + clientes con un pedido de 3DCC
--     aceptado (art. 21.2 LSSI: ya nos compraron). Fuera quien solo pidió
--     precio sin marcarla (también antes de que existiera), quien la dejó sin
--     marcar en su última solicitud y las bajas. Antes entraba todo el que
--     pidió precio, porque cada solicitud crea su pedido en «Nuevo».

alter table public.quotes add column if not exists acepta_ofertas boolean;

create or replace function public.campana_audiencia()
returns table (email text, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  with eleccion as (
    -- Lo último que dijo cada email en la casilla.
    select distinct on (lower(trim(q.email))) lower(trim(q.email)) as email, q.acepta_ofertas
      from public.quotes q
     where q.acepta_ofertas is not null
     order by lower(trim(q.email)), q.created_at desc
  )
  select distinct on (e.email) e.email, e.nombre
    from (
      select lower(trim(q.email)) as email, q.nombre, q.created_at
        from public.quotes q
       where q.acepta_ofertas
         and q.nombre !~* '^\s*test\s*$'
      union all
      select lower(trim(o.data ->> 'cliente_email')), o.data ->> 'cliente', o.created_at
        from public.orders o
       where o.empresa = '3dcc'
         -- Cada solicitud web crea su pedido en «Nuevo» (0027): cliente es
         -- quien aceptó, el mismo corte que material_contabilizado.
         and coalesce(o.data ->> 'estado', 'Nuevo') not in ('Nuevo', 'Presupuesto enviado', 'Descartado')
    ) e
   where (public.is_admin() or auth.role() = 'service_role')
     and e.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
     and not exists (select 1 from public.email_bajas b where b.email = e.email)
     and not exists (select 1 from eleccion c where c.email = e.email and not c.acepta_ofertas)
   order by e.email, e.created_at desc;
$$;

revoke all on function public.campana_audiencia() from public, anon;
grant execute on function public.campana_audiencia() to authenticated, service_role;
