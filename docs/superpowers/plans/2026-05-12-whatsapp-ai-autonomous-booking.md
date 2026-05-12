# WhatsApp AI autonomous booking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a customer-tap-to-confirm autonomous booking path to the WhatsApp AI agent. When a known customer's draft passes all autonomy gates, the agent sends Meta interactive buttons; on `[Yes]` the booking is written without staff intervention. Reschedules and cancellations follow the same pattern. New customers are gathered across turns and onboarded after a plain-text summary confirmation, with the first booking still routing to staff approval.

**Architecture:** Additive — every change layers onto the existing `whatsapp-agent` → `whatsapp_drafts` → `whatsapp_booking_actions` pipeline. Migration extends two CHECK constraints and adds five columns. New `apply-customer-confirm` edge function handles button-reply routing. `whatsapp-send` gains a `confirm_buttons` mode. Frontend changes are minor: a new-customer badge and a per-conversation toggle.

**Tech Stack:** Supabase Postgres + Edge Functions (Deno + TypeScript), React 18 + Vite + Tailwind, Vitest + Playwright for tests. AI provider: Anthropic Claude (sonnet-4-6).

**Spec:** [docs/superpowers/specs/2026-05-12-whatsapp-ai-autonomous-booking-design.md](../specs/2026-05-12-whatsapp-ai-autonomous-booking-design.md)

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `supabase/migrations/20260512140000_whatsapp_autonomous_booking.sql` | Create | Extend `whatsapp_booking_actions.state` CHECK constraint with 4 new states; add `customer_confirm_message_id`, `customer_confirm_expires_at`; add `lead_status` + `lead_payload` + `autonomous_booking_enabled` columns to `whatsapp_conversations`; add `source` column to `humans`. |
| `supabase/functions/_shared/agentRisk.ts` | Modify | Add `canAutoBook()` helper (parallel to existing `canAutoSend`). |
| `supabase/functions/_shared/agentRisk.test.ts` | Create | Vitest tests for `canAutoBook` autonomy gate logic. |
| `supabase/functions/whatsapp-agent/index.ts` | Modify | Extend `parseExtractedState` schema; extend `parseBookingAction` to accept `reschedule`/`cancel`; detect `button_reply` and route to `apply-customer-confirm`; emit `confirm_buttons` after creating `awaiting_customer_confirm` action; new-customer lead_status state machine; post-creation correction path. System prompt edits. |
| `supabase/functions/whatsapp-send/index.ts` | Modify | New `confirm_buttons` mode that posts a Meta interactive button message. |
| `supabase/functions/apply-customer-confirm/index.ts` | Create | New edge function. Receives `{ booking_action_id, choice }`, looks up action, re-checks availability, runs the booking action (create/reschedule/cancel), transitions state, fires ack message. |
| `src/supabase/hooks/useWhatsAppInbox.js` | Modify | Surface `lead_status`, `lead_payload`, `autonomous_booking_enabled`. |
| `src/components/views/WhatsAppInboxView.jsx` | Modify | "🆕 New customer onboarded by AI" badge. Per-conversation `Autonomous booking` toggle (mirrors existing `AutoSendToggle`). |
| `src/security/supabaseSecurityReview.test.ts` | Modify | Static assertions: new states allowed in CHECK; new columns present; RLS still locked down on new columns; agent emits `awaiting_customer_confirm` only under autonomy gates. |

**Migration filename note:** Use timestamp `20260512140000` (matches the existing `YYYYMMDDhhmmss` convention; verify nothing has been added between session-start and run-time and bump if needed).

---

## Phase 0 — Schema foundation

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/20260512140000_whatsapp_autonomous_booking.sql`

- [ ] **Step 1.1: Write the migration**

```sql
-- 20260512140000_whatsapp_autonomous_booking.sql
--
-- Customer-confirmed autonomous booking — schema foundation.
-- Spec: docs/superpowers/specs/2026-05-12-whatsapp-ai-autonomous-booking-design.md
--
-- Additive only. Existing pending → applied/rejected staff-approval path is
-- untouched. Four new state values represent the autonomous lifecycle:
--   pending                      — staff approval queue (existing)
--   awaiting_customer_confirm    — AI sent Yes/No buttons, waiting on customer
--   confirmed                    — customer tapped Yes; about to apply
--   auto_applied                 — successfully applied without staff
--   rejected_by_customer         — customer tapped No or TTL expired
--   (existing) approved, rejected, applied, failed, superseded

-- 1. whatsapp_booking_actions: extend state CHECK + add confirm-tracking columns
alter table whatsapp_booking_actions
  drop constraint if exists whatsapp_booking_actions_state_check;

alter table whatsapp_booking_actions
  add constraint whatsapp_booking_actions_state_check
  check (state in (
    'pending', 'approved', 'rejected', 'applied', 'failed', 'superseded',
    'awaiting_customer_confirm', 'confirmed', 'auto_applied', 'rejected_by_customer'
  ));

alter table whatsapp_booking_actions
  add column if not exists customer_confirm_message_id text,
  add column if not exists customer_confirm_expires_at timestamptz;

create index if not exists idx_whatsapp_booking_actions_confirm_msg
  on whatsapp_booking_actions(customer_confirm_message_id)
  where customer_confirm_message_id is not null;

create index if not exists idx_whatsapp_booking_actions_awaiting_confirm
  on whatsapp_booking_actions(state, customer_confirm_expires_at)
  where state = 'awaiting_customer_confirm';

-- 2. whatsapp_conversations: lead-collection state + per-conversation opt-in
alter table whatsapp_conversations
  add column if not exists lead_status text
    check (lead_status in ('collecting', 'awaiting_summary_confirm', 'records_created')),
  add column if not exists lead_payload jsonb,
  add column if not exists autonomous_booking_enabled boolean not null default false;

-- 3. humans: provenance for the post-creation correction path
alter table humans add column if not exists source text;

-- 4. bookings: source + notes columns used by the autonomous-booking insert path.
--    'source' distinguishes whatsapp_ai (staff-approved AI proposal) from
--    whatsapp_ai_auto (customer-confirmed autonomous booking). 'notes' carries
--    a short free-text reason from the AI's booking_action payload.
alter table bookings add column if not exists source text;
alter table bookings add column if not exists notes text;

