-- ============================================================================
-- Fase 2 del plan Calculadora → web (docs/plan-calculadora/02-pedido-estandar.md):
-- pedido estándar con fecha prometida, urgencia, señal y precio firme.
--
-- A. Fecha prometida
--    quotes.fecha_prometida (date) se fija al pasar a «aceptado» con
--    fecha_tope(): horas pendientes de los pedidos en aceptado/imprimiendo +
--    las de este, entre plazo_horas_dia (4), más días de diseño/post-procesado
--    y la holgura (plazo_holgura_dias, 2), en días laborables (lunes a
--    viernes; los festivos no se cuentan). quotes.listo_at se rellena al pasar
--    a «listo», para medir la puntualidad.
--    El JS de lib/quote/pricing.ts (fechaTope) y su copia en submit-quote
--    hacen la misma cuenta para la fecha orientativa: mantener los tres a la par.
-- B. Urgencia (solo admin): quotes.urgente; con ella la fecha ignora la cola.
--    Un pedido de la Calculadora marcado «Urgente» cuenta igual.
-- D. Precio firme: quotes.precio_firme lo decide submit-quote. Con él, el
--    precio final no puede ser distinto del mostrado (precio_total); para
--    cambiarlo, rehacer_presupuesto() pide el motivo y reinicia la aceptación.
--    El desvío (coste real − coste estimado) se guarda por pedido.
--    La lista de tipos validados (quote_settings.tipos_precio_firme) empieza
--    VACÍA: hasta que el banco de pruebas lo respalde, nada es firme.
--
-- orders no cambia de forma: la Calculadora 7.2 sigue leyendo y guardando lo
-- mismo. Los triggers de 0026/0027 no se tocan; los nuevos solo leen orders.
-- ============================================================================

alter table public.quotes
  add column if not exists fecha_prometida date,
  add column if not exists listo_at        timestamptz,
  add column if not exists urgente         boolean not null default false,
  add column if not exists precio_firme    boolean not null default false,
  -- Coste de impresión del pedido (coste_bruto de la Calculadora): el primero
  -- que se ve es la estimación; el último, el real tras laminar.
  add column if not exists coste_estimado  numeric(10,2),
  add column if not exists coste_real      numeric(10,2),
  add column if not exists rehecho_motivo  text not null default '',
  add column if not exists rehecho_at      timestamptz;

alter table public.quotes
  add column if not exists desvio_coste numeric(10,2)
    generated always as (coste_real - coste_estimado) stored;

-- ---------------------------------------------------------------------------
-- Ajustes: 4 h de impresión al día y 2 días laborables de holgura. La holgura
-- sustituye a plazo_dias_margen (mismo papel). Urgencia +50 % como la
-- Calculadora (URGENCIA.Urgente = 0.5). Lista de tipos firmes vacía.
-- ---------------------------------------------------------------------------
update public.quote_settings
   set config = (config - 'plazo_dias_margen') || jsonb_build_object(
         'plazo_horas_dia', 4,
         'plazo_holgura_dias', coalesce(config -> 'plazo_holgura_dias', '2'::jsonb),
         'urgencia_recargo_pct', coalesce(config -> 'urgencia_recargo_pct', '50'::jsonb),
         'tipos_precio_firme', coalesce(config -> 'tipos_precio_firme', '[]'::jsonb)
       )
 where id = 1;

-- ---------------------------------------------------------------------------
-- Cuentas de plazo
-- ---------------------------------------------------------------------------
-- p_dias laborables después de p_desde. Si p_desde cae en fin de semana se
-- empieza a contar el lunes. Mismo algoritmo que sumarLaborables (pricing.ts).
create or replace function public.sumar_laborables(p_desde date, p_dias integer)
returns date
language plpgsql
immutable
as $$
declare
  d date := p_desde;
  n integer := greatest(0, coalesce(p_dias, 0));
begin
  while extract(isodow from d) > 5 loop
    d := d + 1;
  end loop;
  while n > 0 loop
    d := d + 1;
    if extract(isodow from d) <= 5 then
      n := n - 1;
    end if;
  end loop;
  return d;
end;
$$;

-- Horas de impresión de un pedido: las del pedido de la Calculadora (el
-- taller las corrige al laminar) o, si no, las del tasador.
create or replace function public.horas_pedido(p_quote_id uuid, p_metricas jsonb)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.jsonb_num(o.data -> 'horas') from public.orders o
      where o.quote_id = p_quote_id and public.jsonb_num(o.data -> 'horas') > 0
      limit 1),
    public.jsonb_num(p_metricas -> 'tiempo_h'),
    0);
$$;

