-- ============================================================
-- 026_whatsapp_schema.sql
-- WhatsApp AI Agent — Phase 1 schema.
--
-- What this migration does:
--   1. Creates six new tables that back the AI conversational layer:
--        whatsapp_events           — raw audit log of every Meta POST
--        whatsapp_conversations    — one row per customer phone number
--        whatsapp_messages         — every inbound + outbound message
--        whatsapp_drafts           — AI-proposed replies awaiting send
--        whatsapp_booking_actions  — AI-proposed booking mutations
--                                    (never applied directly)
--        whatsapp_templates        — local mirror of Meta template state
--   2. Enables RLS on all six. Staff can SELECT; only the service role
--      (Edge Functions using the service role key) can INSERT/UPDATE.
--   3. Adds updated_at triggers reusing the existing
--      update_modified_column() function from 001.
--   4. Adds a salon_config.whatsapp_provider column so we can flip
--      between Twilio and Meta during migration.
--
-- Design notes:
--   • whatsapp_events is append-only and the first thing the webhook
--     writes after signature verification. Everything else flows from
--     it via a downstream pg_net trigger (added in 027).
--   • whatsapp_conversations.phone_e164 is the natural key. All inbound
--     messages are keyed by this; human_id links once we match.
--   • whatsapp_booking_actions DELIBERATELY writes to a staging table
--     rather than to bookings directly. A staff member approves in the
--     admin UI; approval copies the payload into bookings atomically.
--   • All jsonb columns store exactly what Meta sent us — never
--     reformatted. Preserves forensic value if something goes wrong.
--
-- Dependencies:
--   - 001_initial_schema.sql (humans, dogs, bookings, update_modified_column)
--   - 002_auth_staff_profiles.sql (staff_profiles)
--   - 004_rls_policies.sql (is_staff() helper)
-- ============================================================

-- ============================================================
-- 0. Extension — pgcrypto for gen_random_uuid (already present
--    via uuid-ossp, but we use the simpler gen_random_uuid here
--    for consistency with any newer code).
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. whatsapp_events — raw webhook payload audit log
--    Append-only. Written by the whatsapp-webhook Edge Function
--    immediately after verifying Meta's HMAC signature.
-- ============================================================
create table whatsapp_events (
  id                uuid primary key default gen_random_uuid(),
  received_at       timestamptz not null default now(),
  signature         text,                -- X-Hub-Signature-256 header value
  signature_valid   boolean not null,    -- we still log rejected events
  event_type        text,                -- e.g. 'messages', 'status', 'template_category_update'
  phone_e164        text,                -- extracted from payload for indexing
  meta_message_id   text,                -- wamid if present, for dedup
  payload           jsonb not null,      -- exact body Meta sent us
  processing_status text not null default 'pending'
                        check (processing_status in ('pending', 'processed', 'failed', 'ignored')),
  processed_at      timestamptz,
  error_message     text
);

-- Fast lookup by conversation and by meta message id for dedup
create index idx_whatsapp_events_phone on whatsapp_events(phone_e164) where phone_e164 is not null;
create index idx_whatsapp_events_status on whatsapp_events(processing_status);
create index idx_whatsapp_events_meta_msg on whatsapp_events(meta_message_id) where meta_message_id is not null;
create index idx_whatsapp_events_received on whatsapp_events(received_at desc);

