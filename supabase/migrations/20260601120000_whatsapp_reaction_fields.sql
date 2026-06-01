-- ============================================================
-- whatsapp_reaction_fields.sql
--
-- Surface emoji reactions in the inbox. Inbound reactions already
-- arrive and are stored — whatsapp-agent inserts them with the full
-- Meta message in whatsapp_messages.raw — but the emoji and the
-- message-being-reacted-to were never pulled out, so the thread could
-- only show a generic "Reacted" line.
--
-- This migration:
--   1. Adds two nullable columns to whatsapp_messages:
--        reaction_emoji       — the emoji (raw.reaction.emoji)
--        in_reply_to_meta_id  — Meta wamid this message references:
--                               a reaction target (raw.reaction.message_id)
--                               or a quoted reply (raw.context.id). Matches
--                               another row's meta_message_id.
--   2. Indexes in_reply_to_meta_id for cheap "reactions for this message"
--      lookups (partial — only the rows that actually reference another).
--   3. Backfills both columns from raw for every reaction/quoted reply
--      already in the table, so history lights up immediately.
--
-- whatsapp-agent is updated in the same change to populate these going
-- forward; the inbox select is widened to read them.
--
-- Non-breaking: columns are nullable with no default, so existing
-- inserts that don't set them are unaffected. No RLS/grant change
-- (row-level policies are unaffected by new columns) and no realtime
-- publication change (the inbox hook re-runs its select on change
-- rather than reading the realtime payload).
-- ============================================================

alter table whatsapp_messages
  add column if not exists reaction_emoji      text,
  add column if not exists in_reply_to_meta_id text;

comment on column whatsapp_messages.reaction_emoji is
  'Inbound type=reaction only: the emoji reacted with (raw.reaction.emoji). NULL otherwise.';
comment on column whatsapp_messages.in_reply_to_meta_id is
  'Meta wamid this message references — reaction target (raw.reaction.message_id) '
  'or quoted reply (raw.context.id). Matches another whatsapp_messages.meta_message_id.';

create index if not exists whatsapp_messages_in_reply_to_idx
  on whatsapp_messages (in_reply_to_meta_id)
  where in_reply_to_meta_id is not null;

-- ── Backfill from the payload we already keep ────────────────
-- Reactions: emoji + the message they react to.
update whatsapp_messages
   set reaction_emoji      = coalesce(reaction_emoji, raw->'reaction'->>'emoji'),
       in_reply_to_meta_id = coalesce(in_reply_to_meta_id, raw->'reaction'->>'message_id')
 where raw ? 'reaction';

-- Quoted-text replies: anchor them to the quoted message too.
update whatsapp_messages
   set in_reply_to_meta_id = coalesce(in_reply_to_meta_id, raw->'context'->>'id')
 where raw ? 'context'
   and in_reply_to_meta_id is null;
