-- ============================================================
-- 031_whatsapp_realtime_publication.sql
--
-- Add the three WhatsApp tables to the supabase_realtime
-- publication so postgres_changes streams UPDATE/INSERT/DELETE
-- events to connected clients.
--
-- Why this is needed:
-- Migration 026 created whatsapp_conversations / whatsapp_messages
-- / whatsapp_drafts but never added them to the realtime publication.
-- Consequence: the inbox UI (useWhatsAppInbox, useWhatsAppUnread)
-- subscribes to these tables but never receives events, so:
--   - The coral unread badge in the toolbar doesn't refresh when a
--     new inbound arrives — user has to reload.
--   - The conversation list doesn't update when the agent drops a
--     fresh draft — staff miss pending reviews until they refresh.
--   - Mark-read / reject / approve don't echo back and the badges
--     stay stale.
--
-- Idempotent by design: uses pg_publication_tables to check before
-- adding, so this migration is safe to re-run in local dev and safe
-- to apply over an environment where a subset of tables has already
-- been added manually.
-- ============================================================

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'whatsapp_conversations',
    'whatsapp_messages',
    'whatsapp_drafts'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        tbl
      );
    end if;
  end loop;
end
$$;