-- ============================================================
-- 2. whatsapp_conversations — per-phone-number state machine
--    One row per customer phone. Lifecycle decides whether the
--    AI is allowed to reply automatically.
-- ============================================================
create table whatsapp_conversations (
  id                   uuid primary key default gen_random_uuid(),
  phone_e164           text not null unique,
  human_id             uuid references humans(id) on delete set null,
  state                text not null default 'ai_handling'
                           check (state in ('ai_handling', 'human_takeover', 'snoozed', 'closed')),
  auto_send_enabled    boolean not null default false,   -- opt-in per conversation
  snoozed_until        timestamptz,
  last_inbound_at      timestamptz,
  last_outbound_at     timestamptz,
  last_customer_text   text,                             -- denormalised for inbox preview
  unread_count         integer not null default 0,
  locale               text not null default 'en-GB',
  notes                text,                             -- free-text staff note about this conversation
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_whatsapp_conversations_human on whatsapp_conversations(human_id);
create index idx_whatsapp_conversations_state on whatsapp_conversations(state);
create index idx_whatsapp_conversations_last_inbound on whatsapp_conversations(last_inbound_at desc);

create trigger whatsapp_conversations_updated
  before update on whatsapp_conversations
  for each row execute function update_modified_column();

-- ============================================================
-- 3. whatsapp_messages — every inbound + outbound message
--    This is what the agent reads to build conversation context
--    and what the admin UI renders in the thread view.
-- ============================================================
create table whatsapp_messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references whatsapp_conversations(id) on delete cascade,
  event_id          uuid references whatsapp_events(id) on delete set null,
  direction         text not null check (direction in ('inbound', 'outbound')),
  role              text not null check (role in ('user', 'assistant', 'system', 'tool')),
  meta_message_id   text,                       -- Meta's wamid; unique per direction
  content           text,                       -- plain-text body of the message
  raw               jsonb,                      -- full Meta payload for media, buttons, etc.
  status            text not null default 'sent'
                        check (status in ('draft', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error_message     text,
  sent_at           timestamptz not null default now(),
  delivered_at      timestamptz,
  read_at           timestamptz
);

-- Unique wamid per direction (Meta reuses ids across inbound/outbound sometimes)
create unique index idx_whatsapp_messages_meta_msg
  on whatsapp_messages(direction, meta_message_id)
  where meta_message_id is not null;

create index idx_whatsapp_messages_conversation
  on whatsapp_messages(conversation_id, sent_at desc);

create index idx_whatsapp_messages_status
  on whatsapp_messages(status)
  where status in ('queued', 'failed');

-- ============================================================
-- 4. whatsapp_drafts — AI-authored replies awaiting send
--    Every draft gets written here. Simple ones with high
--    confidence may be auto-sent, but we still log the decision.
-- ============================================================
create table whatsapp_drafts (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references whatsapp_conversations(id) on delete cascade,
  trigger_message_id  uuid references whatsapp_messages(id) on delete set null,
  proposed_text       text not null,
  intent              text not null
                          check (intent in (
                            'faq', 'greeting', 'booking_query', 'booking_propose',
                            'booking_confirm', 'booking_change', 'booking_cancel',
                            'confirm_time', 'smalltalk', 'escalate', 'other'
                          )),
  confidence          numeric(3,2) not null check (confidence between 0 and 1),
  requires_approval   boolean not null default true,
  state               text not null default 'pending'
                          check (state in ('pending', 'approved', 'rejected', 'auto_sent', 'sent_after_edit', 'superseded')),
  edited_text         text,                       -- populated if staff edits before sending
  decided_by          uuid references auth.users(id),
  decided_at          timestamptz,
  model               text,                       -- e.g. 'claude-opus-4-6'
  tokens_input        integer,
  tokens_output       integer,
  tool_calls          jsonb,                      -- full record of tool calls made
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_whatsapp_drafts_conversation on whatsapp_drafts(conversation_id, created_at desc);
create index idx_whatsapp_drafts_pending on whatsapp_drafts(state) where state = 'pending';

create trigger whatsapp_drafts_updated
  before update on whatsapp_drafts
  for each row execute function update_modified_column();

-- ============================================================
-- 5. whatsapp_booking_actions — proposed mutations to bookings
--    The AI NEVER writes to bookings directly. It writes a row
--    here with state='pending'; a staff member approves in the
--    admin UI; approval applies the change in a transaction.
-- ============================================================
create table whatsapp_booking_actions (
  id                   uuid primary key default gen_random_uuid(),
  conversation_id      uuid not null references whatsapp_conversations(id) on delete cascade,
  draft_id             uuid references whatsapp_drafts(id) on delete set null,
  action               text not null check (action in ('create', 'reschedule', 'cancel')),
  payload              jsonb not null,           -- the proposed booking row / diff
  target_booking_id    uuid references bookings(id) on delete set null,  -- for resched/cancel
  state                text not null default 'pending'
                           check (state in ('pending', 'approved', 'rejected', 'applied', 'failed', 'superseded')),
  rejection_reason     text,
  applied_booking_id   uuid references bookings(id) on delete set null,
  decided_by           uuid references auth.users(id),
  decided_at           timestamptz,
  applied_at           timestamptz,
  error_message        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_whatsapp_booking_actions_conversation on whatsapp_booking_actions(conversation_id);
create index idx_whatsapp_booking_actions_pending on whatsapp_booking_actions(state) where state = 'pending';
create index idx_whatsapp_booking_actions_target on whatsapp_booking_actions(target_booking_id) where target_booking_id is not null;

create trigger whatsapp_booking_actions_updated
  before update on whatsapp_booking_actions
  for each row execute function update_modified_column();

-- ============================================================
-- 6. whatsapp_templates — local mirror of Meta template state
--    Kept in sync by the whatsapp-template-sync Edge Function
--    (added in a later migration) and optionally by the
--    template_status_update webhook event.
-- ============================================================
create table whatsapp_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  language      text not null default 'en_GB',
  category      text not null check (category in ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  status        text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'paused', 'disabled')),
  meta_id       text,                       -- Meta's template id once approved
  components    jsonb not null,             -- full Meta structure incl. placeholders
  rejection_reason text,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (name, language, version)
);

create index idx_whatsapp_templates_name on whatsapp_templates(name);
create index idx_whatsapp_templates_status on whatsapp_templates(status);

create trigger whatsapp_templates_updated
  before update on whatsapp_templates
  for each row execute function update_modified_column();

-- ============================================================
-- 7. salon_config.whatsapp_provider — feature flag
--    Lets us flip the reminder path from Twilio to Meta without
--    code changes. Default 'twilio' preserves current behaviour;
--    flip to 'meta' once Phase 5 is live.
-- ============================================================
alter table salon_config
  add column if not exists whatsapp_provider text not null default 'twilio'
    check (whatsapp_provider in ('twilio', 'meta'));

comment on column salon_config.whatsapp_provider is
  'Which provider handles WhatsApp outbound: twilio (legacy) or meta (Cloud API). Switching to meta disables the Twilio WA path in notify-booking-reminder.';

-- ============================================================
-- 8. Row-Level Security
--    Pattern: staff SELECT everywhere; inserts/updates happen
--    only via the service role (Edge Functions). We explicitly
--    do NOT grant INSERT/UPDATE to the authenticated role on
--    these tables — they're service-role-only.
-- ============================================================

-- ---- whatsapp_events ---------------------------------------
alter table whatsapp_events enable row level security;

create policy "staff_select_whatsapp_events"
  on whatsapp_events for select
  to authenticated
  using (is_staff());

-- ---- whatsapp_conversations --------------------------------
alter table whatsapp_conversations enable row level security;

create policy "staff_select_whatsapp_conversations"
  on whatsapp_conversations for select
  to authenticated
  using (is_staff());

-- Staff can update state, auto_send_enabled, snoozed_until, notes
-- (e.g. taking over a conversation from the admin UI) but NOT the
-- foreign keys or audit columns.
create policy "staff_update_whatsapp_conversations"
  on whatsapp_conversations for update
  to authenticated
  using (is_staff())
  with check (is_staff());

-- ---- whatsapp_messages -------------------------------------
alter table whatsapp_messages enable row level security;

create policy "staff_select_whatsapp_messages"
  on whatsapp_messages for select
  to authenticated
  using (is_staff());

-- ---- whatsapp_drafts ---------------------------------------
alter table whatsapp_drafts enable row level security;

create policy "staff_select_whatsapp_drafts"
  on whatsapp_drafts for select
  to authenticated
  using (is_staff());

-- Staff can approve/reject/edit a draft — update only.
create policy "staff_update_whatsapp_drafts"
  on whatsapp_drafts for update
  to authenticated
  using (is_staff())
  with check (is_staff());

-- ---- whatsapp_booking_actions ------------------------------
alter table whatsapp_booking_actions enable row level security;

create policy "staff_select_whatsapp_booking_actions"
  on whatsapp_booking_actions for select
  to authenticated
  using (is_staff());

create policy "staff_update_whatsapp_booking_actions"
  on whatsapp_booking_actions for update
  to authenticated
  using (is_staff())
  with check (is_staff());

-- ---- whatsapp_templates ------------------------------------
alter table whatsapp_templates enable row level security;

create policy "staff_select_whatsapp_templates"
  on whatsapp_templates for select
  to authenticated
  using (is_staff());

-- Owners may edit templates (e.g. mark as paused locally).
create policy "owner_update_whatsapp_templates"
  on whatsapp_templates for update
  to authenticated
  using (
    exists (
      select 1 from staff_profiles
      where user_id = (select auth.uid())
      and   role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from staff_profiles
      where user_id = (select auth.uid())
      and   role = 'owner'
    )
  );

-- ============================================================
-- 9. Grants
--    Service role bypasses RLS anyway; no extra grants needed.
--    Authenticated role only needs SELECT on these tables, which
--    RLS handles via the policies above.
-- ============================================================

-- ============================================================
-- Done. Rollback is a plain `drop table ... cascade` on each
-- plus `alter table salon_config drop column whatsapp_provider`.
-- ============================================================
