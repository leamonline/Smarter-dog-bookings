-- ============================================================
-- Funnel step ordering: client-supplied ordering for booking_funnel_events
--
-- The wizard now sends a monotonic per-attempt step index and a client
-- timestamp captured synchronously at the call site, so event ordering no
-- longer depends on server insert time (two fire-and-forget requests from
-- one commit can land out of order). Both parameters are optional: the
-- currently-deployed frontend keeps calling the 4-argument shape and its
-- rows simply leave the new columns null.
--
-- Additive + idempotent. Nothing here touches the booking write path.
-- ============================================================

alter table public.booking_funnel_events
  add column if not exists step_index int,
  add column if not exists occurred_at timestamptz;

comment on column public.booking_funnel_events.step_index is
  'Monotonic per-session event index assigned client-side (sd.funnel.session). Authoritative ordering within a session; null for events from frontends predating it.';
comment on column public.booking_funnel_events.occurred_at is
  'Client timestamp captured synchronously when the step was claimed, before any await. Tie-breaker/diagnostic only — created_at remains the server receipt time.';

-- Replace, not overload: a second log_funnel_event overload whose extra
-- parameters all have defaults would make PostgREST named-argument
-- resolution ambiguous, so the old 4-argument signature is dropped first.
drop function if exists public.log_funnel_event(uuid, text, uuid, int);

create or replace function public.log_funnel_event(
  p_session_id  uuid,
  p_step        text,
  p_human_id    uuid default null,
  p_dog_count   int default null,
  p_step_index  int default null,
  p_occurred_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.booking_funnel_events
    (session_id, step, human_id, dog_count, step_index, occurred_at)
  values (
    p_session_id,
    coalesce(nullif(p_step, ''), 'unknown'),
    p_human_id,
    p_dog_count,
    case when p_step_index < 0 then null else p_step_index end,
    p_occurred_at
  );
end;
$$;

comment on function public.log_funnel_event(uuid, text, uuid, int, int, timestamptz) is
  'Best-effort insert of one booking-wizard step into booking_funnel_events. SECURITY DEFINER so authenticated portal users can write without a client INSERT policy. p_step_index/p_occurred_at are the client-side ordering fields (optional; older frontends omit them). Callers invoke fire-and-forget — a failure must never surface to, or block, the wizard.';

revoke execute on function public.log_funnel_event(uuid, text, uuid, int, int, timestamptz) from public, anon, authenticated;
grant execute on function public.log_funnel_event(uuid, text, uuid, int, int, timestamptz) to authenticated;
