-- ============================================================================
-- Fase 1 de Navidad: confianza y recorrido.
--
-- * resenas: reseñas de Google elegidas a mano desde /admin/resenas. La web
--   las lee en build; sin filas publicadas la sección no se pinta.
-- * resenas_resumen: una sola fila con la nota y el total de la ficha.
-- * quote_events: nuevo evento 'whatsapp_clic' (payload: la página), para
--   medir los clics en WhatsApp sin cookies ni datos personales.
-- * Fuera los likes de Trabajos: no aportaban y 0009 los había inflado.
-- ============================================================================

-- ── resenas ──────────────────────────────────────────────────────────────
create table if not exists public.resenas (
  id            uuid primary key default gen_random_uuid(),
  autor_visible text not null check (char_length(autor_visible) between 1 and 60),
  texto         text not null check (char_length(texto) between 1 and 1200),
  estrellas     smallint not null default 5 check (estrellas between 1 and 5),
  fecha         date not null default current_date,
  orden         integer not null default 0,
  publicada     boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.resenas enable row level security;

drop policy if exists "resenas: public read" on public.resenas;
drop policy if exists "resenas: admin read"  on public.resenas;
drop policy if exists "resenas: admin write" on public.resenas;

create policy "resenas: public read" on public.resenas
  for select using (publicada);
create policy "resenas: admin read" on public.resenas
  for select using (public.is_admin());
create policy "resenas: admin write" on public.resenas
  for all using (public.is_admin()) with check (public.is_admin());

-- ── resenas_resumen: una fila ────────────────────────────────────────────
create table if not exists public.resenas_resumen (
  id             boolean primary key default true check (id),
  media          numeric(2,1) not null default 5.0 check (media between 1 and 5),
  total          integer not null default 0 check (total >= 0),
  actualizado_el date not null default current_date
);

insert into public.resenas_resumen (id, media, total) values (true, 5.0, 42)
  on conflict (id) do nothing;

alter table public.resenas_resumen enable row level security;

drop policy if exists "resenas_resumen: public read" on public.resenas_resumen;
drop policy if exists "resenas_resumen: admin write" on public.resenas_resumen;

create policy "resenas_resumen: public read" on public.resenas_resumen
  for select using (true);
create policy "resenas_resumen: admin write" on public.resenas_resumen
  for all using (public.is_admin()) with check (public.is_admin());

-- ── quote_events: clic en WhatsApp ───────────────────────────────────────
alter table public.quote_events drop constraint if exists quote_events_evento_check;
alter table public.quote_events add constraint quote_events_evento_check
  check (evento in (
    'pieza_anadida', 'precio_visto', 'solicitud_enviada', 'pdf_descargado',
    'aceptado', 'whatsapp_clic'
  ));

-- ── Trabajos sin likes ───────────────────────────────────────────────────
drop function if exists public.vote_trabajo(uuid, uuid, text);
drop function if exists public.vote_trabajo(uuid, int, int);
drop function if exists public.get_my_trabajo_votes(uuid, uuid[]);
drop table if exists public.trabajos_votos;
alter table public.trabajos
  drop column if exists likes,
  drop column if exists dislikes;
