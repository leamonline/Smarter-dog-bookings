-- Messenger as a fourth inbox channel.
--
-- WhatsApp, SMS and email stay keyed by (phone_e164, channel). That unique
-- index is not rebuilt. Messenger has no phone: phone_e164 becomes nullable
-- only for channel = 'messenger', and those rows are unique on
-- (messenger_page_id, messenger_psid). A check keeps a phone required on
-- every other channel, so existing writers that omit a phone still fail.
--
-- Rollback, while no messenger rows exist:
--   drop trigger trg_enforce_messenger_staff_only on public.whatsapp_conversations;
--   drop function public.enforce_messenger_staff_only();
--   drop table public.messaging_webhook_events;
--   drop table public.messaging_identities;
--   alter table public.whatsapp_conversations drop constraint whatsapp_conversations_identity_check;
--   alter table public.whatsapp_conversations drop constraint whatsapp_conversations_messenger_identity_key;
--   alter table public.whatsapp_conversations drop column messenger_psid, drop column messenger_page_id;
--   alter table public.whatsapp_conversations alter column phone_e164 set not null;
--   and restore the previous channel checks (whatsapp, sms, email).
-- Once a messenger row exists, roll forward: turn MESSENGER_INBOX_ENABLED off.
-- Do not set phone_e164 back to NOT NULL over a null.

alter table public.whatsapp_conversations
  add column if not exists messenger_psid text,
  add column if not exists messenger_page_id text;

alter table public.whatsapp_conversations
  alter column phone_e164 drop not null;

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_channel_check;
alter table public.whatsapp_messages add constraint whatsapp_messages_channel_check
  check (channel in ('whatsapp', 'sms', 'email', 'messenger'));

alter table public.whatsapp_conversations drop constraint if exists whatsapp_conversations_channel_check;
alter table public.whatsapp_conversations add constraint whatsapp_conversations_channel_check
  check (channel in ('whatsapp', 'sms', 'email', 'messenger'));

alter table public.whatsapp_conversations drop constraint if exists whatsapp_conversations_identity_check;
alter table public.whatsapp_conversations add constraint whatsapp_conversations_identity_check check (
  (
    channel in ('whatsapp', 'sms', 'email')
    and phone_e164 is not null
    and messenger_psid is null
    and messenger_page_id is null
  )
  or (
    channel = 'messenger'
    and phone_e164 is null
    and messenger_psid is not null
    and messenger_page_id is not null
    and length(btrim(messenger_psid)) > 0
    and length(btrim(messenger_page_id)) > 0
  )
);

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_messenger_identity_key;
alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_messenger_identity_key
  unique (messenger_page_id, messenger_psid);

comment on column public.whatsapp_conversations.channel is
  'Channel this conversation uses: whatsapp | sms | email | messenger. WhatsApp, SMS and email stay unique on (phone_e164, channel). Messenger is unique on (messenger_page_id, messenger_psid) and has no phone.';
comment on column public.whatsapp_conversations.messenger_psid is
  'Facebook page-scoped id of the person on a Messenger thread. Null on every other channel. Never a phone number, and never used to match a customer automatically.';
comment on column public.whatsapp_conversations.messenger_page_id is
  'Facebook Page id that received the Messenger thread. Null on every other channel.';
comment on column public.whatsapp_messages.channel is
  'Channel this message went over: whatsapp | sms | email | messenger.';

-- Staff-established link from a Page + PSID to a customer. Profile names
-- are not stored here and are not a match key. A phone number is not copied
-- onto the conversation.
create table if not exists public.messaging_identities (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel = 'messenger'),
  page_id text not null,
  psid text not null,
  human_id uuid not null references public.humans (id) on delete cascade,
  linked_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (channel, page_id, psid)
);

comment on table public.messaging_identities is
  'Staff link from a Messenger page-scoped id to a humans row. Written by messenger-send. Not an automatic phone match.';

alter table public.messaging_identities enable row level security;
revoke all on table public.messaging_identities from public, anon, authenticated;
grant all on table public.messaging_identities to service_role;
grant select on table public.messaging_identities to authenticated;
drop policy if exists messaging_identities_staff_select on public.messaging_identities;
create policy messaging_identities_staff_select
  on public.messaging_identities
  for select
  to authenticated
  using (public.is_staff());

-- Forensic copy of a signed Page webhook. No trigger calls the WhatsApp agent.
create table if not exists public.messaging_webhook_events (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'messenger' check (channel = 'messenger'),
  signature_valid boolean not null,
  page_id text,
  psid text,
  meta_message_id text,
  event_kind text,
  payload jsonb not null,
  processing_status text not null default 'processed',
  error_message text,
  received_at timestamptz not null default now()
);

create index if not exists messaging_webhook_events_received_idx
  on public.messaging_webhook_events (received_at desc);

comment on table public.messaging_webhook_events is
  'Raw Messenger webhook payloads. Separate from whatsapp_events so the WhatsApp agent trigger does not run.';

alter table public.messaging_webhook_events enable row level security;
revoke all on table public.messaging_webhook_events from public, anon, authenticated;
grant all on table public.messaging_webhook_events to service_role;
grant select on table public.messaging_webhook_events to authenticated;
drop policy if exists messaging_webhook_events_staff_select on public.messaging_webhook_events;
create policy messaging_webhook_events_staff_select
  on public.messaging_webhook_events
  for select
  to authenticated
  using (public.is_staff());

-- Messenger never auto-sends and never books on its own, whatever the UI toggles.
create or replace function public.enforce_messenger_staff_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.channel = 'messenger' then
    new.auto_send_enabled := false;
    new.autonomous_booking_enabled := false;
    if new.state = 'ai_handling' then
      new.state := 'human_takeover';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.enforce_messenger_staff_only() is
  'Messenger threads stay on human_takeover with auto-send and autonomous booking off. The AI may still draft; it must not send.';

drop trigger if exists trg_enforce_messenger_staff_only on public.whatsapp_conversations;
create trigger trg_enforce_messenger_staff_only
  before insert or update on public.whatsapp_conversations
  for each row
  execute function public.enforce_messenger_staff_only();

revoke all on function public.enforce_messenger_staff_only() from public, anon, authenticated;
