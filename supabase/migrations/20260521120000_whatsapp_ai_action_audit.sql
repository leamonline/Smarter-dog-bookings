-- ============================================================
-- whatsapp_ai_action_audit
--
-- Forensic trail for every saveBookingAction() invocation in
-- supabase/functions/whatsapp-agent/index.ts. Each call writes
-- exactly one row here: either when an action is staged into
-- whatsapp_booking_actions, or when the agent dropped the
-- proposal (ownership mismatch, invalid slot, capacity full,
-- rate-limit hit).
--
-- Why: with AI_AUTONOMOUS_BOOKING_ENABLED=true, staged actions
-- can auto-apply via apply-customer-confirm. Without this log,
-- the only evidence of rejected proposals is the absence of a
-- corresponding whatsapp_booking_actions row — invisible to
-- staff and impossible to count.
--
-- Staff get SELECT via RLS. Inserts are service-role only
-- (the agent runs with the service role and bypasses RLS).
-- ============================================================

create table if not exists whatsapp_ai_action_audit (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  draft_id        uuid not null references whatsapp_drafts(id) on delete cascade,
  action_kind     text not null check (action_kind in ('create','reschedule','cancel')),
  outcome         text not null check (outcome in (
    'staged',
    'rejected_capacity',
    'rejected_rate_limit',
    'rejected_ownership',
    'rejected_invalid'
  )),
  reason          text,
  payload         jsonb not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ai_action_audit_conversation
  on whatsapp_ai_action_audit(conversation_id, created_at desc);

create index if not exists idx_ai_action_audit_created
  on whatsapp_ai_action_audit(created_at desc);

create index if not exists idx_ai_action_audit_outcome
  on whatsapp_ai_action_audit(outcome, created_at desc);

alter table whatsapp_ai_action_audit enable row level security;

drop policy if exists "staff_select_ai_action_audit" on whatsapp_ai_action_audit;
create policy "staff_select_ai_action_audit"
  on whatsapp_ai_action_audit for select
  to authenticated
  using ((select is_staff()));

-- No INSERT/UPDATE/DELETE policies: only the service role (used by
-- the whatsapp-agent edge function) writes here, and service_role
-- bypasses RLS by design.

comment on table whatsapp_ai_action_audit is
  'Every AI booking-action proposal logs one row here, whether staged or rejected. Source: supabase/functions/whatsapp-agent/index.ts saveBookingAction().';

comment on column whatsapp_ai_action_audit.outcome is
  'staged = inserted into whatsapp_booking_actions; rejected_* = dropped at the stage gate.';
