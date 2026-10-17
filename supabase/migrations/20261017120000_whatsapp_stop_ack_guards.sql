set local lock_timeout = '5s';

-- WhatsApp STOP acknowledgement guards: the two races left open by #1026's
-- review (migration 20261016120000, applied in production and never edited).
--
--  R1. An acknowledgement could be queued after staff re-enabled the number.
--      The agent decides to queue one from a conversation snapshot taken
--      before the STOP was applied. If staff re-enable between the STOP
--      committing and the draft being saved, the re-enable's supersede trigger
--      (G4) has already fired with no acknowledgement to supersede, and the
--      stale snapshot still lets a pending "your messages have stopped" draft
--      in: false work in the staff queue that also occupies the one-pending
--      slot. The insert itself must therefore require that the conversation is
--      stopped NOW, and must do so atomically with a re-enable.
--
--  R2. An acknowledgement could be lost after an ambiguous RPC response. When
--      apply_whatsapp_stop commits but its HTTP answer is lost, the retry sees
--      the per-message marker and answers "already applied", which the agent
--      cannot tell from a historical replay. The agent now treats that answer
--      as its own commit only when an earlier attempt in the same invocation
--      failed without an answer, and queues the acknowledgement then. For that
--      retry protocol to be safe under any interleaving, an acknowledgement
--      must be exactly-once per STOP message in every state, not merely
--      one-pending per conversation: a replay after staff rejected or sent the
--      first one must not queue a second.
--
-- Expand-only, idempotent and drop-free. No existing function, table or
-- trigger is changed; apply_whatsapp_stop keeps its contract.

-- ── R1. An acknowledgement needs a conversation that is stopped now ──
-- SELECT ... FOR SHARE, not FOR KEY SHARE. staff_reenable_whatsapp_number
-- locks the number's conversations FOR UPDATE as its first statement, but the
-- final UPDATE that clears whatsapp_opted_out_at touches no key column and so,
-- on its own, would only take FOR NO KEY UPDATE, which does not conflict with
-- the key-share lock the draft's foreign key takes. The guard must not depend
-- on which of those a future re-enable happens to use. FOR SHARE conflicts
-- with both, so exactly one of two interleavings happens:
--   * the re-enable holds the row first: this insert waits, then reads the
--     committed re-enable (READ COMMITTED re-reads the row after the wait)
--     and is refused;
--   * this insert holds the share lock first: the re-enable waits for it to
--     commit, and its own supersede trigger (G4) then sees the committed
--     acknowledgement and supersedes it.
-- Either way no pending acknowledgement outlives a re-enable.
create or replace function public.whatsapp_drafts_guard_stop_ack()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stopped_at timestamptz;
begin
  if (new.tool_calls ->> 'opt_out_acknowledgement') is distinct from 'true' then
    return new;
  end if;
  select c.whatsapp_opted_out_at into v_stopped_at
    from public.whatsapp_conversations c
   where c.id = new.conversation_id
     for share;
  -- A missing conversation is left to the foreign key to refuse.
  if found and v_stopped_at is null then
    -- Restored to pending (whatsapp-send puts a claimed draft back when the
    -- Meta call fails) after the number was re-enabled: the re-enable's
    -- supersede trigger skipped it while it was claimed, so supersede it now,
    -- exactly as that trigger would have. A failed send must not fail.
    if tg_op = 'UPDATE' then
      new.state := 'superseded';
      new.rejected_reason := 'whatsapp_reenabled';
      return new;
    end if;
    raise exception 'whatsapp_stop_ack_not_stopped: this conversation is not stopped, so no STOP acknowledgement is queued'
      using errcode = 'P0001', detail = 'whatsapp_stop_ack_not_stopped';
  end if;
  return new;
end;
$$;

revoke all on function public.whatsapp_drafts_guard_stop_ack() from public;
revoke all on function public.whatsapp_drafts_guard_stop_ack() from anon;
revoke all on function public.whatsapp_drafts_guard_stop_ack() from authenticated;

comment on function public.whatsapp_drafts_guard_stop_ack() is
  'BEFORE INSERT guard on whatsapp_drafts: a STOP acknowledgement draft is refused unless its conversation is stopped now, checked under a share lock so it is atomic with the audited re-enable (20261017120000).';

create or replace trigger trg_whatsapp_drafts_guard_stop_ack
  before insert on public.whatsapp_drafts
  for each row
  execute function public.whatsapp_drafts_guard_stop_ack();

-- The same check when an acknowledgement goes back to pending.
create or replace trigger trg_whatsapp_drafts_guard_stop_ack_restore
  before update of state on public.whatsapp_drafts
  for each row
  when (new.state = 'pending' and old.state is distinct from 'pending')
  execute function public.whatsapp_drafts_guard_stop_ack();

-- ── R2. One acknowledgement per STOP message, in any state ──────────
-- The agent records the STOP's Meta message id on the draft
-- (tool_calls.stop_meta_message_id). Rows without it (drafts written before
-- this migration, or a STOP Meta sent no id for) are outside the index, so
-- existing data cannot violate it and the one-pending index still bounds them.
create unique index if not exists whatsapp_drafts_one_opt_out_ack_per_stop
  on public.whatsapp_drafts (conversation_id, (tool_calls ->> 'stop_meta_message_id'))
  where (tool_calls ->> 'opt_out_acknowledgement') = 'true'
    and (tool_calls ->> 'stop_meta_message_id') is not null;

-- ── R2. Reading a STOP marker's time, without a table grant ─────────
-- The agent asks when a STOP's marker was written, to tell its own lost commit
-- from a replay: an unanswered attempt alone proves nothing, because the
-- request may never have reached PostgreSQL. whatsapp_stop_applications has no
-- grant or policy for any client role (apply_whatsapp_stop is its only
-- writer), and this keeps it that way: the one fact is exposed through a
-- definer function that only service_role may execute.
create or replace function public.whatsapp_stop_marker_applied_at(p_meta_message_id text)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.applied_at
    from public.whatsapp_stop_applications m
   where m.meta_message_id = p_meta_message_id
$$;

revoke all on function public.whatsapp_stop_marker_applied_at(text) from public;
revoke all on function public.whatsapp_stop_marker_applied_at(text) from anon;
revoke all on function public.whatsapp_stop_marker_applied_at(text) from authenticated;
grant execute on function public.whatsapp_stop_marker_applied_at(text) to service_role;

-- The lower bound for "was this marker written by my attempt?", taken from the
-- DATABASE's clock before the first attempt. Comparing the marker's time (also
-- the database's) with this one never mixes two machines' clocks.
create or replace function public.whatsapp_stop_attempt_started_at()
returns timestamptz
language sql
volatile
security definer
set search_path = public, pg_temp
as $$ select clock_timestamp() $$;

revoke all on function public.whatsapp_stop_attempt_started_at() from public;
revoke all on function public.whatsapp_stop_attempt_started_at() from anon;
revoke all on function public.whatsapp_stop_attempt_started_at() from authenticated;
grant execute on function public.whatsapp_stop_attempt_started_at() to service_role;

comment on function public.whatsapp_stop_marker_applied_at(text) is
  'When apply_whatsapp_stop recorded this Meta message''s STOP, or null. service_role only (20261017120000).';
