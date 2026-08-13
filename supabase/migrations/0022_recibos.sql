-- ============================================================================
-- 0022_recibos — justificantes de pago (recibos no fiscales)
--
-- Principio: UN RECIBO = UN COBRO. Así el caso `pago = 'adelanto'` se resuelve
-- solo (un recibo del adelanto, otro del resto) y queda historial real de
-- cobros, que hoy no existe (`quotes.importe_pagado` es un número que se
-- sobrescribe, sin fecha ni método).
--
-- IMPORTANTE — convivencia con la Calculadora: el trigger
-- `project_order_to_quote()` (0017) escribe `quotes.importe_pagado` desde los
-- pedidos. Por eso `recibos` NUNCA escribe en `quotes`: es un libro de
-- emisiones, no la fuente de verdad del saldo. El panel avisa si la suma de
-- recibos no cuadra con `importe_pagado`.
--
-- Un recibo es INMUTABLE: no se edita ni se borra, se anula y se emite otro.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Código legible correlativo: R-2026-0001
-- ---------------------------------------------------------------------------
create sequence if not exists public.recibo_codigo_seq;

create or replace function public.next_recibo_codigo()
returns text
language sql
volatile
set search_path = public
as $$
  select 'R-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.recibo_codigo_seq')::text, 4, '0');
$$;

-- ---------------------------------------------------------------------------
-- recibos
-- ---------------------------------------------------------------------------
create table if not exists public.recibos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique default public.next_recibo_codigo(),
  quote_id       uuid not null references public.quotes(id) on delete cascade,

  -- el cobro que documenta este justificante
  importe        numeric(10,2) not null check (importe > 0),
  metodo         text not null default 'transferencia'
                 check (metodo in ('efectivo','bizum','transferencia','tarjeta','otro')),
  fecha_pago     date not null default current_date,
  concepto       text not null default '',
  es_adelanto    boolean not null default false,

  -- Snapshot inmutable con el que se reconstruye el PDF byte a byte. Si mañana
  -- cambia el nombre comercial o el teléfono, los recibos ya emitidos no mutan.
  datos          jsonb not null default '{}',

  -- PDF archivado en el bucket privado `recibos`
  pdf_path       text,

  -- Verificación pública del documento (QR del PDF → /recibo?c=..&t=..)
  verif_token    uuid not null default gen_random_uuid(),

  anulado_at     timestamptz,
  anulado_motivo text not null default '',

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists recibos_quote_idx
  on public.recibos (quote_id, created_at desc);
create index if not exists recibos_codigo_idx
  on public.recibos (codigo);

drop trigger if exists touch_recibos on public.recibos;
create trigger touch_recibos before update on public.recibos
  for each row execute function public.touch_updated_at();

-- ── RLS: solo admin. La Edge Function `recibo-emitir` usa service role. ─────
alter table public.recibos enable row level security;

drop policy if exists "recibos: admin all" on public.recibos;

create policy "recibos: admin all" on public.recibos
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Bucket PRIVADO. A diferencia de quote-uploads: un recibo lleva nombre del
-- cliente e importe. El acceso se sirve siempre con URL firmada de caducidad
-- corta emitida por la Edge Function.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recibos', 'recibos', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf'];

-- Nadie lee el bucket directamente: ni anon, ni el admin desde el navegador.
-- Solo el service role (Edge Function), que se salta RLS y firma las URLs.
drop policy if exists "recibos: admin read"   on storage.objects;
drop policy if exists "recibos: no anon read" on storage.objects;

-- ---------------------------------------------------------------------------
-- Verificación pública del justificante.
-- El token (impreso en el QR) autoriza; el código solo no basta, así que los
-- recibos no son enumerables. No devuelve datos personales del cliente.
-- ---------------------------------------------------------------------------
create or replace function public.verificar_recibo(p_codigo text, p_token uuid)
returns table (
  codigo      text,
  pedido      text,
  importe     numeric,
  metodo      text,
  fecha_pago  date,
  concepto    text,
  emitido_at  timestamptz,
  anulado     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.codigo, q.codigo, r.importe, r.metodo, r.fecha_pago, r.concepto,
         r.created_at, r.anulado_at is not null
    from public.recibos r
    join public.quotes q on q.id = r.quote_id
   where r.codigo = upper(trim(p_codigo))
     and r.verif_token = p_token
   limit 1;
$$;

grant execute on function public.verificar_recibo(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Listado de justificantes para el cliente en /presupuesto.
-- Requiere el token personal del presupuesto (el mismo que ya viaja en el
-- enlace del email de confirmación), no solo el código.
-- Devuelve metadatos; el PDF se descarga vía Edge Function con URL firmada.
-- ---------------------------------------------------------------------------
create or replace function public.get_recibos_cliente(p_codigo text, p_token uuid)
returns table (
  codigo      text,
  importe     numeric,
  metodo      text,
  fecha_pago  date,
  concepto    text,
  es_adelanto boolean,
  emitido_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.codigo, r.importe, r.metodo, r.fecha_pago, r.concepto,
         r.es_adelanto, r.created_at
    from public.recibos r
    join public.quotes q on q.id = r.quote_id
   where q.codigo = upper(trim(p_codigo))
     and q.acepta_token = p_token
     and not q.archivado
     and r.anulado_at is null
   order by r.created_at asc;
$$;

grant execute on function public.get_recibos_cliente(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Limpieza: los PDFs de recibos NO se borran nunca automáticamente. Son
-- documentos acreditativos y pesan ~30 KB. Se deja constancia explícita aquí
-- para que nadie los añada al job de limpieza de quote-uploads (0014).
-- ---------------------------------------------------------------------------
