-- ============================================================
-- 20260614120000_clear_snooze_on_inbound.sql
--
-- Wake a snoozed conversation when the customer messages again.
--
-- Bug (review, June 2026):
--   The inbox snooze feature parks a conversation by setting
--   state = 'snoozed' + snoozed_until. The staff list filters every
--   active bucket (Unread, Awaiting reply, …) over non-snoozed rows,
--   so a snoozed thread is hidden until its timer elapses. But nothing
--   cleared the snooze when a NEW inbound message arrived — so a
--   customer who replied during the snooze window stayed invisible to
--   the salon until the timer ran out. For a booking business run over
--   WhatsApp that risks silently missing a customer.
--
-- Fix:
--   Extend the existing reopen_on_new_inbound() BEFORE UPDATE trigger
--   (which already un-closes a closed conversation on new inbound) to
--   ALSO un-snooze a snoozed one. Same firing condition: last_inbound_at
--   advances. We restore state to 'human_takeover' — the safe default
--   since 20260520220000 — rather than guessing the pre-snooze mode, so
--   waking a conversation never silently re-enables the AI.
--
--   The whatsapp_messages_bump_unread trigger advances unread_count via
--   a separate UPDATE, and the agent's upsertConversation advances
--   last_inbound_at; either UPDATE that moves last_inbound_at forward
--   now clears the snooze in the same statement.
--
-- Idempotent: create-or-replace the function + recreate the trigger.
-- Apply manually (migrations are not auto-applied on deploy); the
-- front-end also has a client-side stopgap (unread_count > 0 treats a
-- row as un-snoozed) so the UI is correct in the gap before this lands.
-- ============================================================

create or replace function reopen_on_new_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_inbound_at is distinct from old.last_inbound_at
     and new.last_inbound_at is not null
  then
    -- A new customer message reopens a closed conversation. closed_by
    -- stays set so a future audit can show "you closed this, customer
    -- replied".
    if new.closed_at is not null then
      new.closed_at := null;
      new.closure_reason := null;
      -- Suggestions are stale once the customer replies — clear them so
      -- the conversation doesn't stay flagged as "suggest closing".
      new.closure_suggested_at := null;
      new.closure_suggested_reason := null;
    end if;

    -- ...and wakes a snoozed one, so staff see the reply immediately
    -- instead of it staying parked until the snooze timer elapses.
    -- Restore to human_takeover (the safe default) rather than guessing
    -- the pre-snooze mode — never silently re-enable the AI.
    if new.state = 'snoozed' then
      new.state := 'human_takeover';
      new.snoozed_until := null;
    end if;
  end if;
  return new;
end;
$$;

comment on function reopen_on_new_inbound() is
  'BEFORE UPDATE trigger on whatsapp_conversations. When last_inbound_at advances: clears closure metadata on a closed conversation (preserving closed_by) and wakes a snoozed one (state -> human_takeover, snoozed_until -> null) so a new customer message can never stay hidden behind a snooze.';

drop trigger if exists trg_whatsapp_conversations_reopen_on_new_inbound on whatsapp_conversations;
create trigger trg_whatsapp_conversations_reopen_on_new_inbound
  before update on whatsapp_conversations
  for each row execute function reopen_on_new_inbound();
