-- ============================================================
-- booking_denials: capacity-prevented / rejected demand  (Today view, gap G3)
--
-- Today nothing records demand the salon COULDN'T take. The three BEFORE INSERT
-- gates raise P0001 and roll the row back (booking_capacity_audit logs
-- successes only), and the portal filters unavailable slots client-side so most
-- blocked demand never even reaches an INSERT. So the "capacity-prevented
-- demand" report (2F) has no source.
--
-- This adds an additive, staff-read-only table plus a small SECURITY DEFINER
-- RPC that the portal wizard and the WhatsApp Flow endpoint call best-effort
-- (fire-and-forget — a logging failure must NEVER block or roll back a real
-- booking). Nothing here touches the booking write path, the gates, or RLS on
-- existing tables.
--
-- Canonical reason_code values (free text, read defensively — never CHECK-gate
-- capture): 'capacity_2_2_1', 'seat_blocked', 'daily_cap', 'slot_full',
-- 'calendar_closed', 'past_date', 'past_cutoff', 'large_dog_ineligible',
-- 'pregnant', 'double_booked', 'unavailable', 'unknown'.
-- Canonical source values: 'portal', 'whatsapp_flow', 'staff', 'system',
-- 'unknown'.
--
-- Additive + idempotent.
-- ============================================================

create table if not exists public.booking_denials (
  id                 uuid primary key default gen_random_uuid(),
  requested_date     date,
  slot               text,
  size               text,          -- small|medium|large|null (read defensively)
  service            text,          -- service id (full-groom, ...) or null
  dog_count          int,           -- requested group size when known
  reason_code        text not null default 'unknown',
  reason_detail      text,          -- freetext / captured P0001 message
  source             text not null default 'unknown',
  alternative_shown  boolean not null default false,
  alternative_taken  boolean not null default false,
  human_id           uuid references public.humans(id) on delete set null,
  created_at         timestamptz not null default now()
);

comment on table public.booking_denials is
  'Best-effort log of booking demand the salon could not accept (capacity, calendar, cutoff, pregnancy, etc.). Written fire-and-forget by log_booking_denial() from the portal wizard + WhatsApp Flow endpoint; a write failure must never block a booking. Staff-read-only. Feeds the capacity-prevented-demand report (accrues from deploy).';

create index if not exists idx_booking_denials_date on public.booking_denials (requested_date);
create index if not exists idx_booking_denials_created on public.booking_denials (created_at);

-- Staff-read-only, mirroring the booking_events audit posture. Non-staff
-- authenticated + anon have no matching policy => RLS default-deny => nothing.
alter table public.booking_denials enable row level security;

drop policy if exists booking_denials_staff_read on public.booking_denials;
create policy booking_denials_staff_read on public.booking_denials
  for select
  to authenticated
  using (is_staff());

-- Explicit SELECT grant (RLS still restricts to staff); never to anon. Writes
-- go exclusively through the SECURITY DEFINER RPC below, so no INSERT policy.
grant select on public.booking_denials to authenticated;
revoke all on public.booking_denials from anon;

-- Fire-and-forget logging RPC. SECURITY DEFINER so an ordinary customer-portal
-- (authenticated) session and the service-role WhatsApp Flow can both write,
-- without a client-facing INSERT policy on the table. Never raises on ordinary
-- input; normalises blanks to sensible defaults.
create or replace function public.log_booking_denial(
  p_reason_code       text,
  p_source            text default 'unknown',
  p_requested_date    date default null,
  p_slot              text default null,
  p_size              text default null,
  p_service           text default null,
  p_dog_count         int default null,
  p_reason_detail     text default null,
  p_alternative_shown boolean default false,
  p_alternative_taken boolean default false,
  p_human_id          uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.booking_denials (
    requested_date, slot, size, service, dog_count,
    reason_code, reason_detail, source,
    alternative_shown, alternative_taken, human_id
  ) values (
    p_requested_date,
    nullif(p_slot, ''),
    nullif(p_size, ''),
    nullif(p_service, ''),
    p_dog_count,
    coalesce(nullif(p_reason_code, ''), 'unknown'),
    p_reason_detail,
    coalesce(nullif(p_source, ''), 'unknown'),
    coalesce(p_alternative_shown, false),
    coalesce(p_alternative_taken, false),
    p_human_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.log_booking_denial(text, text, date, text, text, text, int, text, boolean, boolean, uuid) is
  'Best-effort capture of a prevented booking into booking_denials. SECURITY DEFINER so authenticated portal users + the service-role WhatsApp Flow can write without a client INSERT policy. Callers invoke fire-and-forget: a failure here must never surface to, or roll back, the booking attempt.';

-- Lock down per docs/migrations.md, then grant only the two intended callers.
revoke execute on function public.log_booking_denial(text, text, date, text, text, text, int, text, boolean, boolean, uuid) from public, anon, authenticated;
grant execute on function public.log_booking_denial(text, text, date, text, text, text, int, text, boolean, boolean, uuid) to authenticated, service_role;
