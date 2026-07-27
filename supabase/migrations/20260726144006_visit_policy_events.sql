-- ============================================================
-- Visit-level policy events and completion synchronisation
-- (previous_day_1500_v1 programme, phase 1)
--
-- Adds visit identity and the full v1 event vocabulary to booking_events
-- without deleting or rewriting a single historical row, plus the aggregate
-- completion synchroniser that decides when a whole visit is finished.
--
-- Deadline classification uses the TRUSTED request instant (`requested_at`),
-- never the server commit instant: a signed on-time WhatsApp webhook that we
-- only process after the deadline was still an on-time request. `committed_at`
-- is kept separately for audit and latency, and the deployed `occurred_at`
-- stays exactly as it is for the existing feed.
--
-- Spec: docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md
-- Plan: docs/superpowers/plans/2026-07-22-booking-policy-foundation.md (Task 7)
-- ============================================================

-- ── 1. Widen booking_events additively ──────────────────────────────

alter table public.booking_events
  add column if not exists visit_id uuid references public.booking_visits(id),
  add column if not exists outcome_key text,
  add column if not exists requested_at timestamptz,
  add column if not exists committed_at timestamptz,
  add column if not exists deadline_at timestamptz,
  add column if not exists policy_code text references public.booking_policy_versions(code);

comment on column public.booking_events.requested_at is
  'The trusted instant the customer expressed the request: the committed server time for website actions, the signature-verified provider timestamp for WhatsApp, the first verified/decrypted receipt instant for a Flow. Deadline classification uses THIS, never committed_at.';
comment on column public.booking_events.committed_at is
  'Server instant the event was written. Audit and latency only — never used to reclassify a delayed but on-time request.';
comment on column public.booking_events.occurred_at is
  'Legacy display timestamp for the existing activity feed. Compatibility data: new policy code reads requested_at/committed_at.';

-- The full v1 vocabulary, added without disturbing the deployed five kinds.
alter table public.booking_events drop constraint if exists booking_events_event_type_check;
alter table public.booking_events
  add constraint booking_events_event_type_check check (event_type in (
    'created','rescheduled','cancelled','reconfirmed','completed',
    'requested','approved','proposed','declined','withdrawn','confirmed',
    'deposit_received','deposit_not_received',
    'incident_recorded','incident_waived','credit_changed',
    'completion_reopened'
  ));

-- One event per visit outcome, not one per dog.
create unique index if not exists booking_events_visit_outcome_unique
  on public.booking_events(outcome_key)
  where outcome_key is not null;

create index if not exists booking_events_visit_id_idx
  on public.booking_events(visit_id)
  where visit_id is not null;

-- ── 2. Visit command context ────────────────────────────────────────
--
-- A visit command announces itself for the duration of its transaction so its
-- own child-row writes do not also emit duplicate legacy row events. The key
-- lives in a GUC that application roles cannot usefully forge: the suppression
-- check additionally requires the current transaction to be inside a
-- security-definer command (`session_user` differs from `current_user`), and
-- these helpers are revoked from every application role.

