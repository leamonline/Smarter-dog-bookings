-- In-app messages, beside WhatsApp.
--
-- The iPhone app needs a conversation that is not Meta. WhatsApp tables stay
-- as they are: staff-only select, keyed by phone, shaped for Meta and SMS.
-- Customers must be able to read their own app thread, so these rows live in
-- their own tables. A customer with no app keeps using WhatsApp; nothing here
-- writes whatsapp_messages or changes a WhatsApp policy.
--
-- Writes go through send_app_message and mark_app_messages_read. Direct
-- insert and update are not granted. Staff read every thread; a customer
-- reads only the conversation whose human is linked to auth.uid().
--
-- Attachments are deliberately absent. Add a later child table or a nullable
-- path; do not overload the body column.
--
-- TODO(app-push): do not call notify-staff or an APNs sender from
-- send_app_message. Staff Web Push and customer APNs are separate work.
-- The insert into app_messages is the hook. Realtime already publishes it.
-- A later migration can add an AFTER INSERT trigger once those senders exist.
--
-- Expand-only and idempotent. Safe to apply before the website flag
-- VITE_APP_INBOX_ENABLED is turned on: the current inbox does not call these
-- functions. Do not apply this file to production as part of writing it.

set local lock_timeout = '5s';

create table if not exists public.app_conversations (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null unique references public.humans(id) on delete cascade,
  last_message_at timestamptz,
  last_message_text text,
  last_message_sender text
    check (last_message_sender is null or last_message_sender in ('customer', 'staff')),
  staff_unread_count integer not null default 0 check (staff_unread_count >= 0),
  customer_unread_count integer not null default 0 check (customer_unread_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_conversations is
  'One in-app conversation per customer. Not a WhatsApp thread. Customers read their own row; staff read all. Writes go through send_app_message and mark_app_messages_read (20261122120000).';

create table if not exists public.app_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.app_conversations(id) on delete cascade,
  sender text not null check (sender in ('customer', 'staff')),
  staff_user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  staff_read_at timestamptz,
  customer_read_at timestamptz,
  check (sender <> 'customer' or staff_user_id is null)
);

comment on table public.app_messages is
  'One in-app message. sender is customer or staff; staff_user_id is the signed-in staff member when sender is staff. staff_read_at / customer_read_at are the read marks. Attachments are not stored yet (20261122120000).';

create index if not exists app_messages_conversation_created_idx
  on public.app_messages (conversation_id, created_at desc);

create index if not exists app_messages_staff_unread_idx
  on public.app_messages (conversation_id)
  where sender = 'customer' and staff_read_at is null;

create index if not exists app_messages_customer_unread_idx
  on public.app_messages (conversation_id)
  where sender = 'staff' and customer_read_at is null;

drop trigger if exists app_conversations_updated on public.app_conversations;
create trigger app_conversations_updated
  before update on public.app_conversations
  for each row execute function public.update_modified_column();

alter table public.app_conversations enable row level security;
alter table public.app_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_conversations' and policyname = 'app_conversations_select'
  ) then
    create policy app_conversations_select on public.app_conversations
      for select to authenticated
      using (
        (select public.is_staff())
        or exists (
          select 1 from public.humans h
          where h.id = app_conversations.human_id
            and h.customer_user_id = (select auth.uid())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_messages' and policyname = 'app_messages_select'
  ) then
    create policy app_messages_select on public.app_messages
      for select to authenticated
      using (
        (select public.is_staff())
        or exists (
          select 1
          from public.app_conversations c
          join public.humans h on h.id = c.human_id
          where c.id = app_messages.conversation_id
            and h.customer_user_id = (select auth.uid())
        )
      );
  end if;
end $$;

revoke all on table public.app_conversations from public, anon, authenticated, service_role;
revoke all on table public.app_messages from public, anon, authenticated, service_role;
grant select on table public.app_conversations to authenticated;
grant select on table public.app_messages to authenticated;
grant select, insert, update, delete on table public.app_conversations to service_role;
grant select, insert, update, delete on table public.app_messages to service_role;

-- Realtime. Customers and staff subscribe with their own JWT; RLS filters
-- the events. Idempotent if a table is already in the publication.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['app_conversations', 'app_messages']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        tbl
      );
    end if;
  end loop;
end $$;

