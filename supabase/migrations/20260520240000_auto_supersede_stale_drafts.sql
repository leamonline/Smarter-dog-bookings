-- ============================================================
-- Auto-supersede stale WhatsApp drafts
--
-- A pending whatsapp_drafts row sits as "work for staff" forever
-- unless someone explicitly approves or rejects it. Two situations
-- make a draft genuinely stale:
--
--   1. The conversation it belongs to was closed. The thread is
--      done — the AI's suggestion no longer applies.
--   2. A newer inbound message arrived. The draft was written
--      replying to an older customer turn; the customer has now
--      said something else.
--
-- Either way, leaving the row in 'pending' inflates the dashboard
-- "needs eyes" count without surfacing real work. The
-- whatsapp_drafts table already has a 'superseded' state in its
-- CHECK constraint — meant for exactly this case — so we flip
-- to that with a rejection reason naming the cause.
--
-- Two triggers, both SECURITY DEFINER with a pinned search_path.
-- The third statement at the bottom backfills the one stale row
-- created before this migration (the user's test conversation that
-- got closed after the draft was generated).
-- ============================================================

-- 1. Closure trigger: when closed_at goes NULL → NOT NULL, supersede
--    every pending draft on that conversation.
create or replace function supersede_drafts_on_conversation_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.closed_at is not null
     and (old.closed_at is null or old.closed_at is distinct from new.closed_at)
  then
    update whatsapp_drafts
       set state = 'superseded',
           rejected_reason = 'conversation_closed',
           decided_at = now()
     where conversation_id = new.id
       and state = 'pending';
  end if;
  return new;
end;
$$;

comment on function supersede_drafts_on_conversation_close() is
  'AFTER UPDATE trigger on whatsapp_conversations. When the conversation transitions from open to closed, any still-pending AI drafts are flipped to state=superseded with rejected_reason=conversation_closed so the dashboard "needs eyes" count stops counting them.';

drop trigger if exists trg_supersede_drafts_on_conversation_close on whatsapp_conversations;
create trigger trg_supersede_drafts_on_conversation_close
  after update on whatsapp_conversations
  for each row execute function supersede_drafts_on_conversation_close();

-- 2. Newer-inbound trigger: when a new inbound message arrives,
--    supersede any pending drafts that pre-date this message. The
--    draft was written for an earlier turn; the customer has since
--    moved the conversation on.
create or replace function supersede_drafts_on_new_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'inbound' then
    update whatsapp_drafts
       set state = 'superseded',
           rejected_reason = 'newer_inbound',
           decided_at = now()
     where conversation_id = new.conversation_id
       and state = 'pending'
       and created_at < coalesce(new.sent_at, now());
  end if;
  return new;
end;
$$;

comment on function supersede_drafts_on_new_inbound() is
  'AFTER INSERT trigger on whatsapp_messages. When the customer sends a fresh inbound, any older still-pending AI drafts on the conversation are flipped to state=superseded so the dashboard does not count drafts that reply to a stale turn.';

drop trigger if exists trg_supersede_drafts_on_new_inbound on whatsapp_messages;
create trigger trg_supersede_drafts_on_new_inbound
  after insert on whatsapp_messages
  for each row execute function supersede_drafts_on_new_inbound();

-- 3. One-time backfill: any pending draft on an already-closed
--    conversation right now. Also covers drafts where the draft
--    pre-dates the most recent inbound (rare; the agent's
--    auto-draft was already throttled per turn).
update whatsapp_drafts d
   set state = 'superseded',
       rejected_reason = 'conversation_closed',
       decided_at = now()
  from whatsapp_conversations c
 where d.conversation_id = c.id
   and d.state = 'pending'
   and c.closed_at is not null;

update whatsapp_drafts d
   set state = 'superseded',
       rejected_reason = 'newer_inbound',
       decided_at = now()
  where d.state = 'pending'
    and exists (
      select 1 from whatsapp_messages m
       where m.conversation_id = d.conversation_id
         and m.direction = 'inbound'
         and m.sent_at > d.created_at
    );