create or replace function smarter_dog_private.begin_visit_command_context(p_visit_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select set_config('smarter_dog.visit_command', coalesce(p_visit_id::text, ''), true);
$$;
revoke all on function smarter_dog_private.begin_visit_command_context(uuid)
  from public, anon, authenticated, service_role;

create or replace function smarter_dog_private.in_visit_command_context(p_visit_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(current_setting('smarter_dog.visit_command', true), '') = coalesce(p_visit_id::text, '')
     and coalesce(current_setting('smarter_dog.visit_command', true), '') <> ''
     and session_user is distinct from current_user;
$$;
revoke all on function smarter_dog_private.in_visit_command_context(uuid)
  from public, anon, authenticated, service_role;

-- ── 3. Visit event emission ─────────────────────────────────────────

create or replace function public.emit_booking_visit_event(
  p_visit_id uuid,
  p_event_type text,
  p_outcome_key text,
  p_requested_at timestamptz default null,
  p_cancel_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  b record;
  v_id uuid;
begin
  select * into v from public.booking_visits where id = p_visit_id;
  if not found then
    return null;
  end if;

  -- Denormalise from the first included row so the feed survives later edits.
  select b2.booking_date, b2.slot, b2.service,
         d.name as dog_name, d.breed as dog_breed,
         h.name || ' ' || h.surname as customer_name
    into b
    from public.bookings b2
    join public.dogs d on d.id = b2.dog_id
    join public.humans h on h.id = d.human_id
   where b2.visit_id = p_visit_id and b2.visit_membership_state = 'included'
   order by b2.slot, b2.id
   limit 1;

  insert into public.booking_events (
    booking_id, visit_id, event_type, outcome_key,
    customer_name, dog_name, dog_breed, service, booking_date, slot,
    cancel_reason, requested_at, committed_at, deadline_at, policy_code,
    occurred_at
  ) values (
    null, p_visit_id, p_event_type, p_outcome_key,
    b.customer_name, b.dog_name, b.dog_breed, b.service, v.booking_date, b.slot,
    p_cancel_reason,
    coalesce(p_requested_at, statement_timestamp()), statement_timestamp(),
    v.customer_change_deadline_at, v.policy_code,
    statement_timestamp()
  )
  on conflict (outcome_key) where outcome_key is not null do nothing
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.emit_booking_visit_event(uuid, text, text, timestamptz, text)
  from public, anon, authenticated;

-- ── 4. Aggregate completion synchronisation ─────────────────────────
--
-- A visit is completed only when EVERY included child is Completed. One
-- completed dog leaves a two-dog visit active. Audited `removed` children are
-- excluded. Correcting a child back out of Completed reopens the visit and
-- appends history rather than deleting it. Terminal visits never reopen.

create or replace function public.sync_booking_visit_completion(p_visit_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  c record;
begin
  if p_visit_id is null then
    return null;
  end if;
  select * into v from public.booking_visits where id = p_visit_id for update;
  if not found then
    return null;
  end if;
  -- A cancelled, declined, withdrawn or superseded visit never reopens
  -- through a child edit.
  if v.lifecycle_state in ('cancelled','declined','withdrawn','superseded') then
    return v.lifecycle_state;
  end if;
  if v.confirmation_state <> 'confirmed' then
    return v.lifecycle_state;
  end if;

  select
    count(*) filter (where visit_membership_state = 'included') as n_included,
    count(*) filter (where visit_membership_state = 'included'
                       and status = 'Completed') as n_completed
  into c
  from public.bookings
  where visit_id = p_visit_id;

  if c.n_included > 0 and c.n_included = c.n_completed then
    if v.lifecycle_state <> 'completed' then
      update public.booking_visits
         set lifecycle_state = 'completed', completed_at = statement_timestamp()
       where id = p_visit_id;
      perform public.emit_booking_visit_event(
        p_visit_id, 'completed', 'visit-completed:' || p_visit_id::text);
    end if;
    return 'completed';
  end if;

  if v.lifecycle_state = 'completed' then
    update public.booking_visits
       set lifecycle_state = 'active', completed_at = null
     where id = p_visit_id;
    perform public.emit_booking_visit_event(
      p_visit_id, 'completion_reopened',
      'visit-reopened:' || p_visit_id::text || ':' || statement_timestamp()::text);
    return 'active';
  end if;

  return v.lifecycle_state;
end;
$$;
revoke all on function public.sync_booking_visit_completion(uuid) from public, anon, authenticated;

create or replace function public.sync_visit_completion_from_child()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.sync_booking_visit_completion(coalesce(new.visit_id, old.visit_id));
  if tg_op = 'UPDATE' and old.visit_id is distinct from new.visit_id then
    perform public.sync_booking_visit_completion(old.visit_id);
  end if;
  return null;
end;
$$;

drop trigger if exists zz_sync_visit_completion on public.bookings;
create trigger zz_sync_visit_completion
  after insert or delete
     or update of status, visit_id, visit_membership_state
  on public.bookings
  for each row execute function public.sync_visit_completion_from_child();

-- Retrospective approval and post-service payment decisions change commercial
-- confirmation without firing a child-status trigger, so confirmation itself
-- must synchronise the aggregate too.
create or replace function public.sync_visit_completion_on_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.confirmation_state = 'confirmed'
     and old.confirmation_state is distinct from new.confirmation_state then
    perform public.sync_booking_visit_completion(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists zz_sync_visit_completion_on_confirmation on public.booking_visits;
create trigger zz_sync_visit_completion_on_confirmation
  after update of confirmation_state on public.booking_visits
  for each row execute function public.sync_visit_completion_on_confirmation();

-- ── 5. Report inputs ────────────────────────────────────────────────
--
-- Late is decided against the visit's OWN stored deadline and the trusted
-- request instant, never a hard-coded rolling 24 hours and never the commit
-- time. Replacement-style and in-place staff reschedules therefore both
-- appear once, each with the deadline that actually applied.

create or replace view public.booking_visit_policy_events
with (security_invoker = true) as
select
  e.id,
  e.visit_id,
  e.event_type,
  e.outcome_key,
  e.booking_date,
  e.slot,
  e.cancel_reason,
  e.requested_at,
  e.committed_at,
  e.deadline_at,
  e.policy_code,
  case
    when e.deadline_at is null or e.requested_at is null then null
    else e.requested_at > e.deadline_at
  end as was_late,
  e.occurred_at
from public.booking_events e
where e.visit_id is not null;

revoke all on public.booking_visit_policy_events from public;
revoke all on public.booking_visit_policy_events from anon, authenticated;

create or replace function public.get_booking_visit_policy_events(
  p_from date,
  p_to date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  return coalesce(
    (select jsonb_agg(to_jsonb(v) order by v.committed_at)
       from public.booking_visit_policy_events v
      where v.booking_date between p_from and p_to),
    '[]'::jsonb);
end;
$$;
revoke all on function public.get_booking_visit_policy_events(date, date) from public;
revoke all on function public.get_booking_visit_policy_events(date, date) from anon;
revoke all on function public.get_booking_visit_policy_events(date, date) from authenticated;
grant execute on function public.get_booking_visit_policy_events(date, date) to authenticated;

comment on function public.sync_booking_visit_completion(uuid) is
  'Aggregate completion authority: a confirmed visit completes only when every included child is Completed; correcting a child back out reopens it with an appended completion_reopened event. Cancelled/declined/withdrawn/superseded visits never reopen through a child edit.';
