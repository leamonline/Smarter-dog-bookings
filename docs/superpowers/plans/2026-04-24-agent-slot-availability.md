# WhatsApp Agent Slot Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the WhatsApp AI agent enough real slot availability to propose a genuinely bookable slot for small/medium dogs, so the existing staff-approval booking flow actually fires.

**Architecture:** New read-only SQL RPC `get_small_medium_availability(from, to)` backed by the existing `active_slots()` / `get_seats_needed()` helpers from migration 006. Edge function `whatsapp-agent` calls it once per inbound message and injects a `--- Availability ---` block into Claude's context. System prompt gains two rules to use it.

**Tech Stack:** PostgreSQL (PL/pgSQL), Supabase Edge Functions (Deno + TypeScript), Anthropic Claude API.

**Spec:** [docs/superpowers/specs/2026-04-24-whatsapp-agent-availability-design.md](docs/superpowers/specs/2026-04-24-whatsapp-agent-availability-design.md)

**Branch:** `feat/agent-slot-availability` (already created, spec already committed)

**Supabase project:** `nlzhllhkigmsvrzduefz` (`Smarter-dog-grooming`)

---

## File Map

- **Create:** `supabase/migrations/034_whatsapp_agent_availability.sql` — defines the RPC
- **Modify:** `supabase/functions/whatsapp-agent/index.ts`
  - Add helper `buildAvailabilityBlock(supabase, today)` near `buildContext` (~line 370)
  - Wire it into `buildContext` after the Upcoming-bookings block (~line 452)
  - Replace the "NEVER invent appointment slots" rule (line 207)
  - Add a new rule about booking_action behaviour for small/medium vs large dogs (around line 202-207)
- **Plan itself:** `docs/superpowers/plans/2026-04-24-agent-slot-availability.md`

---

## Testing approach

The repo has no automated test framework for Supabase edge functions (Deno) and none for SQL RPCs. The plan uses two substitutes:

- **SQL:** every RPC change is followed by an `execute_sql` verification query against prod. Expected output is specified per task.
- **Edge function:** after deploy, a manual smoke test with a known test WhatsApp contact.

This matches the spec's Testing section explicitly.

---

## Task 1: Create and apply migration 034

**Files:**
- Create: `supabase/migrations/034_whatsapp_agent_availability.sql`

- [ ] **Step 1.1: Write the migration file**

Create `supabase/migrations/034_whatsapp_agent_availability.sql` with this exact content:

```sql
-- 034_whatsapp_agent_availability.sql
--
-- Read-only RPC used by the WhatsApp AI agent to cite real slots when
-- proposing booking_action for small/medium dogs. Deliberately ignores
-- the 2-2-1 rule and all large-dog capacity logic — the 006 trigger is
-- the safety net, and staff approves every booking. See the spec at
-- docs/superpowers/specs/2026-04-24-whatsapp-agent-availability-design.md

create or replace function get_small_medium_availability(
  p_from date,
  p_to   date
)
returns table (booking_date date, slot text)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select d::date as d
      from generate_series(p_from, p_to, interval '1 day') as g(d)
  ),
  open_days as (
    select d.d as day_date
      from days d
      left join day_settings ds on ds.setting_date = d.d
     where coalesce(
             ds.is_open,
             extract(isodow from d.d) in (1, 2, 3)  -- Mon=1, Tue=2, Wed=3
           ) = true
  ),
  slot_grid as (
    select od.day_date, s.slot
      from open_days od
      cross join unnest(active_slots()) as s(slot)
  ),
  usage as (
    select sg.day_date, sg.slot,
           coalesce(
             (select sum(get_seats_needed(b.size, b.slot))
                from bookings b
               where b.booking_date = sg.day_date
                 and b.slot = sg.slot),
             0
           ) as seats_used
      from slot_grid sg
  )
  select day_date, slot
    from usage
   where seats_used < 2
   order by day_date, slot;
$$;

comment on function get_small_medium_availability(date, date) is
  'Returns (date, slot) pairs that are bookable for a small or medium dog in the given date range. Excludes the 2-2-1 rule and all large-dog capacity logic by design — staff approval is the safety net for edge cases.';

revoke all on function get_small_medium_availability(date, date) from public;
grant execute on function get_small_medium_availability(date, date) to authenticated, service_role;

-- Rollback:
--   drop function if exists get_small_medium_availability(date, date);
```

