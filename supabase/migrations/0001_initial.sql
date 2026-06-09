-- ============================================================================
-- 3DCC Salamanca — initial schema
-- Tables: filamentos, colores, productos
-- Auth: handled by Supabase Auth; admin gated via custom claim `is_admin`.
-- ============================================================================

-- Helper: return true if the caller is an authenticated admin user.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- filamentos: one row per material (PLA, PETG, ASA, TPU, ...).
-- ---------------------------------------------------------------------------
create table if not exists public.filamentos (
  id          uuid primary key default gen_random_uuid(),
  material    text not null unique,
  nombre      text not null,
  descripcion text not null default '',
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- colores: one row per color within a material.
-- ---------------------------------------------------------------------------
create table if not exists public.colores (
  id            uuid primary key default gen_random_uuid(),
  filamento_id  uuid not null references public.filamentos(id) on delete cascade,
  nombre        text not null,
  hex           text not null check (hex ~* '^#[0-9a-f]{6}$'),
  texto         text not null default 'black' check (texto in ('black', 'white')),
  acabado       text check (acabado in (
    'Metálico', 'Fluorescente', 'Translucido', 'Textura',
    'Brillante', 'Purpurina', 'Mate', 'Flexible'
  )),
  orden         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists colores_filamento_idx on public.colores(filamento_id);

-- ---------------------------------------------------------------------------
-- productos: catalog entries (Keycaps, Figuras, ...).
-- ---------------------------------------------------------------------------
create table if not exists public.productos (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   integer unique,                  -- preserves the numeric id from productos.yaml
  nombre      text not null,
  descripcion text not null default '',
  precio      numeric(10,2) not null check (precio >= 0),
  categoria   text not null check (categoria in ('Keycaps', 'Figuras')),
  material    text not null default 'PLA',
  colores     text[] not null default '{}',
  dimensiones text not null default '',
  peso        text not null default '',
  imagen      text not null default '',
  destacado   boolean not null default false,
  etiquetas   text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists productos_categoria_idx on public.productos(categoria);
create index if not exists productos_destacado_idx on public.productos(destacado) where destacado;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_filamentos on public.filamentos;
create trigger touch_filamentos before update on public.filamentos
for each row execute function public.touch_updated_at();

drop trigger if exists touch_colores on public.colores;
create trigger touch_colores before update on public.colores
for each row execute function public.touch_updated_at();

drop trigger if exists touch_productos on public.productos;
create trigger touch_productos before update on public.productos
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--   - Anyone can read (public catalog).
--   - Only admins can insert/update/delete via PostgREST.
--   - Service-role bypasses RLS (used by the seed script).
-- ---------------------------------------------------------------------------
alter table public.filamentos enable row level security;
alter table public.colores    enable row level security;
alter table public.productos  enable row level security;

drop policy if exists "filamentos: public read"   on public.filamentos;
drop policy if exists "filamentos: admin write"   on public.filamentos;
drop policy if exists "colores: public read"      on public.colores;
drop policy if exists "colores: admin write"      on public.colores;
drop policy if exists "productos: public read"    on public.productos;
drop policy if exists "productos: admin write"    on public.productos;

create policy "filamentos: public read" on public.filamentos
  for select using (true);
create policy "filamentos: admin write" on public.filamentos
  for all using (public.is_admin()) with check (public.is_admin());

create policy "colores: public read" on public.colores
  for select using (true);
create policy "colores: admin write" on public.colores
  for all using (public.is_admin()) with check (public.is_admin());

create policy "productos: public read" on public.productos
  for select using (true);
create policy "productos: admin write" on public.productos
  for all using (public.is_admin()) with check (public.is_admin());