-- Días de diseño y post-procesado del pedido de la Calculadora.
-- ponytail: 1 día por diseño medio/alto y 1 por post-procesado; «A medida»,
-- sus horas entre 8 por día. Afinar con la puntualidad medida (listo_at).
create or replace function public.dias_extra_pedido(p_quote_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (case
              when o.data ->> 'diseno_modelado' like 'A medida%'
                then greatest(1, ceil(coalesce(public.jsonb_num(o.data -> 'diseno_horas'), 0) / 8))::integer
              when o.data ->> 'diseno_modelado' like 'Media%'
                or o.data ->> 'diseno_modelado' like 'Alta%' then 1
              else 0
            end)
         + (case when coalesce(o.data ->> 'postprocesado_label', 'Limpio') in ('', 'Limpio') then 0 else 1 end)
      from public.orders o
     where o.quote_id = p_quote_id
     limit 1), 0);
$$;

create or replace function public.pedido_urgente(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.orders o
                  where o.quote_id = p_quote_id and o.data ->> 'urgencia_nivel' = 'Urgente');
$$;

-- Horas en cola: pedidos aceptados o imprimiéndose (menos p_excluir).
-- Pública: el tasador la usa para la fecha orientativa. Solo da un número.
create or replace function public.plazo_cola_horas(p_excluir uuid default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(public.horas_pedido(q.id, q.metricas)), 0)
    from public.quotes q
   where q.estado in ('aceptado', 'imprimiendo')
     and not q.archivado
     and (p_excluir is null or q.id <> p_excluir);
$$;

grant execute on function public.plazo_cola_horas(uuid) to anon, authenticated;

create or replace function public.fecha_tope(
  p_horas numeric,
  p_dias_extra integer default 0,
  p_urgente boolean default false,
  p_excluir uuid default null
)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg   jsonb;
  v_hpd numeric;
  v_hol integer;
  v_cola numeric;
begin
  select config into cfg from public.quote_settings where id = 1;
  v_hpd := greatest(1, coalesce(public.jsonb_num(cfg -> 'plazo_horas_dia'), 4));
  v_hol := greatest(0, round(coalesce(public.jsonb_num(cfg -> 'plazo_holgura_dias'), 2)))::integer;
  v_cola := case when p_urgente then 0 else public.plazo_cola_horas(p_excluir) end;
  return public.sumar_laborables(
    public.en_madrid(now())::date,
    ceil(greatest(0, v_cola + coalesce(p_horas, 0)) / v_hpd)::integer
      + greatest(0, coalesce(p_dias_extra, 0))
      + v_hol);
end;
$$;

grant execute on function public.fecha_tope(numeric, integer, boolean, uuid) to anon, authenticated;

