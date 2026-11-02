-- ============================================================================
-- Fase 2 de Navidad: plazas de la semana.
--
-- Una sola fila que se cambia desde /admin/navidad. La web la lee en build
-- (rebuild cada 15 min), así que "quedan 3 plazas" no exige un commit.
-- Productos, precios y fechas viven en lib/campana-navidad.ts.
-- ============================================================================

create table if not exists public.campana_navidad (
  id              boolean primary key default true check (id),
  plazas_semana   integer not null default 15 check (plazas_semana between 0 and 100),
  plazas_ocupadas integer not null default 0 check (plazas_ocupadas >= 0),
  actualizado_el  timestamptz not null default now(),
  check (plazas_ocupadas <= plazas_semana)
);

insert into public.campana_navidad (id) values (true) on conflict (id) do nothing;

alter table public.campana_navidad enable row level security;

drop policy if exists "campana_navidad: public read" on public.campana_navidad;
drop policy if exists "campana_navidad: admin write" on public.campana_navidad;

create policy "campana_navidad: public read" on public.campana_navidad
  for select using (true);
create policy "campana_navidad: admin write" on public.campana_navidad
  for all using (public.is_admin()) with check (public.is_admin());
