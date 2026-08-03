-- ============================================================================
-- Calculadora — fase 2 de la unificación: enlace pedidos ↔ presupuestos web
-- * Proyección automática orders → quotes (estado, pago, importes) vía
--   trigger SECURITY DEFINER: la quote enlazada refleja siempre el estado
--   real de producción sin abrir la escritura de quotes a los usuarios.
-- * Lectura de quotes para usuarios de 3DCC (bandeja web de la Calculadora).
-- ============================================================================

-- ── Mapeo de estados: ORDER_LIFECYCLE (Calculadora) → estados de quotes ──
create or replace function public.map_order_estado_to_quote(e text)
returns text
language sql
immutable
as $$
  select case e
    when 'Presupuesto enviado' then 'revisado'
    when 'Aceptado'            then 'aceptado'
    when 'En producción'       then 'imprimiendo'
    when 'Post-procesado'      then 'imprimiendo'
    when 'Listo para entregar' then 'listo'
    when 'Entregado'           then 'entregado'
    else null                  -- estados desconocidos/legado: no tocar la quote
  end;
$$;

-- ── Mapeo de pago: payment_status (Calculadora) → quotes.pago ────────────
create or replace function public.map_payment_to_pago(p text)
returns text
language sql
immutable
as $$
  select case p
    when 'Pendiente' then 'pendiente'
    when 'Parcial'   then 'adelanto'
    when 'Pagado'    then 'pagado'
    else null
  end;
$$;

-- ── Trigger de proyección ────────────────────────────────────────────────
-- Dirección única pedido → quote: una vez existe pedido, es la fuente de
-- verdad. /presupuesto (cliente) y /admin/presupuestos leen la quote y ven
-- el estado real sin hacer nada.
create or replace function public.project_order_to_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quote_id is null then
    return new;
  end if;
  update public.quotes q
     set estado         = coalesce(public.map_order_estado_to_quote(new.data ->> 'estado'), q.estado),
         pago           = coalesce(public.map_payment_to_pago(new.data ->> 'payment_status'), q.pago),
         precio_final   = coalesce(nullif(new.data ->> 'precio_final', '')::numeric, q.precio_final),
         importe_pagado = coalesce(nullif(new.data ->> 'importe_pagado', '')::numeric, q.importe_pagado)
   where q.id = new.quote_id;
  return new;
end;
$$;

drop trigger if exists project_order_to_quote on public.orders;
create trigger project_order_to_quote
  after insert or update on public.orders
  for each row execute function public.project_order_to_quote();

-- ── Bandeja web ──────────────────────────────────────────────────────────
-- Los usuarios de 3DCC (Calculadora) leen las solicitudes del tasador.
-- SILAB3D no: son solicitudes de la web de 3DCC. Escritura de quotes:
-- solo admin (política existente) y el trigger de arriba.
drop policy if exists "quotes: calculadora 3dcc read" on public.quotes;
create policy "quotes: calculadora 3dcc read" on public.quotes
  for select to authenticated
  using (public.user_empresa() = '3dcc');
