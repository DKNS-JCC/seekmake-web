-- ============================================================================
-- Miniaturas del tasador: una imagen pequeña (JPEG, ~20 KB) de cada pieza que
-- se sube, aunque luego no se pida presupuesto. No es el archivo 3D: solo
-- cómo se veía en el visor, para reconocer en /admin/estadisticas si quien se
-- fue probaba la misma pieza varias veces y qué precio vio.
--
-- Ruta: <session_id>/<huella>.jpg (session_id = el id anónimo de los
-- eventos; huella = resumen de la forma de la pieza). Bucket privado: el
-- navegador del cliente solo puede subir; leer, solo el admin (URLs firmadas).
-- Se borran solas a los 30 días (política de privacidad).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tasador-miniaturas', 'tasador-miniaturas', false, 153600, array['image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = 153600,
  allowed_mime_types = array['image/jpeg'];

drop policy if exists "tasador-miniaturas: anon insert" on storage.objects;
drop policy if exists "tasador-miniaturas: admin read"  on storage.objects;
drop policy if exists "tasador-miniaturas: admin delete" on storage.objects;

create policy "tasador-miniaturas: anon insert"
  on storage.objects for insert
  with check (bucket_id = 'tasador-miniaturas' and name ~ '^[a-z0-9]{1,64}/[a-z0-9]{1,16}\.jpg$');

create policy "tasador-miniaturas: admin read"
  on storage.objects for select
  using (bucket_id = 'tasador-miniaturas' and public.is_admin());

create policy "tasador-miniaturas: admin delete"
  on storage.objects for delete
  using (bucket_id = 'tasador-miniaturas' and public.is_admin());

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('clean-tasador-miniaturas');
exception when others then
  raise notice 'pg_cron unschedule omitido: %', sqlerrm;
end $$;

do $$
begin
  perform cron.schedule(
    'clean-tasador-miniaturas',
    '25 4 * * *',
    $job$
      delete from storage.objects
      where bucket_id = 'tasador-miniaturas'
        and created_at < now() - interval '30 days'
    $job$
  );
exception when others then
  raise notice 'pg_cron no disponible, limpieza automática omitida: %', sqlerrm;
end $$;
