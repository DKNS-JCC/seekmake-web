-- Bucket for attachments submitted via /contacto.
-- Anyone can upload (form is public); files are at non-guessable paths so
-- exposure is limited to whoever has the URL. The Edge Function inserts the
-- public URLs into the email; nothing else references these files.
--
-- For cleanup, run periodically:
--   delete from storage.objects
--   where bucket_id = 'contact-uploads' and created_at < now() - interval '60 days';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-uploads',
  'contact-uploads',
  true,
  31457280,    -- 30 MB per file
  null         -- any mime; client side limits extensions
)
on conflict (id) do update set
  public = true,
  file_size_limit = 31457280;

-- Drop pre-existing policies so the migration is idempotent.
drop policy if exists "contact-uploads: anon insert" on storage.objects;
drop policy if exists "contact-uploads: public read"  on storage.objects;
drop policy if exists "contact-uploads: admin delete" on storage.objects;

-- Public read (so the link in the email works).
create policy "contact-uploads: public read"
  on storage.objects for select
  using (bucket_id = 'contact-uploads');

-- Anyone may insert into this bucket. Size and rate are limited at the
-- bucket level and at the Edge Function.
create policy "contact-uploads: anon insert"
  on storage.objects for insert
  with check (bucket_id = 'contact-uploads');

-- Only admins may delete (for manual cleanup from the Supabase dashboard or
-- via service role).
create policy "contact-uploads: admin delete"
  on storage.objects for delete
  using (bucket_id = 'contact-uploads' and public.is_admin());
