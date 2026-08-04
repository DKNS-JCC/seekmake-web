-- How the palette in colores.muestra_colores is rendered.
--   solido    → single hex, palette ignored
--   bandas    → hard-edged bands (co-extruded dual colour, e.g. "Negro y Azul")
--   degradado → smooth blend (rainbow / silk transition)
alter table public.colores
  add column if not exists muestra_tipo text not null default 'solido';

alter table public.colores
  drop constraint if exists colores_muestra_tipo_check;
alter table public.colores
  add constraint colores_muestra_tipo_check
  check (muestra_tipo in ('solido', 'bandas', 'degradado'));

-- Rows that already carry a palette were rendered as hard bands.
update public.colores
   set muestra_tipo = 'bandas'
 where muestra_tipo = 'solido'
   and coalesce(array_length(muestra_colores, 1), 0) > 1;
