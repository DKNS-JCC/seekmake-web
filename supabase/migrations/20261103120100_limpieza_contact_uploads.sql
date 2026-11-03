-- ============================================================================
-- Adjuntos del formulario de contacto (fotos incluidas): se borran solos a los
-- 60 días. Hasta ahora la limpieza era manual (ver 0011) y la política de
-- privacidad no podía prometer un plazo.
-- ============================================================================

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('clean-contact-uploads');
exception when others then
  raise notice 'pg_cron unschedule omitido: %', sqlerrm;
end $$;

do $$
begin
  perform cron.schedule(
    'clean-contact-uploads',
    '15 4 * * *',
    $job$
      delete from storage.objects
      where bucket_id = 'contact-uploads'
        and created_at < now() - interval '60 days'
    $job$
  );
exception when others then
  raise notice 'pg_cron no disponible, limpieza automática omitida: %', sqlerrm;
end $$;