-- Fecha de un pedido ya guardado (lo que usan el trigger y el seguimiento).
create or replace function public.fecha_tope_quote(p_quote_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select public.fecha_tope(
           public.horas_pedido(q.id, q.metricas),
           public.dias_extra_pedido(q.id),
           q.urgente or public.pedido_urgente(q.id),
           q.id)
    from public.quotes q where q.id = p_quote_id;
$$;

-- ---------------------------------------------------------------------------
-- Trigger en quotes: fecha al aceptar, listo_at, precio firme
-- ---------------------------------------------------------------------------
create or replace function public.quote_pedido_estandar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aceptando boolean;
begin
  -- D. Precio firme: el final no puede ser distinto del mostrado.
  if tg_op = 'UPDATE' and old.precio_firme then
    if not new.precio_firme
       and (coalesce(trim(new.rehecho_motivo), '') = ''
            or new.rehecho_motivo is not distinct from old.rehecho_motivo) then
      raise exception 'Precio firme: para cambiarlo usa «Rehacer presupuesto» con el motivo.';
    end if;
    if new.precio_firme
       and new.precio_final is distinct from old.precio_final
       and coalesce(new.precio_final, new.precio_total) <> new.precio_total then
      if public.sync_desde() = 'orders' then
        -- Guardado de la Calculadora: no se puede tumbar (perdería el pedido
        -- entero). Se conserva el precio firme y queda en el log.
        raise warning 'quote % tiene precio firme: se ignora precio_final % de la Calculadora',
          new.codigo, new.precio_final;
        new.precio_final := old.precio_final;
      else
        raise exception 'Precio firme: el precio final debe ser %; para cambiarlo usa «Rehacer presupuesto».',
          new.precio_total;
      end if;
    end if;
  end if;

  -- A. Fecha prometida al entrar en aceptado/imprimiendo desde antes de aceptar.
  v_aceptando := new.estado in ('aceptado', 'imprimiendo')
    and (tg_op = 'INSERT' or old.estado in ('nuevo', 'revisado', 'rechazado'));
  if v_aceptando and new.fecha_prometida is null then
    new.fecha_prometida := public.fecha_tope(
      public.horas_pedido(new.id, new.metricas),
      public.dias_extra_pedido(new.id),
      new.urgente or public.pedido_urgente(new.id),
      new.id);
  elsif tg_op = 'UPDATE'
        and new.urgente is distinct from old.urgente
        and new.estado in ('aceptado', 'imprimiendo')
        and new.fecha_prometida is not distinct from old.fecha_prometida then
    -- B. Marcar urgente (o dejar de serlo) un pedido en marcha recalcula.
    new.fecha_prometida := public.fecha_tope(
      public.horas_pedido(new.id, new.metricas),
      public.dias_extra_pedido(new.id),
      new.urgente or public.pedido_urgente(new.id),
      new.id);
  end if;

  if new.estado = 'listo' and new.listo_at is null
     and (tg_op = 'INSERT' or old.estado is distinct from 'listo') then
    new.listo_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists quote_pedido_estandar on public.quotes;
create trigger quote_pedido_estandar
  before insert or update on public.quotes
  for each row execute function public.quote_pedido_estandar();

-- ---------------------------------------------------------------------------
-- D. Rehacer presupuesto: el cliente cambió el encargo. Quita el precio
-- firme, guarda el motivo y vuelve a «presupuestado» con validez y enlace de
-- aceptación nuevos (el enlace viejo deja de valer).
-- ---------------------------------------------------------------------------
create or replace function public.rehacer_presupuesto(p_quote_id uuid, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_dias integer;
begin
  if not public.is_admin() then
    raise exception 'Solo el admin puede rehacer un presupuesto.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Hace falta el motivo.';
  end if;
  select greatest(1, round(coalesce(public.jsonb_num(config -> 'validez_dias'), 15)))::integer
    into v_dias from public.quote_settings where id = 1;
  update public.quotes
     set precio_firme    = false,
         rehecho_motivo  = trim(p_motivo),
         rehecho_at      = now(),
         estado          = 'revisado',
         aceptado_at     = null,
         fecha_prometida = null,
         acepta_token    = gen_random_uuid(),
         valido_hasta    = now() + make_interval(days => coalesce(v_dias, 15))
   where id = p_quote_id;
  if not found then
    raise exception 'Presupuesto no encontrado.';
  end if;
end;
$$;

revoke all on function public.rehacer_presupuesto(uuid, text) from public;
grant execute on function public.rehacer_presupuesto(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- D. Desvío: coste real − coste estimado, por pedido. Solo pedidos del
-- tasador (los de la Calculadora no tienen estimación previa).
-- ---------------------------------------------------------------------------
create or replace function public.registrar_coste_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev  text := public.sync_desde();
  v_coste numeric := public.jsonb_num(new.data -> 'coste_bruto');
begin
  if new.quote_id is null or v_coste is null then
    return null;
  end if;
  perform set_config('app.sync_desde', 'orders', true);
  update public.quotes q
     set coste_estimado = coalesce(q.coste_estimado, round(v_coste, 2)),
         coste_real     = round(v_coste, 2)
   where q.id = new.quote_id
     and q.origen = 'web'
     and (q.coste_real is distinct from round(v_coste, 2) or q.coste_estimado is null);
  perform set_config('app.sync_desde', v_prev, true);
  return null;
end;
$$;

drop trigger if exists registrar_coste_pedido on public.orders;
create trigger registrar_coste_pedido
  after insert or update of data, quote_id on public.orders
  for each row execute function public.registrar_coste_pedido();

-- ---------------------------------------------------------------------------
-- Seguimiento público: fecha prometida (o la orientativa si aún no está
-- aceptado) y cuándo quedó listo. RPC aparte para no cambiar el tipo de
-- get_quote_status (obligaría a drop function).
-- ---------------------------------------------------------------------------
create or replace function public.get_quote_plazo(p_codigo text)
returns table (fecha_prometida date, fecha_orientativa date, listo_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select q.fecha_prometida,
         case when q.fecha_prometida is null and q.estado in ('nuevo', 'revisado')
           then public.fecha_tope_quote(q.id) end,
         q.listo_at
    from public.quotes q
   where q.codigo = upper(trim(p_codigo))
     and not q.archivado
   limit 1;
$$;

grant execute on function public.get_quote_plazo(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Relleno: los pedidos ya en marcha reciben su fecha (contada desde hoy).
-- ---------------------------------------------------------------------------
update public.quotes q
   set fecha_prometida = public.fecha_tope_quote(q.id)
 where q.estado in ('aceptado', 'imprimiendo')
   and not q.archivado
   and q.fecha_prometida is null;
