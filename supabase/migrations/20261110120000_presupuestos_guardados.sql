-- ============================================================================
-- "Envíame el presupuesto por email" del tasador (submit-quote, accion
-- 'guardar'): quien aún no pide deja su email, recibe el desglose al momento
-- y, a las 24 h, un recordatorio con el cupón VUELVE5 (accion 'recordatorios',
-- lanzada cada hora por .github/workflows/recordatorios-tasador.yml).
--
-- No hay archivo 3D: solo el email, el desglose y el total. Solo admin
-- (submit-quote escribe con la service role). Se borran a los 30 días.
-- ============================================================================

create table if not exists public.presupuestos_guardados (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  total        numeric(10,2) not null,
  lineas       jsonb not null default '[]',
  entrega      text not null default 'recogida',
  ip_hash      text,
  -- Recordatorio enviado (o descartado porque ya pidió): no se vuelve a mirar.
  recordado_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists presupuestos_guardados_pendientes_idx
  on public.presupuestos_guardados (created_at) where recordado_at is null;

alter table public.presupuestos_guardados enable row level security;
drop policy if exists "presupuestos_guardados: admin all" on public.presupuestos_guardados;
create policy "presupuestos_guardados: admin all" on public.presupuestos_guardados
  for all using (public.is_admin()) with check (public.is_admin());

-- 5 %: el markup de la Calculadora (×2,55 sobre coste) lo absorbe de sobra,
-- también en un pedido mínimo (−0,35 € sobre 7 €). Se edita o apaga en
-- /admin/cupones; apagado, el recordatorio sale sin cupón.
insert into public.cupones (codigo, tipo, valor, pedido_minimo, nota)
values ('VUELVE5', 'pct', 5, 0, 'Recordatorio a las 24 h de «envíame el presupuesto» (submit-quote)')
on conflict (codigo) do nothing;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('clean-presupuestos-guardados');
exception when others then
  raise notice 'pg_cron unschedule omitido: %', sqlerrm;
end $$;

do $$
begin
  perform cron.schedule(
    'clean-presupuestos-guardados',
    '35 4 * * *',
    $job$ delete from public.presupuestos_guardados where created_at < now() - interval '30 days' $job$
  );
exception when others then
  raise notice 'pg_cron no disponible, limpieza automática omitida: %', sqlerrm;
end $$;

-- ── quote_events: visita (con origen y dispositivo) y el formulario ─────────
alter table public.quote_events drop constraint if exists quote_events_evento_check;
alter table public.quote_events add constraint quote_events_evento_check
  check (evento in (
    'pieza_anadida', 'precio_visto', 'solicitud_enviada', 'pdf_descargado',
    'aceptado', 'whatsapp_clic', 'visita', 'formulario_abierto', 'formulario_error'
  ));