- [ ] **Step 1.2: Apply the migration to prod via MCP**

Use the Supabase MCP tool `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__apply_migration` with:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `name`: `034_whatsapp_agent_availability`
- `query`: the full SQL content from Step 1.1 (above)

Expected: `{"success": true}`

- [ ] **Step 1.3: Verify the function exists and returns sensible output**

Use `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__execute_sql` with:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `query`:
```sql
select booking_date, array_agg(slot order by slot) as slots
from get_small_medium_availability(current_date, current_date + 14)
group by booking_date
order by booking_date
limit 10;
```

Expected output: rows for the next up-to-10 open days. Each row has a `booking_date` (a Monday, Tuesday, or Wednesday, unless day_settings overrides) and a `slots` array drawn from `active_slots()` that aren't full. If prod has zero open days in the next 14 days (unlikely), result is empty.

Sanity check on one row: pick a returned `(date, slot)` and confirm in the dashboard's Weekly Calendar view that the slot exists and isn't double-booked.

- [ ] **Step 1.4: Commit**

```bash
git add supabase/migrations/034_whatsapp_agent_availability.sql
git commit -m "$(cat <<'EOF'
feat(db): add get_small_medium_availability RPC for WhatsApp agent

Read-only helper that returns bookable (date, slot) pairs for small/medium
dogs in a given date range. Reuses active_slots() and get_seats_needed()
from 006 so canonical slot list and seat-cost table stay single-sourced.
Deliberately excludes 2-2-1 and large-dog capacity logic — the 006
trigger remains the safety net, and staff approves every booking.

Applied to prod.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `buildAvailabilityBlock` helper and wire into `buildContext`

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts`

- [ ] **Step 2.1: Add the helper function**

In `supabase/functions/whatsapp-agent/index.ts`, insert this block **immediately before** the existing `async function buildContext(` declaration (around line 373):

