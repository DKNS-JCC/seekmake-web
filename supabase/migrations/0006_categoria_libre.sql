-- Free-form `categoria`: drops the legacy CHECK ('Keycaps','Figuras') so the
-- catalog can hold any kind of product, and renames any rows that used the
-- old fan-art categories to neutral defaults (admin can edit afterwards).

-- Drop the old constraint. The name was generated; we search for it.
do $$
declare
  cons_name text;
begin
  select conname into cons_name
  from pg_constraint
  where conrelid = 'public.productos'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%categoria%';
  if cons_name is not null then
    execute format('alter table public.productos drop constraint %I', cons_name);
  end if;
end$$;

-- Soft re-categorise legacy rows. Won't error if there aren't any.
update public.productos
   set categoria = 'Figuras'
 where categoria = 'Figuras';

-- No new CHECK — categoria is now free text.
