-- ============================================================================
-- Fase D de docs/plan-sincronizacion-web-calculadora.md: un solo libro de
-- cobros para la web y la Calculadora.
--
-- Antes el dinero vivía en tres sitios que no se hablaban:
--   * orders.data.payment_history (+ importe_pagado) en la Calculadora,
--   * quotes.importe_pagado, que el pedido sobrescribía (0017),
--   * recibos (0022), que nunca escribía en quotes.
--
-- Ahora:
--   * `cobros` es la fuente de verdad: un apunte por cobro (o ajuste), con
--     fecha, método y de dónde vino. No se borra: se anula.
--   * orders.data.importe_pagado / importe_pendiente / payment_status /
--     payment_history y quotes.importe_pagado / pago SE CALCULAN del libro.
--     Si alguien escribe esos campos a mano, se recalculan igual.
--   * Registrar: RPC registrar_cobro (web y Calculadora). Para no romper las
--     versiones instaladas de la Calculadora, un apunte nuevo que llegue en
--     payment_history al guardar el pedido también entra en el libro.
--   * Anular: RPC anular_cobro. Quitar un apunte del JSON NO lo anula: una
--     copia vieja del pedido no puede borrar cobros que no conocía.
--   * Un recibo (justificante PDF) documenta un cobro: recibos.cobro_id.
--     Emitirlo es opcional.
--
-- Migración sin pérdidas: cada apunte de payment_history pasa al libro con
-- su id; la diferencia con importe_pagado (pedidos anteriores al historial)
-- entra como «saldo anterior», así que ningún importe cambia. Los recibos de
-- quotes sin pedido se convierten en cobros; los de quotes con pedido se
-- casan con el cobro del mismo importe y, si no hay, quedan en la vista
-- cobros_revisar para decidir a mano (no se suman para no contar dos veces).
-- ============================================================================

create table if not exists public.cobros (
  id             uuid primary key default gen_random_uuid(),
  empresa        text not null references public.empresas (slug),
  order_id       text,                                  -- orders.id
  quote_id       uuid references public.quotes (id) on delete set null,
  importe        numeric(10,2) not null check (importe <> 0),
  metodo         text not null default 'Sin registrar', -- 'Efectivo', 'Bizum'… (texto libre, como la Calculadora)
  fecha          date not null default current_date,
  cobrado_at     timestamptz not null default now(),
  nota           text not null default '',
  tipo           text not null default 'cobro' check (tipo in ('cobro', 'ajuste')),
  origen         text not null default 'calculadora'
                 check (origen in ('calculadora', 'web', 'migracion')),
  fuente         text,                                  -- payment_history[].source original
  legacy_id      text,                                  -- payment_history[].id
  anulado_at     timestamptz,
  anulado_motivo text not null default '',
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  check (order_id is not null or quote_id is not null),
  check (tipo = 'ajuste' or importe > 0)
);

create index if not exists cobros_order_idx on public.cobros (empresa, order_id);
create index if not exists cobros_quote_idx on public.cobros (quote_id);
create unique index if not exists cobros_legacy_uidx
  on public.cobros (empresa, order_id, legacy_id) where legacy_id is not null;

alter table public.recibos
  add column if not exists cobro_id uuid references public.cobros (id) on delete set null;
create index if not exists recibos_cobro_idx on public.recibos (cobro_id);

-- ── RLS: lectura para el admin y para la empresa dueña; escritura solo por
--    las RPC de abajo (security definer) o el service role. ────────────────
alter table public.cobros enable row level security;

drop policy if exists "cobros: admin read" on public.cobros;
create policy "cobros: admin read" on public.cobros
  for select using (public.is_admin());

drop policy if exists "cobros: empresa read" on public.cobros;
create policy "cobros: empresa read" on public.cobros
  for select to authenticated using (empresa = public.user_empresa());

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.ts_seguro(t text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  return nullif(trim(t), '')::timestamptz;
exception when others then
  return null;
end;
$$;

-- quotes.pago
create or replace function public.pago_de(p_total numeric, p_pagado numeric)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_pagado, 0) <= 0 then 'pendiente'
    when p_pagado >= coalesce(p_total, 0) then 'pagado'
    else 'adelanto'
  end;
$$;

-- orders.data.payment_status (paymentStatusFromOrder de la Calculadora)
create or replace function public.payment_status_de(p_total numeric, p_pagado numeric)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_pagado, 0) <= 0 then 'Pendiente'
    when p_pagado >= coalesce(p_total, 0) then 'Pagado'
    else 'Parcial'
  end;
$$;

