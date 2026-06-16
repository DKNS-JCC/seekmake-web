-- ============================================================================
-- 0015_envios — envíos generados desde el panel admin (Sendcloud)
-- 1 envío ↔ 1 presupuesto (quote). Escritura vía Edge Function (service role).
-- ============================================================================

create table if not exists public.envios (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid references public.quotes(id) on delete set null,

  -- proveedor
  proveedor       text not null default 'sendcloud',
  sendcloud_id    bigint,                 -- parcel id en Sendcloud
  metodo          text,                   -- "Correos 48h", "SEUR 24"...
  carrier         text,

  -- destino / paquete (snapshot)
  cp_destino      text,
  pais            text not null default 'ES',
  peso_g          integer,

  -- tarifa
  coste           numeric(10,2),          -- lo que cobras al cliente (manual)
  coste_carrier   numeric(10,2),          -- coste real (margen)

  -- seguimiento
  tracking_number text,
  tracking_url    text,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','etiqueta','en_transito','entregado','incidencia','cancelado')),
  estado_carrier  text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists envios_quote_idx   on public.envios(quote_id);
create index if not exists envios_tracking_idx on public.envios(tracking_number);

drop trigger if exists touch_envios on public.envios;
create trigger touch_envios before update on public.envios
for each row execute function public.touch_updated_at();

-- ── RLS: lectura/escritura solo admin. La Edge Function usa service role
--    (salta RLS) para insertar. El navegador admin lee con su JWT is_admin. ──
alter table public.envios enable row level security;

drop policy if exists "envios: admin read"  on public.envios;
drop policy if exists "envios: admin write" on public.envios;

create policy "envios: admin read" on public.envios
  for select using (public.is_admin());
create policy "envios: admin write" on public.envios
  for all using (public.is_admin()) with check (public.is_admin());
