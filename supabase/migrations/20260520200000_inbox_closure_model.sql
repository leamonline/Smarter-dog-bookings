-- ============================================================
-- Phase B Part 1: inbox closure model
--
-- Lets staff close a conversation, audits who closed it, and gives
-- a daily background pass three triggers for suggesting closures:
--
--   1. booking_confirmed_quiet  — conversation has a confirmed
--      booking and the customer hasn't replied in 7+ days
--   2. stale_30d                — no customer reply for 30+ days
--   3. customer_cancelled       — a linked booking has been cancelled
--
-- The pass writes closure_suggested_at / closure_suggested_reason
-- only. It never closes a conversation — staff resolve manually via
-- the inbox so they stay in control.
--
-- Closed conversations stay in the DB but fall out of the active
-- inbox queue. A BEFORE UPDATE trigger on whatsapp_conversations
-- auto-reopens any closed conversation that receives a new inbound,
-- by watching the existing last_inbound_at column (which the
-- whatsapp-agent edge function bumps when it processes a
-- whatsapp_events row). closed_by is preserved across reopen so a
-- future audit surface can still show who closed it; closed_at,
-- closure_reason, closure_suggested_* are all cleared.
-- ============================================================

-- 1. Columns
alter table whatsapp_conversations add column if not exists closed_at timestamptz;
alter table whatsapp_conversations add column if not exists closed_by uuid references auth.users(id) on delete set null;
alter table whatsapp_conversations add column if not exists closure_reason text;
alter table whatsapp_conversations add column if not exists closure_suggested_at timestamptz;
alter table whatsapp_conversations add column if not exists closure_suggested_reason text;

comment on column whatsapp_conversations.closed_at is
  'When staff marked this conversation complete. NULL = active. Cleared automatically by trg_whatsapp_conversations_reopen_on_new_inbound when a new inbound message arrives.';
comment on column whatsapp_conversations.closed_by is
  'auth.users.id of the staff member who closed the conversation. Preserved across reopen for audit; cleared by ON DELETE SET NULL if the auth user is removed.';
comment on column whatsapp_conversations.closure_reason is
  'One of manual / booking_confirmed_quiet / stale_30d / customer_cancelled. Manual means staff clicked the close button. The three machine reasons are inherited from a prior suggestion when staff accept it.';
comment on column whatsapp_conversations.closure_suggested_at is
  'When the daily suggest_conversation_closures() pass first flagged this conversation. Cleared on close or reopen.';
comment on column whatsapp_conversations.closure_suggested_reason is
  'Same enum minus manual: booking_confirmed_quiet / stale_30d / customer_cancelled. Surfaced as an amber pill in Needs review.';

-- CHECK constraints — null is always allowed; otherwise must be a
-- known enum value. Manual is excluded from the suggested-reason
-- check because the background pass never tags anything manual.
alter table whatsapp_conversations drop constraint if exists whatsapp_conversations_closure_reason_check;
alter table whatsapp_conversations add constraint whatsapp_conversations_closure_reason_check check (
  closure_reason is null or closure_reason in ('manual','booking_confirmed_quiet','stale_30d','customer_cancelled')
);

alter table whatsapp_conversations drop constraint if exists whatsapp_conversations_closure_suggested_reason_check;
alter table whatsapp_conversations add constraint whatsapp_conversations_closure_suggested_reason_check check (
  closure_suggested_reason is null or closure_suggested_reason in ('booking_confirmed_quiet','stale_30d','customer_cancelled')
);

-- 2. Indexes — partial so they only cover the rows the inbox queries
--    actually filter on. Done filter: closed_at is not null. Needs
--    review sort: closure_suggested_at is not null AND closed_at is null.
create index if not exists idx_whatsapp_conversations_closed_at
  on whatsapp_conversations(closed_at desc)
  where closed_at is not null;

create index if not exists idx_whatsapp_conversations_closure_suggested
  on whatsapp_conversations(closure_suggested_at desc)
  where closure_suggested_at is not null and closed_at is null;

