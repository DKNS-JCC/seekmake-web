-- ============================================================================
-- Los archivos de clientes (contact-uploads, quote-uploads) ya no se pueden
-- listar con la clave pública.
--
-- Las políticas "public read" (0011, 0012) daban SELECT sobre storage.objects
-- a cualquiera, y con eso storage.list() devolvía todas las rutas: el uuid
-- del path dejaba de ser secreto. Los buckets siguen siendo públicos, así que
-- las URLs de /object/public/ (los enlaces de los emails y la ficha del
-- presupuesto) funcionan igual: esa descarga no pasa por RLS.
--
-- Subir no necesita SELECT (upload con upsert: false). Borrar desde el admin
-- (storage.remove) sí, por eso el admin conserva la lectura.
-- ============================================================================

drop policy if exists "contact-uploads: public read" on storage.objects;
drop policy if exists "quote-uploads: public read"   on storage.objects;

drop policy if exists "contact-uploads: admin read" on storage.objects;
create policy "contact-uploads: admin read"
  on storage.objects for select
  using (bucket_id = 'contact-uploads' and public.is_admin());

drop policy if exists "quote-uploads: admin read" on storage.objects;
create policy "quote-uploads: admin read"
  on storage.objects for select
  using (bucket_id = 'quote-uploads' and public.is_admin());
