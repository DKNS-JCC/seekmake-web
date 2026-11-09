-- ============================================================================
-- Campañas por email (/admin/campanas).
--
--   * Audiencia = emails de las solicitudes del tasador y de los pedidos de
--     3DCC (nunca SILAB3D), sin repetir, menos los que se dieron de baja.
--   * Un correo por destinatario (nunca CCO), cada uno con su enlace de baja
--     y List-Unsubscribe de un clic (lo exigen Gmail y Yahoo).
--   * campana_envios es el registro y también el seguro contra dobles envíos:
--     reenviar una campaña solo manda a quien aún no la recibió.
--   * Las bajas las escribe solo la función campana-baja (service role).
-- ============================================================================

create table if not exists public.email_bajas (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create table if not exists public.campanas (
  id         uuid primary key default gen_random_uuid(),
  asunto     text not null check (length(trim(asunto)) between 1 and 150),
  -- Markdown con {{nombre}}, {{cupon}} y {{enlace_cupon}}; html es lo mismo
  -- ya renderizado por el admin (la función solo sustituye las variables).
  cuerpo     text not null,
  html       text not null,
  cupon      text references public.cupones (codigo) on update cascade,
  estado     text not null default 'borrador' check (estado in ('borrador', 'enviando', 'enviada')),
  created_at timestamptz not null default now(),
  enviada_at timestamptz
);

create table if not exists public.campana_envios (
  campana_id uuid not null references public.campanas (id) on delete cascade,
  email      text not null,
  ok         boolean not null,
  error      text,
  created_at timestamptz not null default now(),
  primary key (campana_id, email)
);

alter table public.email_bajas enable row level security;
alter table public.campanas enable row level security;
alter table public.campana_envios enable row level security;

drop policy if exists "email_bajas: admin read" on public.email_bajas;
create policy "email_bajas: admin read" on public.email_bajas
  for select using (public.is_admin());
drop policy if exists "campanas: admin all" on public.campanas;
create policy "campanas: admin all" on public.campanas
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "campana_envios: admin read" on public.campana_envios;
create policy "campana_envios: admin read" on public.campana_envios
  for select using (public.is_admin());

-- A quién llega una campaña. Admin (para ver la lista) o la función.
create or replace function public.campana_audiencia()
returns table (email text, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (e.email) e.email, e.nombre
    from (
      select lower(trim(q.email)) as email, q.nombre, q.created_at
        from public.quotes q
       where q.nombre !~* '^\s*test\s*$'
      union all
      select lower(trim(o.data ->> 'cliente_email')), o.data ->> 'cliente', o.created_at
        from public.orders o
       where o.empresa = '3dcc'
    ) e
   where (public.is_admin() or auth.role() = 'service_role')
     and e.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
     and not exists (select 1 from public.email_bajas b where b.email = e.email)
   order by e.email, e.created_at desc;
$$;

revoke all on function public.campana_audiencia() from public, anon;
grant execute on function public.campana_audiencia() to authenticated, service_role;