-- 5. Update existing apply_whatsapp_booking_action() function to accept the
--    new 'confirmed' state from the autonomous path (in addition to the
--    legacy 'pending' state from staff approval). The autonomous flow
--    transitions awaiting_customer_confirm → confirmed → calls this fn.
create or replace function apply_whatsapp_booking_action(p_action_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action whatsapp_booking_actions%rowtype;
  v_booking_id uuid;
  v_dog_human_id uuid;
  v_conversation_human_id uuid;
begin
  -- Autonomous path bypasses the staff check by setting state='confirmed'
  -- (only the apply-customer-confirm edge fn writes that state, and it
  -- runs under service-role). Staff path still goes through is_staff().
  select *
    into v_action
    from whatsapp_booking_actions
   where id = p_action_id
   for update;

  if not found then
    raise exception 'booking action not found';
  end if;

  if v_action.state not in ('pending', 'confirmed') then
    raise exception 'booking action is %, not pending or confirmed', v_action.state;
  end if;

  if v_action.state = 'pending' and not is_staff() then
    raise exception 'not authorised'
      using hint = 'Only staff can apply pending WhatsApp booking actions';
  end if;

  if v_action.action <> 'create' then
    raise exception 'unsupported booking action: %', v_action.action;
  end if;

  if nullif(v_action.payload->>'dog_id', '') is null
     or nullif(v_action.payload->>'booking_date', '') is null
     or nullif(v_action.payload->>'slot', '') is null
     or nullif(v_action.payload->>'service', '') is null then
    raise exception 'booking action payload is missing dog_id, booking_date, slot, or service';
  end if;

  select human_id
    into v_dog_human_id
    from dogs
   where id = (v_action.payload->>'dog_id')::uuid;

  if not found then
    raise exception 'dog not found for booking action';
  end if;

  select human_id
    into v_conversation_human_id
    from whatsapp_conversations
   where id = v_action.conversation_id;

  if v_conversation_human_id is not null
     and v_conversation_human_id <> v_dog_human_id then
    raise exception 'dog does not belong to the conversation customer';
  end if;

  insert into bookings (
    booking_date,
    slot,
    dog_id,
    size,
    service,
    status,
    addons,
    pickup_by_id,
    payment,
    confirmed,
    source,
    notes
  )
  values (
    (v_action.payload->>'booking_date')::date,
    v_action.payload->>'slot',
    (v_action.payload->>'dog_id')::uuid,
    coalesce(nullif(v_action.payload->>'size', ''), 'small'),
    v_action.payload->>'service',
    coalesce(nullif(v_action.payload->>'status', ''), 'Booked'),
    coalesce(
      array(select jsonb_array_elements_text(coalesce(v_action.payload->'addons', '[]'::jsonb))),
      '{}'::text[]
    ),
    nullif(v_action.payload->>'pickup_by_id', '')::uuid,
    coalesce(nullif(v_action.payload->>'payment', ''), 'Due at Pick-up'),
    coalesce((v_action.payload->>'confirmed')::boolean, true),
    case when v_action.state = 'confirmed' then 'whatsapp_ai_auto' else 'whatsapp_ai' end,
    nullif(v_action.payload->>'notes', '')
  )
  returning id into v_booking_id;

  update whatsapp_booking_actions
     set state = case when v_action.state = 'confirmed' then 'auto_applied' else 'applied' end,
         applied_booking_id = v_booking_id,
         applied_at = now(),
         decided_by = case when v_action.state = 'pending' then auth.uid() else null end,
         decided_at = now(),
         error_message = null
   where id = p_action_id;

  return v_booking_id;
end;
$$;

comment on function apply_whatsapp_booking_action(uuid) is
  'Applies a WhatsApp booking action. Pending state requires is_staff() (legacy staff-approval path, bookings.source = ''whatsapp_ai''). Confirmed state is service-role only and represents the customer-confirmed autonomous booking path (bookings.source = ''whatsapp_ai_auto'').';

comment on column whatsapp_booking_actions.customer_confirm_message_id is
  'Meta wa_id of the [Yes]/[No] button message we sent. Used to route button_reply events back to this action row.';

comment on column whatsapp_booking_actions.customer_confirm_expires_at is
  'TTL on awaiting_customer_confirm. After this point, the action transitions to rejected_by_customer with reason=expired.';

comment on column whatsapp_conversations.lead_status is
  'New-customer onboarding state. NULL for known customers. Transitions: NULL → collecting → awaiting_summary_confirm → records_created.';

comment on column whatsapp_conversations.lead_payload is
  'Partial new-customer info gathered across turns. Frozen into humans/dogs rows on summary-confirm.';

comment on column whatsapp_conversations.autonomous_booking_enabled is
  'Per-conversation opt-in for autonomous booking. Mirrors auto_send_enabled — staff flips this once they trust the AI on this customer.';

comment on column humans.source is
  'How this record was created. ''whatsapp_ai'' for AI-onboarded customers; NULL or app-specific values for existing customers. Used by the post-creation correction path to gate which rows the AI may update.';

comment on column bookings.source is
  'How this booking was created. ''whatsapp_ai_auto'' = customer-confirmed via the autonomous path. ''whatsapp_ai'' = staff-approved AI proposal. NULL = legacy / app-direct.';

comment on column bookings.notes is
  'Short free-text reason from the booking proposer (currently only populated by the WhatsApp AI auto-booking flow).';
```

- [ ] **Step 1.2: Verify the migration is syntactically valid**

Run:
```bash
ls supabase/migrations/ | tail -3
```

Expected: Your new migration listed last, alphabetically after `20260512000000_drop_customer_bookings_delete_policy.sql`.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/20260512140000_whatsapp_autonomous_booking.sql
git commit -m "feat(whatsapp-agent): schema for customer-confirmed autonomous booking"
```

(Use a HEREDOC for a longer message if your repo style prefers it; the existing whatsapp commits favour single-line subject + blank body.)

### Task 2: Static security review — assert new states are constrained

**Files:**
- Modify: `src/security/supabaseSecurityReview.test.ts`

- [ ] **Step 2.1: Add a failing test asserting the new state CHECK constraint**

Add at the end of the existing `describe("Supabase security review regressions", ...)` block (before the closing `});`):

```ts
  it("constrains whatsapp_booking_actions.state to the autonomous-booking state set", () => {
    const migration = getMigrationBySql((sql) =>
      sql.includes("whatsapp_booking_actions_state_check") &&
      sql.includes("awaiting_customer_confirm")
    );

    // The replacement CHECK must list all four new autonomous states alongside the legacy six.
    expect(migration).toMatch(/awaiting_customer_confirm/);
    expect(migration).toMatch(/'confirmed'/);
    expect(migration).toMatch(/auto_applied/);
    expect(migration).toMatch(/rejected_by_customer/);
    // Legacy states still present
    expect(migration).toMatch(/'pending'/);
    expect(migration).toMatch(/'applied'/);
  });

  it("adds the confirm-tracking columns and lead-collection columns", () => {
    const migration = getMigrationBySql((sql) =>
      sql.includes("customer_confirm_message_id") &&
      sql.includes("lead_status")
    );

    expect(migration).toMatch(/add column customer_confirm_message_id text/i);
    expect(migration).toMatch(/add column customer_confirm_expires_at timestamptz/i);
    expect(migration).toMatch(/add column lead_status text/i);
    expect(migration).toMatch(/add column lead_payload jsonb/i);
    expect(migration).toMatch(/add column autonomous_booking_enabled boolean not null default false/i);
    expect(migration).toMatch(/alter table humans\s+add column source text/i);
  });

  it("keeps the staff-only is_staff() check on the legacy pending application path", () => {
    const migration = getMigrationBySql((sql) =>
      sql.includes("create or replace function apply_whatsapp_booking_action") &&
      sql.includes("not pending or confirmed")
    );

    // Autonomous path uses state='confirmed' (set under service-role) and skips is_staff.
    // Staff path keeps is_staff() — verify the conditional gate is present.
    expect(migration).toMatch(/state = 'pending' and not is_staff\(\)/);
    expect(migration).toMatch(/'whatsapp_ai_auto'/);
    expect(migration).toMatch(/'whatsapp_ai'/);
  });
```

- [ ] **Step 2.2: Run the new tests, watch them pass**

Run: `npm run test -- src/security/supabaseSecurityReview.test.ts`
Expected: all three new tests pass; full suite still passes.

- [ ] **Step 2.3: Commit**

```bash
git add src/security/supabaseSecurityReview.test.ts
git commit -m "test(security-review): assert autonomous-booking schema is constrained"
```

---

## Phase 1 — Customer-confirm pipeline (create, known customer)

### Task 3: `canAutoBook` autonomy gate helper

**Files:**
- Modify: `supabase/functions/_shared/agentRisk.ts`
- Create: `supabase/functions/_shared/agentRisk.test.ts`

- [ ] **Step 3.1: Write a failing test for `canAutoBook`**

Create `supabase/functions/_shared/agentRisk.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canAutoBook } from "./agentRisk.ts";

describe("canAutoBook", () => {
  const base = {
    intent: "booking_propose" as const,
    riskLevel: "low" as const,
    confidence: 0.9,
    dogSize: "small" as const,
    customerIsKnown: true,
    conversationState: "ai_handling" as const,
    envFlagEnabled: true,
    conversationOptedIn: true,
    breedKnown: true,
  };

  it("returns true when every gate passes", () => {
    expect(canAutoBook(base)).toBe(true);
  });

  it("returns false when env flag is off", () => {
    expect(canAutoBook({ ...base, envFlagEnabled: false })).toBe(false);
  });

  it("returns false when the conversation hasn't opted in", () => {
    expect(canAutoBook({ ...base, conversationOptedIn: false })).toBe(false);
  });

  it("returns false for unknown customer", () => {
    expect(canAutoBook({ ...base, customerIsKnown: false })).toBe(false);
  });

  it("returns false when confidence is below 0.85", () => {
    expect(canAutoBook({ ...base, confidence: 0.84 })).toBe(false);
  });

  it("returns false for medium or high risk", () => {
    expect(canAutoBook({ ...base, riskLevel: "medium" })).toBe(false);
    expect(canAutoBook({ ...base, riskLevel: "high" })).toBe(false);
  });

  it("returns false for large dogs", () => {
    expect(canAutoBook({ ...base, dogSize: "large" })).toBe(false);
  });

  it("returns false when breed is unknown", () => {
    expect(canAutoBook({ ...base, breedKnown: false })).toBe(false);
  });

  it("returns false when human has taken over", () => {
    expect(canAutoBook({ ...base, conversationState: "human_takeover" })).toBe(false);
  });

  it("allows booking_change and booking_cancel intents", () => {
    expect(canAutoBook({ ...base, intent: "booking_change" })).toBe(true);
    expect(canAutoBook({ ...base, intent: "booking_cancel" })).toBe(true);
  });

  it("rejects other intents (faq, smalltalk, escalate)", () => {
    expect(canAutoBook({ ...base, intent: "faq" })).toBe(false);
    expect(canAutoBook({ ...base, intent: "escalate" })).toBe(false);
  });
});
```

- [ ] **Step 3.2: Run the test, confirm it fails**

Run: `npm run test -- supabase/functions/_shared/agentRisk.test.ts`
Expected: FAIL, `canAutoBook` is not exported.

- [ ] **Step 3.3: Implement `canAutoBook` in `agentRisk.ts`**

Append to `supabase/functions/_shared/agentRisk.ts` (after the existing `canAutoSend`):

```ts
export interface CanAutoBookInput {
  intent: Intent;
  riskLevel: RiskLevel;
  confidence: number;
  dogSize: "small" | "medium" | "large" | "unknown" | null;
  customerIsKnown: boolean;
  conversationState: "ai_handling" | "human_takeover" | "snoozed" | "closed" | string;
  envFlagEnabled: boolean;
  conversationOptedIn: boolean;
  breedKnown: boolean;
}

/**
 * Returns true iff every autonomy gate passes for an autonomous booking
 * action (create / reschedule / cancel). The agent calls this once it
 * has Claude's draft + classifier output; on true it emits the
 * awaiting_customer_confirm flow, on false it emits a legacy `pending`
 * action that the staff inbox can approve.
 */
export function canAutoBook(input: CanAutoBookInput): boolean {
  if (!input.envFlagEnabled) return false;
  if (!input.conversationOptedIn) return false;
  if (!input.customerIsKnown) return false;
  if (input.confidence < 0.85) return false;
  if (input.riskLevel !== "low") return false;
  if (input.conversationState !== "ai_handling") return false;
  if (!input.breedKnown) return false;
  const okSizes = new Set(["small", "medium"]);
  if (!input.dogSize || !okSizes.has(input.dogSize)) return false;
  const okIntents = new Set<Intent>(["booking_propose", "booking_change", "booking_cancel"]);
  if (!okIntents.has(input.intent)) return false;
  return true;
}
```

- [ ] **Step 3.4: Run the test, watch it pass**

Run: `npm run test -- supabase/functions/_shared/agentRisk.test.ts`
Expected: all 11 cases pass.

- [ ] **Step 3.5: Run the full test suite to ensure no regression**

Run: `npm run test`
Expected: full suite green.

- [ ] **Step 3.6: Commit**

```bash
git add supabase/functions/_shared/agentRisk.ts supabase/functions/_shared/agentRisk.test.ts
git commit -m "feat(agent-risk): add canAutoBook autonomy gate helper"
```

### Task 4: Extend `parseBookingAction` to accept reschedule / cancel shapes

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts:856-877`

- [ ] **Step 4.1: Add types for the new shapes**

Replace the `BookingActionFromClaude` interface ([whatsapp-agent/index.ts:145-153](../../../supabase/functions/whatsapp-agent/index.ts:145)) with a discriminated union:

```ts
type BookingActionFromClaude =
  | {
      action: "create";
      dog_id: string;
      booking_date: string;
      slot: string;
      service: "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom";
      size?: "small" | "medium" | "large";
      notes?: string;
    }
  | {
      action: "reschedule";
      old_booking_id: string;
      new_date: string;
      new_slot: string;
      notes?: string;
    }
  | {
      action: "cancel";
      old_booking_id: string;
      reason: string;
    };
```

- [ ] **Step 4.2: Replace `parseBookingAction` with the multi-shape version**

Replace the body of `parseBookingAction` ([whatsapp-agent/index.ts:856-877](../../../supabase/functions/whatsapp-agent/index.ts:856)):

```ts
function parseBookingAction(value: unknown): BookingActionFromClaude | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const action = obj.action;

  if (action === "create") {
    const validServices = new Set([
      "full-groom",
      "bath-and-brush",
      "bath-and-deshed",
      "puppy-groom",
    ]);
    const validSizes = new Set(["small", "medium", "large"]);
    if (typeof obj.dog_id !== "string" || !obj.dog_id) return null;
    if (typeof obj.booking_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.booking_date)) return null;
    if (typeof obj.slot !== "string" || !/^\d{2}:\d{2}$/.test(obj.slot)) return null;
    if (typeof obj.service !== "string" || !validServices.has(obj.service)) return null;
    return {
      action: "create",
      dog_id: obj.dog_id,
      booking_date: obj.booking_date,
      slot: obj.slot,
      service: obj.service as "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom",
      ...(typeof obj.size === "string" && validSizes.has(obj.size)
        ? { size: obj.size as "small" | "medium" | "large" }
        : {}),
      ...(typeof obj.notes === "string" && obj.notes.trim()
        ? { notes: obj.notes.trim().slice(0, 300) }
        : {}),
    };
  }

  if (action === "reschedule") {
    if (typeof obj.old_booking_id !== "string" || !obj.old_booking_id) return null;
    if (typeof obj.new_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.new_date)) return null;
    if (typeof obj.new_slot !== "string" || !/^\d{2}:\d{2}$/.test(obj.new_slot)) return null;
    return {
      action: "reschedule",
      old_booking_id: obj.old_booking_id,
      new_date: obj.new_date,
      new_slot: obj.new_slot,
      ...(typeof obj.notes === "string" && obj.notes.trim()
        ? { notes: obj.notes.trim().slice(0, 300) }
        : {}),
    };
  }

  if (action === "cancel") {
    if (typeof obj.old_booking_id !== "string" || !obj.old_booking_id) return null;
    if (typeof obj.reason !== "string" || !obj.reason.trim()) return null;
    return {
      action: "cancel",
      old_booking_id: obj.old_booking_id,
      reason: obj.reason.trim().slice(0, 300),
    };
  }

  return null;
}
```

- [ ] **Step 4.3: Confirm the file still type-checks**

Run: `npm run typecheck`
Expected: pass (no errors involving `BookingActionFromClaude`).

- [ ] **Step 4.4: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts
git commit -m "feat(whatsapp-agent): parse reschedule and cancel booking action shapes"
```

