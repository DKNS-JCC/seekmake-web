-- ============================================================================
-- Calculadora — fase 0 de la unificación (docs/plan-unificacion-calculadora.md)
-- Multi-tenant (3DCC + SILAB3D) replicando el esquema Firestore:
--   empresas/{slug}/data/{config,inventory,clients,calc_state} → empresa_docs
--   empresas/{slug}/orders/{id}                                → orders
-- RLS reproduce las Firestore rules actuales, incluido el acceso al socio
-- (pool de filamento compartido y pedidos is_shared).
-- Esta migración no afecta a nada en producción: solo añade tablas nuevas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- empresas + usuarios
-- ---------------------------------------------------------------------------
create table if not exists public.empresas (
  slug   text primary key,
  nombre text not null
);

insert into public.empresas (slug, nombre) values
  ('3dcc', '3DCC'),
  ('silab3d', 'SILAB3D')
on conflict (slug) do nothing;

-- Mapeo usuario → empresa. Se rellena a mano tras crear las cuentas en
-- Supabase Auth (Dashboard → Authentication → Add user), p. ej.:
--   insert into public.empresa_users (user_id, empresa)
--   values ('<uuid del usuario>', '3dcc');
create table if not exists public.empresa_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  empresa text not null references public.empresas (slug)
);

-- ---------------------------------------------------------------------------
-- Helpers RLS
-- ---------------------------------------------------------------------------
-- Empresa del usuario autenticado (security definer: lee empresa_users
-- saltándose su propio RLS).
create or replace function public.user_empresa()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select empresa from public.empresa_users where user_id = auth.uid();
$$;

-- Empresa socia (con dos inquilinos es un case; si algún día hay más,
-- pasar a una tabla de partners).
create or replace function public.partner_de(e text)
returns text
language sql
immutable
as $$
  select case e when '3dcc' then 'silab3d' when 'silab3d' then '3dcc' end;
$$;

grant execute on function public.user_empresa() to authenticated;
grant execute on function public.partner_de(text) to authenticated;

-- ---------------------------------------------------------------------------
-- empresa_docs: espejo 1:1 de los documentos data/* de Firestore.
-- El adaptador de la Calculadora hace upsert del documento completo,
-- igual que hoy hace setDoc().
-- ---------------------------------------------------------------------------
create table if not exists public.empresa_docs (
  empresa    text not null references public.empresas (slug),
  doc        text not null check (doc in ('config', 'inventory', 'clients', 'calc_state')),
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (empresa, doc)
);

drop trigger if exists touch_empresa_docs on public.empresa_docs;
create trigger touch_empresa_docs before update on public.empresa_docs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- orders: pedidos de la Calculadora. El pedido completo (forma de
-- normalizeOrder en src/shared/backend.mjs) vive en `data`; columnas
-- generadas para filtrar sin riesgo de drift. Sin check de estados: los
-- valores los garantiza normalizeOrder y hay datos históricos variados.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id         text not null,                          -- ids de 8 chars existentes
  empresa    text not null references public.empresas (slug),
  quote_id   uuid references public.quotes (id) on delete set null,
  data       jsonb not null,
  estado     text    generated always as (data ->> 'estado') stored,
  is_shared  boolean generated always as (coalesce((data ->> 'is_shared')::boolean, false)) stored,
  archived   boolean generated always as (coalesce((data ->> 'archived')::boolean, false)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- PK compuesta: los ids son aleatorios de 8 chars generados por la app;
  -- una colisión entre empresas no debe pisar la fila de la otra.
  primary key (empresa, id)
);

create index if not exists orders_empresa_idx on public.orders (empresa) where not archived;
create index if not exists orders_shared_idx  on public.orders (empresa, is_shared) where is_shared;
-- Como máximo un pedido por solicitud web.
create unique index if not exists orders_quote_id_uidx on public.orders (quote_id) where quote_id is not null;

drop trigger if exists touch_orders on public.orders;
create trigger touch_orders before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.empresas      enable row level security;
alter table public.empresa_users enable row level security;
alter table public.empresa_docs  enable row level security;
alter table public.orders        enable row level security;

-- empresas: lectura para cualquier usuario autenticado; sin escritura
-- (gestión por service role / SQL editor).
drop policy if exists "empresas: authenticated read" on public.empresas;
create policy "empresas: authenticated read" on public.empresas
  for select to authenticated using (true);

-- empresa_users: cada usuario ve solo su propia fila (el login la necesita
-- para derivar la empresa); gestión por service role / SQL editor.
drop policy if exists "empresa_users: own read" on public.empresa_users;
create policy "empresa_users: own read" on public.empresa_users
  for select to authenticated using (user_id = auth.uid());

-- empresa_docs: todo sobre lo propio.
drop policy if exists "empresa_docs: own all" on public.empresa_docs;
create policy "empresa_docs: own all" on public.empresa_docs
  for all to authenticated
  using (empresa = public.user_empresa())
  with check (empresa = public.user_empresa());

-- empresa_docs: el socio lee TODOS los docs. Réplica del comportamiento
-- actual (las Firestore rules dan lectura total a cualquier usuario
-- autenticado y el ghost mode carga los datos completos del socio con
-- loadAllData). Las escrituras sí se restringen: solo inventory (abajo).
drop policy if exists "empresa_docs: partner read" on public.empresa_docs;
create policy "empresa_docs: partner read" on public.empresa_docs
  for select to authenticated
  using (empresa = public.partner_de(public.user_empresa()));

-- …y escribe inventory (savePartnerInventory: consumo del pool compartido).
drop policy if exists "empresa_docs: partner update inventory" on public.empresa_docs;
create policy "empresa_docs: partner update inventory" on public.empresa_docs
  for update to authenticated
  using (
    empresa = public.partner_de(public.user_empresa())
    and doc = 'inventory'
  )
  with check (
    empresa = public.partner_de(public.user_empresa())
    and doc = 'inventory'
  );

-- orders: todo sobre lo propio.
drop policy if exists "orders: own all" on public.orders;
create policy "orders: own all" on public.orders
  for all to authenticated
  using (empresa = public.user_empresa())
  with check (empresa = public.user_empresa());

-- orders: el socio lee todo (ghost mode carga la colección completa;
-- loadPartnerSharedOrders filtra is_shared/archived en la consulta).
-- Escritura de pedidos del socio: NO — la UI ya los trata como solo
-- lectura ("Pedido de X — sólo lectura" en Orders.vue).
drop policy if exists "orders: partner read shared" on public.orders;
drop policy if exists "orders: partner read" on public.orders;
create policy "orders: partner read" on public.orders
  for select to authenticated
  using (empresa = public.partner_de(public.user_empresa()));
