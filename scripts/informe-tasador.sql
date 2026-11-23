-- Informe del tasador: antes vs después del cambio del 10-nov-2026.
-- Pegar entero en Supabase → SQL Editor → Run. Devuelve una sola tabla.
with per as (
  select 'a_antes (29 oct-9 nov)' p, timestamptz '2026-10-29 00:00+01' d, timestamptz '2026-11-10 00:00+01' h
  union all
  select 'b_despues (10 nov-hoy)', timestamptz '2026-11-10 00:00+01', now()
),
ev as (
  select per.p, e.* from quote_events e join per on e.created_at >= per.d and e.created_at < per.h
),
q as (
  select per.p, x.* from quotes x join per on x.created_at >= per.d and x.created_at < per.h
),
fila as (
  -- 1. Embudo: sesiones únicas por paso
  select '1 embudo' b, p, evento k, count(distinct session_id)::text v from ev group by p, evento
  union all
  -- 2. Pedidos guardados
  select '2 pedidos', p, 'total (' || origen || ')', count(*)::text from q group by p, origen
  union all
  select '2 pedidos', p, 'estado ' || estado, count(*)::text from q group by p, estado
  union all
  select '2 pedidos', p, 'importe medio €', round(avg(precio_total), 2)::text from q group by p
  union all
  select '2 pedidos', p, 'importe total €', round(sum(precio_total), 2)::text from q group by p
  union all
  select '2 pedidos', p, 'precio final medio € (los que lo tienen)', round(avg(precio_final), 2)::text
    from q where precio_final is not null group by p
  union all
  select '2 pedidos', p, 'a consultar', count(*)::text from q where (desglose->>'consultar')::boolean group by p
  union all
  -- 3. Pedidos enviados en el navegador que NO están en quotes (perdidos)
  select '3 perdidos', ev.p, 'solicitud_enviada sin pedido', count(*)::text
    from ev left join quotes x on x.codigo = ev.payload->>'codigo'
   where ev.evento = 'solicitud_enviada' and x.id is null group by ev.p
  union all
  -- 4. Por qué falla el formulario
  select '4 errores form', p, payload->>'motivo', count(*)::text from ev where evento = 'formulario_error' group by p, 2
  union all
  -- 5. De dónde vienen y con qué
  select '5 visitas', p, 'dispositivo ' || coalesce(payload->>'dispositivo', '?'), count(distinct session_id)::text
    from ev where evento = 'visita' group by p, 3
  union all
  select '5 visitas', p, 'origen ' || coalesce(nullif(concat_ws(' / ', payload->>'utm_source', payload->>'utm_medium'), ''),
                                               nullif(payload->>'referrer', ''), 'directo'),
         count(distinct session_id)::text
    from ev where evento = 'visita' group by p, 3
  union all
  -- 6. Precio visto: mediana del último precio de cada sesión
  select '6 precio visto', p, 'mediana € por sesión',
         round(percentile_cont(0.5) within group (order by t)::numeric, 2)::text
    from (select distinct on (p, session_id) p, (payload->>'total')::numeric t
            from ev where evento = 'precio_visto' order by p, session_id, created_at desc) s group by p
  union all
  -- 7. Días del periodo nuevo: visitas, precio visto, pedidos
  select '7 por día', 'b', to_char(created_at at time zone 'Europe/Madrid', 'MM-DD') || ' ' || evento,
         count(distinct session_id)::text
    from ev where p like 'b%' and evento in ('visita', 'precio_visto', 'solicitud_enviada') group by 3
)
select b as bloque, p as periodo, k as dato, v as valor from fila order by b, k, p;
