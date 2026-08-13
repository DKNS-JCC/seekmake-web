-- ============================================================================
-- 0023_envios_publico — el cliente ve su envío
--
-- La tabla `envios` (0015) ya guardaba tracking_number y tracking_url, pero
-- era invisible: RLS admin-only y `get_quote_status` no devuelve ni un campo
-- de envío. Esta migración:
--   1. Añade lo que hace falta para un seguimiento útil (punto de recogida
--      InPost, fechas por estado, alta manual).
--   2. Publica una RPC dedicada `get_envio_status`, con SOLO campos
--      logísticos: ni dirección, ni nombre, ni teléfono, ni coste (margen).
--
-- Se crea una RPC nueva en vez de ampliar `get_quote_status` porque cambiar el
-- tipo de retorno de esa función obliga a `drop function` (ya pasó en 0013 y
-- 0014) y arrastraría a toda la página de estado.
--
-- El estado lo pone el admin a mano. El modelo de datos es exactamente el que
-- rellenaría un webhook de Sendcloud, así que automatizarlo más adelante no
-- requiere ninguna migración nueva.
-- ============================================================================

alter table public.envios
  -- Nombre bonito del transportista para mostrar ("InPost", "Correos Express").
  -- `carrier` guarda el código de Sendcloud, que no siempre es presentable.
  add column if not exists carrier_nombre text,

  -- Punto de recogida (locker InPost, tienda, oficina). jsonb porque un locker,
  -- una oficina de Correos y una entrega a domicilio no tienen la misma forma
  -- y esto solo se muestra, nunca se consulta por campos.
  --   {nombre, direccion, ciudad, cp, horario, codigo_apertura, hasta}
  add column if not exists punto_recogida jsonb not null default '{}',

  -- Línea de tiempo sin tabla de eventos: una marca por estado alcanzado.
  add column if not exists etiqueta_at   timestamptz,
  add column if not exists transito_at   timestamptz,
  add column if not exists disponible_at timestamptz,
  add column if not exists entregado_at  timestamptz,

  add column if not exists fecha_estimada date,

  -- Mensaje libre del admin visible para el cliente ("te lo dejo en el locker
  -- de Carrefour porque el domicilio daba error").
  add column if not exists nota_cliente text not null default '',

  -- Alta manual (pegar un tracking) vs creado al generar etiqueta Sendcloud.
  add column if not exists origen text not null default 'sendcloud'
    check (origen in ('sendcloud', 'manual'));

-- 'disponible' = ya está en el punto de recogida, esperando al cliente. Es el
-- estado más informativo de todo el flujo InPost y no existía.
alter table public.envios drop constraint if exists envios_estado_check;
alter table public.envios add constraint envios_estado_check
  check (estado in ('pendiente', 'etiqueta', 'en_transito', 'disponible',
                    'entregado', 'incidencia', 'cancelado'));

-- Los envíos existentes se crearon todos desde Sendcloud al generar etiqueta.
update public.envios
   set etiqueta_at = coalesce(etiqueta_at, created_at)
 where estado <> 'pendiente' and etiqueta_at is null;

-- ---------------------------------------------------------------------------
-- Consulta pública del envío por código de presupuesto.
--
-- Mismo criterio de privacidad que get_quote_status: el código actúa como
-- número de seguimiento (no adivinable) y la función solo expone campos
-- logísticos. Fuera quedan cp_destino, coste, coste_carrier y sendcloud_id.
-- ---------------------------------------------------------------------------
create or replace function public.get_envio_status(p_codigo text)
returns table (
  carrier         text,
  carrier_nombre  text,
  metodo          text,
  tracking_number text,
  tracking_url    text,
  estado          text,
  punto_recogida  jsonb,
  fecha_estimada  date,
  nota_cliente    text,
  etiqueta_at     timestamptz,
  transito_at     timestamptz,
  disponible_at   timestamptz,
  entregado_at    timestamptz,
  updated_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.carrier, e.carrier_nombre, e.metodo, e.tracking_number,
         e.tracking_url, e.estado, e.punto_recogida, e.fecha_estimada,
         e.nota_cliente, e.etiqueta_at, e.transito_at, e.disponible_at,
         e.entregado_at, e.updated_at
    from public.envios e
    join public.quotes q on q.id = e.quote_id
   where q.codigo = upper(trim(p_codigo))
     and not q.archivado
     and e.estado <> 'cancelado'
   order by e.created_at desc
   limit 1;
$$;

grant execute on function public.get_envio_status(text) to anon, authenticated;
