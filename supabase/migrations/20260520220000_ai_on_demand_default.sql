-- ============================================================
-- Phase G — AI on demand
--
-- Flips the default AI behaviour: from "agent drafts every inbound"
-- to "messages just sit in the inbox; staff click Generate reply
-- when they want an AI draft."
--
-- Two changes here:
--
-- 1. Default of whatsapp_conversations.state flips from
--    'ai_handling' to 'human_takeover'. New conversations created
--    by the webhook / upsert paths land in human_takeover and the
--    agent short-circuits (see whatsapp-agent/index.ts).
--
-- 2. Existing rows currently in 'ai_handling' WITHOUT auto_send_enabled
--    (the old "AI drafts" mode that we're retiring) are migrated to
--    'human_takeover'. Rows where staff actively opted into auto-send
--    (`auto_send_enabled = true`) are left in 'ai_handling' — that's
--    the "AI auto" mode, which stays.
--
-- The retained mode pair is:
--   Human only:  state='human_takeover', auto_send_enabled=false
--   AI auto:     state='ai_handling',    auto_send_enabled=true
--
-- The intermediate "AI drafts" mode (state='ai_handling',
-- auto_send_enabled=false) is gone — it overlapped with the new
-- on-demand "Generate reply" button and added a third choice without
-- adding value.
-- ============================================================

-- 1. Migrate existing AI-drafts rows to Human only
update whatsapp_conversations
   set state = 'human_takeover'
 where state = 'ai_handling'
   and auto_send_enabled = false;

-- 2. Default for new rows
alter table whatsapp_conversations
  alter column state set default 'human_takeover';

comment on column whatsapp_conversations.state is
  'AI mode for this conversation: human_takeover (default — no AI activity unless staff clicks Generate reply) or ai_handling (AI processes every inbound; if auto_send_enabled is true, low-risk replies go without approval). Combined with auto_send_enabled this gives the two-mode model post-Phase-G: Human only / AI auto.';
