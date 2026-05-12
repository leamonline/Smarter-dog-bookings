-- ============================================================
-- 20260513000000_whatsapp_booking_actions_realtime.sql
--
-- Add whatsapp_booking_actions to the supabase_realtime publication.
--
-- Why this is needed:
-- Migration 20260427142614 added whatsapp_conversations, _messages, and
-- _drafts to the realtime publication but missed whatsapp_booking_actions.
-- useWhatsAppInbox subscribes to postgres_changes on this table (both at
-- the inbox-list scope and per-conversation), so without the publication
-- entry the emerald "pending booking proposal" dot doesn't appear when
-- the AI emits a fresh action — staff have to reload to see it. The
-- per-conversation BookingActionPanel also misses live state transitions
-- (e.g. a proposal moving from pending to applied via the same RPC in
-- another tab).
--
-- Idempotent by design: checks pg_publication_tables before adding, so
-- this migration is safe to re-run in local dev and safe to apply over
-- an environment where the table has been added manually.
-- ============================================================

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'whatsapp_booking_actions'
  ) then
    execute 'alter publication supabase_realtime add table public.whatsapp_booking_actions';
  end if;
end
$$;
