-- ============================================================
-- 029_whatsapp_unread_count_fix.sql
-- Fix double-counting of unread_count on whatsapp_conversations.
--
-- Bug (observed 2026-04-21 during end-to-end smoke test):
--   A single inbound message produced unread_count = 2, not 1.
--
-- Root cause:
--   whatsapp-agent Edge Function's upsertConversation() does two
--   things that BOTH try to bump the counter:
--     (a) UPSERT with unread_count: 1 — on ON CONFLICT this resets
--         the existing value to 1 (not what we want) AND on INSERT
--         starts a new conversation at 1.
--     (b) RPC call `increment_conversation_unread` — bumps by +1 on
--         top of the reset. Also, the RPC doesn't actually exist
--         (the agent logs a warning when calling), so whether you
--         get 1 or 2 depends on whether the RPC is deployed.
--   Either way: state of unread_count cannot be trusted.
--
-- Fix strategy:
--   Move unread_count management off the Edge Function entirely.
--   A row in whatsapp_messages is the authoritative "an inbound
--   message happened" signal — use an AFTER INSERT trigger on that
--   table. Single source of truth, atomic, no race with the upsert.
--
-- This migration:
--   1. Adds whatsapp_messages_bump_unread trigger on whatsapp_messages
--      that increments unread_count for inbound messages only.
--   2. Adds an RPC mark_whatsapp_conversation_read(conversation_id uuid)
--      that sets unread_count = 0. Staff UI will call this when a
--      thread is opened (see admin inbox build in a later task).
--   3. Does NOT modify the Edge Function here — companion change is
--      in supabase/functions/whatsapp-agent/index.ts which must drop
--      the unread_count from the upsert AND remove the RPC call.
--
-- IMPORTANT: deploy this migration AND the updated agent function
-- together. Applying migration alone (without agent change) would
-- give you +2 increments per inbound (upsert resets to 1, trigger
-- bumps to 2). Applying agent change alone (without migration) would
-- leave unread_count stuck at 0 forever.
-- ============================================================

-- ============================================================
-- 1. Trigger: increment unread_count on inbound message insert.
-- ============================================================
create or replace function bump_conversation_unread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only inbound messages increment unread. Outbound replies from
  -- staff are, by definition, already "read".
  if new.direction = 'inbound' then
    update whatsapp_conversations
      set unread_count = unread_count + 1
      where id = new.conversation_id;
  end if;
  return new;
end;
$$;

comment on function bump_conversation_unread() is
  'AFTER INSERT trigger function on whatsapp_messages. Atomically increments whatsapp_conversations.unread_count when direction=inbound. Replaces the broken double-counting logic that lived in the whatsapp-agent Edge Function.';

drop trigger if exists whatsapp_messages_bump_unread on whatsapp_messages;

create trigger whatsapp_messages_bump_unread
  after insert on whatsapp_messages
  for each row
  execute function bump_conversation_unread();

-- ============================================================
-- 2. RPC: mark a conversation read (reset unread_count to 0).
--    Called by the admin inbox when a staff member opens a thread.
--    SECURITY DEFINER so it bypasses RLS; it does its own is_staff()
--    check to make sure only staff can clear their own inbox.
-- ============================================================
create or replace function mark_whatsapp_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Gate on staff membership — defence in depth alongside the RLS
  -- grant below.
  if not is_staff() then
    raise exception 'not authorised'
      using hint = 'Only staff can mark WhatsApp conversations as read';
  end if;

  update whatsapp_conversations
    set unread_count = 0
    where id = p_conversation_id;
end;
$$;

comment on function mark_whatsapp_conversation_read(uuid) is
  'Staff-only RPC. Sets whatsapp_conversations.unread_count = 0 for the given conversation. Called by the admin inbox on thread open.';

-- Allow authenticated (i.e. logged-in staff) to call it. The function
-- body's is_staff() check is what actually enforces the staff-only rule.
revoke all on function mark_whatsapp_conversation_read(uuid) from public;
grant execute on function mark_whatsapp_conversation_read(uuid) to authenticated;

-- ============================================================
-- 3. One-shot backfill: normalise any existing rows.
--    If the bug has already produced nonsensical values, recalculate
--    from whatsapp_messages. This is safe to re-run; idempotent.
-- ============================================================
update whatsapp_conversations c
set unread_count = sub.cnt
from (
  select conversation_id, count(*)::int as cnt
  from whatsapp_messages
  where direction = 'inbound'
  group by conversation_id
) sub
where c.id = sub.conversation_id
  and c.unread_count <> sub.cnt;

-- Conversations with no inbound messages → unread_count must be 0.
update whatsapp_conversations
  set unread_count = 0
where id not in (select conversation_id from whatsapp_messages where direction = 'inbound')
  and unread_count <> 0;

-- ============================================================
-- Done.
--
-- Rollback:
--   drop trigger whatsapp_messages_bump_unread on whatsapp_messages;
--   drop function bump_conversation_unread();
--   drop function mark_whatsapp_conversation_read(uuid);
--
-- NOTE: rollback does NOT restore the Edge Function's old logic.
-- If you roll back, also revert the whatsapp-agent change.
-- ============================================================
