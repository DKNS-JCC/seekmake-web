-- ============================================================================
-- Fase C de docs/plan-sincronizacion-web-calculadora.md: un pedido = una
-- quote (lo que ve el cliente) + un order (lo que ve el taller). Siempre 1:1.
--
-- * Solicitud del tasador → se crea su pedido en la Calculadora, en «Nuevo»,
--   con los gramos y horas del estimador y el coste calculado con la config
--   real de 3DCC. La bandeja «Presupuestos web» pasa a ser la lista de
--   pedidos en «Nuevo».
-- * Pedido hecho a mano en la Calculadora (3DCC) → se crea su quote
--   (origen 'calculadora'): código Q-AAAA-NNNN, seguimiento en /presupuesto,
--   aceptación en un clic, recibos y envíos como cualquier pedido web, y
--   aparece en /admin/presupuestos.
-- * Los pedidos de SILAB3D no tienen quote: la web es de 3DCC.
--
-- Anti-bucle: las dos creaciones marcan app.sync_desde (0026) y la contraria
-- no se dispara. Nada de esto manda correos.
-- ============================================================================

alter table public.quotes
  add column if not exists origen text not null default 'web',
  -- Qué se encarga, en palabras del taller. Las solicitudes web lo llevan en
  -- los nombres de archivo; los pedidos de la Calculadora, aquí.
  add column if not exists descripcion text not null default '';

alter table public.quotes drop constraint if exists quotes_origen_check;
alter table public.quotes add constraint quotes_origen_check
  check (origen in ('web', 'calculadora'));

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
-- Ids de pedido como los de la Calculadora: 8 caracteres en mayúsculas.
create or replace function public.nuevo_order_id(p_empresa text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v text;
begin
  loop
    v := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.orders where empresa = p_empresa and id = v);
  end loop;
  return v;
end;
$$;

-- Hora de España. Con respaldo a UTC por si el servidor no trae la base de
-- zonas horarias (el Postgres de pruebas en Windows no la trae).
create or replace function public.en_madrid(t timestamptz)
returns timestamp
language plpgsql
stable
as $$
begin
  return t at time zone 'Europe/Madrid';
exception when others then
  return t at time zone 'UTC';
end;
$$;

create or replace function public.desde_madrid(t timestamp)
returns timestamptz
language plpgsql
stable
as $$
begin
  return t at time zone 'Europe/Madrid';
exception when others then
  return t at time zone 'UTC';
end;
$$;

