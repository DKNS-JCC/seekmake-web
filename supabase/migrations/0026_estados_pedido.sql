-- ============================================================================
-- Fase B de docs/plan-sincronizacion-web-calculadora.md: un solo vocabulario
-- de estados y sincronización en los DOS sentidos.
--
-- Hasta aquí solo viajaba pedido → web (0017). Cambiar el estado en
-- /admin/presupuestos, o que el cliente aceptase en la web, no llegaba a la
-- Calculadora, y el siguiente guardado del pedido lo pisaba.
--
-- 1. pedido_estados: la lista común, con la etiqueta que usa la Calculadora
--    (orders.data.estado) y el código que usa la web (quotes.estado). Los dos
--    mapeos se leen de aquí, así que añadir un estado es una fila, no dos
--    funciones que mantener a la par.
-- 2. quotes → orders: al cambiar quotes.estado (admin, accept_quote,
--    calc_reject_quote…) el pedido enlazado cambia también.
-- 3. Anti-bucle: cada proyección marca la transacción con app.sync_desde y la
--    proyección contraria no se dispara mientras esté puesta. Además solo se
--    escribe si el valor cambia de verdad.
-- 4. Guardados obsoletos: la Calculadora guarda el pedido ENTERO (upsert del
--    JSON). Si otro sitio cambió el estado después de que la app cargase el
--    pedido, su guardado traería el estado viejo. Cada cambio de estado lleva
--    last_status_update; si el que llega es más antiguo que el guardado, se
--    conserva el estado del servidor. Gana siempre el cambio más reciente.
--
-- Los valores guardados no cambian: los pedidos siguen con sus etiquetas y
-- las quotes con sus códigos, así que las apps ya instaladas siguen
-- funcionando. «Descartado» (y los legados «Rechazado»/«Enviado») se mapean.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Vocabulario común
-- ---------------------------------------------------------------------------
create table if not exists public.pedido_estados (
  clave        text primary key,
  orden        integer not null unique,
  etiqueta     text not null unique,   -- orders.data.estado (Calculadora)
  estado_quote text not null,          -- quotes.estado (web)
  descripcion  text not null default ''
);

insert into public.pedido_estados (clave, orden, etiqueta, estado_quote, descripcion) values
  ('nuevo',         1, 'Nuevo',               'nuevo',       'Solicitud recibida, sin presupuesto enviado'),
  ('presupuestado', 2, 'Presupuesto enviado', 'revisado',    'Presupuesto enviado al cliente, esperando respuesta'),
  ('aceptado',      3, 'Aceptado',            'aceptado',    'El cliente dijo que sí'),
  ('imprimiendo',   4, 'En producción',       'imprimiendo', 'En la impresora'),
  ('postprocesado', 5, 'Post-procesado',      'imprimiendo', 'Lijado, pintura o montaje'),
  ('listo',         6, 'Listo para entregar', 'listo',       'Terminado, pendiente de recogida o envío'),
  ('entregado',     7, 'Entregado',           'entregado',   'En manos del cliente'),
  ('descartado',    8, 'Descartado',          'rechazado',   'Rechazado o sin respuesta del cliente')
on conflict (clave) do update set
  orden = excluded.orden,
  etiqueta = excluded.etiqueta,
  estado_quote = excluded.estado_quote,
  descripcion = excluded.descripcion;

alter table public.pedido_estados enable row level security;
drop policy if exists "pedido_estados: public read" on public.pedido_estados;
create policy "pedido_estados: public read" on public.pedido_estados
  for select using (true);

-- Etiquetas antiguas de la Calculadora → etiqueta actual (normalizeEstado).
create or replace function public.normalizar_estado_order(e text)
returns text
language sql
immutable
as $$
  select case trim(coalesce(e, ''))
    when ''           then null
    when 'Enviado'    then 'Presupuesto enviado'
    when 'Rechazado'  then 'Descartado'
    when 'descartado' then 'Descartado'
    else trim(e)
  end;
$$;

-- Pedido → web. Sustituye a la de 0017/0025 (misma firma, ya la usa
-- project_order_to_quote). Desconocido → null: no tocar la quote.
create or replace function public.map_order_estado_to_quote(e text)
returns text
language sql
stable
set search_path = public
as $$
  select estado_quote from public.pedido_estados
   where etiqueta = public.normalizar_estado_order(e);
$$;

