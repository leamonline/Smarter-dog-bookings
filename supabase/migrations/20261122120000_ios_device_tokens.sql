-- ============================================================
-- iPhone push tokens
--
-- ADDITIVE and dark-launched. Stores an APNs device token for a signed-in
-- customer or member of staff. Nothing reads this table until the edge
-- secret IOS_PUSH_ENABLED is turned on, so applying it does not change
-- WhatsApp, SMS or email reminders.
--
-- RLS: a person can read, insert, update and delete only their own rows.
-- The role on the row has to match is_staff() — a customer cannot label
-- their phone as staff. Moving a token from one account to another (a
-- shared phone) is done by the register-device-token edge function, which
-- uses the service role, because the new user cannot see the old row.
--
-- notification_log.channel gains 'apns' and keeps 'webpush'.
--
-- Idempotent: safe to apply and re-apply. The channel CHECK is dropped by
-- name and by definition, because a hosted project can have renamed it.
-- ============================================================

create table if not exists public.device_tokens (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  role                   text not null check (role in ('customer', 'staff')),
  apns_token             text not null,
  environment            text not null check (environment in ('sandbox', 'production')),
  bundle_id              text not null,
  last_seen_at           timestamptz not null default now(),
  notifications_enabled  boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint device_tokens_apns_token_hex check (apns_token ~ '^[0-9a-f]{64,200}$'),
  constraint device_tokens_bundle_id_shape check (
    bundle_id ~ '^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$'
    and bundle_id !~ '\.\.'
    and char_length(bundle_id) between 3 and 200
  )
);

comment on table public.device_tokens is
  'One APNs token per iPhone. RLS: the signed-in user manages only their own rows. register-device-token (service role) may move a token to a new account. Reminders read it only when IOS_PUSH_ENABLED is on.';

create unique index if not exists device_tokens_apns_token_key
  on public.device_tokens (apns_token);

create index if not exists device_tokens_user_id_idx
  on public.device_tokens (user_id);

drop trigger if exists device_tokens_updated on public.device_tokens;
create trigger device_tokens_updated
  before update on public.device_tokens
  for each row execute function public.update_modified_column();

alter table public.device_tokens enable row level security;

revoke all on table public.device_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.device_tokens to authenticated;
grant all on table public.device_tokens to service_role;

drop policy if exists device_tokens_select_own on public.device_tokens;
create policy device_tokens_select_own
  on public.device_tokens
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists device_tokens_insert_own on public.device_tokens;
create policy device_tokens_insert_own
  on public.device_tokens
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and role = case when (select public.is_staff()) then 'staff' else 'customer' end
  );

drop policy if exists device_tokens_update_own on public.device_tokens;
create policy device_tokens_update_own
  on public.device_tokens
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and role = case when (select public.is_staff()) then 'staff' else 'customer' end
  );

drop policy if exists device_tokens_delete_own on public.device_tokens;
create policy device_tokens_delete_own
  on public.device_tokens
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- notification_log.channel: keep whatsapp, sms, email and webpush, add apns.
do $$
declare
  v_conname text;
begin
  alter table public.notification_log
    drop constraint if exists notification_log_channel_check;

  for v_conname in
    select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'notification_log'
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%channel%'
  loop
    execute format('alter table public.notification_log drop constraint %I', v_conname);
  end loop;
end $$;

alter table public.notification_log
  add constraint notification_log_channel_check
  check (channel in ('whatsapp', 'sms', 'email', 'webpush', 'apns'));

comment on constraint notification_log_channel_check on public.notification_log is
  'whatsapp, sms, email, webpush (staff PWA) and apns (iPhone app, used only when IOS_PUSH_ENABLED is on).';