### Task 5: Extend `parseExtractedState` schema

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts:829-854`
- Modify: `supabase/functions/_shared/agentRisk.ts` (the `AgentState` interface)

- [ ] **Step 5.1: Extend `AgentState`**

In `supabase/functions/_shared/agentRisk.ts`, find the `AgentState` interface and add fields:

```ts
export interface AgentState {
  customerName?: string | null;
  customerSurname?: string | null;
  dogName?: string | null;
  breed?: string | null;
  dogSize?: "small" | "medium" | "large" | "unknown" | null;
  dogAge?: string | null;
  alerts?: string[] | null;
  coatCondition?: string | null;
  service?: "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom" | null;
  preferredDay?: string | null;
  preferredTime?: string | null;
}
```

Verify the existing `mergeAgentState` handles the new fields naturally (it iterates known keys; the new keys merge identically to existing string keys). If the existing implementation uses a hardcoded key list, extend it too.

- [ ] **Step 5.2: Extend `parseExtractedState`**

Replace the body of `parseExtractedState` ([whatsapp-agent/index.ts:829-854](../../../supabase/functions/whatsapp-agent/index.ts:829)):

```ts
function parseExtractedState(value: unknown): Partial<AgentState> | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const out: Partial<AgentState> = {};
  const stringKeys: (keyof AgentState)[] = [
    "customerName",
    "customerSurname",
    "dogName",
    "breed",
    "dogAge",
    "coatCondition",
    "service",
    "preferredDay",
    "preferredTime",
  ];
  for (const key of stringKeys) {
    const raw = v[key];
    if (typeof raw === "string" && raw.trim()) {
      (out as Record<string, unknown>)[key] = raw.trim().slice(0, 200);
    }
  }
  if (typeof v.dogSize === "string") {
    const ds = v.dogSize.toLowerCase();
    if (ds === "small" || ds === "medium" || ds === "large" || ds === "unknown") {
      out.dogSize = ds;
    }
  }
  if (Array.isArray(v.alerts)) {
    const alerts = v.alerts
      .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
      .map((a) => a.trim().slice(0, 100))
      .slice(0, 10);
    if (alerts.length > 0) out.alerts = alerts;
  }
  return Object.keys(out).length > 0 ? out : null;
}
```

- [ ] **Step 5.3: Extend `renderAgentStateBlock` to render the new fields**

Replace the `labels` array in `renderAgentStateBlock` ([whatsapp-agent/index.ts:613-633](../../../supabase/functions/whatsapp-agent/index.ts:613)):

```ts
  const labels: Array<[keyof AgentState, string]> = [
    ["customerName", "Customer first name"],
    ["customerSurname", "Customer surname"],
    ["dogName", "Dog name"],
    ["breed", "Breed"],
    ["dogSize", "Size"],
    ["dogAge", "Dog age"],
    ["coatCondition", "Coat condition"],
    ["service", "Service"],
    ["preferredDay", "Preferred day"],
    ["preferredTime", "Preferred time"],
  ];
```

Then handle `alerts` (string array) as a separate line below the existing loop:

```ts
  if (Array.isArray(state.alerts) && state.alerts.length > 0) {
    lines.push(`Alerts: ${state.alerts.join(", ")}`);
  }
```

- [ ] **Step 5.4: Run typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 5.5: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts supabase/functions/_shared/agentRisk.ts
git commit -m "feat(whatsapp-agent): extend extracted-state schema for new-customer fields"
```