```typescript
// ── Availability block ───────────────────────────────────────
// Queries get_small_medium_availability (migration 034) and formats
// the result as a prompt section. See the spec at
// docs/superpowers/specs/2026-04-24-whatsapp-agent-availability-design.md
//
// Format example:
//   --- Availability (next 30 days, small/medium dogs only) ---
//   Mon 27 Apr: 08:30 09:00 10:30 11:00 12:30
//   Tue 28 Apr: (all open)
//   Wed 29 Apr: 09:00 10:30
//   Mon 04 May: (closed)
//
// - "(all open)" when all 10 slots in active_slots() are free
// - "(closed)" only for default-open days (Mon/Tue/Wed) where
//   day_settings marks them closed; other closed days are omitted.
// - On error, returns a block that tells the agent to defer to staff.
const ACTIVE_SLOT_COUNT = 10; // matches active_slots() from migration 006
const AVAILABILITY_WINDOW_DAYS = 30;

function isDefaultOpenDay(isoDate: string): boolean {
  // isoDate = "YYYY-MM-DD"; getUTCDay: Sun=0, Mon=1, ..., Sat=6
  const dow = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return dow === 1 || dow === 2 || dow === 3;
}

function formatShortDate(isoDate: string): string {
  // "Mon 27 Apr" — matches the UK audience's natural reading
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

async function buildAvailabilityBlock(
  supabase: SupabaseClient,
  todayIso: string,
): Promise<string> {
  const toIso = new Date(Date.now() + AVAILABILITY_WINDOW_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase.rpc("get_small_medium_availability", {
    p_from: todayIso,
    p_to: toIso,
  });

  if (error) {
    console.warn("buildAvailabilityBlock RPC error:", error.message);
    return `--- Availability ---\n(unavailable — tell the customer the team will check the diary)`;
  }

  // Group slots by date
  const byDate = new Map<string, string[]>();
  for (const row of (data ?? []) as Array<{ booking_date: string; slot: string }>) {
    const list = byDate.get(row.booking_date) ?? [];
    list.push(row.slot);
    byDate.set(row.booking_date, list);
  }

  // Walk every day in the window so we can render "(closed)" for default-open days
  const lines: string[] = [];
  for (let offset = 0; offset <= AVAILABILITY_WINDOW_DAYS; offset++) {
    const d = new Date(Date.now() + offset * 24 * 3600 * 1000);
    const iso = d.toISOString().slice(0, 10);
    const slots = byDate.get(iso);

    if (slots && slots.length > 0) {
      const label = formatShortDate(iso);
      const slotList = slots.length >= ACTIVE_SLOT_COUNT
        ? "(all open)"
        : slots.join(" ");
      lines.push(`${label}: ${slotList}`);
      continue;
    }

    // No slots returned → either closed or fully booked.
    // Only annotate "(closed)" for default-open days; otherwise skip as noise.
    if (isDefaultOpenDay(iso)) {
      const label = formatShortDate(iso);
      lines.push(`${label}: (closed)`);
    }
  }

  const header = `--- Availability (next ${AVAILABILITY_WINDOW_DAYS} days, small/medium dogs only) ---`;
  if (lines.length === 0) {
    return `${header}\n(no open days in the next ${AVAILABILITY_WINDOW_DAYS} days — tell the customer the team will check the diary)`;
  }
  return `${header}\n${lines.join("\n")}`;
}
```

- [ ] **Step 2.2: Call the helper from `buildContext`**

In the same file, inside `buildContext`, find the block (currently around line 450):

```typescript
    if (bookings?.length) {
      const bookingLines = bookings.map((b: any) =>
        `  - ${b.dogs?.name ?? "?"}: ${b.booking_date} at ${b.slot} — ${b.service}${
          b.confirmed ? " (confirmed)" : " (unconfirmed)"
        }`
      ).join("\n");
      parts.push(`--- Upcoming bookings (next 14 days) ---\n${bookingLines}`);
    } else {
      parts.push(`--- Upcoming bookings ---\n(none in next 14 days)`);
    }
  } else {
    parts.push(`--- Customer ---\nUnknown (phone not matched to any existing customer record). Do NOT address by name.`);
  }

  return parts.join("\n\n");
```

Insert the availability block immediately after the `} else {` block that closes the `if (humanId)` — i.e. after the "Unknown customer" branch, but before `return parts.join("\n\n");`. The final shape should be:

```typescript
    if (bookings?.length) {
      const bookingLines = bookings.map((b: any) =>
        `  - ${b.dogs?.name ?? "?"}: ${b.booking_date} at ${b.slot} — ${b.service}${
          b.confirmed ? " (confirmed)" : " (unconfirmed)"
        }`
      ).join("\n");
      parts.push(`--- Upcoming bookings (next 14 days) ---\n${bookingLines}`);
    } else {
      parts.push(`--- Upcoming bookings ---\n(none in next 14 days)`);
    }
  } else {
    parts.push(`--- Customer ---\nUnknown (phone not matched to any existing customer record). Do NOT address by name.`);
  }

  // Availability applies whether or not the customer is matched — the agent
  // might still propose a slot for a matched dog attached to a different
  // conversation, and unmatched customers will see it via staff approval anyway.
  parts.push(await buildAvailabilityBlock(supabase, todayIso));

  return parts.join("\n\n");
```

- [ ] **Step 2.3: Verify the file compiles (Deno type-check)**

