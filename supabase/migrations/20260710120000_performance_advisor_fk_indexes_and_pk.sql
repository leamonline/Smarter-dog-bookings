-- ============================================================
-- Performance-advisor hygiene: covering indexes for every flagged
-- unindexed foreign key + a primary key for the one PK-less table.
--
-- Source: Supabase performance advisor run against prod on 2026-07-10.
-- It flagged 16 FK constraints with no covering index (FK indexes matter
-- for the referenced-side delete/update checks and the joins these
-- columns exist for) and one table with no primary key. The advisor's
-- "unused index" items are deliberately NOT acted on — far too early to
-- prune at this data size.
--
-- The whatsapp_* additions are pure indexes: no function, policy, trigger
-- or RPC in the WhatsApp agent path is touched.
--
-- Plain CREATE INDEX (not CONCURRENTLY): every one of these tables is
-- tiny (low thousands of rows at most), so the brief lock is a
-- non-event, and it keeps the migration runnable inside the SQL
-- editor's transaction.
--
-- Additive + idempotent (IF NOT EXISTS / guarded DO block throughout).
-- ============================================================

-- ---- Unindexed foreign keys (one covering index each) ----

create index if not exists idx_booking_denials_human_id
  on public.booking_denials (human_id);

create index if not exists idx_booking_funnel_events_human_id
  on public.booking_funnel_events (human_id);

create index if not exists idx_bookings_staff_capacity_override_by
  on public.bookings (staff_capacity_override_by);

create index if not exists idx_bookings_whatsapp_message_id
  on public.bookings (whatsapp_message_id);

create index if not exists idx_retention_marks_created_by
  on public.retention_marks (created_by);

create index if not exists idx_salon_todos_human_id
  on public.salon_todos (human_id);

create index if not exists idx_whatsapp_ai_action_audit_draft_id
  on public.whatsapp_ai_action_audit (draft_id);

create index if not exists idx_whatsapp_booking_actions_applied_booking_id
  on public.whatsapp_booking_actions (applied_booking_id);

create index if not exists idx_whatsapp_booking_actions_decided_by
  on public.whatsapp_booking_actions (decided_by);

create index if not exists idx_whatsapp_booking_actions_draft_id
  on public.whatsapp_booking_actions (draft_id);

create index if not exists idx_whatsapp_conversations_closed_by
  on public.whatsapp_conversations (closed_by);

create index if not exists idx_whatsapp_drafts_decided_by
  on public.whatsapp_drafts (decided_by);

create index if not exists idx_whatsapp_drafts_trigger_message_id
  on public.whatsapp_drafts (trigger_message_id);

create index if not exists idx_whatsapp_flow_sessions_booking_id
  on public.whatsapp_flow_sessions (booking_id);

create index if not exists idx_whatsapp_flow_sessions_human_id
  on public.whatsapp_flow_sessions (human_id);

create index if not exists idx_whatsapp_messages_event_id
  on public.whatsapp_messages (event_id);

-- ---- Primary key for customer_phone_lookup_attempts ----
--
-- The table is the portal's phone-lookup rate-limit log: just (ip,
-- attempted_at), append-only, pruned by window queries. Neither column is
-- unique, so a synthetic uuid id is the right PK. Guarded so a re-run (or
-- a table that somehow already gained a PK) is a no-op.

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'customer_phone_lookup_attempts'
      and c.contype = 'p'
  ) then
    alter table public.customer_phone_lookup_attempts
      add column if not exists id uuid not null default gen_random_uuid();
    alter table public.customer_phone_lookup_attempts
      add constraint customer_phone_lookup_attempts_pkey primary key (id);
    comment on column public.customer_phone_lookup_attempts.id is
      'Synthetic PK (advisor: no_primary_key). The table is an append-only rate-limit log; ip/attempted_at are not unique.';
  end if;
end $$;
