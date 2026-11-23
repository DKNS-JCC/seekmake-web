-- Campañas programadas desde pg_cron en vez de GitHub Actions: el cron de
-- GitHub se saltó casi todas las ejecuciones y la campaña de las 10:00 del
-- 23/11/2026 no salió hasta que se lanzó a mano.
--
-- Cada 5 min, si hay alguna campaña que ya toca, pg_net llama a campana-enviar
-- con x-cron-secret. El secreto se genera aquí, vive solo en el vault y la
-- función lo comprueba con campana_cron_ok() (service role): no está en el
-- repo ni en los secrets de las funciones.

do $$
begin
  create extension if not exists pg_net;
  if not exists (select 1 from vault.secrets where name = 'campanas_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'campanas_cron',
      'x-cron-secret con el que pg_cron llama a campana-enviar');
  end if;
exception when others then
  raise notice 'pg_net / vault no disponibles, cron de campañas omitido: %', sqlerrm;
end $$;

-- plpgsql: no se valida al crearla, así que no falla donde no hay vault.
create or replace function public.campana_cron_ok(secreto text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce(length(secreto), 0) >= 32 and exists (
    select 1 from vault.decrypted_secrets where name = 'campanas_cron' and decrypted_secret = secreto
  );
end $$;

revoke all on function public.campana_cron_ok(text) from public, anon, authenticated;
grant execute on function public.campana_cron_ok(text) to service_role;

do $$
begin
  perform cron.schedule(
    'campanas-programadas',
    '*/5 * * * *',
    $job$
      select net.http_post(
        url := 'https://gtowgsgyeipfjdnsnizr.supabase.co/functions/v1/campana-enviar',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'campanas_cron')
        ),
        body := '{"accion":"programadas"}'::jsonb,
        timeout_milliseconds := 150000
      )
      where exists (
        select 1 from public.campanas where estado <> 'enviada' and programada_at <= now()
      )
    $job$
  );
exception when others then
  raise notice 'pg_cron no disponible, cron de campañas omitido: %', sqlerrm;
end $$;
