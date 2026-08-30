-- ============================================================
-- Record WHY a booking-wizard step could not be completed.
--
-- booking_funnel_events already records which step an attempt REACHED.
-- Measured on 30 August 2026 against the clean window (after the
-- per-attempt session fix in 20260823171500), the two largest losses are
-- both at the front of the wizard, before anyone sees a price or a slot:
--
--   started     -> select_dogs    the largest single drop
--   select_dogs -> select_date    the second largest
--
-- The funnel cannot say why. This adds the half of the answer that is
-- observable: the state the customer was actually in when they stopped.
--
-- WHAT THIS DELIBERATELY DOES NOT CLAIM
--
-- blocked_reason is only ever written when the wizard had NOTHING to
-- offer — no dogs on file, no eligible dog, a first calendar page with no
-- open day. It is never written to explain someone who had a usable choice
-- and left anyway; that is not observable, and guessing at it would put
-- invented intent into a table people will trust. An abandoned attempt with
-- no blocked_reason is itself the finding.
--
-- The value set is governed by a CHECK rather than left free text, so a
-- typo cannot quietly invent a fourth category. It mirrors
-- FUNNEL_BLOCKED_REASONS in src/engine/funnelBlockers.ts, and a test pins
-- the two lists together.
--
-- Nullable with no default and no backfill: rows written before this
-- migration legitimately have no reason, and inventing one for them would
-- be the same mistake as reading pre-adoption payment rows as unpaid.
-- ============================================================

alter table public.booking_funnel_events
  add column if not exists blocked_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.booking_funnel_events'::regclass
      and conname = 'booking_funnel_events_blocked_reason_check'
  ) then
    alter table public.booking_funnel_events
      add constraint booking_funnel_events_blocked_reason_check
      check (
        blocked_reason is null
        or blocked_reason in (
          'no_dogs_on_file',
          'no_eligible_dogs',
          'no_open_days_in_first_page'
        )
      );
  end if;
end $$;

comment on column public.booking_funnel_events.blocked_reason is
  'Why the wizard could not offer the customer a way forward at this step. Null on every ordinary step event, and null on an abandoned attempt where the customer HAD a usable choice — absence of a reason is a finding, not missing data. Governed set; mirrors FUNNEL_BLOCKED_REASONS in src/engine/funnelBlockers.ts.';

-- Replace, not overload. The same hazard 20260823171500 documented applies:
-- a second log_funnel_event whose extra parameter has a default makes
-- PostgREST named-argument resolution ambiguous, so the current signature
-- is dropped first.
--
-- Ordering note for the operator: applying this before the frontend deploys
-- means the live portal briefly calls a signature that no longer exists.
-- The wizard logs fire-and-forget (`.then(undefined, () => {})`), so the
-- customer sees nothing; the cost is a few minutes of missing telemetry,
-- which is the same trade 20260823171500 accepted.
drop function if exists public.log_funnel_event(uuid, text, uuid, int, int, timestamptz);

create or replace function public.log_funnel_event(
  p_session_id     uuid,
  p_step           text,
  p_human_id       uuid default null,
  p_dog_count      int default null,
  p_step_index     int default null,
  p_occurred_at    timestamptz default null,
  p_blocked_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.booking_funnel_events
    (session_id, step, human_id, dog_count, step_index, occurred_at, blocked_reason)
  values (
    p_session_id,
    coalesce(nullif(p_step, ''), 'unknown'),
    p_human_id,
    p_dog_count,
    case when p_step_index < 0 then null else p_step_index end,
    p_occurred_at,
    -- An unrecognised reason is dropped rather than raised: this is
    -- fire-and-forget telemetry, and a client sending a stale value must
    -- never cost the customer their booking. The CHECK above is the
    -- backstop; this keeps it from ever firing.
    case
      when p_blocked_reason in (
        'no_dogs_on_file', 'no_eligible_dogs', 'no_open_days_in_first_page'
      ) then p_blocked_reason
      else null
    end
  );
end;
$$;

comment on function public.log_funnel_event(uuid, text, uuid, int, int, timestamptz, text) is
  'Best-effort insert of one booking-wizard step into booking_funnel_events. SECURITY DEFINER so authenticated portal users can write without a client INSERT policy. p_step_index/p_occurred_at are client-side ordering fields; p_blocked_reason is set only when the wizard could offer no way forward, and an unrecognised value is stored as null rather than raising. Callers invoke fire-and-forget — a failure must never surface to, or block, the wizard.';

revoke execute on function public.log_funnel_event(uuid, text, uuid, int, int, timestamptz, text) from public, anon, authenticated;
grant execute on function public.log_funnel_event(uuid, text, uuid, int, int, timestamptz, text) to authenticated;
