-- ============================================================
-- #salon-today Slack alerts: the alert ledger
--
-- WHY THIS TABLE EXISTS
--
-- Two jobs, one row shape.
--
--   1. DEDUPLICATION. Three of the alerts are found by a sweep that runs
--      every five minutes. Without a claim, a dog still sitting in "Ready"
--      an hour later would post twelve times, and a channel that repeats
--      itself is a channel staff stop reading. Each alert derives a stable
--      alert_key; the sender INSERTs it BEFORE posting, and a 23505 unique
--      violation means somebody already handled it.
--
--      Claim-before-post, never post-then-record: if the function dies
--      between the two, that alert is silently lost rather than posted
--      twice. For a channel staff are meant to trust, under-posting is the
--      right failure direction.
--
--   2. THE OUT-OF-HOURS QUEUE. Alerts raised outside the Mon-Wed
--      08:00-15:30 posting window are held here as state='queued' with
--      their rendered text, and flushed when the window next opens. The
--      alternative — dropping them — would lose a cancellation made at
--      07:30 for that same afternoon.
--
-- WHY NOT REUSE notification_log.dedupe_key
--
-- The mechanism there is proven and this table copies it deliberately. But
-- notification_log is the CUSTOMER communications log, and the staff
-- dashboard derives each booking's reminder Sent/Unsent state from it.
-- Injecting internal ops alerts would mean widening two load-bearing CHECK
-- constraints and adding rows every other reader has to learn to ignore.
-- Internal alerts and customer messages are different things; they get
-- different tables.
--
-- The table is inert on its own: nothing writes to it until the slack-alerts
-- Edge Function is deployed and SLACK_ALERTS_ENABLED is set.
--
-- Additive + idempotent.
-- ============================================================

create table if not exists public.slack_alerts (
  id uuid primary key default gen_random_uuid(),

  -- The idempotency claim. Composed by buildDedupeKey() in
  -- supabase/functions/_shared/slackMessage.ts — e.g. 'noshow:<booking>:<date>',
  -- 'unanswered:<conversation>:<last_inbound_at>'. Two keys carry more than an
  -- id on purpose: the moved/new key includes the slot so a second time change
  -- the same day re-alerts, and the unanswered key includes the inbound
  -- timestamp so a NEW customer message breaks through while the same
  -- unanswered one stays quiet.
  alert_key text not null,

  alert_type text not null check (alert_type in (
    'cancellation',
    'moved_off',
    'new_booking',
    'moved_in',
    'no_show',
    'ready_overdue',
    'unanswered',
    'summary'
  )),

  -- Drives the emoji: act = red, notice = amber, good = green.
  severity text not null check (severity in ('act', 'notice', 'good')),

  -- What the alert is about. Both nullable: the morning summary is about the
  -- day rather than any one booking. ON DELETE SET NULL so purging a booking
  -- never fails on this table -- an alert record is history, and history that
  -- blocks a delete is a liability.
  booking_id uuid references public.bookings(id) on delete set null,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,

  -- The London calendar date the alert concerns. Used by the queue flush to
  -- discard anything that went stale overnight: an alert about a date that
  -- has already passed is history, not "something that changes today".
  booking_date date,

  state text not null default 'posted'
    check (state in ('queued', 'posted', 'dropped')),

  -- The rendered Slack text. Required for the queue (the flush posts exactly
  -- what was composed at the time, not a re-derivation from data that may
  -- have moved on) and useful afterwards for working out what staff saw.
  message text,

  -- True when SLACK_ALERTS_DRY_RUN was on: everything was computed and the
  -- claim was made, but nothing was sent. Lets the salon watch a real day,
  -- and in particular confirm the sweep alerts fire ONCE rather than twelve
  -- times, before going live.
  dry_run boolean not null default false,

  created_at timestamptz not null default now(),
  posted_at timestamptz
);

comment on table public.slack_alerts is
  'Ledger of every #salon-today Slack alert the system decided on. Doubles as the idempotency claim (unique alert_key, INSERTed before posting so a 23505 means "already handled") and as the out-of-hours queue (state=queued rows carry their rendered message and are flushed when the posting window next opens). Internal ops only -- deliberately separate from notification_log, which is the customer communications log the dashboard reads for reminder Sent/Unsent state.';

comment on column public.slack_alerts.alert_key is
  'Idempotency key, composed by buildDedupeKey() in _shared/slackMessage.ts. Unique; claimed by INSERT before the Slack POST.';
comment on column public.slack_alerts.state is
  'queued = held because the posting window was shut; posted = sent (or logged, when dry_run); dropped = discarded, either a cron alert raised out of hours (it re-evaluates and heals itself) or a queued alert that went stale before it could be flushed.';
comment on column public.slack_alerts.message is
  'The exact text composed for Slack. The queue flush posts this rather than re-deriving it, so staff see what was true when the alert was raised.';
comment on column public.slack_alerts.dry_run is
  'True when the alert was computed and claimed but deliberately not sent (SLACK_ALERTS_DRY_RUN).';

-- The claim itself. A plain unique index rather than a partial one: every row
-- here has a key, unlike notification_log where dedupe_key is NULL for
-- customer sends.
create unique index if not exists idx_slack_alerts_key
  on public.slack_alerts (alert_key);

-- The flush reads only queued rows, oldest first.
create index if not exists idx_slack_alerts_queued
  on public.slack_alerts (created_at)
  where state = 'queued';

-- Retention prune (scheduled in the follow-up migration) scans by age.
create index if not exists idx_slack_alerts_created_at
  on public.slack_alerts (created_at desc);

alter table public.slack_alerts enable row level security;

-- Staff may read the ledger (useful when someone asks "why didn't we get an
-- alert for that?"). Writes are service-role only: the Edge Function holds
-- the service key and bypasses RLS, so no insert/update policy is needed --
-- and not having one means nothing reachable from a browser can forge or
-- clear a claim.
drop policy if exists "staff_select_slack_alerts" on public.slack_alerts;
create policy "staff_select_slack_alerts"
  on public.slack_alerts
  for select
  to authenticated
  using (is_staff());
