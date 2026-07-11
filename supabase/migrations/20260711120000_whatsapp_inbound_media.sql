-- ============================================================
-- 20260711120000_whatsapp_inbound_media.sql
-- Inbound WhatsApp photos: storage for the actual image bytes.
--
-- Customers can send photos, but Meta's webhook only delivers a media
-- id — the picture itself must be fetched from the Graph API within
-- ~30 days. Until now nothing fetched it, so the inbox could only show
-- a "📷 Photo" chip. This migration adds the storage half of the fix:
--
--  1. whatsapp_messages.media_path / media_mime — where the downloaded
--     object lives in Storage and what it is. Populated by the
--     whatsapp-agent ingest (new messages) and the whatsapp-media edge
--     function (manual backfill/retry). NULL = no stored media.
--  2. A private 'whatsapp-media' bucket (mirrors 'groom-photos').
--     Writes come from edge functions using the service role (bypasses
--     RLS), so no insert policy is needed or wanted.
--  3. Staff-only read policy so the staff app can createSignedUrl()
--     for inline display. Customers never read this bucket.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Columns
alter table whatsapp_messages
  add column if not exists media_path text,
  add column if not exists media_mime text;

comment on column whatsapp_messages.media_path is
  'Storage path in the whatsapp-media bucket (conversation_id/message_id.ext); null = no downloaded media';
comment on column whatsapp_messages.media_mime is
  'Mime type of the stored media object, as reported by Meta';

-- 2. Private bucket
insert into storage.buckets (id, name, public)
  values ('whatsapp-media', 'whatsapp-media', false)
  on conflict (id) do nothing;

-- 3. Staff-only read (signed-URL creation checks SELECT permission)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'staff_read_whatsapp_media'
  ) then
    create policy staff_read_whatsapp_media on storage.objects
      for select
      using (bucket_id = 'whatsapp-media' and (select is_staff()));
  end if;
end $$;
