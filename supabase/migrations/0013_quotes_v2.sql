-- Tasador v2 — order lifecycle overhaul.
-- * Clear estado pipeline: nuevo → revisado → aceptado → imprimiendo →
--   listo → entregado (terminal), plus rechazado (terminal).
-- * Payment tracking decoupled from estado: pago + importe_pagado +
--   precio_final (the price the admin actually confirms).
-- * Multi-piece quotes: `archivos` jsonb array replaces the single
--   archivo_* columns (no production rows existed when this ran).
-- * archivado flag so test/old quotes can be hidden without deleting.
-- * Nightly storage cleanup via pg_cron (best effort).

-- ── estado pipeline ─────────────────────────────────────────────────────
alter table public.quotes drop constraint if exists quotes_estado_check;
alter table public.quotes add constraint quotes_estado_check
  check (estado in (
    'nuevo', 'revisado', 'aceptado', 'imprimiendo',
    'listo', 'entregado', 'rechazado'
  ));

-- ── payment tracking ────────────────────────────────────────────────────
alter table public.quotes
  add column if not exists pago text not null default 'pendiente'
    check (pago in ('pendiente', 'adelanto', 'pagado')),
  add column if not exists importe_pagado numeric(10,2) not null default 0,
  add column if not exists precio_final numeric(10,2);

-- ── archive flag ────────────────────────────────────────────────────────
alter table public.quotes
  add column if not exists archivado boolean not null default false;

create index if not exists quotes_archivado_idx
  on public.quotes (archivado) where not archivado;

-- ── multi-piece files ───────────────────────────────────────────────────
-- [{nombre, url, path, tamano, tamano_original, comprimido, cantidad,
--   metricas: {volumen_cm3, area_cm2, bbox_mm, peso_g, tiempo_h, ...}}]
alter table public.quotes
  add column if not exists archivos jsonb not null default '[]';

alter table public.quotes
  drop column if exists archivo_nombre,
  drop column if exists archivo_url,
  drop column if exists archivo_tamano;

-- ── public status RPC (return type changed → drop first) ────────────────
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
  created_at   timestamptz,
  updated_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select q.codigo, q.estado, q.pago, q.entrega, q.material, q.cantidad,
         q.precio_total, q.precio_final, q.created_at, q.updated_at
  from public.quotes q
  where upper(trim(p_codigo)) = q.codigo
    and not q.archivado
  limit 1;
$$;

grant execute on function public.get_quote_status(text) to anon, authenticated;

-- ── nightly storage cleanup (best effort — skipped if pg_cron missing) ──
-- Frees the quote-uploads bucket: files of terminal quotes 30+ days old,
-- and any file older than 120 days regardless.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'clean-quote-uploads',
    '0 4 * * *',
    $job$
      delete from storage.objects o
      where o.bucket_id = 'quote-uploads'
        and (
          o.created_at < now() - interval '120 days'
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
