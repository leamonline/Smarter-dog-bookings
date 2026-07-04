-- ============================================================
-- booking_funnel_events: customer booking-wizard step telemetry (improvement #4)
--
-- Measures where customers drop off in the self-service wizard (started → dogs →
-- service → date → slot → confirm → booked). One session_id per wizard run ties
-- its steps together; the wizard logs each step it reaches best-effort via
-- log_funnel_event(). Staff-read-only; no PII beyond the linked human_id.
--
-- Additive + idempotent. Nothing here touches the booking write path.
-- ============================================================

create table if not exists public.booking_funnel_events (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null,          -- one wizard run
  step        text not null,          -- started|select_dogs|select_service|select_date|select_slot|confirm|booked
  human_id    uuid references public.humans(id) on delete set null,
  dog_count   int,
  created_at  timestamptz not null default now()
);

comment on table public.booking_funnel_events is
  'Best-effort per-step telemetry for the customer booking wizard (improvement #4). One session_id per wizard run; the wizard logs each step it reaches via log_funnel_event() fire-and-forget. Staff-read-only; drives the booking-funnel drop-off report.';

create index if not exists idx_booking_funnel_session on public.booking_funnel_events (session_id);
create index if not exists idx_booking_funnel_created on public.booking_funnel_events (created_at);

-- Staff-read-only, mirroring booking_denials.
alter table public.booking_funnel_events enable row level security;

drop policy if exists booking_funnel_staff_read on public.booking_funnel_events;
create policy booking_funnel_staff_read on public.booking_funnel_events
  for select
  to authenticated
  using (is_staff());

grant select on public.booking_funnel_events to authenticated;
revoke all on public.booking_funnel_events from anon;

-- Fire-and-forget step logger. SECURITY DEFINER so an authenticated portal
-- session can write without a client INSERT policy. Never raises on ordinary
-- input; callers invoke it fire-and-forget.
create or replace function public.log_funnel_event(
  p_session_id uuid,
  p_step       text,
  p_human_id   uuid default null,
  p_dog_count  int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.booking_funnel_events (session_id, step, human_id, dog_count)
  values (p_session_id, coalesce(nullif(p_step, ''), 'unknown'), p_human_id, p_dog_count);
end;
$$;

comment on function public.log_funnel_event(uuid, text, uuid, int) is
  'Best-effort insert of one booking-wizard step into booking_funnel_events. SECURITY DEFINER so authenticated portal users can write without a client INSERT policy. Callers invoke fire-and-forget — a failure must never surface to, or block, the wizard.';

revoke execute on function public.log_funnel_event(uuid, text, uuid, int) from public, anon, authenticated;
grant execute on function public.log_funnel_event(uuid, text, uuid, int) to authenticated;
