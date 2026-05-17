-- Extra fields on `colores` that exist in legacy filamentos.yaml.
alter table public.colores
  add column if not exists combina_con text[] not null default '{}',
  add column if not exists oferta boolean not null default false;