-- ── Send ─────────────────────────────────────────────────────
-- Customers omit p_human_id: the human is the one linked to auth.uid().
-- A customer-supplied human id is ignored, so they cannot write into
-- someone else's thread. Staff must pass the customer's human id.
create or replace function public.send_app_message(
  p_body text,
  p_human_id uuid default null
)
returns table (
  out_id uuid,
  out_conversation_id uuid,
  out_human_id uuid,
  out_sender text,
  out_body text,
  out_created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_staff boolean := public.is_staff();
  v_human_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_sender text;
  v_now timestamptz := now();
  v_conversation_id uuid;
  v_message public.app_messages%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_body = '' then
    raise exception 'empty_message' using errcode = '22023';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'message_too_long' using errcode = '22023';
  end if;

  if v_staff then
    if p_human_id is null then
      raise exception 'human_required' using errcode = '22023';
    end if;
    select h.id into v_human_id
    from public.humans h
    where h.id = p_human_id;
    if v_human_id is null then
      raise exception 'human_not_found' using errcode = '42704';
    end if;
    v_sender := 'staff';
  else
    select h.id into v_human_id
    from public.humans h
    where h.customer_user_id = v_uid
      and h.archived_at is null
    limit 1;
    if v_human_id is null then
      if exists (
        select 1 from public.humans h
        where h.customer_user_id = v_uid and h.archived_at is not null
      ) then
        raise exception 'account_archived' using errcode = '22023';
      end if;
      raise exception 'no_linked_human' using errcode = '28000';
    end if;
    v_sender := 'customer';
  end if;

  insert into public.app_conversations as c (
    human_id,
    last_message_at,
    last_message_text,
    last_message_sender,
    staff_unread_count,
    customer_unread_count
  )
  values (
    v_human_id,
    v_now,
    v_body,
    v_sender,
    case when v_sender = 'customer' then 1 else 0 end,
    case when v_sender = 'staff' then 1 else 0 end
  )
  on conflict on constraint app_conversations_human_id_key do update
  set
    last_message_at = excluded.last_message_at,
    last_message_text = excluded.last_message_text,
    last_message_sender = excluded.last_message_sender,
    staff_unread_count = c.staff_unread_count
      + case when excluded.last_message_sender = 'customer' then 1 else 0 end,
    customer_unread_count = c.customer_unread_count
      + case when excluded.last_message_sender = 'staff' then 1 else 0 end
  returning c.id into v_conversation_id;

  insert into public.app_messages (
    conversation_id,
    sender,
    staff_user_id,
    body,
    created_at,
    staff_read_at,
    customer_read_at
  )
  values (
    v_conversation_id,
    v_sender,
    case when v_sender = 'staff' then v_uid end,
    v_body,
    v_now,
    case when v_sender = 'staff' then v_now end,
    case when v_sender = 'customer' then v_now end
  )
  returning * into v_message;

  return query
  select
    v_message.id,
    v_message.conversation_id,
    v_human_id,
    v_message.sender,
    v_message.body,
    v_message.created_at;
end;
$$;

comment on function public.send_app_message(text, uuid) is
  'Sends one in-app message. Customers write on their own linked human (p_human_id is ignored). Staff must pass the customer human id. Does not write WhatsApp or send a push (20261122120000).';

revoke all on function public.send_app_message(text, uuid) from public, anon, authenticated;
grant execute on function public.send_app_message(text, uuid) to authenticated;

-- ── Mark read ────────────────────────────────────────────────
-- Staff mark customer messages read. Customers mark staff messages read,
-- and only on their own conversation. A missing or someone else's id is
-- not_found either way, so the answer does not reveal that it exists.
create or replace function public.mark_app_messages_read(p_conversation_id uuid)
returns table (
  out_conversation_id uuid,
  out_unread_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_staff boolean := public.is_staff();
  v_id uuid;
  v_human_id uuid;
  v_now timestamptz := now();
  v_unread integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select c.id, c.human_id into v_id, v_human_id
  from public.app_conversations c
  where c.id = p_conversation_id
  for update;

  if v_id is null then
    raise exception 'not_found' using errcode = '42704';
  end if;

  if not v_staff then
    if not exists (
      select 1 from public.humans h
      where h.id = v_human_id and h.customer_user_id = v_uid
    ) then
      raise exception 'not_found' using errcode = '42704';
    end if;

    update public.app_messages m
    set customer_read_at = v_now
    where m.conversation_id = v_id
      and m.sender = 'staff'
      and m.customer_read_at is null;

    update public.app_conversations c
    set customer_unread_count = (
      select count(*)::integer
      from public.app_messages m
      where m.conversation_id = c.id
        and m.sender = 'staff'
        and m.customer_read_at is null
    )
    where c.id = v_id
    returning c.customer_unread_count into v_unread;
  else
    update public.app_messages m
    set staff_read_at = v_now
    where m.conversation_id = v_id
      and m.sender = 'customer'
      and m.staff_read_at is null;

    update public.app_conversations c
    set staff_unread_count = (
      select count(*)::integer
      from public.app_messages m
      where m.conversation_id = c.id
        and m.sender = 'customer'
        and m.staff_read_at is null
    )
    where c.id = v_id
    returning c.staff_unread_count into v_unread;
  end if;

  return query select v_id, coalesce(v_unread, 0);
end;
$$;

comment on function public.mark_app_messages_read(uuid) is
  'Marks the other side''s in-app messages read and recounts that side''s unread total. Staff mark customer messages; a customer marks staff messages on their own conversation only (20261122120000).';

revoke all on function public.mark_app_messages_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_app_messages_read(uuid) to authenticated;

-- ── Unified staff inbox ──────────────────────────────────────
-- One row per customer who has a WhatsApp/SMS thread, an app thread, or
-- both. A WhatsApp number with no human stays its own row. Channels names
-- which pipes that row contains. last_channel is the channel of the newer
-- message (WhatsApp wins a tie).
create or replace function public.list_staff_unified_inbox()
returns table (
  thread_key text,
  human_id uuid,
  whatsapp_conversation_id uuid,
  app_conversation_id uuid,
  channels text[],
  last_channel text,
  last_message_at timestamptz,
  last_message_text text,
  last_message_direction text,
  staff_unread_count integer,
  phone_e164 text,
  customer_name text,
  customer_surname text,
  app_unread_count integer
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  return query
  with wa as (
    select
      c.id,
      c.human_id,
      c.channel,
      c.phone_e164,
      c.unread_count,
      c.last_message_at,
      c.last_message_text,
      c.last_message_direction,
      c.last_customer_text,
      c.last_inbound_at,
      c.last_outbound_at,
      coalesce(c.last_message_at, c.last_inbound_at, c.last_outbound_at) as activity_at
    from public.whatsapp_conversations c
  ),
  app as (
    select
      a.id,
      a.human_id,
      a.staff_unread_count,
      a.last_message_at,
      a.last_message_text,
      a.last_message_sender
    from public.app_conversations a
  ),
  humans_involved as (
    select w.human_id from wa w where w.human_id is not null
    union
    select a.human_id from app a
  ),
  per_human as (
    select
      h.human_id,
      wa_latest.id as whatsapp_conversation_id,
      a.id as app_conversation_id,
      array_remove(array[
        case when exists (
          select 1 from wa w where w.human_id = h.human_id and w.channel = 'whatsapp'
        ) then 'whatsapp' end,
        case when exists (
          select 1 from wa w where w.human_id = h.human_id and w.channel = 'sms'
        ) then 'sms' end,
        case when a.id is not null then 'app' end
      ]::text[], null::text) as channels,
      case
        when a.last_message_at is not null
          and (wa_latest.activity_at is null or a.last_message_at > wa_latest.activity_at)
          then 'app'
        else wa_latest.channel
      end as last_channel,
      case
        when a.last_message_at is not null
          and (wa_latest.activity_at is null or a.last_message_at > wa_latest.activity_at)
          then a.last_message_at
        else wa_latest.activity_at
      end as last_message_at,
      case
        when a.last_message_at is not null
          and (wa_latest.activity_at is null or a.last_message_at > wa_latest.activity_at)
          then a.last_message_text
        else coalesce(wa_latest.last_message_text, wa_latest.last_customer_text)
      end as last_message_text,
      case
        when a.last_message_at is not null
          and (wa_latest.activity_at is null or a.last_message_at > wa_latest.activity_at)
          then case when a.last_message_sender = 'customer' then 'inbound' else 'outbound' end
        else coalesce(
          wa_latest.last_message_direction,
          case
            when wa_latest.last_outbound_at is not null
              and (wa_latest.last_inbound_at is null or wa_latest.last_outbound_at >= wa_latest.last_inbound_at)
              then 'outbound'
            else 'inbound'
          end
        )
      end as last_message_direction,
      (
        coalesce(wa_latest.unread_count, 0) + coalesce(a.staff_unread_count, 0)
      )::integer as staff_unread_count,
      coalesce(wa_latest.phone_e164, person.phone) as phone_e164,
      person.name as customer_name,
      person.surname as customer_surname,
      coalesce(a.staff_unread_count, 0)::integer as app_unread_count
    from humans_involved h
    left join lateral (
      select w.*
      from wa w
      where w.human_id = h.human_id
      order by w.activity_at desc nulls last, w.id desc
      limit 1
    ) wa_latest on true
    left join app a on a.human_id = h.human_id
    left join public.humans person on person.id = h.human_id
  )
  select
    'human:' || p.human_id::text,
    p.human_id,
    p.whatsapp_conversation_id,
    p.app_conversation_id,
    p.channels,
    p.last_channel,
    p.last_message_at,
    p.last_message_text,
    p.last_message_direction,
    p.staff_unread_count,
    p.phone_e164,
    p.customer_name,
    p.customer_surname,
    p.app_unread_count
  from per_human p
  union all
  select
    'wa:' || w.id::text,
    null::uuid,
    w.id,
    null::uuid,
    array[w.channel]::text[],
    w.channel,
    w.activity_at,
    coalesce(w.last_message_text, w.last_customer_text),
    coalesce(
      w.last_message_direction,
      case
        when w.last_outbound_at is not null
          and (w.last_inbound_at is null or w.last_outbound_at >= w.last_inbound_at)
          then 'outbound'
        else 'inbound'
      end
    ),
    w.unread_count,
    w.phone_e164,
    null::text,
    null::text,
    0
  from wa w
  where w.human_id is null;
end;
$$;

comment on function public.list_staff_unified_inbox() is
  'Staff only. One inbox row per customer, merging WhatsApp, SMS and in-app threads, plus a row for each WhatsApp number that is not linked to a customer. channels lists the pipes on that row (20261122120000).';

revoke all on function public.list_staff_unified_inbox() from public, anon, authenticated;
grant execute on function public.list_staff_unified_inbox() to authenticated;

-- Latest 200 messages across the customer's WhatsApp/SMS threads and their
-- app thread, oldest first. 200 matches the website inbox detail fetch.
-- Pass p_whatsapp_conversation_id for a number that has no human.
create or replace function public.list_staff_unified_thread(
  p_human_id uuid default null,
  p_whatsapp_conversation_id uuid default null
)
returns table (
  id uuid,
  channel text,
  direction text,
  body text,
  sent_at timestamptz,
  status text,
  sender text,
  staff_user_id uuid,
  error_message text,
  reaction_emoji text,
  media_path text,
  media_mime text,
  meta_message_id text,
  in_reply_to_meta_id text
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'not_staff' using errcode = '42501';
  end if;
  if p_human_id is null and p_whatsapp_conversation_id is null then
    raise exception 'thread_required' using errcode = '22023';
  end if;

  return query
  with combined as (
    select
      m.id,
      m.channel,
      m.direction,
      m.content as body,
      m.sent_at,
      m.status,
      case when m.direction = 'inbound' then 'customer' else 'staff' end as sender,
      null::uuid as staff_user_id,
      m.error_message,
      m.reaction_emoji,
      m.media_path,
      m.media_mime,
      m.meta_message_id,
      m.in_reply_to_meta_id
    from public.whatsapp_messages m
    join public.whatsapp_conversations c on c.id = m.conversation_id
    where (p_human_id is not null and c.human_id = p_human_id)
       or (p_whatsapp_conversation_id is not null and c.id = p_whatsapp_conversation_id)
    union all
    select
      m.id,
      'app'::text,
      case when m.sender = 'customer' then 'inbound' else 'outbound' end,
      m.body,
      m.created_at,
      'sent'::text,
      m.sender,
      m.staff_user_id,
      null::text,
      null::text,
      null::text,
      null::text,
      null::text,
      null::text
    from public.app_messages m
    join public.app_conversations c on c.id = m.conversation_id
    where p_human_id is not null and c.human_id = p_human_id
  ),
  recent as (
    select * from combined
    order by combined.sent_at desc, combined.id desc
    limit 200
  )
  select
    recent.id,
    recent.channel,
    recent.direction,
    recent.body,
    recent.sent_at,
    recent.status,
    recent.sender,
    recent.staff_user_id,
    recent.error_message,
    recent.reaction_emoji,
    recent.media_path,
    recent.media_mime,
    recent.meta_message_id,
    recent.in_reply_to_meta_id
  from recent
  order by recent.sent_at asc, recent.id asc;
end;
$$;

comment on function public.list_staff_unified_thread(uuid, uuid) is
  'Staff only. Messages for one customer across WhatsApp, SMS and the app, oldest first, capped at the latest 200. Each row carries its channel (20261122120000).';

revoke all on function public.list_staff_unified_thread(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_staff_unified_thread(uuid, uuid) to authenticated;
