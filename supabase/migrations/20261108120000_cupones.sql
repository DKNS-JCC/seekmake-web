-- ============================================================================
-- Códigos de descuento del tasador ("cupones", para no confundirlos con el
-- código Q-AAAA-NNNN del presupuesto).
--
-- Reglas:
--   * % o importe fijo, sobre las piezas, antes del pedido mínimo; el envío
--     no se descuenta. No se acumula con el descuento por cantidad: se
--     aplica el mayor (lib/quote/pricing.ts y submit-quote).
--   * Un uso = una solicitud con ese cupón que no esté rechazada. Si se
--     descarta, el uso vuelve solo; no hay contador que mantener.
--   * La tabla es solo de admin (si fuese pública se verían todos los
--     códigos). El tasador pregunta por uno con validar_cupon().
--   * El cupón viaja al pedido de la Calculadora en las notas, para que no
--     se pierda si se cambia el precio allí.
-- ============================================================================

create table if not exists public.cupones (
  codigo        text primary key check (codigo ~ '^[A-Z0-9_-]{3,30}$'),
  tipo          text not null check (tipo in ('pct', 'fijo')),
  valor         numeric(10,2) not null check (valor > 0 and (tipo <> 'pct' or valor <= 100)),
  pedido_minimo numeric(10,2) not null default 0 check (pedido_minimo >= 0),
  max_usos      integer check (max_usos > 0),
  -- Último día válido (inclusive, hora de Madrid). Null = sin caducidad.
  valido_hasta  date,
  activo        boolean not null default true,
  nota          text,
  created_at    timestamptz not null default now()
);

alter table public.cupones enable row level security;
drop policy if exists "cupones: admin all" on public.cupones;
create policy "cupones: admin all" on public.cupones
  for all using (public.is_admin()) with check (public.is_admin());

-- Sin "on delete": un cupón usado no se borra, se desactiva.
alter table public.quotes
  add column if not exists cupon text references public.cupones (codigo) on update cascade;
create index if not exists quotes_cupon_idx on public.quotes (cupon) where cupon is not null;

-- El cupón si hoy se puede usar; ninguna fila si no existe, está apagado,
-- caducado o agotado. Pública: la usan el tasador (anon) y submit-quote.
-- ponytail: sin límite de intentos; vale para códigos de campaña, que se
-- comparten. Para códigos personales, generarlos largos y aleatorios.
create or replace function public.validar_cupon(p_codigo text)
returns table (codigo text, tipo text, valor numeric, pedido_minimo numeric)
language sql
stable
security definer
set search_path = public
as $$
  select c.codigo, c.tipo, c.valor, c.pedido_minimo
    from public.cupones c
   where c.codigo = upper(trim(p_codigo))
     and c.activo
     and (c.valido_hasta is null or c.valido_hasta >= public.en_madrid(now())::date)
     and (c.max_usos is null or c.max_usos > (
           select count(*) from public.quotes q
            where q.cupon = c.codigo and q.estado <> 'rechazado'));
$$;

grant execute on function public.validar_cupon(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pedido de la Calculadora: el cupón en las notas y en data.cupon.
-- Se envuelve la función de 0027 en vez de copiarla entera; quien la llama
-- (crear_order_para_quote) la busca por nombre y recibe esta.
-- ---------------------------------------------------------------------------
do $r$
begin
  if not exists (select 1 from pg_proc where proname = 'quote_a_order_data_base') then
    alter function public.quote_a_order_data(uuid, text) rename to quote_a_order_data_base;
  end if;
end
$r$;

create or replace function public.quote_a_order_data(p_quote_id uuid, p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d     jsonb := public.quote_a_order_data_base(p_quote_id, p_order_id);
  v_cup text;
  v_dto text;
begin
  -- submit-quote guarda lo descontado en desglose.cupon_descuento.
  select q.cupon, q.desglose ->> 'cupon_descuento'
    into v_cup, v_dto
    from public.quotes q
   where q.id = p_quote_id;
  if d is null or v_cup is null then
    return d;
  end if;
  return d || jsonb_build_object(
    'cupon', v_cup,
    'notes', concat_ws(E'\n', d ->> 'notes',
                       'Cupón ' || v_cup || coalesce(': -' || v_dto || ' €', '') ||
                       ' (respetarlo si se cambia el precio)')
  );
end;
$$;
