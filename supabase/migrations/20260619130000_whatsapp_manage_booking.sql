-- ============================================================
-- WhatsApp manage-booking (Flow C): cancel/reschedule self-service
--
-- WHY
-- A recognised WhatsApp customer can now cancel or reschedule their own
-- upcoming visit. Cancellation needs a service-role write path (the agent +
-- the Flow endpoint run as service role with no end-user JWT), and the
-- multi-visit picker needs a short-lived, server-side, nonce-backed selection
-- context so client-returned list-row ids are only ever hints.
--
-- WHAT
-- 1. cancel_whatsapp_booking_group(p_group_id, p_human_id, p_reason) and
--    cancel_whatsapp_booking_by_id(p_booking_id, p_human_id, p_reason) —
--    service-role, owner passed explicitly, only cancel status='Booked' rows
--    OWNED by p_human_id (via dogs.human_id), set cancel_reason, and RETURN
--    (cancelled_count, booking_ids, group_id) so the caller never treats a
--    zero-row update as success. Cancel acts on the WHOLE visit (group). The
--    existing notify_on_booking_cancelled trigger fires on each status→Cancelled
--    transition (no notification code needed here).
-- 2. whatsapp_manage_sessions — the nonce selection context for the "which
--    upcoming visit?" list. One active (pending_selection) row per human at a
--    time; a new request supersedes the prior. RLS on, no policies → only the
--    service role reaches it.
--
-- Idempotent: create or replace + create table if not exists. Re-cancelling an
-- already-Cancelled row is a no-op (the status='Booked' filter excludes it).
-- ============================================================

-- ── Cancel a whole booking group (the whole visit) ──────────
create or replace function public.cancel_whatsapp_booking_group(
  p_group_id uuid,
  p_human_id uuid,
  p_reason   text default 'Customer cancelled via WhatsApp'
)
returns table (cancelled_count int, booking_ids uuid[], group_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;
  if p_group_id is null then
    raise exception 'group_id is required' using errcode = '22023';
  end if;

  -- Cancel every Booked row in the group that the caller actually owns
  -- (ownership via dogs.human_id). Ownership + status are the guard; a
  -- mismatched group/owner simply cancels nothing (cancelled_count = 0).
  with cancelled as (
    update public.bookings b
       set status = 'Cancelled',
           cancel_reason = left(coalesce(p_reason, 'Customer cancelled via WhatsApp'), 500)
      from public.dogs d
     where b.dog_id = d.id
       and d.human_id = p_human_id
       and b.group_id = p_group_id
       and b.status = 'Booked'
    returning b.id
  )
  select count(*)::int, coalesce(array_agg(id), '{}'::uuid[]), p_group_id
    into cancelled_count, booking_ids, group_id
    from cancelled;

  return next;
end;
$$;

comment on function public.cancel_whatsapp_booking_group(uuid, uuid, text) is
  'Service-role WhatsApp cancel: cancels every Booked row in p_group_id owned by p_human_id (ownership via dogs.human_id), sets cancel_reason, lets notify_on_booking_cancelled fire. Returns (cancelled_count, booking_ids, group_id) — a 0 count means nothing was cancellable and the caller must NOT treat it as success.';

-- ── Cancel by booking id (resolves to the whole visit/group) ─
create or replace function public.cancel_whatsapp_booking_by_id(
  p_booking_id uuid,
  p_human_id   uuid,
  p_reason     text default 'Customer cancelled via WhatsApp'
)
returns table (cancelled_count int, booking_ids uuid[], group_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
begin
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;
  if p_booking_id is null then
    raise exception 'booking_id is required' using errcode = '22023';
  end if;

  -- Resolve the visit: if the booking is part of a group, cancel the whole
  -- group; otherwise just the single booking. (Whole-visit granularity.)
  select b.group_id into v_group_id from public.bookings b where b.id = p_booking_id;

  with cancelled as (
    update public.bookings b
       set status = 'Cancelled',
           cancel_reason = left(coalesce(p_reason, 'Customer cancelled via WhatsApp'), 500)
      from public.dogs d
     where b.dog_id = d.id
       and d.human_id = p_human_id
       and b.status = 'Booked'
       and (
         (v_group_id is not null and b.group_id = v_group_id)
         or (v_group_id is null and b.id = p_booking_id)
       )
    returning b.id
  )
  select count(*)::int, coalesce(array_agg(id), '{}'::uuid[]), v_group_id
    into cancelled_count, booking_ids, group_id
    from cancelled;

  return next;
end;
$$;

comment on function public.cancel_whatsapp_booking_by_id(uuid, uuid, text) is
  'Service-role WhatsApp cancel by booking id: resolves the booking''s group (whole-visit) and cancels every Booked row in it owned by p_human_id. Returns (cancelled_count, booking_ids, group_id). Used by apply-customer-confirm (confirm-buttons cancel) and the reschedule cancel-old step.';

revoke all on function public.cancel_whatsapp_booking_group(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_whatsapp_booking_by_id(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_whatsapp_booking_group(uuid, uuid, text) to service_role;
grant execute on function public.cancel_whatsapp_booking_by_id(uuid, uuid, text) to service_role;

-- ── Manage-booking selection sessions (nonce for the visit list) ─
create table if not exists public.whatsapp_manage_sessions (
  id              uuid primary key default gen_random_uuid(), -- the nonce
  human_id        uuid not null,
  conversation_id uuid,
  action          text not null check (action in ('cancel', 'reschedule')),
  candidate_visits jsonb not null default '[]'::jsonb,
  status          text not null default 'pending_selection'
                    check (status in ('pending_selection', 'consumed', 'superseded', 'expired')),
  selected_key    text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '10 minutes')
);

comment on table public.whatsapp_manage_sessions is
  'Short-lived, nonce-backed selection context for the WhatsApp manage-booking visit picker. id is the nonce embedded in list-row ids (manage:<id>:<visit_key>); a list tap is only honoured if the row exists, is pending_selection, unexpired, and belongs to the same human. One pending row per human — a new request supersedes the prior. Service-role only.';

create index if not exists whatsapp_manage_sessions_human_status_idx
  on public.whatsapp_manage_sessions (human_id, status);
create index if not exists whatsapp_manage_sessions_expires_idx
  on public.whatsapp_manage_sessions (expires_at);

-- Lock down: RLS on with no policies → anon/authenticated get nothing; the
-- service role (the agent) bypasses RLS. (Expired rows are harmless; a cron
-- sweep can prune them later.)
alter table public.whatsapp_manage_sessions enable row level security;
revoke all on table public.whatsapp_manage_sessions from anon, authenticated;