-- Cobros vivos de un pedido (y de su quote, por si se registraron antes del
-- enlace o solo con quote_id).
create or replace function public.cobros_vivos(p_empresa text, p_order_id text, p_quote_id uuid)
returns setof public.cobros
language sql
stable
security definer
set search_path = public
as $$
  select c.* from public.cobros c
   where c.anulado_at is null
     and ((p_order_id is not null and c.empresa = p_empresa and c.order_id = p_order_id)
          or (p_quote_id is not null and c.quote_id = p_quote_id));
$$;

-- Lo que el libro dice de un pedido, con la forma de normalizeOrder. Los
-- apuntes sin dinero del JSON (cambios de precio, source 'recalculation') se
-- conservan intercalados por fecha.
create or replace function public.proyectar_pagos(p_data jsonb, p_empresa text, p_order_id text, p_quote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with vivos as (
    select * from public.cobros_vivos(p_empresa, p_order_id, p_quote_id)
  ), total as (
    select coalesce(sum(importe), 0) as pagado from vivos
  ), apuntes as (
    select c.cobrado_at as ts,
           jsonb_build_object(
             'id', coalesce(c.legacy_id, c.id::text),
             'cobro_id', c.id,
             'created_at', public.iso_de(c.cobrado_at),
             'method', c.metodo,
             'amount', c.importe,
             'note', c.nota,
             'source', coalesce(c.fuente, case
               when c.tipo = 'ajuste' then 'manual-adjustment'
               when c.origen = 'web' then 'web'
               else 'manual-payment' end)
           ) as e
      from vivos c
    union all
    select coalesce(public.ts_seguro(e ->> 'created_at'), 'epoch'::timestamptz), e
      from jsonb_array_elements(
             case when jsonb_typeof(p_data -> 'payment_history') = 'array'
               then p_data -> 'payment_history' else '[]'::jsonb end) e
     where coalesce(public.jsonb_num(e -> 'amount'), 0) = 0
  )
  select jsonb_build_object(
    'importe_pagado', round(t.pagado, 2),
    'importe_pendiente', round(greatest(0, coalesce(public.jsonb_num(p_data -> 'precio_final'), 0) - t.pagado), 2),
    'payment_status', public.payment_status_de(coalesce(public.jsonb_num(p_data -> 'precio_final'), 0), t.pagado),
    'payment_history', coalesce((select jsonb_agg(a.e order by a.ts) from apuntes a), '[]'::jsonb)
  )
  from total t;
$$;

-- ---------------------------------------------------------------------------
-- Recalcular a partir del libro
-- ---------------------------------------------------------------------------
create or replace function public.recalcular_pagos(p_empresa text, p_order_id text, p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev  text := public.sync_desde();
  v_quote uuid := p_quote_id;
  v_order text := p_order_id;
  v_emp   text := p_empresa;
begin
  -- Completar el otro extremo del enlace.
  if v_order is null and v_quote is not null then
    select empresa, id into v_emp, v_order from public.orders where quote_id = v_quote;
  end if;
  if v_quote is null and v_order is not null then
    select quote_id into v_quote from public.orders where empresa = v_emp and id = v_order;
  end if;

  perform set_config('app.sync_desde', 'cobros', true);
  if v_order is not null then
    -- project_order_to_quote (AFTER) lleva el resultado a la quote.
    update public.orders o
       set data = o.data || public.proyectar_pagos(o.data, o.empresa, o.id, o.quote_id)
     where o.empresa = v_emp and o.id = v_order;
  end if;
  if v_quote is not null then
    -- El BEFORE UPDATE de quotes recalcula importe_pagado y pago.
    update public.quotes set updated_at = now() where id = v_quote;
  end if;
  perform set_config('app.sync_desde', v_prev, true);
end;
$$;

-- Rellena el enlace que falte antes de guardar el cobro.
create or replace function public.cobros_enlazar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_id is null and new.quote_id is not null then
    select o.empresa, o.id into new.empresa, new.order_id
      from public.orders o where o.quote_id = new.quote_id;
    new.empresa := coalesce(new.empresa, '3dcc');
  elsif new.quote_id is null and new.order_id is not null then
    select o.quote_id into new.quote_id
      from public.orders o where o.empresa = new.empresa and o.id = new.order_id;
  end if;
  return new;
end;
$$;

create or replace function public.cobros_recalcular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.sync_desde() = 'cobros' then
    return null;
  end if;
  perform public.recalcular_pagos(new.empresa, new.order_id, new.quote_id);
  if tg_op = 'UPDATE'
     and (old.order_id, old.quote_id) is distinct from (new.order_id, new.quote_id) then
    perform public.recalcular_pagos(old.empresa, old.order_id, old.quote_id);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pedido guardado desde la Calculadora
-- ---------------------------------------------------------------------------
-- 1. Apuntes nuevos de payment_history → libro (compatibilidad con las
--    versiones instaladas, que registran cobros editando el JSON).
-- 2. Los campos de dinero se sobrescriben con lo que diga el libro: una
--    copia vieja del pedido no puede deshacer un cobro hecho en la web.
create or replace function public.sincronizar_cobros_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e      jsonb;
  v_amt  numeric;
  v_eid  text;
  v_ts   timestamptz;
  v_prev text := public.sync_desde();
begin
  if v_prev = 'cobros' then
    return new;  -- recálculo en curso: ya viene proyectado
  end if;

  perform set_config('app.sync_desde', 'cobros', true);
  for e in select * from jsonb_array_elements(
    case when jsonb_typeof(new.data -> 'payment_history') = 'array'
      then new.data -> 'payment_history' else '[]'::jsonb end
  ) loop
    v_amt := round(coalesce(public.jsonb_num(e -> 'amount'), 0), 2);
    if v_amt = 0 or e ->> 'source' = 'recalculation' then
      continue;
    end if;
    v_eid := coalesce(nullif(e ->> 'id', ''), md5(e::text));
    -- Ya en el libro (vivo o anulado): no se reimporta.
    if exists (
      select 1 from public.cobros c
       where c.empresa = new.empresa and c.order_id = new.id
         and (c.legacy_id = v_eid or c.id::text = v_eid)
    ) then
      continue;
    end if;
    v_ts := coalesce(public.ts_seguro(e ->> 'created_at'), now());
    insert into public.cobros (
      empresa, order_id, quote_id, importe, metodo, fecha, cobrado_at, nota,
      tipo, origen, fuente, legacy_id
    ) values (
      new.empresa, new.id, new.quote_id, v_amt,
      coalesce(nullif(trim(e ->> 'method'), ''), 'Sin registrar'),
      public.en_madrid(v_ts)::date, v_ts,
      coalesce(e ->> 'note', ''),
      -- «Pago recibido» en la Calculadora es un manual-adjustment positivo: un
      -- cobro de verdad. Solo lo negativo (correcciones a la baja) es ajuste.
      case when v_amt < 0 then 'ajuste' else 'cobro' end,
      'calculadora', nullif(e ->> 'source', ''), v_eid
    );
  end loop;

  new.data := new.data || public.proyectar_pagos(new.data, new.empresa, new.id, new.quote_id);
  perform set_config('app.sync_desde', v_prev, true);
  return new;
end;
$$;

-- quotes: importe_pagado y pago salen siempre del libro.
create or replace function public.pagos_quote_desde_cobros()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp    text;
  v_order  text;
  v_pagado numeric;
begin
  select empresa, id into v_emp, v_order from public.orders where quote_id = new.id;
  select coalesce(sum(importe), 0) into v_pagado
    from public.cobros_vivos(v_emp, v_order, new.id);
  new.importe_pagado := round(v_pagado, 2);
  new.pago := public.pago_de(coalesce(new.precio_final, new.precio_total), v_pagado);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
create or replace function public.registrar_cobro(
  p_importe  numeric,
  p_metodo   text,
  p_quote_id uuid default null,
  p_empresa  text default null,
  p_order_id text default null,
  p_fecha    date default null,
  p_nota     text default '',
  p_tipo     text default 'cobro'
)
returns public.cobros
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_emp   text := p_empresa;
  v_order text := p_order_id;
  v_quote uuid := p_quote_id;
  v_imp   numeric := round(coalesce(p_importe, 0), 2);
  v_fila  public.cobros;
begin
  if v_order is null and v_quote is not null then
    select empresa, id into v_emp, v_order from public.orders where quote_id = v_quote;
  end if;
  v_emp := coalesce(v_emp, '3dcc');
  if v_order is not null and not exists (
    select 1 from public.orders where empresa = v_emp and id = v_order
  ) then
    raise exception 'Pedido % no encontrado.', v_order;
  end if;
  if v_order is null and v_quote is null then
    raise exception 'Falta el pedido o el presupuesto.';
  end if;
  if not (public.is_admin() or coalesce(public.user_empresa() = v_emp, false)) then
    raise exception 'No autorizado para registrar cobros de %.', v_emp;
  end if;
  if v_imp = 0 or abs(v_imp) > 100000 then
    raise exception 'Importe no válido.';
  end if;
  if coalesce(p_tipo, 'cobro') = 'cobro' and v_imp < 0 then
    raise exception 'Un cobro no puede ser negativo: usa un ajuste.';
  end if;
  if coalesce(trim(p_metodo), '') = '' then
    raise exception 'Indica el método de cobro.';
  end if;

  insert into public.cobros (
    empresa, order_id, quote_id, importe, metodo, fecha, cobrado_at, nota, tipo, origen
  ) values (
    v_emp, v_order, v_quote, v_imp, trim(p_metodo),
    coalesce(p_fecha, public.en_madrid(now())::date),
    case when p_fecha is null or p_fecha = public.en_madrid(now())::date
      then now() else public.desde_madrid(p_fecha + time '12:00') end,
    coalesce(p_nota, ''),
    coalesce(p_tipo, 'cobro'),
    case when public.is_admin() and public.user_empresa() is null then 'web' else 'calculadora' end
  )
  returning * into v_fila;
  return v_fila;
end;
$$;

-- Anula por id del libro o por el id que ve la Calculadora en payment_history.
create or replace function public.anular_cobro(
  p_cobro_id   uuid default null,
  p_empresa    text default null,
  p_order_id   text default null,
  p_payment_id text default null,
  p_motivo     text default ''
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_fila public.cobros;
begin
  if p_cobro_id is not null then
    select * into v_fila from public.cobros where id = p_cobro_id;
  else
    select * into v_fila from public.cobros
     where empresa = coalesce(p_empresa, '3dcc') and order_id = p_order_id
       and (legacy_id = p_payment_id or id::text = p_payment_id)
     order by anulado_at nulls first
     limit 1;
  end if;
  if not found then
    raise exception 'Cobro no encontrado.';
  end if;
  if not (public.is_admin() or coalesce(public.user_empresa() = v_fila.empresa, false)) then
    raise exception 'No autorizado para anular cobros de %.', v_fila.empresa;
  end if;
  update public.cobros
     set anulado_at = now(), anulado_motivo = left(coalesce(p_motivo, ''), 500)
   where id = v_fila.id and anulado_at is null;
  return found;
end;
$$;

revoke all on function public.registrar_cobro(numeric, text, uuid, text, text, date, text, text) from public;
revoke all on function public.anular_cobro(uuid, text, text, text, text) from public;
grant execute on function public.registrar_cobro(numeric, text, uuid, text, text, date, text, text) to authenticated;
grant execute on function public.anular_cobro(uuid, text, text, text, text) to authenticated;

-- Justificantes que no se pudieron casar con un cobro al migrar.
create or replace view public.cobros_revisar
with (security_invoker = true) as
  select r.id as recibo_id, r.codigo as recibo, q.codigo as pedido, r.importe,
         r.metodo, r.fecha_pago, r.created_at
    from public.recibos r
    join public.quotes q on q.id = r.quote_id
   where r.cobro_id is null and r.anulado_at is null;

grant select on public.cobros_revisar to authenticated;

-- ---------------------------------------------------------------------------
-- Migración de lo que ya hay (antes de los triggers: sin recálculos a medias)
-- ---------------------------------------------------------------------------
-- 1. payment_history → libro, con su id.
insert into public.cobros (
  empresa, order_id, quote_id, importe, metodo, fecha, cobrado_at, nota,
  tipo, origen, fuente, legacy_id
)
select distinct on (o.empresa, o.id, coalesce(nullif(e ->> 'id', ''), md5(e::text)))
  o.empresa, o.id, o.quote_id,
  round(public.jsonb_num(e -> 'amount'), 2),
  coalesce(nullif(trim(e ->> 'method'), ''), 'Sin registrar'),
  public.en_madrid(coalesce(public.ts_seguro(e ->> 'created_at'), o.created_at))::date,
  coalesce(public.ts_seguro(e ->> 'created_at'), o.created_at),
  coalesce(e ->> 'note', ''),
  case when public.jsonb_num(e -> 'amount') < 0
    then 'ajuste' else 'cobro' end,
  'migracion', nullif(e ->> 'source', ''),
  coalesce(nullif(e ->> 'id', ''), md5(e::text))
from public.orders o
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(o.data -> 'payment_history') = 'array'
    then o.data -> 'payment_history' else '[]'::jsonb end
) e
where round(coalesce(public.jsonb_num(e -> 'amount'), 0), 2) <> 0
  and coalesce(e ->> 'source', '') <> 'recalculation'
on conflict do nothing;

-- 2. Lo que importe_pagado tiene de más (o de menos) sobre el historial.
insert into public.cobros (
  empresa, order_id, quote_id, importe, metodo, fecha, cobrado_at, nota,
  tipo, origen, fuente, legacy_id
)
select o.empresa, o.id, o.quote_id, s.resto,
       coalesce(nullif(trim(o.data ->> 'payment_method'), ''), 'Sin registrar'),
       public.en_madrid(s.ts)::date, s.ts,
       'Saldo anterior al libro de cobros',
       case when s.resto < 0 then 'ajuste' else 'cobro' end,
       'migracion', 'saldo-inicial', 'saldo-inicial'
  from public.orders o
  cross join lateral (
    select round(coalesce(public.jsonb_num(o.data -> 'importe_pagado'), 0)
                 - coalesce((select sum(c.importe) from public.cobros c
                              where c.empresa = o.empresa and c.order_id = o.id), 0), 2) as resto,
           coalesce(public.ts_seguro(o.data ->> 'last_status_update'),
                    public.ts_seguro(o.data ->> 'created_at'),
                    o.created_at) as ts
  ) s
 where s.resto <> 0
on conflict do nothing;

-- 3. Recibos de quotes con pedido: casar con el cobro del mismo importe.
do $$
declare
  r record;
  v_cobro uuid;
begin
  for r in
    select rc.id, rc.importe, o.empresa, o.id as order_id
      from public.recibos rc
      join public.orders o on o.quote_id = rc.quote_id
     where rc.cobro_id is null and rc.anulado_at is null
     order by rc.created_at
  loop
    select c.id into v_cobro
      from public.cobros c
     where c.empresa = r.empresa and c.order_id = r.order_id
       and c.importe = r.importe and c.anulado_at is null
       and not exists (select 1 from public.recibos x where x.cobro_id = c.id)
     order by c.cobrado_at
     limit 1;
    if v_cobro is not null then
      update public.recibos set cobro_id = v_cobro where id = r.id;
    end if;
  end loop;
end $$;

-- 4. Quotes sin pedido: cada recibo vivo es un cobro…
do $$
declare
  r record;
  v_cobro uuid;
begin
  for r in
    select rc.* from public.recibos rc
     where rc.cobro_id is null and rc.anulado_at is null
       and not exists (select 1 from public.orders o where o.quote_id = rc.quote_id)
     order by rc.created_at
  loop
    insert into public.cobros (
      empresa, quote_id, importe, metodo, fecha, cobrado_at, nota, tipo, origen, fuente
    ) values (
      '3dcc', r.quote_id, r.importe, initcap(r.metodo), r.fecha_pago,
      public.desde_madrid(r.fecha_pago + time '12:00'),
      coalesce(nullif(r.concepto, ''), 'Justificante ' || r.codigo),
      'cobro', 'migracion', 'recibo'
    ) returning id into v_cobro;
    update public.recibos set cobro_id = v_cobro where id = r.id;
  end loop;
end $$;

-- …y lo que importe_pagado tenga de más, saldo anterior.
insert into public.cobros (empresa, quote_id, importe, metodo, fecha, cobrado_at, nota, tipo, origen, fuente)
select '3dcc', q.id, s.resto, 'Sin registrar',
       public.en_madrid(q.updated_at)::date, q.updated_at,
       'Saldo anterior al libro de cobros',
       case when s.resto < 0 then 'ajuste' else 'cobro' end,
       'migracion', 'saldo-inicial'
  from public.quotes q
  cross join lateral (
    select round(q.importe_pagado - coalesce((select sum(c.importe) from public.cobros c
                                               where c.quote_id = q.id and c.anulado_at is null), 0), 2) as resto
  ) s
 where not exists (select 1 from public.orders o where o.quote_id = q.id)
   and s.resto <> 0;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists cobros_enlazar on public.cobros;
create trigger cobros_enlazar
  before insert on public.cobros
  for each row execute function public.cobros_enlazar();

drop trigger if exists cobros_recalcular on public.cobros;
create trigger cobros_recalcular
  after insert or update on public.cobros
  for each row execute function public.cobros_recalcular();

-- «sincronizar_…» va después de «proteger_estado_order» (orden alfabético).
drop trigger if exists sincronizar_cobros_order on public.orders;
create trigger sincronizar_cobros_order
  before insert or update on public.orders
  for each row execute function public.sincronizar_cobros_order();

drop trigger if exists pagos_quote_desde_cobros on public.quotes;
create trigger pagos_quote_desde_cobros
  before update on public.quotes
  for each row execute function public.pagos_quote_desde_cobros();
