-- =============================================================================
-- 04 — Storage buckets + storage.objects policies
--   avatars             : public read, admin write
--   backgrounds         : public read, admin write
--   message-attachments : PRIVATE — only admins (all) and visitors (attachments of
--                         messages the owner published) may read them.
--                         Files are written exclusively by Edge Functions using
--                         the service role, never from the browser.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('backgrounds', 'backgrounds', true, 8388608,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('message-attachments', 'message-attachments', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Idempotency
drop policy if exists "profile_assets_public_read"   on storage.objects;
drop policy if exists "profile_assets_admin_insert"  on storage.objects;
drop policy if exists "profile_assets_admin_update"  on storage.objects;
drop policy if exists "profile_assets_admin_delete"  on storage.objects;
drop policy if exists "attachments_admin_read"       on storage.objects;
drop policy if exists "attachments_public_read"      on storage.objects;
drop policy if exists "attachments_admin_insert"     on storage.objects;
drop policy if exists "attachments_admin_update"     on storage.objects;
drop policy if exists "attachments_admin_delete"     on storage.objects;

-- ------------------------------- avatars / backgrounds -----------------------
create policy "profile_assets_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('avatars', 'backgrounds'));

create policy "profile_assets_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id in ('avatars', 'backgrounds') and public.is_admin());

create policy "profile_assets_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id in ('avatars', 'backgrounds') and public.is_admin())
  with check (bucket_id in ('avatars', 'backgrounds') and public.is_admin());

create policy "profile_assets_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id in ('avatars', 'backgrounds') and public.is_admin());

-- ------------------------------ message-attachments --------------------------
-- Admins can read everything in the private bucket (signed URLs then work too,
-- because creating a signed URL requires SELECT permission on the object row).
create policy "attachments_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'message-attachments' and public.is_admin());

-- Visitors may read only files that belong to a message the owner published.
create policy "attachments_public_read"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1
      from public.message_attachments a
      join public.messages m on m.id = a.message_id
      where a.storage_path = storage.objects.name
        and m.status in ('unread', 'read')
        and m.is_public = true
        and m.parent_id is null
    )
  );

create policy "attachments_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'message-attachments' and public.is_admin());

create policy "attachments_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'message-attachments' and public.is_admin())
  with check (bucket_id = 'message-attachments' and public.is_admin());

create policy "attachments_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'message-attachments' and public.is_admin());