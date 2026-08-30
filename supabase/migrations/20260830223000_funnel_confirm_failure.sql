-- ============================================================
-- Record every confirm click that produced no booking, with why (#708).
--
-- Between 4 July and 26 August, 21 booking confirmations produced no
-- appointment across 13 customers; five never booked again by any route.
-- The failure path reports through logger.error, and #707 established that
-- logger reaches nothing in production: no Sentry DSN is set. #708 is
-- blocked on "Sentry enabled, then a week of events".
--
-- This closes the loop the other way. booking_funnel_events demonstrably
-- works in production — it is how #708 was measured — so the wizard now
-- logs a "confirm_failed" step there, carrying a governed failure code and
-- a short structured diagnostic. The candidates #708 needs separated are
-- exactly what the client observes at the failure:
--
--   gate_rejected       a BEFORE INSERT gate refused it (also in booking_denials)
--   reschedule_rule     a handled reschedule code (SDC02/SDR01/SDR02/SDC04)
--   slot_taken_recheck  the client-side final re-check bounced the customer
--   network_failed      the request never got an HTTP response
--   server_error        a structured Postgres/PostgREST error — defect candidate
--   unknown             an error with no code and no network signature
--
-- WHAT THIS DOES NOT CLAIM
--
-- A confirm with no "booked" and no "confirm_failed" row remains possible,
-- and remains a finding: navigation away mid-request, or network loss so
-- total the telemetry write failed with the booking. Telemetry cannot log
-- to a database it cannot reach; that residue is Sentry's, and #708's
-- Sentry criterion stands. This narrows the residue, it does not erase it.
--
-- The value set is governed by a CHECK rather than left free text; it
-- mirrors CONFIRM_FAILURE_CODES in src/engine/confirmFailure.ts, and a
-- test pins the two lists together. failure_detail is capped at 300 chars
-- in the RPC — it carries an error code and message (the same class of
-- content booking_denials.reason_detail already stores, same staff-read-
-- only posture), never customer-entered text.
-- ============================================================

alter table public.booking_funnel_events
  add column if not exists failure_code text;

alter table public.booking_funnel_events
  add column if not exists failure_detail text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.booking_funnel_events'::regclass
      and conname = 'booking_funnel_events_failure_code_check'
  ) then
    alter table public.booking_funnel_events
      add constraint booking_funnel_events_failure_code_check
      check (
        failure_code is null
        or failure_code in (
          'gate_rejected',
          'reschedule_rule',
          'slot_taken_recheck',
          'network_failed',
          'server_error',
          'unknown'
        )
      );
  end if;
end $$;

comment on column public.booking_funnel_events.failure_code is
  'Why a confirm click produced no booking. Set only on step = confirm_failed. Governed set; mirrors CONFIRM_FAILURE_CODES in src/engine/confirmFailure.ts. A confirm with neither booked nor confirm_failed means navigation away or network loss too total to log — that absence is a finding, not missing data (#708).';

comment on column public.booking_funnel_events.failure_detail is
  'Short structured diagnostic for a confirm_failed event: error code plus message, truncated to 300 chars by log_funnel_event(). Same content class and staff-read-only posture as booking_denials.reason_detail.';

-- Replace, not overload. The same hazard 20260823171500 documented applies:
-- a second log_funnel_event whose extra parameters have defaults makes
-- PostgREST named-argument resolution ambiguous, so the current signature
-- is dropped first.
--
-- Ordering note for the operator: applying this before the frontend deploys
-- means the live portal briefly calls a signature that no longer exists.
-- The wizard logs fire-and-forget (`.then(undefined, () => {})`), so the
-- customer sees nothing; the cost is a few minutes of missing telemetry,
-- the same trade 20260823171500 and 20260830203000 accepted.
drop function if exists public.log_funnel_event(uuid, text, uuid, int, int, timestamptz, text);

create or replace function public.log_funnel_event(
  p_session_id     uuid,
  p_step           text,
  p_human_id       uuid default null,
  p_dog_count      int default null,
  p_step_index     int default null,
  p_occurred_at    timestamptz default null,
  p_blocked_reason text default null,
  p_failure_code   text default null,
  p_failure_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.booking_funnel_events
    (session_id, step, human_id, dog_count, step_index, occurred_at,
     blocked_reason, failure_code, failure_detail)
  values (
    p_session_id,
    coalesce(nullif(p_step, ''), 'unknown'),
    p_human_id,
    p_dog_count,
    case when p_step_index < 0 then null else p_step_index end,
    p_occurred_at,
    -- Unrecognised values are dropped rather than raised: this is
    -- fire-and-forget telemetry, and a client sending a stale value must
    -- never cost the customer their booking. The CHECKs above are the
    -- backstop; these keep them from ever firing.
    case
      when p_blocked_reason in (
        'no_dogs_on_file', 'no_eligible_dogs', 'no_open_days_in_first_page'
      ) then p_blocked_reason
      else null
    end,
    case
      when p_failure_code in (
        'gate_rejected', 'reschedule_rule', 'slot_taken_recheck',
        'network_failed', 'server_error', 'unknown'
      ) then p_failure_code
      else null
    end,
    left(p_failure_detail, 300)
  );
end;
$$;

comment on function public.log_funnel_event(uuid, text, uuid, int, int, timestamptz, text, text, text) is
  'Best-effort insert of one booking-wizard step into booking_funnel_events. SECURITY DEFINER so authenticated portal users can write without a client INSERT policy. p_step_index/p_occurred_at are client-side ordering fields; p_blocked_reason is set only when the wizard could offer no way forward; p_failure_code/p_failure_detail are set only on step = confirm_failed (#708). Unrecognised governed values are stored as null rather than raising. Callers invoke fire-and-forget — a failure must never surface to, or block, the wizard.';

revoke execute on function public.log_funnel_event(uuid, text, uuid, int, int, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.log_funnel_event(uuid, text, uuid, int, int, timestamptz, text, text, text) to authenticated;
