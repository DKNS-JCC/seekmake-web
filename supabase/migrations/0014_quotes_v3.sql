-- Tasador v3 — trust, lifecycle and analytics.
-- * Server-side pricing: submit-quote now recomputes the total, so quotes
--   store an ip_hash for DB-backed rate limiting.
-- * Acceptance flow: acepta_token (secret link emailed to the customer) +
--   accept_quote() RPC + valido_hasta expiry window.
-- * quote_events — anonymous funnel events for /admin/estadisticas.
-- * Storage cleanup v2: also purge orphan uploads (never attached to a
--   quote) after 48 h.

-- ── quotes: acceptance + validity + rate-limit support ──────────────────
alter table public.quotes
  add column if not exists acepta_token uuid not null default gen_random_uuid(),
  add column if not exists aceptado_at  timestamptz,
  add column if not exists valido_hasta timestamptz not null
    default (now() + interval '15 days'),
  add column if not exists ip_hash      text not null default '';

create index if not exists quotes_ip_hash_idx
  on public.quotes (ip_hash, created_at desc);

-- ── public status RPC: expose validity (return type changed → drop) ─────
drop function if exists public.get_quote_status(text);

create function public.get_quote_status(p_codigo text)
returns table (
  codigo       text,
  estado       text,
  pago         text,
  entrega      text,
  material     text,
  cantidad     integer,
  precio_total numeric,
  precio_final numeric,
  valido_hasta timestamptz,
  aceptado_at  timestamptz,
  created_at   timestamptz,
  updated_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select q.codigo, q.estado, q.pago, q.entrega, q.material, q.cantidad,
         q.precio_total, q.precio_final, q.valido_hasta, q.aceptado_at,
         q.created_at, q.updated_at
  from public.quotes q
  where upper(trim(p_codigo)) = q.codigo
    and not q.archivado
  limit 1;
$$;

grant execute on function public.get_quote_status(text) to anon, authenticated;

-- ── customer acceptance RPC ──────────────────────────────────────────────
-- The token (mailed to the customer only) authorises the state change; the
-- code alone is not enough. Accepting is only possible while the quote is
-- nuevo/revisado and not expired.
create or replace function public.accept_quote(p_codigo text, p_token uuid)
returns table (ok boolean, estado text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  update public.quotes q
     set estado = 'aceptado',
         aceptado_at = now()
   where q.codigo = upper(trim(p_codigo))
     and q.acepta_token = p_token
     and q.estado in ('nuevo', 'revisado')
     and not q.archivado
     and q.valido_hasta > now()
  returning q.estado into v_estado;

  if v_estado is null then
    return query select false, null::text;
  else
    return query select true, v_estado;
  end if;
end;
$$;

grant execute on function public.accept_quote(text, uuid) to anon, authenticated;

-- ── quote_events: anonymous funnel analytics ─────────────────────────────
create table if not exists public.quote_events (
  id         bigint generated always as identity primary key,
  session_id text not null default '' check (char_length(session_id) <= 64),
  evento     text not null check (evento in (
               'pieza_anadida', 'solicitud_enviada', 'pdf_descargado',
               'aceptado'
             )),
  payload    jsonb not null default '{}'
             check (pg_column_size(payload) <= 2048),
  created_at timestamptz not null default now()
);

create index if not exists quote_events_created_idx
  on public.quote_events (created_at desc);
create index if not exists quote_events_evento_idx
  on public.quote_events (evento, created_at desc);

alter table public.quote_events enable row level security;

drop policy if exists "quote_events: anon insert" on public.quote_events;
drop policy if exists "quote_events: admin read"  on public.quote_events;

-- Anonymous, fire-and-forget inserts from the quote page. No reads for anon.
create policy "quote_events: anon insert" on public.quote_events
  for insert with check (true);

create policy "quote_events: admin read" on public.quote_events
  for select using (public.is_admin());

-- ── storage cleanup v2 (replaces the 0013 job) ──────────────────────────
-- * Orphans: uploads never referenced by any quote, older than 48 h
--   (covers junk uploads and abandoned carts).
-- * Terminal quotes: files 30+ days after entregado/rechazado.
-- * Hard cap: anything older than 120 days.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('clean-quote-uploads');
exception when others then
  raise notice 'pg_cron unschedule omitido: %', sqlerrm;
end $$;

do $$
begin
  perform cron.schedule(
    'clean-quote-uploads',
    '0 4 * * *',
    $job$
      delete from storage.objects o
      where o.bucket_id = 'quote-uploads'
        and (
          o.created_at < now() - interval '120 days'
          or (
            o.created_at < now() - interval '48 hours'
            and not exists (
              select 1 from public.quotes q
              where q.archivos @> jsonb_build_array(
                      jsonb_build_object('path', o.name))
            )
          )
          or exists (
            select 1 from public.quotes q
            where q.estado in ('entregado', 'rechazado')
              and q.updated_at < now() - interval '30 days'
              and q.archivos @> jsonb_build_array(
                    jsonb_build_object('path', o.name))
          )
        )
    $job$
  );
exception when others then
  raise notice 'pg_cron no disponible, limpieza automática omitida: %', sqlerrm;
end $$;