Run:
```bash
cd supabase/functions/whatsapp-agent && deno check index.ts
```

Expected: no type errors. If `deno` is not installed, skip this step — the MCP deploy in Task 4 will surface any issues.

- [ ] **Step 2.4: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts
git commit -m "$(cat <<'EOF'
feat(whatsapp-agent): inject small/medium availability into prompt context

New buildAvailabilityBlock helper calls get_small_medium_availability
and formats the result as an --- Availability --- section appended to
every prompt. 30-day window. Groups slots per day, renders "(all open)"
for fully-free days and "(closed)" for default-open days that have
been marked closed in day_settings; other closed days are omitted.

On RPC error, emits a graceful "unavailable — defer to staff" message
so the agent falls back to the existing holding-reply flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Update system prompt rules

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts` (the `SYSTEM_PROMPT` const's `HARD RULES` block, currently line 207)

- [ ] **Step 3.1: Replace the "NEVER invent appointment slots" line**

In `supabase/functions/whatsapp-agent/index.ts`, find this line (currently line 207):

```
- NEVER invent appointment slots beyond what's in the context you've been given. If the context doesn't list availability, don't make up times — say "let me just check the diary and come back to you".
```

Replace with:

```
- NEVER invent appointment slots. If the "--- Availability ---" block is present, you may only cite dates and times from that block. If it's missing, empty, or says "unavailable", say "let me just check the diary and come back to you".
```

- [ ] **Step 3.2: Add a new rule about size-gated booking_action**

In the same file, find the existing booking_action rules block (currently lines 201-207) that starts:

```
- NEVER directly confirm, move, or cancel a booking in the text. Staff approves every action before it reaches the diary.
- You MAY propose a new booking action only when all of these are explicit or safely resolved from context: exact dog_id, exact YYYY-MM-DD booking_date, exact slot, and service ID. Use only dog IDs shown in context.
```

Add this new bullet as the line **immediately after** the "You MAY propose a new booking action..." line:

```
- For booking_action proposals: if the dog's size is "small" or "medium", the booking_date + slot you cite MUST appear in the "--- Availability ---" block. If the dog's size is "large" (or unknown), do NOT propose a booking_action regardless of availability — say "the team will check the diary".
```

- [ ] **Step 3.3: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts
git commit -m "$(cat <<'EOF'
feat(whatsapp-agent): add availability-aware hard rules to system prompt

Agent is now told to cite slots from --- Availability --- (not invent
them) and to gate booking_action proposals on dog size — small/medium
may propose with a slot from the block, large defers to staff regardless.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Deploy and smoke test

**Files:**
- Deploy: `supabase/functions/whatsapp-agent/index.ts` to prod Supabase

- [ ] **Step 4.1: Deploy the edge function via MCP**

Load the deploy tool if needed:
```
ToolSearch: select:mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__deploy_edge_function
```

Then invoke with:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `name`: `whatsapp-agent`
- `files`: the full content of `supabase/functions/whatsapp-agent/index.ts`

Expected: successful deploy response. Manually deploying rather than waiting for CI because we're still on a feature branch; CI deploys on merge to main.

- [ ] **Step 4.2: Check the deploy logs for startup errors**

Use `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__get_logs` with:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `service`: `edge-function`

Scan for any startup errors from `whatsapp-agent`. Expected: none.

- [ ] **Step 4.3: Manual smoke test — small-dog booking proposal**

Via WhatsApp, send to the salon's test number (or from a known test contact if set up):

> "Hi! Can I book my Boston Terrier in for a full groom? Soonest available please."

Wait ~5 seconds. Expected observations:

1. The agent's draft reply arrives in the staff inbox (`/whatsapp` in the app).
2. **A green "Booking proposal" panel appears under the draft** with a specific date and time.
3. The date + slot shown in the panel is one that appeared in the Availability RPC output from Step 1.3 (i.e. a real bookable slot).
4. Click Apply. Expected: booking appears in the Weekly Calendar with `status = 'Booked'`, and the booking_action row in `whatsapp_booking_actions` flips to `state='applied'`.

- [ ] **Step 4.4: Manual smoke test — large-dog behaviour unchanged**

Send:

> "Hi — can I book my Husky in for a deshed? What's the soonest?"

Expected:

1. The agent's draft reply arrives in the staff inbox.
2. **No booking-proposal panel appears** — the agent should have deferred to staff per the new size-gated rule.
3. The reply text mentions the team will check the diary (or similar holding language).

- [ ] **Step 4.5: Commit any deploy-surfaced fixes**

If Steps 4.1–4.4 surface bugs, fix them, redeploy via 4.1, and re-run the smoke tests. Commit each fix:

```bash
git add <path>
git commit -m "fix(whatsapp-agent): <what the smoke test revealed>"
```

If no fixes needed, skip this step.

- [ ] **Step 4.6: Push the branch and open a PR**

```bash
git push -u origin feat/agent-slot-availability
gh pr create --title "feat(whatsapp-agent): slot availability awareness for small/medium dogs" --body "$(cat <<'EOF'
## Summary