-- 3. Auto-reopen trigger. Fires on any UPDATE to whatsapp_conversations
--    where last_inbound_at advances to a new value, and clears the
--    closure metadata if the row is currently closed. closed_by stays
--    set so a future audit can show "you closed this, customer replied".
create or replace function reopen_on_new_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.closed_at is not null
     and new.last_inbound_at is distinct from old.last_inbound_at
     and new.last_inbound_at is not null
  then
    new.closed_at := null;
    new.closure_reason := null;
    -- Suggestions are stale once the customer replies — clear them
    -- so the conversation doesn't stay flagged as "suggest closing"
    -- in Needs review after the thread genuinely resumes.
    new.closure_suggested_at := null;
    new.closure_suggested_reason := null;
  end if;
  return new;
end;
$$;

comment on function reopen_on_new_inbound() is
  'BEFORE UPDATE trigger on whatsapp_conversations. When last_inbound_at advances on a closed conversation, clears closed_at, closure_reason, and any stale suggestion. Preserves closed_by for audit.';

drop trigger if exists trg_whatsapp_conversations_reopen_on_new_inbound on whatsapp_conversations;
create trigger trg_whatsapp_conversations_reopen_on_new_inbound
  before update on whatsapp_conversations
  for each row execute function reopen_on_new_inbound();

-- 4. Background suggestion pass. Idempotent — only writes
--    closure_suggested_* on rows that don't already have a suggestion
--    and aren't already closed. Order matters: trigger 1 fires before
--    2 because a confirmed-quiet hit is more specific than stale_30d
--    (a 30d-quiet booking-confirmed conversation should be tagged
--    booking_confirmed_quiet, not stale_30d).
create or replace function suggest_conversation_closures()
returns table(conversation_id uuid, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  -- Trigger 1: confirmed booking + 7 days of customer silence
  return query
  update whatsapp_conversations c
     set closure_suggested_at = v_now,
         closure_suggested_reason = 'booking_confirmed_quiet'
   where c.closed_at is null
     and c.closure_suggested_at is null
     and exists (
       select 1 from bookings b
        where b.whatsapp_conversation_id = c.id
          and b.status in ('Booked','Checked in','In bath','Ready for pick-up','Completed')
     )
     and c.last_inbound_at is not null
     and c.last_inbound_at < v_now - interval '7 days'
   returning c.id::uuid, 'booking_confirmed_quiet'::text;

  -- Trigger 2: stale_30d (no customer reply for 30 days)
  return query
  update whatsapp_conversations c
     set closure_suggested_at = v_now,
         closure_suggested_reason = 'stale_30d'
   where c.closed_at is null
     and c.closure_suggested_at is null
     and c.last_inbound_at is not null
     and c.last_inbound_at < v_now - interval '30 days'
   returning c.id::uuid, 'stale_30d'::text;

  -- Trigger 3: any linked booking has status='Cancelled' and the
  -- customer hasn't messaged in the last 24h (gives them time to ack).
  return query
  update whatsapp_conversations c
     set closure_suggested_at = v_now,
         closure_suggested_reason = 'customer_cancelled'
   where c.closed_at is null
     and c.closure_suggested_at is null
     and exists (
       select 1 from bookings b
        where b.whatsapp_conversation_id = c.id
          and b.status = 'Cancelled'
     )
     and (c.last_inbound_at is null or c.last_inbound_at < v_now - interval '24 hours')
   returning c.id::uuid, 'customer_cancelled'::text;
end;
$$;

comment on function suggest_conversation_closures() is
  'Daily background pass. Tags conversations with closure_suggested_at / closure_suggested_reason based on three triggers. Idempotent — does not re-tag rows that already have a suggestion. Never closes anything; closures stay staff-driven. Returns the (conversation_id, reason) pairs touched, mostly for debugging — cron ignores the result.';

revoke all on function suggest_conversation_closures() from public;
grant execute on function suggest_conversation_closures() to service_role;

-- 5. Daily cron. 03:00 UTC matches the existing notify-* cadence so
--    the salon's iPad isn't woken at random hours. cron.unschedule
--    is no-op if the job doesn't exist — keeps the migration
--    re-runnable.
do $$
begin
  perform cron.unschedule('suggest_conversation_closures_daily');
exception when others then
  null;
end$$;

select cron.schedule(
  'suggest_conversation_closures_daily',
  '0 3 * * *',
  $cron$ select public.suggest_conversation_closures(); $cron$
);
