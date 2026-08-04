alter table public.colores
  add column if not exists muestra_colores text[] not null default '{}';