-- Web → pedido. La web no distingue producción de post-procesado: si el
-- pedido ya está en cualquiera de los dos, 'imprimiendo' no lo mueve.
create or replace function public.map_quote_estado_to_order(q text, actual text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when q = 'imprimiendo'
     and public.normalizar_estado_order(actual) in ('En producción', 'Post-procesado')
      then public.normalizar_estado_order(actual)
    else (select etiqueta from public.pedido_estados
           where estado_quote = q order by orden limit 1)
  end;
$$;

-- Mismo formato que Date.prototype.toISOString(): los last_status_update de
-- la Calculadora y los del servidor se comparan como texto.
create or replace function public.iso_ahora()
returns text
language sql
stable
as $$
  select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- ¿Quién está proyectando en esta transacción? ('' = nadie)
create or replace function public.sync_desde()
returns text
language sql
stable
as $$
  select coalesce(current_setting('app.sync_desde', true), '');
$$;

-- ---------------------------------------------------------------------------
-- Pedido → web (0017, ahora con marca anti-bucle)
-- ---------------------------------------------------------------------------
create or replace function public.project_order_to_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := public.sync_desde();
begin
  if new.quote_id is null or v_prev = 'quotes' then
    return new;
  end if;
  perform set_config('app.sync_desde', 'orders', true);
  update public.quotes q
     set estado         = coalesce(public.map_order_estado_to_quote(new.data ->> 'estado'), q.estado),
         pago           = coalesce(public.map_payment_to_pago(new.data ->> 'payment_status'), q.pago),
         precio_final   = coalesce(nullif(new.data ->> 'precio_final', '')::numeric, q.precio_final),
         importe_pagado = coalesce(nullif(new.data ->> 'importe_pagado', '')::numeric, q.importe_pagado)
   where q.id = new.quote_id
     and (q.estado, q.pago, q.precio_final, q.importe_pagado) is distinct from (
           coalesce(public.map_order_estado_to_quote(new.data ->> 'estado'), q.estado),
           coalesce(public.map_payment_to_pago(new.data ->> 'payment_status'), q.pago),
           coalesce(nullif(new.data ->> 'precio_final', '')::numeric, q.precio_final),
           coalesce(nullif(new.data ->> 'importe_pagado', '')::numeric, q.importe_pagado)
         );
  perform set_config('app.sync_desde', v_prev, true);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Web → pedido
-- ---------------------------------------------------------------------------
create or replace function public.project_quote_to_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev  text := public.sync_desde();
  o       record;
  v_nuevo text;
  v_ahora text := public.iso_ahora();
  v_patch jsonb;
begin
  if v_prev = 'orders' or new.estado is not distinct from old.estado then
    return new;
  end if;

  for o in select empresa, id, data from public.orders where quote_id = new.id loop
    v_nuevo := public.map_quote_estado_to_order(new.estado, o.data ->> 'estado');
    if v_nuevo is null
       or v_nuevo is not distinct from public.normalizar_estado_order(o.data ->> 'estado') then
      continue;
    end if;

    v_patch := jsonb_build_object('estado', v_nuevo, 'last_status_update', v_ahora);
    -- Lo que la Calculadora apunta al aceptar (setOrderAccepted): fecha de
    -- aceptación y material dado por gastado.
    if v_nuevo not in ('Nuevo', 'Presupuesto enviado', 'Descartado') then
      if coalesce(o.data ->> 'accepted_at', '') = '' then
        v_patch := v_patch || jsonb_build_object('accepted_at', v_ahora);
      end if;
      v_patch := v_patch || jsonb_build_object('material_contabilizado', true);
    end if;

    perform set_config('app.sync_desde', 'quotes', true);
    update public.orders
       set data = data || v_patch
     where empresa = o.empresa and id = o.id;
    perform set_config('app.sync_desde', v_prev, true);
  end loop;
  return new;
end;
$$;

drop trigger if exists project_quote_to_order on public.quotes;
create trigger project_quote_to_order
  after update of estado on public.quotes
  for each row execute function public.project_quote_to_order();

-- ---------------------------------------------------------------------------
-- Guardados obsoletos de la Calculadora
-- ---------------------------------------------------------------------------
-- Si el JSON que llega cambia el estado pero trae un last_status_update más
-- antiguo que el guardado, es una copia vieja: se queda el estado del
-- servidor (y lo que va con él). El resto del pedido sí se guarda.
create or replace function public.proteger_estado_order()
returns trigger
language plpgsql
as $$
declare
  v_old_ts text := coalesce(old.data ->> 'last_status_update', '');
  v_new_ts text := coalesce(new.data ->> 'last_status_update', '');
begin
  if public.sync_desde() = 'quotes' then
    return new;
  end if;
  if public.normalizar_estado_order(new.data ->> 'estado')
       is distinct from public.normalizar_estado_order(old.data ->> 'estado')
     and v_new_ts < v_old_ts then
    new.data := new.data || jsonb_strip_nulls(jsonb_build_object(
      'estado',                 old.data -> 'estado',
      'last_status_update',     old.data -> 'last_status_update',
      'accepted_at',            old.data -> 'accepted_at',
      'material_contabilizado', old.data -> 'material_contabilizado'
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_estado_order on public.orders;
create trigger proteger_estado_order
  before update on public.orders
  for each row execute function public.proteger_estado_order();
