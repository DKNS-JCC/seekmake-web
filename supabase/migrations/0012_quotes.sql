-- Tasador propio (replaces the SeekMake embed).
-- * quote_settings — single-row jsonb with every pricing knob, editable from
--   /admin/tarifas. Public read (the quote page computes prices client-side),
--   admin write.
-- * quotes — submitted quote requests. Inserted by the `submit-quote` Edge
--   Function (service role), so no anon insert policy. Admin-only read/write.
-- * quote-uploads — Storage bucket for the customer's model files.

-- ---------------------------------------------------------------------------
-- quote_settings
-- ---------------------------------------------------------------------------
create table if not exists public.quote_settings (
  id         integer primary key default 1 check (id = 1),
  config     jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_quote_settings on public.quote_settings;
create trigger touch_quote_settings before update on public.quote_settings
  for each row execute function public.touch_updated_at();

alter table public.quote_settings enable row level security;

drop policy if exists "quote_settings: public read" on public.quote_settings;
drop policy if exists "quote_settings: admin write" on public.quote_settings;

create policy "quote_settings: public read" on public.quote_settings
  for select using (true);

create policy "quote_settings: admin write" on public.quote_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed defaults (idempotent — never overwrites tuned values).
-- Keep in sync with DEFAULT_QUOTE_SETTINGS in lib/quote/pricing.ts.
insert into public.quote_settings (id, config) values (1, '{
  "version": 1,
  "materiales": {
    "PLA":  { "precio_g": 0.05, "densidad": 1.24 },
    "PETG": { "precio_g": 0.06, "densidad": 1.27 },
    "ASA":  { "precio_g": 0.07, "densidad": 1.07 },
    "TPU":  { "precio_g": 0.08, "densidad": 1.21 }
  },
  "precio_hora": 0.30,
  "tarifa_preparacion": 1.50,
  "precio_minimo": 5.00,
  "caudal_g_h": 18,
  "fraccion_pared": 0.35,
  "recargo_acabado_pct": {
    "Metálico": 10, "Fluorescente": 10, "Translucido": 5, "Textura": 10,
    "Brillante": 5, "Purpurina": 10, "Mate": 0, "Flexible": 15
  },
  "recargo_multicolor": { "base_pct": 15, "por_color_extra": 1.00 },
  "resistencia": [
    { "id": "decorativa", "nombre": "Decorativa", "descripcion": "Para exponer o piezas sin esfuerzo", "relleno_pct": 10 },
    { "id": "estandar",   "nombre": "Estándar",   "descripcion": "Uso diario normal",                  "relleno_pct": 20 },
    { "id": "resistente", "nombre": "Resistente", "descripcion": "Soportará golpes o carga",           "relleno_pct": 40 },
    { "id": "maciza",     "nombre": "Maciza",     "descripcion": "Máxima dureza, pieza casi sólida",   "relleno_pct": 100 }
  ],
  "detalle": [
    { "id": "rapido",   "nombre": "Rápido",       "descripcion": "Capas visibles, más económico", "altura_capa_mm": 0.28, "factor_tiempo": 0.7 },
    { "id": "estandar", "nombre": "Estándar",     "descripcion": "Buen equilibrio calidad/precio", "altura_capa_mm": 0.20, "factor_tiempo": 1.0 },
    { "id": "fino",     "nombre": "Alto detalle", "descripcion": "Superficie fina, ideal figuras", "altura_capa_mm": 0.12, "factor_tiempo": 1.7 }
  ],
  "descuentos_cantidad": [
    { "min": 2,  "pct": 5 },
    { "min": 6,  "pct": 12 },
    { "min": 21, "pct": 20 }
  ]
}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- quotes
-- ---------------------------------------------------------------------------
create sequence if not exists public.quote_codigo_seq;

-- Human-friendly reference code, e.g. Q-2026-0042.
create or replace function public.next_quote_codigo()
returns text
language sql
volatile
set search_path = public
as $$
  select 'Q-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.quote_codigo_seq')::text, 4, '0');
$$;

create table if not exists public.quotes (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique default public.next_quote_codigo(),
  estado         text not null default 'nuevo' check (estado in (
                   'nuevo', 'revisado', 'aceptado', 'rechazado', 'completado'
                 )),
  -- customer
  nombre         text not null,
  email          text not null,
  telefono       text not null default '',
  mensaje        text not null default '',
  -- model file (lives in the quote-uploads bucket)
  archivo_nombre text not null,
  archivo_url    text not null,
  archivo_tamano bigint not null default 0,
  -- selection
  material       text not null,
  colores        jsonb not null default '[]',  -- [{nombre, hex, acabado, parte}]
  resistencia    text not null default 'estandar',
  detalle        text not null default 'estandar',
  cantidad       integer not null default 1 check (cantidad >= 1),
  -- computed at submit time (snapshot — settings may change later)
  metricas       jsonb not null default '{}',  -- volumen_cm3, area_cm2, bbox_mm, peso_g, tiempo_h, triangulos
  desglose       jsonb not null default '{}',  -- pricing breakdown lines
  precio_total   numeric(10,2) not null default 0,
  -- admin
  notas_admin    text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists quotes_estado_idx  on public.quotes (estado);
create index if not exists quotes_created_idx on public.quotes (created_at desc);

drop trigger if exists touch_quotes on public.quotes;
create trigger touch_quotes before update on public.quotes
  for each row execute function public.touch_updated_at();

-- Customer data: never publicly readable. The Edge Function inserts with the
-- service role (bypasses RLS); only admins can read/manage.
alter table public.quotes enable row level security;

drop policy if exists "quotes: admin all" on public.quotes;

create policy "quotes: admin all" on public.quotes
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket for quote model files
-- ---------------------------------------------------------------------------
-- Same model as contact-uploads (0011): public bucket, non-guessable paths.
-- 50 MB to match the client-side limit of the 3D viewer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-uploads', 'quote-uploads', true, 52428800, null)
on conflict (id) do update set
  public = true,
  file_size_limit = 52428800;

drop policy if exists "quote-uploads: anon insert" on storage.objects;
drop policy if exists "quote-uploads: public read"  on storage.objects;
drop policy if exists "quote-uploads: admin delete" on storage.objects;

create policy "quote-uploads: public read"
  on storage.objects for select
  using (bucket_id = 'quote-uploads');

create policy "quote-uploads: anon insert"
  on storage.objects for insert
  with check (bucket_id = 'quote-uploads');

create policy "quote-uploads: admin delete"
  on storage.objects for delete
  using (bucket_id = 'quote-uploads' and public.is_admin());
