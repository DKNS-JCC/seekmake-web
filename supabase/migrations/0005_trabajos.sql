-- "Nuestros trabajos" — image gallery of past work.
-- The actual image files live in the `product-images` Storage bucket; this
-- table only stores metadata + the public URL.

create table if not exists public.trabajos (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descripcion text not null default '',
  imagen      text not null default '',
  material    text not null default '',
  etiquetas   text[] not null default '{}',
  destacado   boolean not null default false,
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists trabajos_destacado_idx
  on public.trabajos (destacado) where destacado;

create index if not exists trabajos_orden_idx on public.trabajos (orden);

-- updated_at trigger reuses public.touch_updated_at() from 0001.
drop trigger if exists touch_trabajos on public.trabajos;
create trigger touch_trabajos before update on public.trabajos
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.trabajos enable row level security;

drop policy if exists "trabajos: public read"  on public.trabajos;
drop policy if exists "trabajos: admin write"  on public.trabajos;

create policy "trabajos: public read" on public.trabajos
  for select using (true);

create policy "trabajos: admin write" on public.trabajos
  for all using (public.is_admin()) with check (public.is_admin());