Gives the WhatsApp AI agent enough real availability signal to propose
a concrete, bookable slot for small/medium dogs via the existing
whatsapp_booking_actions approval flow. Large-dog behaviour is unchanged
(agent defers to staff).

- New RPC: get_small_medium_availability(date, date) — reuses active_slots()
  and get_seats_needed() from 006. Already applied to prod.
- whatsapp-agent edge function now queries the RPC and appends an
  --- Availability (next 30 days, small/medium dogs only) --- block.
  Already deployed to prod via MCP.
- System prompt updated with two rules gating booking_action on dog
  size and availability.

Spec: docs/superpowers/specs/2026-04-24-whatsapp-agent-availability-design.md
Plan: docs/superpowers/plans/2026-04-24-agent-slot-availability.md

## Test plan

- [x] Migration applied + verified output (Task 1)
- [x] Edge function deployed + logs clean (Task 4 Steps 1-2)
- [x] Small-dog test produced a booking-proposal panel with a real slot (Task 4 Step 3)
- [x] Large-dog test did NOT produce a proposal (Task 4 Step 4)
- [ ] Monitor next ~5 inbound messages in prod for regressions

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

### Spec coverage
- RPC with exact signature: Task 1.1 ✓
- Reuses `active_slots()` + `get_seats_needed()`: Task 1.1 ✓
- `day_settings.is_open` override + Mon/Tue/Wed default: Task 1.1 ✓
- 30-day window: Task 2.1 constant + Task 2.2 call ✓
- `--- Availability ---` section format, with "(all open)" / "(closed)" rules: Task 2.1 ✓
- RPC error handling: Task 2.1 `buildAvailabilityBlock` catches + returns "unavailable" message ✓
- System prompt: replace + add rules: Task 3.1 + 3.2 ✓
- Large-dog behaviour unchanged: Task 3.2 ✓
- No 006 trigger changes: confirmed — only migration 034 is new ✓
- No caching / extra_slots handling: confirmed — not in plan ✓
- Spec Testing section covered: SQL verification in Task 1.3, small/large manual tests in Task 4.3–4.4 ✓

### Placeholder scan
No "TBD", "TODO", or "similar to Task N" references. All code blocks are complete.

### Type consistency
- RPC signature `get_small_medium_availability(date, date)` used identically in migration (Task 1.1) and client call (Task 2.1 via `supabase.rpc(...)`).
- `buildAvailabilityBlock(supabase, todayIso)` defined in Task 2.1 with `SupabaseClient` + `string`, called in Task 2.2 with `supabase` (same type from `buildContext`'s param) + `todayIso` (the `const todayIso` already in scope).
- Return type `Promise<string>` — `parts.push(await buildAvailabilityBlock(...))` matches.
