-- ============================================================
-- Allow 'email' as a messaging channel
--
-- 20260520210000_messaging_channel.sql introduced the `channel` column
-- on whatsapp_conversations / whatsapp_messages (and humans.preferred_channel)
-- constrained to ('whatsapp','sms'). Its own comment anticipated a third
-- channel: "If we ever build a 3rd channel (email? Instagram?) the same
-- pattern continues."
--
-- The staff Send-Reminder flow now logs confirmed email reminders into the
-- same unified customer thread (reminder-send edge function), so the CHECK
-- constraints need to permit 'email'. Purely additive — every existing row
-- keeps its 'whatsapp' / 'sms' value.
-- ============================================================

alter table whatsapp_messages drop constraint if exists whatsapp_messages_channel_check;
alter table whatsapp_messages add constraint whatsapp_messages_channel_check
  check (channel in ('whatsapp', 'sms', 'email'));

alter table whatsapp_conversations drop constraint if exists whatsapp_conversations_channel_check;
alter table whatsapp_conversations add constraint whatsapp_conversations_channel_check
  check (channel in ('whatsapp', 'sms', 'email'));

alter table humans drop constraint if exists humans_preferred_channel_check;
alter table humans add constraint humans_preferred_channel_check
  check (preferred_channel is null or preferred_channel in ('whatsapp', 'sms', 'email'));

comment on column whatsapp_messages.channel is
  'Channel this message went over: whatsapp | sms | email. Inherited from the parent conversation at insert time (recordOutbound helpers + the inbound webhook set it explicitly).';
