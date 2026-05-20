-- ============================================================
-- Phase E Part 1: messaging channel column
--
-- Lays the schema for multi-channel customer messaging. Until now
-- everything has been WhatsApp; this migration adds the column so
-- both existing rows and new ones can be tagged with their channel,
-- and adds a per-human routing preference the agent will eventually
-- honour for outbound nudges.
--
-- The tables aren't renamed (whatsapp_conversations, whatsapp_messages)
-- because:
--   1. Renaming breaks every realtime channel, every edge function,
--      every PostgREST endpoint the frontend uses.
--   2. The agent-side prompt + every RLS policy + every cron job
--      references the existing names.
--   3. The actual customer-facing data model is identical regardless
--      of channel — they're conversations with messages.
--
-- So we treat 'whatsapp_*' as the table family name and use the
-- channel column to disambiguate per row. If we ever build a 3rd
-- channel (email? Instagram?) the same pattern continues.
--
-- Defaults:
--   whatsapp_conversations.channel  default 'whatsapp'
--   whatsapp_messages.channel       default 'whatsapp'
--   humans.preferred_channel        nullable (NULL = unset, agent
--                                   falls back to whichever channel
--                                   the customer last replied on)
-- ============================================================

-- 1. Columns
alter table whatsapp_conversations add column if not exists channel text not null default 'whatsapp';
alter table whatsapp_messages add column if not exists channel text not null default 'whatsapp';
alter table humans add column if not exists preferred_channel text;

-- CHECK constraints — null on humans (unset), but never null on the
-- message/conversation rows since the channel is load-bearing for
-- routing decisions in whatsapp-send / sms-send.
alter table whatsapp_conversations drop constraint if exists whatsapp_conversations_channel_check;
alter table whatsapp_conversations add constraint whatsapp_conversations_channel_check check (channel in ('whatsapp','sms'));

alter table whatsapp_messages drop constraint if exists whatsapp_messages_channel_check;
alter table whatsapp_messages add constraint whatsapp_messages_channel_check check (channel in ('whatsapp','sms'));

alter table humans drop constraint if exists humans_preferred_channel_check;
alter table humans add constraint humans_preferred_channel_check check (
  preferred_channel is null or preferred_channel in ('whatsapp','sms')
);

comment on column whatsapp_conversations.channel is
  'Channel this conversation uses: whatsapp | sms. Defaults to whatsapp. A single customer can have two conversations (one per channel) — phone_e164 is unique per channel pair, not globally, so the existing unique index needs the channel column added to its definition in a follow-up.';
comment on column whatsapp_messages.channel is
  'Channel this message went over: whatsapp | sms. Inherited from the parent conversation at insert time (the recordOutbound helpers and the inbound webhook set it explicitly).';
comment on column humans.preferred_channel is
  'Optional override of the customer''s preferred messaging channel. NULL = no preference; the agent uses whichever channel the customer last replied on. Set when staff know the customer prefers one channel (e.g. older customers who don''t use WhatsApp).';

-- 2. Existing unique index on (phone_e164) now needs to be (phone_e164, channel)
--    because the same customer might have one WhatsApp thread AND one
--    SMS thread. Dropping + recreating only works because the column
--    has a NOT NULL DEFAULT, so every existing row already has 'whatsapp'.
alter table whatsapp_conversations drop constraint if exists whatsapp_conversations_phone_e164_key;
create unique index if not exists whatsapp_conversations_phone_channel_key
  on whatsapp_conversations(phone_e164, channel);

-- 3. Index on humans.preferred_channel — small table, but the agent
--    will eventually filter by this column when picking the channel
--    for proactive outbound nudges.
create index if not exists idx_humans_preferred_channel
  on humans(preferred_channel)
  where preferred_channel is not null;
