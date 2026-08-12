-- Out-of-stock flag, mirroring `oferta`. Agotado colours stay visible in the
-- muestrario (so customers know they exist) but cannot be picked in the tasador.
alter table public.colores
  add column if not exists agotado boolean not null default false;
