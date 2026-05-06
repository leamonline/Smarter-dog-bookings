-- ============================================================
-- 038_whatsapp_agent_risk_and_state.sql
-- WhatsApp AI receptionist — risk-level signals + persistent agent state.
--
-- What this migration does:
--   1. Adds three columns to whatsapp_drafts so the agent can record an
--      explicit risk classification and the dashboard can route by it:
--        risk_level         text     'low' | 'medium' | 'high'
--        handoff_required   boolean  staff must take over
--        auto_send_eligible boolean  draft passed all auto-send gates
--   2. Adds whatsapp_conversations.agent_state (jsonb) so the agent can
--      remember extracted facts (dog name, breed, preferred day...)
--      across turns and stop re-asking the same questions.
--   3. Adds two cheap partial indexes for the staff "needs attention"
--      filter (high-risk + handoff queues stay fast even with millions
--      of drafts).
--
-- All changes are additive with safe defaults — running this on a
-- populated DB does not break existing rows or any existing queries.
-- Existing RLS policies are table-level and continue to apply
-- unchanged; no new policies needed.
--
-- Why these and not a new bookings.status enum value:
--   The brief asks for a "pending_ai" booking concept. We already have
--   it: whatsapp_booking_actions.state='pending'. Adding a separate
--   status to the bookings enum would split truth across two tables
--   and confuse the existing capacity/availability triggers.
--
-- Dependencies:
--   - 026_whatsapp_schema.sql (whatsapp_drafts, whatsapp_conversations)
--
-- Rollback:
--   alter table whatsapp_drafts drop column auto_send_eligible;
--   alter table whatsapp_drafts drop column handoff_required;
--   alter table whatsapp_drafts drop column risk_level;
--   alter table whatsapp_conversations drop column agent_state;
--   drop index if exists idx_whatsapp_drafts_handoff;
--   drop index if exists idx_whatsapp_drafts_high_risk;
-- ============================================================

-- ---- whatsapp_drafts: risk + handoff + auto-send eligibility ----
alter table whatsapp_drafts
  add column if not exists risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high'));

alter table whatsapp_drafts
  add column if not exists handoff_required boolean not null default false;

alter table whatsapp_drafts
  add column if not exists auto_send_eligible boolean not null default false;

comment on column whatsapp_drafts.risk_level is
  'Discrete risk classification computed by the agent. ''low'' = safe to auto-send when policy allows; ''medium'' = staff review by default; ''high'' = always requires a human (medical, complaint, ambiguous).';
comment on column whatsapp_drafts.handoff_required is
  'True when the conversation must be handled by a human. Set for high-risk, escalate intent, or low-confidence responses. Drives the red dot on the inbox list.';
comment on column whatsapp_drafts.auto_send_eligible is
  'True only when env flag + per-conversation opt-in + per-draft policy all permit auto-send. Computed at draft time and stored so the dashboard can show "would have auto-sent" while the env flag is still off.';

-- ---- whatsapp_conversations: persistent extracted agent state ----
-- Stored as jsonb instead of structured columns because the shape will
-- evolve and a free-form blob keeps migrations cheap. Documented shape:
--   {
--     "customerName":  string | null,
--     "dogName":       string | null,
--     "breed":         string | null,
--     "dogSize":       "small" | "medium" | "large" | "unknown" | null,
--     "service":       "full-groom" | "bath-and-brush" | ... | null,
--     "preferredDay":  string | null,    -- free-form, not parsed yet
--     "preferredTime": string | null,    -- free-form
--     "status":        string | null,    -- agent's own state machine
--     "missingFields": string[]
--   }
-- Anything not present in the patch is left untouched (see
-- mergeAgentState helper in supabase/functions/_shared/agentRisk.ts).
alter table whatsapp_conversations
  add column if not exists agent_state jsonb not null default '{}'::jsonb;

comment on column whatsapp_conversations.agent_state is
  'Persistent extracted state for the AI receptionist. Updated each turn from the draft response. Lets the agent remember dog name / breed / preferred day across messages without re-asking. Free-form jsonb; see _shared/agentRisk.ts for the documented shape.';

-- ---- Partial indexes for the staff "needs attention" view ----
create index if not exists idx_whatsapp_drafts_handoff
  on whatsapp_drafts (state, created_at desc)
  where handoff_required = true;

create index if not exists idx_whatsapp_drafts_high_risk
  on whatsapp_drafts (state, created_at desc)
  where risk_level = 'high';