create or replace function public.iso_de(t timestamptz)
returns text
language sql
immutable
as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- ---------------------------------------------------------------------------
-- Solicitud web → pedido
-- ---------------------------------------------------------------------------
-- El JSON tiene la forma de normalizeOrder (Calculadora). El coste es el de
-- impresión (filamento + luz + desgaste) con la K1 de la config de 3DCC; el
-- taller lo recalcula al laminar, como hacía con la bandeja.
create or replace function public.quote_a_order_data(p_quote_id uuid, p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q       public.quotes;
  cfg     jsonb;
  imp     jsonb;
  v_peso  numeric := 0;
  v_horas numeric := 0;
  v_piezas integer := 0;
  v_nombres text;
  v_kg    numeric;
  v_coste numeric := 0;
  v_precio numeric;
  v_estado text;
  v_notas text;
begin
  select * into q from public.quotes where id = p_quote_id;
  if not found then
    return null;
  end if;

  select
    coalesce(sum(public.jsonb_num(a -> 'metricas' -> 'peso_g')
                 * greatest(1, coalesce(public.jsonb_num(a -> 'cantidad'), 1))), 0),
    coalesce(sum(public.jsonb_num(a -> 'metricas' -> 'tiempo_h')
                 * greatest(1, coalesce(public.jsonb_num(a -> 'cantidad'), 1))), 0),
    coalesce(sum(greatest(1, coalesce(public.jsonb_num(a -> 'cantidad'), 1))), 0)::integer,
    string_agg(nullif(trim(a ->> 'nombre'), ''), ', ')
    into v_peso, v_horas, v_piezas, v_nombres
    from jsonb_array_elements(coalesce(q.archivos, '[]'::jsonb)) a;
  if v_peso = 0 then
    v_peso := coalesce(public.jsonb_num(q.metricas -> 'peso_g'), 0) * greatest(1, q.cantidad);
  end if;
  if v_horas = 0 then
    v_horas := coalesce(public.jsonb_num(q.metricas -> 'tiempo_h'), 0) * greatest(1, q.cantidad);
  end if;
  if v_piezas = 0 then
    v_piezas := greatest(1, q.cantidad);
  end if;

  select data into cfg from public.empresa_docs where empresa = '3dcc' and doc = 'config';
  select p into imp
    from jsonb_array_elements(coalesce(cfg -> 'printers', '[]'::jsonb)) p
   where p ->> 'name' ilike '%k1%'
   limit 1;
  if imp is null then
    imp := cfg -> 'printers' -> 0;
  end if;
  select public.jsonb_num(f -> 'price_per_kg') into v_kg
    from jsonb_array_elements(coalesce(cfg -> 'filament_types', '[]'::jsonb)) f
   where upper(f ->> 'name') = upper(q.material)
   limit 1;
  v_coste := round(
      v_peso * coalesce(v_kg, 20) / 1000
    + v_horas * coalesce(public.jsonb_num(imp -> 'energy_consumption_kwh'), 0.15)
              * coalesce(public.jsonb_num(cfg -> 'global_config' -> 'energy_cost_kwh'), 0.24)
    + v_horas * (coalesce(public.jsonb_num(imp -> 'price_eur'), 0)
                 + coalesce(public.jsonb_num(imp -> 'service_costs_life_eur'), 0))
              / greatest(1, coalesce(nullif(public.jsonb_num(imp -> 'depreciation_time_h'), 0), 3000)),
    2);

  v_precio := coalesce(q.precio_final, q.precio_total, 0);
  v_estado := coalesce(public.map_quote_estado_to_order(q.estado, null), 'Nuevo');
  v_notas := concat_ws(E'\n',
    'Solicitud web ' || q.codigo,
    case when q.entrega = 'envio'
      then 'Envío: ' || concat_ws(', ', q.direccion ->> 'calle', q.direccion ->> 'cp',
                                  q.direccion ->> 'ciudad', q.direccion ->> 'provincia')
      else 'Recogida en Salamanca' end,
    nullif(q.telefono, ''),
    case when jsonb_array_length(coalesce(q.colores, '[]'::jsonb)) > 1
      then 'Colores: ' || (select string_agg(c ->> 'nombre', ', ') from jsonb_array_elements(q.colores) c)
    end,
    nullif('«' || nullif(trim(q.mensaje), '') || '»', '«»')
  );

  return jsonb_build_object(
    'id', p_order_id,
    'created_at', public.iso_de(q.created_at),
    'fecha', to_char(public.en_madrid(q.created_at), 'YYYY-MM-DD'),
    'empresa', '3DCC',
    'origen', 'web',
    'cliente', q.nombre,
    'cliente_email', q.email,
    'descripcion', q.codigo || ' · ' || coalesce(v_nombres, 'presupuesto web'),
    'impresora', coalesce(imp ->> 'name', ''),
    'filamento', q.material,
    'filamento_color', coalesce(q.colores -> 0 ->> 'nombre', ''),
    'peso_g', round(v_peso)::text,
    'horas', round(v_horas, 2)::text,
    'cantidad', v_piezas,
    'precio_final', v_precio,
    'coste_bruto', v_coste,
    'beneficio_neto', round(v_precio - v_coste, 2),
    'estado', v_estado,
    'last_status_update', public.iso_de(coalesce(q.aceptado_at, q.created_at)),
    'accepted_at', coalesce(public.iso_de(q.aceptado_at), ''),
    'material_contabilizado', v_estado not in ('Nuevo', 'Presupuesto enviado', 'Descartado'),
    'importe_pagado', 0,
    'payment_history', '[]'::jsonb,
    'notif_history', '[]'::jsonb,
    'notes', v_notas
  );
end;
$$;

create or replace function public.crear_order_para_quote(p_quote_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_prev text := public.sync_desde();
  v_id   text;
begin
  if exists (select 1 from public.orders where quote_id = p_quote_id) then
    return null;
  end if;
  v_id := public.nuevo_order_id('3dcc');
  perform set_config('app.sync_desde', 'quotes', true);
  insert into public.orders (empresa, id, quote_id, data)
  values ('3dcc', v_id, p_quote_id, public.quote_a_order_data(p_quote_id, v_id));
  perform set_config('app.sync_desde', v_prev, true);
  return v_id;
end;
$$;

create or replace function public.crear_order_desde_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.origen = 'web' and public.sync_desde() <> 'orders' then
    -- Un fallo aquí no puede tumbar la solicitud del cliente: se avisa en el
    -- log y la solicitud se guarda igual (sin pedido, como antes).
    begin
      perform public.crear_order_para_quote(new.id);
    exception when others then
      raise warning 'crear_order_para_quote(%) falló: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists crear_order_desde_quote on public.quotes;
create trigger crear_order_desde_quote
  after insert on public.quotes
  for each row execute function public.crear_order_desde_quote();

-- ---------------------------------------------------------------------------
-- Pedido de la Calculadora → quote
-- ---------------------------------------------------------------------------
create or replace function public.crear_quote_para_order(p_empresa text, p_order_id text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_prev   text := public.sync_desde();
  o        record;
  d        jsonb;
  v_estado text;
  v_precio numeric;
  v_id     uuid;
begin
  select * into o from public.orders where empresa = p_empresa and id = p_order_id;
  if not found or o.quote_id is not null or o.empresa <> '3dcc' then
    return null;
  end if;
  d := o.data;
  v_estado := coalesce(public.map_order_estado_to_quote(d ->> 'estado'), 'revisado');
  v_precio := coalesce(public.jsonb_num(d -> 'precio_final'), 0);

  perform set_config('app.sync_desde', 'orders', true);
  insert into public.quotes (
    origen, estado, nombre, email, telefono, material, cantidad, descripcion,
    precio_total, precio_final, archivos, metricas, aceptado_at
  ) values (
    'calculadora',
    v_estado,
    coalesce(nullif(trim(d ->> 'cliente'), ''), '(sin nombre)'),
    coalesce(trim(d ->> 'cliente_email'), ''),
    '',
    coalesce(nullif(trim(d ->> 'filamento'), ''), '—'),
    greatest(1, coalesce(public.jsonb_num(d -> 'cantidad'), 1))::integer,
    coalesce(trim(d ->> 'descripcion'), ''),
    v_precio,
    v_precio,
    '[]'::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'peso_g', public.jsonb_num(d -> 'peso_g'),
      'tiempo_h', public.jsonb_num(d -> 'horas')
    )),
    case when v_estado in ('aceptado', 'imprimiendo', 'listo', 'entregado')
      then coalesce(nullif(d ->> 'accepted_at', '')::timestamptz, now()) end
  )
  returning id into v_id;

  perform set_config('app.sync_desde', 'quotes', true);
  update public.orders set quote_id = v_id where empresa = p_empresa and id = p_order_id;
  perform set_config('app.sync_desde', v_prev, true);
  return v_id;
end;
$$;

create or replace function public.crear_quote_desde_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empresa = '3dcc'
     and new.quote_id is null
     and not new.archived
     and public.sync_desde() <> 'quotes'
     and coalesce(public.normalizar_estado_order(new.data ->> 'estado'), '') <> 'Descartado' then
    -- Ídem: el pedido se guarda aunque su quote no se pueda crear.
    begin
      perform public.crear_quote_para_order(new.empresa, new.id);
    exception when others then
      raise warning 'crear_quote_para_order(%, %) falló: %', new.empresa, new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

-- AFTER INSERT y no BEFORE: con el upsert de la Calculadora un BEFORE INSERT
-- se dispara también cuando el pedido ya existe (ON CONFLICT DO UPDATE).
drop trigger if exists crear_quote_desde_order on public.orders;
create trigger crear_quote_desde_order
  after insert on public.orders
  for each row execute function public.crear_quote_desde_order();

-- Si el pedido se enlaza a otra quote (versiones antiguas de la Calculadora
-- que aún enlazan desde la bandeja) o se borra, su quote de la Calculadora se
-- queda huérfana: se archiva. Las quotes web no se tocan.
create or replace function public.archivar_quote_huerfana()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.quote_id is not null
     and (tg_op = 'DELETE' or new.quote_id is distinct from old.quote_id) then
    update public.quotes
       set archivado = true
     where id = old.quote_id and origen = 'calculadora' and not archivado;
  end if;
  return null;
end;
$$;

drop trigger if exists archivar_quote_huerfana on public.orders;
create trigger archivar_quote_huerfana
  after update of quote_id or delete on public.orders
  for each row execute function public.archivar_quote_huerfana();

-- ---------------------------------------------------------------------------
-- Pedido → quote: además, los datos del cliente en las quotes de la
-- Calculadora (en las web manda lo que escribió el cliente).
-- ---------------------------------------------------------------------------
create or replace function public.project_order_to_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := public.sync_desde();
  d      jsonb := new.data;
begin
  if new.quote_id is null or v_prev = 'quotes' then
    return new;
  end if;
  perform set_config('app.sync_desde', 'orders', true);
  update public.quotes q
     set estado         = coalesce(public.map_order_estado_to_quote(d ->> 'estado'), q.estado),
         pago           = coalesce(public.map_payment_to_pago(d ->> 'payment_status'), q.pago),
         precio_final   = coalesce(public.jsonb_num(d -> 'precio_final'), q.precio_final),
         importe_pagado = coalesce(public.jsonb_num(d -> 'importe_pagado'), q.importe_pagado)
   where q.id = new.quote_id
     and (q.estado, q.pago, q.precio_final, q.importe_pagado) is distinct from (
           coalesce(public.map_order_estado_to_quote(d ->> 'estado'), q.estado),
           coalesce(public.map_payment_to_pago(d ->> 'payment_status'), q.pago),
           coalesce(public.jsonb_num(d -> 'precio_final'), q.precio_final),
           coalesce(public.jsonb_num(d -> 'importe_pagado'), q.importe_pagado)
         );
  update public.quotes q
     set nombre      = coalesce(nullif(trim(d ->> 'cliente'), ''), q.nombre),
         email       = coalesce(trim(d ->> 'cliente_email'), q.email),
         material    = coalesce(nullif(trim(d ->> 'filamento'), ''), q.material),
         cantidad    = greatest(1, coalesce(public.jsonb_num(d -> 'cantidad'), q.cantidad))::integer,
         descripcion = coalesce(trim(d ->> 'descripcion'), q.descripcion),
         precio_total = coalesce(public.jsonb_num(d -> 'precio_final'), q.precio_total),
         archivado   = q.archivado or (new.archived and q.estado in ('entregado', 'rechazado'))
   where q.id = new.quote_id
     and q.origen = 'calculadora'
     and (q.nombre, q.email, q.material, q.cantidad, q.descripcion, q.precio_total, q.archivado)
         is distinct from (
           coalesce(nullif(trim(d ->> 'cliente'), ''), q.nombre),
           coalesce(trim(d ->> 'cliente_email'), q.email),
           coalesce(nullif(trim(d ->> 'filamento'), ''), q.material),
           greatest(1, coalesce(public.jsonb_num(d -> 'cantidad'), q.cantidad))::integer,
           coalesce(trim(d ->> 'descripcion'), q.descripcion),
           coalesce(public.jsonb_num(d -> 'precio_final'), q.precio_total),
           q.archivado or (new.archived and q.estado in ('entregado', 'rechazado'))
         );
  perform set_config('app.sync_desde', v_prev, true);
  return new;
end;
$$;

-- La RPC de la bandeja antigua (0018) sigue sirviendo a las versiones
-- instaladas; con 0026 el rechazo ya baja solo al pedido.

-- ---------------------------------------------------------------------------
-- Estado público: descripción del encargo para los pedidos de la Calculadora
-- (no lleva archivos que enseñar). Nueva RPC para no tocar get_quote_status.
-- ---------------------------------------------------------------------------
create or replace function public.get_quote_detalle(p_codigo text)
returns table (codigo text, origen text, descripcion text)
language sql
stable
security definer
set search_path = public
as $$
  select q.codigo, q.origen, q.descripcion
    from public.quotes q
   where q.codigo = upper(trim(p_codigo))
     and not q.archivado
   limit 1;
$$;

grant execute on function public.get_quote_detalle(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Relleno inicial
-- ---------------------------------------------------------------------------
-- Solicitudes web vivas sin pedido → pedido. Las cerradas (entregadas,
-- rechazadas o archivadas) se quedan como estaban: meterlas ahora en la
-- Calculadora ensuciaría la facturación con pedidos sin costes reales.
select public.crear_order_para_quote(q.id)
  from public.quotes q
 where q.origen = 'web'
   and not q.archivado
   and q.estado in ('nuevo', 'revisado', 'aceptado', 'imprimiendo', 'listo')
   and not exists (select 1 from public.orders o where o.quote_id = q.id)
 order by q.created_at;

-- Pedidos vivos de 3DCC sin quote → quote. Los archivados y descartados no.
select public.crear_quote_para_order(o.empresa, o.id)
  from public.orders o
 where o.empresa = '3dcc'
   and o.quote_id is null
   and not o.archived
   and coalesce(public.normalizar_estado_order(o.data ->> 'estado'), '') <> 'Descartado'
 order by o.created_at;
