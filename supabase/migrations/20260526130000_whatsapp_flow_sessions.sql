-- 20260526130000_whatsapp_flow_sessions.sql
--
-- Session/state store for WhatsApp Flows (interactive booking, intake,
-- cancel/reschedule). One row per flow_token: the opaque token we mint
-- when we SEND a Flow and that Meta echoes back on every encrypted
-- data-exchange request. It binds the token to a phone + human and
-- carries the partially-collected form state across screens, so the
-- Flow Data Endpoint never has to trust client-supplied identity.
--
-- This is additive infrastructure for Flows — it does NOT alter any
-- existing domain table. RLS mirrors the other whatsapp_* tables:
-- service-role writes (the endpoint), staff read-only for debugging.

create table if not exists whatsapp_flow_sessions (
  flow_token   text primary key,
  phone_e164   text not null,
  human_id     uuid references humans(id) on delete set null,
  flow_type    text not null default 'appointment_booking'
                 check (flow_type in ('appointment_booking', 'new_client_intake', 'cancel_reschedule')),
  screen       text,
  state        jsonb not null default '{}'::jsonb,
  status       text not null default 'active'
                 check (status in ('active', 'completed', 'expired', 'failed')),
  booking_id   uuid references bookings(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_whatsapp_flow_sessions_phone
  on whatsapp_flow_sessions (phone_e164);

create index if not exists idx_whatsapp_flow_sessions_expires
  on whatsapp_flow_sessions (expires_at);

comment on table whatsapp_flow_sessions is
  'Per-flow_token state for WhatsApp Flows. Written by the service-role Flow Data Endpoint; bind-at-send-time identity (phone_e164, human_id) so screen transitions never trust the client. RLS: service-role write, staff read.';

alter table whatsapp_flow_sessions enable row level security;

-- Staff can read sessions (inbox/debugging). All INSERT/UPDATE go through
-- the service role, which bypasses RLS — so no write policy is granted,
-- matching the existing whatsapp_* tables.
drop policy if exists "staff read flow sessions" on whatsapp_flow_sessions;
create policy "staff read flow sessions"
  on whatsapp_flow_sessions
  for select
  to authenticated
  using (public.is_staff());

-- Rollback:
--   drop table if exists whatsapp_flow_sessions;