### Task 6: System prompt edits — confirmation question rule + reschedule/cancel + new-customer

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts:165-331` (the `SYSTEM_PROMPT` constant)

- [ ] **Step 6.1: Replace the HARD RULES block**

Find the "HARD RULES — always" section in `SYSTEM_PROMPT` and replace the relevant rules. The full replacement block (preserve the surrounding bar separators):

```
────────────────────────────────────────────────────────
HARD RULES — always
────────────────────────────────────────────────────────
- NEVER directly confirm, move, or cancel a booking in the text. The system follows up with a tap-to-confirm message; your text MUST end with a question prompting the customer's confirmation (e.g. "Shall I book that in for you?", "Want me to move it to Wednesday at 11:00?", "Are you sure you want to cancel?"). Banned phrasing: "booked in", "pencilled in", "penciled in", "you're in", "all booked", "added to the diary", "locked in", "sorted". Phrasing alternatives: "shall I book it?", "want me to set that up?", "happy to lock that in if you like".
- You MAY propose a booking_action only when all of these are explicit or safely resolved from context: action kind (create | reschedule | cancel); for create — exact dog_id, exact YYYY-MM-DD booking_date, exact slot, and service ID; for reschedule — exact old_booking_id from the "Upcoming bookings" block, exact new_date + new_slot; for cancel — exact old_booking_id, plus a reason quoted from the customer's message. Use only dog IDs and booking IDs shown in context.
- For booking_action.create with size "small" or "medium", the booking_date + slot MUST appear in the "--- Availability ---" block. Large dogs (size "large" or unknown size from breed): do NOT propose any booking_action — say "the team will check the diary". The "--- Large-dog availability ---" block is informational only; never reuse a slot from "--- Availability ---" for a large dog.
- For booking_action.reschedule, only propose if the original booking is at least 24 hours from today. Anything inside that window: hold and let staff handle (intent "booking_change", no booking_action).
- For booking_action.cancel, only propose if the booking is in "Booked" status (not yet checked in or finished). Mid-service or finished bookings: hold and let staff handle.
- If a breed is mentioned that you do not recognise (not a common UK breed name and not in the customer's "Dogs" context block), do NOT propose booking_action. Ask another natural question, populate extracted_state with the breed string for staff to confirm, and tell the customer "the team will confirm what size that breed is".
- Do not propose more than 3 candidate slots in a single message. If you want to offer more, ask the customer for a narrower preference first.
- NEVER quote prices as fixed guarantees. Guide prices labelled "starts from" or "guide price" are fine.
- NEVER invent appointment slots or days. SMALL/MEDIUM cite times only from "--- Availability ---"; LARGE cite days only from "--- Large-dog availability ---". If a block is missing or empty, say "let me just check the diary and come back to you".
- NEVER promise same-day turnaround or specific groomer assignments.
- If the message sounds distressed, angry, or is a complaint → intent "escalate", short empathetic holding reply, no booking_action.
- If a message seems medical or safety-related → intent "escalate", brief holding reply, no booking_action.
```

- [ ] **Step 6.2: Replace the OUTPUT FORMAT booking_action shape**

Find the OUTPUT FORMAT block and replace the `booking_action` portion of the JSON schema:

```
  "booking_action": null | {
    "action": "create",
    "dog_id": "uuid from context",
    "booking_date": "YYYY-MM-DD",
    "slot": "HH:MM",
    "service": "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom",
    "size": "small" | "medium",
    "notes": "short reason, optional"
  } | {
    "action": "reschedule",
    "old_booking_id": "uuid from --- Upcoming bookings --- context",
    "new_date": "YYYY-MM-DD",
    "new_slot": "HH:MM",
    "notes": "short reason, optional"
  } | {
    "action": "cancel",
    "old_booking_id": "uuid from --- Upcoming bookings --- context",
    "reason": "quoted or paraphrased from the customer's message"
  },
```

And replace the `extracted_state` portion:

```
  "extracted_state": null | {
    "customerName":      string | null,
    "customerSurname":   string | null,
    "dogName":           string | null,
    "breed":             string | null,
    "dogSize":           "small" | "medium" | "large" | "unknown" | null,
    "dogAge":            string | null,
    "alerts":            string[] | null,
    "coatCondition":     string | null,
    "service":           "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom" | null,
    "preferredDay":      string | null,
    "preferredTime":     string | null
  }
```

- [ ] **Step 6.3: Append the NEW CUSTOMER COLLECTION section**

Add a new section to `SYSTEM_PROMPT` just before `OUTPUT FORMAT`:

```
────────────────────────────────────────────────────────
NEW CUSTOMER COLLECTION
────────────────────────────────────────────────────────
When --- Customer --- is "Unknown (...)", you are speaking to someone not on our records yet. Over the next few turns, gather:
- Customer first name + surname
- Dog name + breed
- Dog age (puppy if under 6 months)
- Any handling alerts (reactive, nervous, medical)
- Coat condition / matting state
- Preferred day

Use extracted_state to populate these on every turn. Ask for missing fields naturally — one or two per turn, never all in one go. Don't invent details.

Once you have ALL of the required fields above AND the breed is one you recognise, your next reply MUST be a single plain-text summary that asks the customer to confirm everything before we save it. Example shape:

  "Just to double-check — Sarah Lockwood, Alfie's a 3yo Cockapoo, nervous around dryers, coat in good condition, looking for a Wednesday — sound right? 🎓🐶❤️ X"

Do NOT propose a booking_action while customer is unknown. The system creates the records on the customer's next positive reply ("yes", "that's right", "perfect"); on the turn after, you'll see --- Customer --- populated and can move into the normal booking flow.

If the customer corrects a detail during the summary, update via extracted_state and re-summarise on the next turn.
```

- [ ] **Step 6.4: Smoke-check the prompt is still valid TypeScript string**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 6.5: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts
git commit -m "feat(whatsapp-agent): system prompt for confirmation-question + new-customer"
```

### Task 7: `whatsapp-send` — new `confirm_buttons` mode

**Files:**
- Modify: `supabase/functions/whatsapp-send/index.ts`

- [ ] **Step 7.1: Read the existing modes to confirm extension points**

```bash
grep -n "mode:\|mode ===\|case.*mode" supabase/functions/whatsapp-send/index.ts | head -20
```

Note the current modes (likely `text`, `template`, `draft`) and the dispatch shape so the new mode mirrors the existing one.

- [ ] **Step 7.2: Add the `confirm_buttons` mode handler**

Add a new handler in `whatsapp-send/index.ts` that:
1. Validates input: `{ mode: "confirm_buttons", conversation_id, booking_action_id, summary_text, action_kind: "book" | "reschedule" | "cancel" }`.
2. Looks up the conversation to get `phone_e164`.
3. Builds the Meta interactive button payload (see code below).
4. POSTs to Meta as the existing `text`/`template` modes do (reuse the `META_TOKEN` + `PHONE_NUMBER_ID` env + URL helpers).
5. Inserts a `whatsapp_messages` row (direction=outbound, role=assistant, content=summary_text, raw=body, meta_message_id from response).
6. Updates the `whatsapp_booking_actions` row: `customer_confirm_message_id = meta_message_id`, `customer_confirm_expires_at = now() + 24 hours`, `state = 'awaiting_customer_confirm'`.
7. Returns `{ ok: true, meta_message_id }` on success, `{ ok: false, reason }` on failure.

Implementation:

```ts
// Add alongside other mode handlers
async function handleConfirmButtons(
  supabase: SupabaseClient,
  payload: {
    conversation_id: string;
    booking_action_id: string;
    summary_text: string;
    action_kind: "book" | "reschedule" | "cancel";
  },
) {
  const { data: conversation, error: convErr } = await supabase
    .from("whatsapp_conversations")
    .select("phone_e164")
    .eq("id", payload.conversation_id)
    .single();
  if (convErr || !conversation?.phone_e164) {
    return { ok: false, reason: "conversation not found or missing phone" };
  }

  const yesLabel =
    payload.action_kind === "book"
      ? "Yes, book it"
      : payload.action_kind === "reschedule"
        ? "Yes, move it"
        : "Yes, cancel";

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: conversation.phone_e164.replace(/^\+/, ""),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: payload.summary_text.slice(0, 1024) },
      action: {
        buttons: [
          { type: "reply", reply: { id: `${payload.booking_action_id}:yes`, title: yesLabel.slice(0, 20) } },
          { type: "reply", reply: { id: `${payload.booking_action_id}:no`, title: "No, change".slice(0, 20) } },
        ],
      },
    },
  };

  const metaRes = await postToMeta(body); // existing helper used by other modes
  if (!metaRes.ok) {
    return { ok: false, reason: `meta send failed: ${metaRes.error}` };
  }

  const metaMessageId = metaRes.message_id;

  // Outbound message row (so the inbox renders the buttons we sent)
  await supabase.from("whatsapp_messages").insert({
    conversation_id: payload.conversation_id,
    direction: "outbound",
    role: "assistant",
    meta_message_id: metaMessageId,
    content: payload.summary_text,
    raw: body,
    status: "sent",
    sent_at: new Date().toISOString(),
  });

  // Transition booking action to awaiting_customer_confirm, stamp TTL
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: actionErr } = await supabase
    .from("whatsapp_booking_actions")
    .update({
      state: "awaiting_customer_confirm",
      customer_confirm_message_id: metaMessageId,
      customer_confirm_expires_at: expiresAt,
    })
    .eq("id", payload.booking_action_id);

  if (actionErr) {
    return { ok: false, reason: `action transition failed: ${actionErr.message}` };
  }

  return { ok: true, meta_message_id: metaMessageId };
}
```

Wire it into the existing mode dispatch (look for the `if (mode === "text")` / `case "text":` cascade — match the pattern).

- [ ] **Step 7.3: Confirm timing of state transition**

The agent inserts the `whatsapp_booking_actions` row with `state = 'pending'` first (so the row exists for the send-buttons step to reference). Then it calls `whatsapp-send` with `confirm_buttons` mode, which transitions the state to `awaiting_customer_confirm` only after the Meta send succeeds. If Meta send fails, the row stays at `pending` and the staff inbox sees it via the legacy path — graceful degrade.

- [ ] **Step 7.4: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 7.5: Commit**

```bash
git add supabase/functions/whatsapp-send/index.ts
git commit -m "feat(whatsapp-send): add confirm_buttons mode for autonomous booking"
```

### Task 8: `apply-customer-confirm` edge function — scaffold + Yes/No routing

**Files:**
- Create: `supabase/functions/apply-customer-confirm/index.ts`

- [ ] **Step 8.1: Scaffold the function**

Create `supabase/functions/apply-customer-confirm/index.ts`:

```ts
// ============================================================
// supabase/functions/apply-customer-confirm/index.ts
//
// Handles a customer's [Yes] / [No, change] tap on a Meta interactive
// button sent by whatsapp-send (confirm_buttons mode).
//
// Called internally by whatsapp-agent when it detects a button_reply
// event with id matching `<booking_action_id>:yes|no`.
//
// On Yes: re-checks availability (catches races since the agent built
//         context), runs the booking action via apply_whatsapp_booking_action
//         (autonomous path uses state='confirmed' which bypasses is_staff),
//         transitions to auto_applied, fires ack message.
// On No:  transitions to rejected_by_customer, agent re-engages next turn.
//
// Idempotent: re-tapping does nothing destructive.
// TTL:       awaiting_customer_confirm older than 24h transitions to
//            rejected_by_customer with reason='expired'.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualHeader } from "../_shared/webhook-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("APPLY_CONFIRM_INTERNAL_SECRET")!;
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";
const WHATSAPP_SEND_URL =
  Deno.env.get("WHATSAPP_SEND_URL") ?? `${SUPABASE_URL}/functions/v1/whatsapp-send`;

interface ConfirmInput {
  booking_action_id: string;
  choice: "yes" | "no";
}

async function sendAckText(conversation_id: string, text: string) {
  if (!SEND_INTERNAL_SECRET) return;
  try {
    await fetch(WHATSAPP_SEND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": SEND_INTERNAL_SECRET,
      },
      body: JSON.stringify({ mode: "text", conversation_id, text }),
    });
  } catch (err) {
    console.warn("sendAckText failed (non-fatal):", err);
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (!timingSafeEqualHeader(req.headers.get("x-internal-secret"), INTERNAL_SECRET)) {
    return new Response("unauthorized", { status: 401 });
  }

  let input: ConfirmInput;
  try {
    input = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!input.booking_action_id || (input.choice !== "yes" && input.choice !== "no")) {
    return new Response("missing or invalid fields", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: action, error: actionErr } = await supabase
    .from("whatsapp_booking_actions")
    .select("id, conversation_id, action, payload, state, customer_confirm_expires_at, target_booking_id")
    .eq("id", input.booking_action_id)
    .single();

  if (actionErr || !action) {
    return new Response("action not found", { status: 404 });
  }

  // Idempotency: only act on actions still awaiting customer confirmation.
  if (action.state !== "awaiting_customer_confirm") {
    return new Response(`already ${action.state}`, { status: 200 });
  }

  // TTL: expire stale awaiting_customer_confirm rows.
  if (action.customer_confirm_expires_at && new Date(action.customer_confirm_expires_at) < new Date()) {
    await supabase
      .from("whatsapp_booking_actions")
      .update({ state: "rejected_by_customer", rejection_reason: "expired" })
      .eq("id", action.id);
    await sendAckText(action.conversation_id, "Sorry, that confirmation expired — want me to find a slot again? 🎓🐶❤️ X");
    return new Response("expired", { status: 200 });
  }

  if (input.choice === "no") {
    await supabase
      .from("whatsapp_booking_actions")
      .update({ state: "rejected_by_customer", rejection_reason: "customer_no" })
      .eq("id", action.id);
    // No ack here — the agent will re-engage on the next inbound turn.
    return new Response("rejected by customer", { status: 200 });
  }

  // choice === 'yes' — handler dispatched on action.action in subsequent tasks
  return new Response("yes-handler not yet implemented", { status: 501 });
});
```

- [ ] **Step 8.2: Deno typecheck (best-effort)**

Run: `npm run typecheck`
Expected: pass for the Node-side. Deno-only typing is checked at deploy time.

- [ ] **Step 8.3: Commit**

```bash
git add supabase/functions/apply-customer-confirm/index.ts
git commit -m "feat(apply-customer-confirm): scaffold + No / TTL / idempotency handling"
```

### Task 9: `apply-customer-confirm` — create branch with slot re-check

**Files:**
- Modify: `supabase/functions/apply-customer-confirm/index.ts`

- [ ] **Step 9.1: Replace the 501 stub with the create branch**

Replace the `// choice === 'yes' ...` block at the end of the serve handler with:

```ts
  // choice === 'yes' — run the action
  try {
    if (action.action === "create") {
      // Re-check slot availability via the same RPC the agent uses
      const slotFree = await isSlotFree(supabase, action.payload);
      if (!slotFree) {
        await supabase
          .from("whatsapp_booking_actions")
          .update({ state: "rejected_by_customer", rejection_reason: "slot_gone" })
          .eq("id", action.id);
        await sendAckText(
          action.conversation_id,
          "Ah, that slot just went — let me check what else is open. 🎓🐶❤️ X",
        );
        return new Response("slot_gone", { status: 200 });
      }
      // Transition to 'confirmed' so apply_whatsapp_booking_action treats this
      // as the autonomous path (no is_staff() check) and stamps source='whatsapp_ai_auto'.
      await supabase
        .from("whatsapp_booking_actions")
        .update({ state: "confirmed", decided_at: new Date().toISOString() })
        .eq("id", action.id);

      const { data: appliedId, error: applyErr } = await supabase.rpc(
        "apply_whatsapp_booking_action",
        { p_action_id: action.id },
      );
      if (applyErr) throw new Error(applyErr.message);

      const summary = formatBookingSummary(action.payload);
      await sendAckText(
        action.conversation_id,
        `You're booked in ✓ ${summary}. See you then! 🎓🐶❤️ X`,
      );
      return new Response("auto_applied", { status: 200 });
    }

    // reschedule and cancel branches added in Tasks 10–11
    return new Response(`unsupported action kind: ${action.action}`, { status: 501 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Auto-apply failed — fall back to staff queue so they don't lose the lead.
    await supabase
      .from("whatsapp_booking_actions")
      .update({ state: "pending", error_message: `auto_apply_failed: ${message}` })
      .eq("id", action.id);
    console.error("apply-customer-confirm failed:", message);
    return new Response("fell back to pending", { status: 200 });
  }
```

Then add the helper functions above `serve(...)`:

```ts
async function isSlotFree(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const bookingDate = payload.booking_date as string;
  const slot = payload.slot as string;
  const dogId = payload.dog_id as string;

  const { data, error } = await supabase
    .from("bookings")
    .select("id, dog_id")
    .eq("booking_date", bookingDate)
    .eq("slot", slot)
    .neq("status", "Cancelled");

  if (error) {
    console.warn("isSlotFree query failed; failing closed:", error.message);
    return false;
  }

  // If the customer's own dog is already in this slot (e.g. retry), treat
  // that as "free" so we don't reject our own race against ourselves.
  if (!data || data.length === 0) return true;
  if (data.length === 1 && data[0].dog_id === dogId) return true;
  return false;
}

function formatBookingSummary(payload: Record<string, unknown>): string {
  const date = payload.booking_date as string;
  const slot = payload.slot as string;
  const service = payload.service as string;
  const serviceLabel: Record<string, string> = {
    "full-groom": "full groom",
    "bath-and-brush": "bath & brush",
    "bath-and-deshed": "bath & deshed",
    "puppy-groom": "puppy groom",
  };
  const label = serviceLabel[service] ?? service;
  const formattedDate = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  return `${formattedDate} at ${slot} — ${label}`;
}
```

- [ ] **Step 9.2: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 9.3: Commit**

```bash
git add supabase/functions/apply-customer-confirm/index.ts
git commit -m "feat(apply-customer-confirm): create branch with slot re-check + fallback"
```

### Task 10: `apply-customer-confirm` — reschedule branch

**Files:**
- Modify: `supabase/functions/apply-customer-confirm/index.ts`

- [ ] **Step 10.1: Add the reschedule branch**

In the try block, between the `action.action === "create"` branch and the `unsupported action kind` return, add:

```ts
    if (action.action === "reschedule") {
      const newDate = action.payload.new_date as string;
      const newSlot = action.payload.new_slot as string;
      const oldBookingId = action.target_booking_id ?? (action.payload.old_booking_id as string);

      // Re-check target booking is still in Booked status and ≥24h away
      const { data: existing, error: bookErr } = await supabase
        .from("bookings")
        .select("id, status, booking_date, slot, dog_id")
        .eq("id", oldBookingId)
        .single();
      if (bookErr || !existing) {
        throw new Error("original booking not found");
      }
      if (existing.status !== "Booked") {
        await supabase
          .from("whatsapp_booking_actions")
          .update({ state: "rejected_by_customer", rejection_reason: "booking_not_movable" })
          .eq("id", action.id);
        await sendAckText(
          action.conversation_id,
          "I can't move that booking automatically — one of the team will be in touch shortly. 🎓🐶❤️ X",
        );
        return new Response("not_movable", { status: 200 });
      }

      // Re-check the new slot is free (excluding the booking we're moving)
      const targetFree = await isSlotFreeExcluding(supabase, newDate, newSlot, oldBookingId);
      if (!targetFree) {
        await supabase
          .from("whatsapp_booking_actions")
          .update({ state: "rejected_by_customer", rejection_reason: "slot_gone" })
          .eq("id", action.id);
        await sendAckText(
          action.conversation_id,
          "Ah, that new slot just went — let me check what else is open. 🎓🐶❤️ X",
        );
        return new Response("slot_gone", { status: 200 });
      }

      await supabase
        .from("bookings")
        .update({ booking_date: newDate, slot: newSlot })
        .eq("id", oldBookingId);

      await supabase
        .from("whatsapp_booking_actions")
        .update({
          state: "auto_applied",
          applied_booking_id: oldBookingId,
          applied_at: new Date().toISOString(),
          decided_at: new Date().toISOString(),
        })
        .eq("id", action.id);

      const summary = formatBookingSummary({
        booking_date: newDate,
        slot: newSlot,
        service: "full-groom", // service unchanged; reschedule is date+slot only
      });
      await sendAckText(
        action.conversation_id,
        `All moved ✓ now ${summary.replace(/ — .*/, "")} (same service as before). 🎓🐶❤️ X`,
      );
      return new Response("rescheduled", { status: 200 });
    }
```

And add the helper above `serve`:

```ts
async function isSlotFreeExcluding(
  supabase: SupabaseClient,
  bookingDate: string,
  slot: string,
  excludeBookingId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("booking_date", bookingDate)
    .eq("slot", slot)
    .neq("status", "Cancelled")
    .neq("id", excludeBookingId);
  if (error) return false;
  return !data || data.length === 0;
}
```

- [ ] **Step 10.2: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 10.3: Commit**

```bash
git add supabase/functions/apply-customer-confirm/index.ts
git commit -m "feat(apply-customer-confirm): reschedule branch with target-not-movable handling"
```

### Task 11: `apply-customer-confirm` — cancel branch

**Files:**
- Modify: `supabase/functions/apply-customer-confirm/index.ts`

- [ ] **Step 11.1: Add the cancel branch**

In the try block, before the `unsupported action kind` return:

```ts
    if (action.action === "cancel") {
      const oldBookingId = action.target_booking_id ?? (action.payload.old_booking_id as string);
      const reason = (action.payload.reason as string) ?? "customer requested via WhatsApp";

      const { data: existing, error: bookErr } = await supabase
        .from("bookings")
        .select("id, status, booking_date, slot")
        .eq("id", oldBookingId)
        .single();
      if (bookErr || !existing) {
        throw new Error("original booking not found");
      }
      if (existing.status !== "Booked") {
        await supabase
          .from("whatsapp_booking_actions")
          .update({ state: "rejected_by_customer", rejection_reason: "booking_not_cancellable" })
          .eq("id", action.id);
        await sendAckText(
          action.conversation_id,
          "I can't cancel that one automatically — one of the team will be in touch. 🎓🐶❤️ X",
        );
        return new Response("not_cancellable", { status: 200 });
      }

      // UPDATE-to-cancel — fires the existing notify-booking-cancelled trigger.
      await supabase
        .from("bookings")
        .update({ status: "Cancelled", cancel_reason: reason })
        .eq("id", oldBookingId);

      await supabase
        .from("whatsapp_booking_actions")
        .update({
          state: "auto_applied",
          applied_booking_id: oldBookingId,
          applied_at: new Date().toISOString(),
          decided_at: new Date().toISOString(),
        })
        .eq("id", action.id);

      await sendAckText(
        action.conversation_id,
        "All cancelled ✓ Hope to see you another time. 🎓🐶❤️ X",
      );
      return new Response("cancelled", { status: 200 });
    }
```

- [ ] **Step 11.2: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 11.3: Commit**

```bash
git add supabase/functions/apply-customer-confirm/index.ts
git commit -m "feat(apply-customer-confirm): cancel branch via UPDATE-to-cancel path"
```

### Task 12: `whatsapp-agent` — detect button_reply and route to `apply-customer-confirm`

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts`

- [ ] **Step 12.1: Add a button-reply detector before the Claude call**

In the inbound-message loop (around [whatsapp-agent/index.ts:1129](../../../supabase/functions/whatsapp-agent/index.ts:1129)), after `insertInboundMessage(...)` but before the `conversation.state !== "ai_handling"` check, add:

```ts
          // Button-reply routing: if this is a Yes/No tap on a confirm_buttons
          // message we sent, route to apply-customer-confirm and skip the
          // Claude draft for this turn.
          const buttonReply = msg.interactive?.button_reply;
          if (buttonReply?.id) {
            const buttonReplyMatch = buttonReply.id.match(/^([0-9a-f-]{36}):(yes|no)$/i);
            if (buttonReplyMatch) {
              const [, actionId, choice] = buttonReplyMatch;
              const applyUrl = `${SUPABASE_URL}/functions/v1/apply-customer-confirm`;
              try {
                const res = await fetch(applyUrl, {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    "x-internal-secret": Deno.env.get("APPLY_CONFIRM_INTERNAL_SECRET") ?? "",
                  },
                  body: JSON.stringify({ booking_action_id: actionId, choice }),
                });
                if (!res.ok) {
                  console.warn(`apply-customer-confirm returned ${res.status}`);
                }
              } catch (err) {
                console.warn("apply-customer-confirm dispatch failed:", err);
              }
              continue; // skip Claude draft for this turn
            }
          }
```

- [ ] **Step 12.2: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 12.3: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts
git commit -m "feat(whatsapp-agent): route Yes/No button replies to apply-customer-confirm"
```

### Task 13: `whatsapp-agent` — emit `confirm_buttons` after autonomous booking_action

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts`

- [ ] **Step 13.1: Add the autonomy check and confirm dispatch**

In the inbound-message loop after `saveBookingAction(...)` ([whatsapp-agent/index.ts:1230](../../../supabase/functions/whatsapp-agent/index.ts:1230)), add:

```ts
          // Autonomous-booking dispatch: when canAutoBook passes and the
          // draft included a booking_action that was saved, send the
          // customer-confirm buttons.
          if (draft.booking_action) {
            const breed = conversation.agent_state?.breed ?? null;
            const dogSize = inferDogSize(breed, draft.booking_action);
            const breedKnown = dogSize !== "unknown" && dogSize !== null;
            const eligible = canAutoBook({
              intent: draft.intent,
              riskLevel,
              confidence: draft.confidence,
              dogSize,
              customerIsKnown: !!conversation.human_id,
              conversationState: conversation.state,
              envFlagEnabled: AI_AUTONOMOUS_BOOKING_ENABLED,
              conversationOptedIn: !!conversation.autonomous_booking_enabled,
              breedKnown,
            });
            if (eligible) {
              await dispatchConfirmButtons(supabase, conversation.id, draftId, draft.booking_action);
            }
          }
```

Add the env constant near the top of the file (alongside `AI_AUTO_SEND_LOW_RISK`):

```ts
const AI_AUTONOMOUS_BOOKING_ENABLED =
  (Deno.env.get("AI_AUTONOMOUS_BOOKING_ENABLED") ?? "false").toLowerCase() === "true";
```

Add the helpers below the existing helpers (above the `serve(...)` block):

```ts
function inferDogSize(
  breed: string | null,
  bookingAction: BookingActionFromClaude,
): "small" | "medium" | "large" | "unknown" | null {
  if (bookingAction.action === "create" && bookingAction.size) return bookingAction.size;
  if (!breed) return null;
  // Mirror src/constants/breeds.ts: lowercase the key for case-insensitive lookup.
  // The edge function can't import from src/, so we inline a minimal lookup —
  // expanded set should be kept in sync. Unknown returns "unknown" so the gate fails.
  const small = ["king charles cavalier","cavalier king charles spaniel","maltese","bichon frise","shih tzu","yorkshire terrier","yorkie","pomeranian","chihuahua","mini dachshund","miniature dachshund","toy poodle","lhasa apso","french bulldog","frenchie","pug","boston terrier","havanese","papillon","italian greyhound","japanese chin","brussels griffon","affenpinscher","miniature pinscher","min pin","chinese crested","pekingese","scottish terrier","scottie","west highland terrier","west highland white terrier","westie","cairn terrier","norfolk terrier","norwich terrier","toy fox terrier","silky terrier","dandie dinmont terrier","english toy terrier"];
  const medium = ["cocker spaniel","cockapoo","spaniel","springer spaniel","english springer spaniel","border collie","bearded collie","standard poodle","poodle","sheltie","shetland sheepdog","whippet","corgi","welsh corgi","pembroke welsh corgi","cardigan welsh corgi","staffordshire bull terrier","staffy","jack russell","jack russell terrier","beagle","basset hound","border terrier","bichon","tibetan terrier","schnauzer","miniature schnauzer","standard schnauzer","keeshond","american eskimo","brittany","wheaten terrier","soft coated wheaten terrier"];
  const large = ["husky","siberian husky","alaskan malamute","labrador","labrador retriever","golden retriever","german shepherd","alsatian","rottweiler","doberman","doberman pinscher","great dane","newfoundland","bernese mountain dog","saint bernard","st bernard","irish setter","english setter","gordon setter","dalmatian","weimaraner","vizsla","rhodesian ridgeback","akita","mastiff","old english sheepdog","bullmastiff","leonberger","greater swiss mountain dog","standard bernedoodle","bernedoodle","goldendoodle","labradoodle"];
  const b = breed.toLowerCase().trim();
  if (small.includes(b)) return "small";
  if (medium.includes(b)) return "medium";
  if (large.includes(b)) return "large";
  return "unknown";
}

async function dispatchConfirmButtons(
  supabase: SupabaseClient,
  conversationId: string,
  draftId: string,
  bookingAction: BookingActionFromClaude,
) {
  // Find the booking action row we just saved
  const { data: actionRow } = await supabase
    .from("whatsapp_booking_actions")
    .select("id, payload")
    .eq("draft_id", draftId)
    .eq("state", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!actionRow) return;

  const summaryText = buildConfirmSummary(bookingAction);
  const actionKind = bookingAction.action === "create" ? "book"
    : bookingAction.action === "reschedule" ? "reschedule"
    : "cancel";

  if (!SEND_INTERNAL_SECRET) {
    console.warn("dispatchConfirmButtons: SEND_INTERNAL_SECRET not set; skipping");
    return;
  }

  try {
    await fetch(WHATSAPP_SEND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": SEND_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        mode: "confirm_buttons",
        conversation_id: conversationId,
        booking_action_id: actionRow.id,
        summary_text: summaryText,
        action_kind: actionKind,
      }),
    });
  } catch (err) {
    console.warn("dispatchConfirmButtons failed:", err);
  }
}

function buildConfirmSummary(action: BookingActionFromClaude): string {
  if (action.action === "create") {
    return `Confirm ${formatDateShort(action.booking_date)} at ${action.slot} — ${serviceLabel(action.service)}?`;
  }
  if (action.action === "reschedule") {
    return `Confirm move to ${formatDateShort(action.new_date)} at ${action.new_slot}?`;
  }
  return `Cancel this booking? (${action.reason.slice(0, 60)})`;
}

function formatDateShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function serviceLabel(s: string): string {
  const map: Record<string, string> = {
    "full-groom": "full groom",
    "bath-and-brush": "bath & brush",
    "bath-and-deshed": "bath & deshed",
    "puppy-groom": "puppy groom",
  };
  return map[s] ?? s;
}
```

Import `canAutoBook` from the shared module at the top of the file (extend the existing import).

- [ ] **Step 13.2: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 13.3: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts
git commit -m "feat(whatsapp-agent): dispatch confirm_buttons when autonomy gates pass"
```

---

## Phase 2 — New-customer onboarding

### Task 14: lead_status state machine + summary-confirm detection

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts`

- [ ] **Step 14.1: Extend `ConversationRow` and the upsert select**

Find `ConversationRow` ([whatsapp-agent/index.ts:369-375](../../../supabase/functions/whatsapp-agent/index.ts:369)) and add fields:

```ts
interface ConversationRow {
  id: string;
  state: string;
  human_id: string | null;
  phone_e164: string;
  auto_send_enabled: boolean;
  autonomous_booking_enabled: boolean;
  agent_state: AgentState;
  lead_status: "collecting" | "awaiting_summary_confirm" | "records_created" | null;
  lead_payload: AgentState | null;
}
```

Extend the upsertConversation select clause ([whatsapp-agent/index.ts:406](../../../supabase/functions/whatsapp-agent/index.ts:406)):

```ts
    .select("id, state, human_id, phone_e164, auto_send_enabled, autonomous_booking_enabled, agent_state, lead_status, lead_payload")
```

And the return mapping ([whatsapp-agent/index.ts:421-429](../../../supabase/functions/whatsapp-agent/index.ts:421)):

```ts
  return {
    id: row.id,
    state: row.state,
    human_id: row.human_id,
    phone_e164: row.phone_e164,
    auto_send_enabled: row.auto_send_enabled === true,
    autonomous_booking_enabled: row.autonomous_booking_enabled === true,
    agent_state: (row.agent_state && typeof row.agent_state === "object"
      ? (row.agent_state as AgentState)
      : {}) as AgentState,
    lead_status: row.lead_status ?? null,
    lead_payload: (row.lead_payload && typeof row.lead_payload === "object"
      ? (row.lead_payload as AgentState)
      : null),
  };
```

- [ ] **Step 14.2: Add a lead_status transition helper**

Add above `serve(...)`:

```ts
const REQUIRED_LEAD_FIELDS: (keyof AgentState)[] = [
  "customerName",
  "customerSurname",
  "dogName",
  "breed",
  "dogAge",
  "coatCondition",
  "preferredDay",
];

function isLeadComplete(payload: AgentState | null): boolean {
  if (!payload) return false;
  for (const key of REQUIRED_LEAD_FIELDS) {
    const value = payload[key];
    if (typeof value !== "string" || !value.trim()) return false;
  }
  return true;
}

// Heuristic: did the customer's latest message signal a positive confirmation
// of the AI's summary? We only trigger record creation on these tokens, so
// false positives are worse than false negatives. Bias toward strict.
const POSITIVE_TOKENS = [
  "yes", "yeah", "yep", "yup", "yeh", "ye",
  "that's right", "thats right", "thats it", "that's it",
  "correct", "perfect", "all good", "sounds good", "sounds right",
  "looks good", "go ahead", "all correct",
];

function isPositiveConfirm(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  return POSITIVE_TOKENS.some((tok) =>
    t === tok || t.startsWith(`${tok} `) || t.startsWith(`${tok}.`) || t.startsWith(`${tok},`),
  );
}
```

- [ ] **Step 14.3: Add the records-creation helper**

```ts
async function createNewCustomerRecords(
  supabase: SupabaseClient,
  conversationId: string,
  phoneE164: string,
  payload: AgentState,
): Promise<{ ok: true; humanId: string; dogId: string } | { ok: false; reason: string }> {
  // Insert humans first
  const notesParts: string[] = [];
  if (payload.coatCondition) notesParts.push(`Coat (at signup): ${payload.coatCondition}`);
  if (payload.preferredDay) notesParts.push(`Preferred day: ${payload.preferredDay}`);

  const { data: humanRow, error: humanErr } = await supabase
    .from("humans")
    .insert({
      name: payload.customerName,
      surname: payload.customerSurname,
      phone: phoneE164,
      notes: notesParts.length > 0 ? notesParts.join(" · ") : null,
      source: "whatsapp_ai",
    })
    .select("id")
    .single();
  if (humanErr || !humanRow) {
    return { ok: false, reason: `humans insert failed: ${humanErr?.message}` };
  }

  // Then dogs
  const dogSize = payload.dogSize ?? "unknown";
  const { data: dogRow, error: dogErr } = await supabase
    .from("dogs")
    .insert({
      human_id: humanRow.id,
      name: payload.dogName,
      breed: payload.breed,
      size: dogSize === "unknown" ? null : dogSize,
      groom_notes: payload.coatCondition ?? null,
      alerts: Array.isArray(payload.alerts) ? payload.alerts : null,
    })
    .select("id")
    .single();
  if (dogErr || !dogRow) {
    return { ok: false, reason: `dogs insert failed: ${dogErr?.message}` };
  }

  // Link the conversation
  await supabase
    .from("whatsapp_conversations")
    .update({ human_id: humanRow.id, lead_status: "records_created" })
    .eq("id", conversationId);

  return { ok: true, humanId: humanRow.id, dogId: dogRow.id };
}
```

- [ ] **Step 14.4: Wire it into the inbound loop**

In the inbound-message loop, after `persistAgentState` ([whatsapp-agent/index.ts:1217](../../../supabase/functions/whatsapp-agent/index.ts:1217)), before `saveDraft`, add:

```ts
          // New-customer state machine:
          //   - When lead_payload becomes complete + breed resolves, transition
          //     to awaiting_summary_confirm so the AI summarises on its next turn.
          //   - When awaiting_summary_confirm and the inbound is a positive
          //     token, create records and transition to records_created.
          if (!conversation.human_id) {
            const mergedPayload = mergeAgentState(
              conversation.lead_payload ?? conversation.agent_state,
              draft.extracted_state ?? {},
            );

            if (
              conversation.lead_status === "awaiting_summary_confirm" &&
              text &&
              isPositiveConfirm(text)
            ) {
              if (isLeadComplete(mergedPayload)) {
                const result = await createNewCustomerRecords(
                  supabase,
                  conversation.id,
                  conversation.phone_e164,
                  mergedPayload,
                );
                if (!result.ok) {
                  console.warn("createNewCustomerRecords failed:", result.reason);
                }
              }
            } else if (
              isLeadComplete(mergedPayload) &&
              conversation.lead_status !== "awaiting_summary_confirm"
            ) {
              await supabase
                .from("whatsapp_conversations")
                .update({
                  lead_status: "awaiting_summary_confirm",
                  lead_payload: mergedPayload,
                })
                .eq("id", conversation.id);
            } else {
              // Still gathering — keep lead_status='collecting' and persist payload progress.
              await supabase
                .from("whatsapp_conversations")
                .update({
                  lead_status: conversation.lead_status ?? "collecting",
                  lead_payload: mergedPayload,
                })
                .eq("id", conversation.id);
            }
          }
```

- [ ] **Step 14.5: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 14.6: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts
git commit -m "feat(whatsapp-agent): new-customer lead state machine + record creation"
```

### Task 15: Post-creation correction path

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts`

- [ ] **Step 15.1: Add the whitelisted-update helper**

Add above `serve(...)`:

```ts
const HUMAN_UPDATE_WHITELIST: (keyof AgentState)[] = ["customerName", "customerSurname"];
const DOG_UPDATE_WHITELIST: (keyof AgentState)[] = ["dogName", "dogAge", "coatCondition"];

async function applyPostCreationCorrections(
  supabase: SupabaseClient,
  humanId: string,
  current: AgentState | null,
  patch: Partial<AgentState>,
): Promise<void> {
  // Only apply if humans.source = 'whatsapp_ai' — this is the AI's own record.
  const { data: human, error: humanErr } = await supabase
    .from("humans")
    .select("id, source, name, surname")
    .eq("id", humanId)
    .single();
  if (humanErr || !human) return;
  if (human.source !== "whatsapp_ai") return;

  const humanUpdate: Record<string, string> = {};
  if (HUMAN_UPDATE_WHITELIST.includes("customerName") && patch.customerName && patch.customerName !== current?.customerName) {
    humanUpdate.name = patch.customerName;
  }
  if (HUMAN_UPDATE_WHITELIST.includes("customerSurname") && patch.customerSurname && patch.customerSurname !== current?.customerSurname) {
    humanUpdate.surname = patch.customerSurname;
  }
  if (Object.keys(humanUpdate).length > 0) {
    await supabase.from("humans").update(humanUpdate).eq("id", humanId);
  }

  // Dogs — find the AI-owned dog(s) for this human and apply the diff
  const { data: dogs } = await supabase
    .from("dogs")
    .select("id, name")
    .eq("human_id", humanId);
  if (!dogs || dogs.length === 0) return;

  // Take the first dog (multi-dog new-customer onboarding is out of scope —
  // see spec section "Out of scope").
  const dogId = dogs[0].id;

  const dogUpdate: Record<string, string | string[] | null> = {};
  if (DOG_UPDATE_WHITELIST.includes("dogName") && patch.dogName && patch.dogName !== current?.dogName) {
    dogUpdate.name = patch.dogName;
  }
  if (DOG_UPDATE_WHITELIST.includes("dogAge") && patch.dogAge && patch.dogAge !== current?.dogAge) {
    // dogs.age is a free-text column in this schema; if it's typed, adjust.
    // Fall back to writing into groom_notes if dogs.age doesn't exist.
    dogUpdate.groom_notes = [current?.coatCondition, patch.dogAge ? `Age: ${patch.dogAge}` : null]
      .filter(Boolean).join(" · ");
  }
  if (patch.alerts && JSON.stringify(patch.alerts) !== JSON.stringify(current?.alerts ?? [])) {
    dogUpdate.alerts = patch.alerts;
  }
  if (Object.keys(dogUpdate).length > 0) {
    await supabase.from("dogs").update(dogUpdate).eq("id", dogId);
  }
}
```

- [ ] **Step 15.2: Call the helper when records exist and a correction patch arrives**

In the inbound-message loop, after `persistAgentState`, add:

```ts
          if (conversation.human_id && draft.extracted_state && conversation.lead_status === "records_created") {
            await applyPostCreationCorrections(
              supabase,
              conversation.human_id,
              conversation.agent_state,
              draft.extracted_state,
            );
          }
```

- [ ] **Step 15.3: Typecheck**

Run: `npm run typecheck`
Expected: pass.

- [ ] **Step 15.4: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts
git commit -m "feat(whatsapp-agent): post-creation correction path for AI-onboarded customers"
```

---

## Phase 3 — Inbox UI surfacing

### Task 16: Surface `lead_status` + `lead_payload` + `autonomous_booking_enabled` in the hook

**Files:**
- Modify: `src/supabase/hooks/useWhatsAppInbox.js`

- [ ] **Step 16.1: Extend the conversation select**

Find the query that loads `whatsapp_conversations` rows in `useWhatsAppInbox.js`. Extend the `.select(...)` clause to include:

```js
"id, phone_e164, human_id, state, last_inbound_at, last_customer_text, unread_count, has_pending_draft, has_pending_booking_action, needs_human_review, auto_send_enabled, autonomous_booking_enabled, lead_status, lead_payload, humans:human_id(name, surname)"
```

(adjust to match the existing pattern in the file — preserve whatever existing fields are there).

- [ ] **Step 16.2: Add a setter for `autonomous_booking_enabled`**

Mirror the existing `setAutoSendEnabled` function. In the same shape:

```js
const setAutonomousBookingEnabled = useCallback(async (enabled) => {
  if (!selectedId) return;
  setActionInFlight(true);
  try {
    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({ autonomous_booking_enabled: !!enabled })
      .eq("id", selectedId);
    if (error) throw error;
  } catch (err) {
    console.error("setAutonomousBookingEnabled failed:", err);
  } finally {
    setActionInFlight(false);
  }
}, [selectedId]);
```

Return it from the hook alongside `setAutoSendEnabled`.

- [ ] **Step 16.3: Run the existing hook tests**

Run: `npm run test -- src/supabase/hooks/useWhatsAppInbox.test.js`
Expected: pass (no behaviour change to tested pure helpers).

- [ ] **Step 16.4: Commit**

```bash
git add src/supabase/hooks/useWhatsAppInbox.js
git commit -m "feat(whatsapp-inbox-hook): surface lead_status + autonomous_booking_enabled"
```

### Task 17: Inbox view — "New customer" badge + autonomous-booking toggle

**Files:**
- Modify: `src/components/views/WhatsAppInboxView.jsx`

- [ ] **Step 17.1: Add the "New customer" badge to `ConversationListItem`**

In `ConversationListItem` ([WhatsAppInboxView.jsx:295](src/components/views/WhatsAppInboxView.jsx)), inside the icon row that already renders `needs_human_review` / `has_pending_draft` / `has_pending_booking_action`, add:

```jsx
          {conv.lead_status === "records_created" && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-sky-100 text-sky-800 border border-sky-200"
              title="New customer onboarded by AI — spot-check before approving the first booking"
              aria-label="New customer onboarded by AI"
            >
              🆕 New
            </span>
          )}
