-- ============================================================
-- Staff Web Push — subscriptions, per-staff alert prefs, log plumbing
--
-- ADDITIVE, dark-launched. Creates the storage that the notify-staff
-- edge function and the staff client need. No customer-facing table or
-- behaviour is touched; with STAFF_PUSH_ENABLED unset, nothing here is
-- ever read by a sender.
--
--   1. staff_push_subscriptions — one row per installed staff device
--      (PWA push subscription). RLS: a staff member manages ONLY their
--      own rows. The notify-staff edge fn reads/deletes across all rows
--      via service_role (bypasses RLS).
--   2. staff_alert_prefs — per-staff opt-in for each of the six alert
--      categories (all default true). Absence of a row = all enabled
--      (the sender LEFT JOINs and coalesces NULL → true).
--   3. notification_log — extend the channel CHECK to allow 'webpush',
--      extend trigger_type for the six staff categories, and add a
--      nullable dedupe_key (+ its own partial unique index) so staff
--      sends can coalesce (e.g. one push per conversation per minute)
--      WITHOUT disturbing the existing customer idempotency index.
--
-- Idempotent: safe to apply and re-apply. CHECK constraints are dropped
-- both by expected name AND by definition-match (prod constraint names
-- may have drifted from this migration history).
-- ============================================================

-- ── 1. staff_push_subscriptions ─────────────────────────────
create table if not exists public.staff_push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text,
  auth          text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  failure_count integer not null default 0
);

comment on table public.staff_push_subscriptions is
  'One row per installed staff device that has enabled Web Push. RLS: owner-only; notify-staff reads/deletes across all rows via service_role.';

create index if not exists idx_staff_push_subscriptions_user
  on public.staff_push_subscriptions(user_id);

alter table public.staff_push_subscriptions enable row level security;

drop policy if exists "staff_select_own_push_subscriptions"
  on public.staff_push_subscriptions;
create policy "staff_select_own_push_subscriptions"
  on public.staff_push_subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()) and (select is_staff()));

drop policy if exists "staff_insert_own_push_subscriptions"
  on public.staff_push_subscriptions;
create policy "staff_insert_own_push_subscriptions"
  on public.staff_push_subscriptions
  for insert
  to authenticated
  with check (user_id = (select auth.uid()) and (select is_staff()));

drop policy if exists "staff_update_own_push_subscriptions"
  on public.staff_push_subscriptions;
create policy "staff_update_own_push_subscriptions"
  on public.staff_push_subscriptions
  for update
  to authenticated
  using (user_id = (select auth.uid()) and (select is_staff()))
  with check (user_id = (select auth.uid()) and (select is_staff()));

drop policy if exists "staff_delete_own_push_subscriptions"
  on public.staff_push_subscriptions;
create policy "staff_delete_own_push_subscriptions"
  on public.staff_push_subscriptions
  for delete
  to authenticated
  using (user_id = (select auth.uid()) and (select is_staff()));

-- ── 2. staff_alert_prefs ────────────────────────────────────
create table if not exists public.staff_alert_prefs (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  messages     boolean not null default true,
  new_booking  boolean not null default true,
  cancellation boolean not null default true,
  reschedule   boolean not null default true,
  new_client   boolean not null default true,
  waitlist     boolean not null default true,
  updated_at   timestamptz not null default now()
);

comment on table public.staff_alert_prefs is
  'Per-staff opt-in for each Web Push alert category. Missing row = all enabled (notify-staff coalesces NULL → true).';

alter table public.staff_alert_prefs enable row level security;

drop policy if exists "staff_select_own_alert_prefs"
  on public.staff_alert_prefs;
create policy "staff_select_own_alert_prefs"
  on public.staff_alert_prefs
  for select
  to authenticated
  using (user_id = (select auth.uid()) and (select is_staff()));

drop policy if exists "staff_insert_own_alert_prefs"
  on public.staff_alert_prefs;
create policy "staff_insert_own_alert_prefs"
  on public.staff_alert_prefs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()) and (select is_staff()));

drop policy if exists "staff_update_own_alert_prefs"
  on public.staff_alert_prefs;
create policy "staff_update_own_alert_prefs"
  on public.staff_alert_prefs
  for update
  to authenticated
  using (user_id = (select auth.uid()) and (select is_staff()))
  with check (user_id = (select auth.uid()) and (select is_staff()));

drop policy if exists "staff_delete_own_alert_prefs"
  on public.staff_alert_prefs;
create policy "staff_delete_own_alert_prefs"
  on public.staff_alert_prefs
  for delete
  to authenticated
  using (user_id = (select auth.uid()) and (select is_staff()));

-- ── 3. notification_log: channel + trigger_type + dedupe_key ─

-- 3a. channel CHECK → add 'webpush'. Drop by expected name and by
--     definition-match, then recreate.
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
     where t.relname = 'notification_log'
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%channel%'
  loop
    execute format('alter table public.notification_log drop constraint %I', v_conname);
  end loop;
end $$;

alter table public.notification_log
  add constraint notification_log_channel_check
  check (channel in ('whatsapp', 'sms', 'email', 'webpush'));

-- 3b. trigger_type CHECK → keep all existing values, add the six
--     staff Web Push categories.
do $$
declare
  v_conname text;
begin
  alter table public.notification_log
    drop constraint if exists notification_log_trigger_type_check;

  for v_conname in
    select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = 'notification_log'
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%trigger_type%'
  loop
    execute format('alter table public.notification_log drop constraint %I', v_conname);
  end loop;
end $$;

alter table public.notification_log
  add constraint notification_log_trigger_type_check
  check (trigger_type in (
    'confirmed', 'reminder', 'cancelled', 'waitlist_joined', 'ready', 'welcome',
    'staff_message', 'staff_new_booking', 'staff_cancellation',
    'staff_reschedule', 'staff_new_client', 'staff_waitlist'
  ));

-- 3c. dedupe_key + its own partial unique index. Lets the staff sender
--     coalesce bursty events (the key embeds a time bucket) without
--     touching idx_notification_log_idempotent (the customer index).
alter table public.notification_log
  add column if not exists dedupe_key text;

comment on column public.notification_log.dedupe_key is
  'Staff Web Push coalescing key (e.g. staffmsg:<conversation>:<minute>). NULL for customer sends.';

create unique index if not exists idx_notification_log_staff_dedupe
  on public.notification_log (dedupe_key)
  where dedupe_key is not null;
