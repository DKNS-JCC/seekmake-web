-- Trabajos: manual completion date.
-- `fecha_realizacion` is an optional date the admin can set from the form.
-- `fecha_efectiva` is a generated column that falls back to created_at,
-- so timeline ordering and display always have a date without per-row
-- coalesce logic in the queries.
--
-- Note: `timestamptz::date` is NOT immutable (depends on session TimeZone)
-- and Postgres rejects it inside a generated column. `AT TIME ZONE 'UTC'`
-- normalises to a tz-less timestamp first, which is immutable and lets the
-- final cast to date be deterministic.

alter table public.trabajos
  add column if not exists fecha_realizacion date;

alter table public.trabajos
  add column if not exists fecha_efectiva date
  generated always as (
    coalesce(fecha_realizacion, (created_at at time zone 'Europe/Madrid')::date)
  ) stored;

create index if not exists trabajos_fecha_efectiva_idx
  on public.trabajos (fecha_efectiva desc);