```

- [ ] **Step 17.2: Add the autonomous-booking toggle next to AutoSendToggle**

Locate where `AutoSendToggle` is rendered in the header of the selected conversation (search for `<AutoSendToggle`). Beside it, add a similar toggle:

```jsx
              <AutonomousBookingToggle
                conversation={selectedConversation}
                onChange={setAutonomousBookingEnabled}
                disabled={actionInFlight}
              />
```

And add the component definition above `WhatsAppInboxView` (next to `AutoSendToggle`):

```jsx
function AutonomousBookingToggle({ conversation, onChange, disabled }) {
  if (!conversation) return null;
  const enabled = !!conversation.autonomous_booking_enabled;
  const isDisabled = !!disabled;

  const title = enabled
    ? "Autonomous booking is on for this conversation. AI may write to the diary on customer confirm (also requires AI_AUTONOMOUS_BOOKING_ENABLED=true at function level)."
    : "Autonomous booking is off. AI booking proposals go to the staff approval queue.";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`Autonomous booking ${enabled ? "on" : "off"} for this conversation`}
      onClick={() => onChange(!enabled)}
      disabled={isDisabled}
      title={title}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-bold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-[inherit] ${
        enabled
          ? "bg-sky-100 border-sky-300 text-sky-900 hover:bg-sky-200"
          : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-block w-7 h-4 rounded-full transition-colors ${
          enabled ? "bg-sky-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-3" : "translate-x-0"
          }`}
        />
      </span>
      Auto-book {enabled ? "on" : "off"}
    </button>
  );
}
```

Pull `setAutonomousBookingEnabled` from the `useWhatsAppInbox()` destructure at the top of the main view:

```jsx
const {
  // ...existing destructures...
  setAutonomousBookingEnabled,
  // ...
} = useWhatsAppInbox();
```

- [ ] **Step 17.3: Smoke test in browser**

Run the existing preview workflow:
```bash
npm run dev
```

Open the inbox at `/whatsapp`, select a conversation, and confirm:
- The "Auto-book on/off" toggle renders next to "Auto-send on/off"
- Tapping toggles its visual state (the underlying flag flips in the database)
- A conversation with `lead_status = 'records_created'` shows the "🆕 New" pill in the list

(For a manual seed, run a quick SQL update against a test conversation.)

- [ ] **Step 17.4: Commit**

```bash
git add src/components/views/WhatsAppInboxView.jsx
git commit -m "feat(whatsapp-inbox): new-customer badge + autonomous-booking toggle"
```

---

## Phase 4 — Test coverage + rollout playbook

### Task 18: Static security-review assertions for autonomous flow

**Files:**
- Modify: `src/security/supabaseSecurityReview.test.ts`

- [ ] **Step 18.1: Add assertions for the new edge function**

Add to the existing describe block:

```ts
  it("apply-customer-confirm requires the internal secret and only acts on awaiting_customer_confirm", () => {
    const fn = readProjectFile("supabase/functions/apply-customer-confirm/index.ts");

    expect(fn).toMatch(/timingSafeEqualHeader\(\s*req\.headers\.get\("x-internal-secret"\)/);
    expect(fn).toMatch(/APPLY_CONFIRM_INTERNAL_SECRET/);
    expect(fn).toMatch(/state\s*!==\s*"awaiting_customer_confirm"/);
    expect(fn).toMatch(/customer_confirm_expires_at/);
    // Race protection on create
    expect(fn).toMatch(/isSlotFree\b/);
    // Fall back to pending on apply failure
    expect(fn).toMatch(/state:\s*"pending"/);
  });

  it("whatsapp-agent only calls apply-customer-confirm with shared secret", () => {
    const fn = readProjectFile("supabase/functions/whatsapp-agent/index.ts");

    expect(fn).toMatch(/apply-customer-confirm/);
    expect(fn).toMatch(/x-internal-secret/);
    expect(fn).toMatch(/APPLY_CONFIRM_INTERNAL_SECRET/);
    // canAutoBook gate present before dispatchConfirmButtons
    expect(fn).toMatch(/canAutoBook\(/);
    expect(fn).toMatch(/dispatchConfirmButtons\(/);
  });

  it("whatsapp-send confirm_buttons mode posts Meta interactive buttons and writes message id", () => {
    const fn = readProjectFile("supabase/functions/whatsapp-send/index.ts");

    expect(fn).toMatch(/"confirm_buttons"/);
    expect(fn).toMatch(/type:\s*"interactive"/);
    expect(fn).toMatch(/customer_confirm_message_id/);
    expect(fn).toMatch(/awaiting_customer_confirm/);
  });

  it("AI-onboarded humans are tagged source=whatsapp_ai for the correction path", () => {
    const fn = readProjectFile("supabase/functions/whatsapp-agent/index.ts");

    expect(fn).toMatch(/source:\s*"whatsapp_ai"/);
    expect(fn).toMatch(/applyPostCreationCorrections\b/);
    expect(fn).toMatch(/HUMAN_UPDATE_WHITELIST/);
    expect(fn).toMatch(/DOG_UPDATE_WHITELIST/);
  });
```

- [ ] **Step 18.2: Run the full suite**

Run: `npm run test`
Expected: all green, including the four new assertions.

- [ ] **Step 18.3: Commit**

```bash
git add src/security/supabaseSecurityReview.test.ts
git commit -m "test(security-review): assert autonomous-booking edge functions are gated"
```

### Task 19: Rollout playbook

**Files:**
- Create: `docs/superpowers/runbooks/2026-05-12-whatsapp-autonomous-booking-rollout.md`

- [ ] **Step 19.1: Write the playbook**

```markdown
# WhatsApp autonomous booking — rollout playbook

**Status:** ready to roll out behind flags
**Owner:** Bleep
**Linked spec:** [2026-05-12-whatsapp-ai-autonomous-booking-design.md](../specs/2026-05-12-whatsapp-ai-autonomous-booking-design.md)

## Pre-deploy checklist

- [ ] Migration `20260512140000_whatsapp_autonomous_booking.sql` applied to staging
- [ ] `APPLY_CONFIRM_INTERNAL_SECRET` env var generated (32-char random) and added to: `whatsapp-agent`, `apply-customer-confirm`
- [ ] `apply-customer-confirm` edge function deployed: `supabase functions deploy apply-customer-confirm --no-verify-jwt`
- [ ] `whatsapp-agent` and `whatsapp-send` redeployed with new code
- [ ] `AI_AUTONOMOUS_BOOKING_ENABLED=false` confirmed in env (the kill switch is off by default; we flip it after rollout)
- [ ] Full test suite green: `npm run test`
- [ ] Typecheck green: `npm run typecheck`

## Phase A — single trusted customer

1. Pick one trusted customer (e.g. yourself or a regular who's comfortable being a guinea pig).
2. Log into the inbox at `/whatsapp`, open their conversation.
3. Toggle "Auto-book on" (the new pill next to Auto-send).
4. Globally enable autonomous booking: set env var `AI_AUTONOMOUS_BOOKING_ENABLED=true` on `whatsapp-agent`.
5. From the customer's phone, send a real booking message: *"Can you fit Alfie in for Monday at 9:30?"*
6. Observe:
   - AI proposes the slot in text
   - Customer receives a Meta button: *"Confirm Mon 19 May at 09:30 — full groom for Alfie?"* with [Yes, book it] / [No, change]
   - Tap Yes → booking row appears in the diary with `source='whatsapp_ai_auto'`
   - Acknowledgement text arrives: *"You're booked in ✓ ..."*
7. Verify in `whatsapp_booking_actions`: state transitions pending → awaiting_customer_confirm → confirmed → auto_applied.
8. Run for one week; watch for any anomalies.

## Phase B — small cohort (5-10 customers)

Once Phase A is stable for a week:
1. Pick 5-10 more regulars across different breeds (small and medium only).
2. Flip `autonomous_booking_enabled` for each.
3. Watch for two weeks. Note: large dogs and unknown breeds still defer to staff — that's expected.

## Phase C — broad rollout

Once Phase B is stable:
1. Decide whether to flip `autonomous_booking_enabled` by default for new conversations (a separate migration to change the default would do this).
2. Document the criteria for staff to opt out individual customers if they prefer staff approval.

## Kill switch

If anything goes wrong:

1. Immediate: set `AI_AUTONOMOUS_BOOKING_ENABLED=false` on `whatsapp-agent`. Redeploy. New customer messages will fall back to the existing staff-approval path.
2. To pause one conversation only: toggle "Auto-book off" in the inbox.
3. To rescue a stuck `awaiting_customer_confirm`: `UPDATE whatsapp_booking_actions SET state='pending' WHERE state='awaiting_customer_confirm' AND id=...` — it'll surface in the staff inbox for manual handling.

## Monitoring

- New customers: watch `whatsapp_conversations` for `lead_status='records_created'`. Spot-check the resulting `humans` and `dogs` rows.
- Auto-applied: `SELECT count(*) FROM whatsapp_booking_actions WHERE state='auto_applied' GROUP BY date_trunc('day', applied_at);`
- Failures: `SELECT * FROM whatsapp_booking_actions WHERE state='pending' AND error_message LIKE 'auto_apply_failed:%';`
- Customer-rejected: `SELECT count(*), rejection_reason FROM whatsapp_booking_actions WHERE state='rejected_by_customer' GROUP BY rejection_reason;`
```

- [ ] **Step 19.2: Commit**

```bash
git add docs/superpowers/runbooks/2026-05-12-whatsapp-autonomous-booking-rollout.md
git commit -m "docs(whatsapp-agent): rollout playbook for autonomous booking"
```

---

## Self-review checklist

After all tasks land, verify the following before declaring the feature done:

**Spec coverage:**
- [x] Phone → human matching: unchanged (already worked) → Task references it but doesn't change it
- [x] Memory between turns: extended by Task 5 (new fields in `extracted_state` + `renderAgentStateBlock`)
- [x] Real availability fed into the prompt: unchanged (already worked)
- [x] AI proposes booking_action: extended by Task 4 (reschedule/cancel) and Task 6 (system prompt)
- [x] Staff approval queue: unchanged; new states are additive
- [x] Customer-confirm pipeline: Tasks 7, 8, 9, 12, 13
- [x] Reschedule autonomy: Tasks 10, 13
- [x] Cancel autonomy: Tasks 11, 13
- [x] New-customer onboarding: Tasks 14, 15
- [x] Inbox UI surfacing: Tasks 16, 17
- [x] Schema additions: Task 1
- [x] Static security review: Tasks 2, 18
- [x] Rollout playbook: Task 19

**Placeholder scan:** No TBD/TODO/incomplete sections. Every step contains the actual content to write.

**Type consistency:**
- `canAutoBook(input: CanAutoBookInput): boolean` (Task 3) — called from `whatsapp-agent` (Task 13) with the matching shape ✓
- `BookingActionFromClaude` discriminated union (Task 4) — used by `parseBookingAction`, `buildConfirmSummary`, `dispatchConfirmButtons` ✓
- `AgentState` interface (Task 5) — used by `parseExtractedState`, `mergeAgentState`, `renderAgentStateBlock`, `createNewCustomerRecords`, `applyPostCreationCorrections` ✓
- `apply_whatsapp_booking_action` SQL function signature (Task 1) — called from `apply-customer-confirm` create branch (Task 9) ✓
