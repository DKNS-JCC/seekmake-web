-- Pickup appointments in Salamanca.
--
-- The admin opens slots (day, time, place). When an order with
-- entrega='recogida' is «listo», its email carries the personal link
-- (acepta_token) and /presupuesto shows the free slots. The customer asks for
-- one (quote_id set, confirmada=false); the admin confirms it (the
-- appointment email goes out) or frees it and asks for another.
--
-- One slot = one customer: a booking is an UPDATE ... WHERE quote_id IS NULL,
-- so two customers clicking the same slot at once can't both get it.

create table if not exists public.huecos_recogida (
  id          uuid primary key default gen_random_uuid(),
  inicio      timestamptz not null,
  lugar       text not null default 'Puerta de la Farmacia Ciurana, Plaza del Barrio Vidal, Salamanca'
              check (char_length(lugar) between 1 and 200),
  quote_id    uuid unique references public.quotes(id) on delete set null,
  confirmada  boolean not null default false,
  pedida_at   timestamptz,
  created_at  timestamptz not null default now(),
  check (quote_id is not null or not confirmada)
);
-- Generating the same timetable twice doesn't duplicate slots.
create unique index if not exists huecos_recogida_inicio_lugar on public.huecos_recogida (inicio, lugar);

alter table public.huecos_recogida enable row level security;
drop policy if exists huecos_recogida_admin on public.huecos_recogida;
create policy huecos_recogida_admin on public.huecos_recogida
  for all using (public.is_admin()) with check (public.is_admin());

-- Same check for every customer call: right token, still «listo» for pickup.
create or replace function public._quote_recogida(p_codigo text, p_token uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select q.id from public.quotes q
   where q.codigo = upper(trim(p_codigo))
     and q.acepta_token = p_token
     and q.estado = 'listo'
     and q.entrega = 'recogida'
     and not q.archivado;
$$;
revoke all on function public._quote_recogida(text, uuid) from public, anon, authenticated;

-- Free slots from 2 h to 60 days ahead, plus the customer's own one (mio = true).
create or replace function public.get_huecos_recogida(p_codigo text, p_token uuid)
returns table (id uuid, inicio timestamptz, lugar text, mio boolean, confirmada boolean)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select public._quote_recogida(p_codigo, p_token) as id)
  select h.id, h.inicio, h.lugar, h.quote_id is not null, h.confirmada
    from public.huecos_recogida h, q
   where q.id is not null
     and (h.quote_id = q.id or (h.quote_id is null and h.inicio > now() + interval '2 hours'
                                  and h.inicio < now() + interval '60 days'))
   order by h.inicio;
$$;
grant execute on function public.get_huecos_recogida(text, uuid) to anon, authenticated;

-- Ask for a slot. Changing it frees the old one; a confirmed one stays
-- (they write to us to move it). Returns false if the slot was taken.
create or replace function public.pedir_hueco_recogida(p_codigo text, p_token uuid, p_hueco uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_quote uuid := public._quote_recogida(p_codigo, p_token);
  v_ok uuid;
begin
  if v_quote is null then return false; end if;
  if exists (select 1 from public.huecos_recogida where quote_id = v_quote and confirmada) then
    return false;
  end if;
  update public.huecos_recogida set quote_id = null, pedida_at = null where quote_id = v_quote;
  update public.huecos_recogida
     set quote_id = v_quote, pedida_at = now()
   where id = p_hueco and quote_id is null
     and inicio > now() + interval '2 hours' and inicio < now() + interval '60 days'
  returning id into v_ok;
  return v_ok is not null;
end $$;
grant execute on function public.pedir_hueco_recogida(text, uuid, uuid) to anon, authenticated;
