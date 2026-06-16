-- ============================================================================
-- PoC envíos — tabla `envios` (Sendcloud)
-- Ejecutar en Supabase SQL Editor DESPUÉS de las migraciones existentes.
-- Sigue el patrón de RLS del proyecto: public.is_admin() para escritura.
-- ============================================================================

create table if not exists public.envios (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid references public.quotes(id) on delete set null,

  -- proveedor
  proveedor       text not null default 'sendcloud',
  sendcloud_id    bigint,                 -- parcel id en Sendcloud
  metodo          text,                   -- "Correos 48h", "SEUR 24", ...

  -- destino / paquete (snapshot en el momento del envío)
  cp_destino      text,
  pais            text not null default 'ES',
  peso_g          integer,

  -- tarifa
  coste           numeric(10,2),          -- lo que paga el cliente
  coste_carrier   numeric(10,2),          -- coste real (para calcular margen)

  -- seguimiento
  tracking_number text,
  tracking_url    text,
  etiqueta_url    text,                   -- PDF de la etiqueta
  -- estado interno normalizado
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','etiqueta','en_transito','entregado','incidencia','cancelado')),
  estado_carrier  text,                   -- texto crudo que reporta el carrier

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists envios_quote_idx    on public.envios(quote_id);
create index if not exists envios_tracking_idx  on public.envios(tracking_number);

-- updated_at automático (reutiliza el trigger del proyecto)
drop trigger if exists touch_envios on public.envios;
create trigger touch_envios before update on public.envios
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
--   - Escritura: solo admin (las Edge Functions usan service-role y la saltan).
--   - Lectura: solo admin. El tracking para cliente se expone vía función,
--     no por lectura directa de la tabla.
-- ---------------------------------------------------------------------------
alter table public.envios enable row level security;

drop policy if exists "envios: admin read"  on public.envios;
drop policy if exists "envios: admin write" on public.envios;

create policy "envios: admin read" on public.envios
  for select using (public.is_admin());
create policy "envios: admin write" on public.envios
  for all using (public.is_admin()) with check (public.is_admin());
