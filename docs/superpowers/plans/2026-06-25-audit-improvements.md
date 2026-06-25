# Audit Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the nine improvements from the 2026-06-24 onboarding audit — close the confirmed WhatsApp-Flow capacity gap, centralise the daily cap, refresh stale docs, harden the customer write path, surface hidden agent failures, stand up executable DB tests, audit live prod grants, and pay down realtime/facade debt.

**Architecture:** Three sequenced waves of increasing risk and effort. Wave 1 is pure code + docs (no DB, no RLS). Wave 2 adds one hand-applied migration and one dashboard card. Wave 3 is the large correctness/security work (a local-DB test harness, a prod grant audit, and debt paydown) — each Wave-3 task is a spike with a concrete first slice and an enumerated remainder that should graduate to its own plan when started.

**Tech Stack:** React 19 + Vite 7, TypeScript engine / JSX UI, Supabase (Postgres + RLS + Deno Edge Functions), Vitest (logic + component projects), Playwright (offline E2E), Supabase CLI (`supabase start` / `supabase test db`) for the new DB harness.

## Global Constraints

Copy these verbatim into every task's mental checklist — they are project-wide and load-bearing:

- **UK English** in all copy, comments, and docs (colour, organise, behaviour).
- **Work on a branch off `main`.** `main` auto-deploys to Vercel production and auto-deploys changed Edge Functions. Never push untested work there.
- **Migrations are applied to prod BY HAND, and must be applied BEFORE merging code that depends on them.** Merging deploys frontend + edge functions but NOT the database. Keep every migration **idempotent** (create-if-not-exists / create-or-replace / guarded publication adds). Never `db push` or blind-rerun.
- **The capacity engine exists THREE times and must stay in sync:** `src/engine/capacity.ts` (frontend), `supabase/functions/_shared/capacity.ts` (Deno mirror), and the Postgres trigger `validate_booking_capacity()` whose **live body is in [supabase/migrations/20260622100000_daily_dog_cap.sql](../../../supabase/migrations/20260622100000_daily_dog_cap.sql)** (NOT the original `20260331083432_capacity_trigger.sql`, which is superseded). Change one rule → change all three.
- **High-risk changes must be explained before coding:** RLS policies, auth, the capacity/booking-conflict engine + its DB trigger, and the booking write-path RPCs. Wave 2 Task 2.1 and all of Wave 3 are in this category.
- **The CI bar is `lint → typecheck → check-migrations → test → build`** (`.github/workflows/ci.yml`). Run `npm run test` (both Vitest projects), not just `npm run build`, before pushing. Two `tsc` passes run (`tsc --noEmit && tsc -p tsconfig.node-tests.json`).
- **Never** put a secret behind a `VITE_` prefix; never commit `.env*` or the service-role key.
- **No bare `console`** in `src/` (use `src/lib/logger.ts`); **no `.js`/`.jsx` extension** on a relative import whose target is `.ts`/`.tsx` (the import-extension check fails lint).
- **Edge Functions are Deno** — they cannot import frontend `src/` modules, which is why `_shared/capacity.ts` and `_shared/salonConstants.ts` are hand-mirrors. A "shared constant" therefore means one value per module tree (frontend + Deno), kept in lockstep by the parity test — not a single importable file.
- Commit messages use conventional-commit style with a scope, e.g. `fix(capacity): …`, `docs(audit): …`.

---

## File Structure

**Wave 1 — capacity parity, constant, docs (no migration):**
- Modify `src/constants/salon.ts` — add `DAILY_DOG_CAP`.
- Modify `src/constants/index.ts` — re-export `DAILY_DOG_CAP`.
- Modify `src/engine/utilisation.ts` — `DAY_CAPACITY` sources `DAILY_DOG_CAP`.
- Modify `src/engine/capacity.ts` — `findGroupedSlots` default sources `DAILY_DOG_CAP`.
- Modify `src/constants/salonSettings.ts` — `dailyDogCap` sources `DAILY_DOG_CAP`.
- Modify `supabase/functions/_shared/salonConstants.ts` — add mirrored `DAILY_DOG_CAP`.
- Modify `supabase/functions/_shared/capacity.ts` — add `dailyDogCap` param + day-total guard to `findGroupedSlots`.
- Modify `src/lib/whatsapp/capacityParity.test.ts` — near-full-day + daily-cap parity cases.
- Modify `docs/capacity-engine.md`, `docs/whatsapp-agent.md`, `CLAUDE.md`, `DESIGN.md`, `LAUNCH_PLAN.md` — doc fixes/annotations.

**Wave 2 — customer write hardening + agent-failure visibility:**
- Create `supabase/migrations/20260625090000_create_customer_dog_rpc.sql` — ownership-validating dog INSERT.
- Modify `src/supabase/rpc.ts` — `createCustomerDog` wrapper.
- Modify `src/supabase/repositories/dogsRepo.ts` — `createForHuman` write helper.
- Modify `src/components/customer/booking/AddDogInline.tsx` — call the RPC, not a raw INSERT.
- Create `src/supabase/hooks/useAgentFailures.js` — singleton hook over `whatsapp_events`.
- Create `src/components/dashboard/AgentFailuresCard.jsx` — dashboard card.
- Modify `src/components/dashboard/RightWorkflowSidebar.jsx` — mount the card.

**Wave 3 — DB tests, prod audit, debt paydown:**
- Create `supabase/tests/` (pgTAP) — first test `pregnancy_gate.test.sql`.
- Modify `package.json` — `test:db` script.
- Create `scripts/prod-grant-audit.sql` — read-only prod grant/policy audit.
- Create `src/supabase/realtimeChannels.ts` — centralised channel names.
- Modify the fixed-name realtime hooks to consume it.

---

## WAVE 1 — Capacity parity + daily-cap constant + docs

*Low risk, no migration, no RLS. The one confirmed customer-facing bug (WhatsApp Flow offering a 15th-dog slot) is fixed in Task 1.2.*

### Task 1.1: Centralise the daily-dog cap constant (frontend)

**Why:** The number `14` is hard-declared in four places (`capacity.ts` default arg, `utilisation.ts` `DAY_CAPACITY`, `salonSettings.ts` `dailyDogCap`, and the DB). Collapse the three frontend copies to one named constant so they can't drift.

**Files:**
- Modify: `src/constants/salon.ts` (after `MAX_DOGS_PER_SLOT`, line 7)
- Modify: `src/constants/index.ts:2-16`
- Modify: `src/engine/utilisation.ts:1,12`
- Modify: `src/engine/capacity.ts:1` and the `findGroupedSlots` signature (line 564)
- Modify: `src/constants/salonSettings.ts:1,120`
- Test: `src/engine/utilisation.test.js` (add one assertion)

**Interfaces:**
- Produces: `DAILY_DOG_CAP: number` (= 14), exported from `src/constants/salon.ts` and re-exported via `src/constants/index.ts`. Consumed by `utilisation.ts`, `capacity.ts`, `salonSettings.ts`.

- [ ] **Step 1: Write the failing test**

Add to `src/engine/utilisation.test.js` (top-level, inside the existing file):

```js
import { DAILY_DOG_CAP } from "../constants/salon";
import { DAY_CAPACITY } from "./utilisation";

it("DAY_CAPACITY is sourced from the single DAILY_DOG_CAP constant", () => {
  expect(DAY_CAPACITY).toBe(DAILY_DOG_CAP);
  expect(DAILY_DOG_CAP).toBe(14);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:logic -- src/engine/utilisation.test.js`
Expected: FAIL — `DAILY_DOG_CAP` is not exported yet (`undefined`).

- [ ] **Step 3: Add the constant to `src/constants/salon.ts`**

Insert directly after line 7 (`export const MAX_DOGS_PER_SLOT = 5;`):

```ts
/** Maximum dogs the salon will groom in one day (a throughput cap, separate
 *  from per-slot seats). Mirrored in supabase/functions/_shared/salonConstants.ts
 *  (Deno) and in salon_config.daily_dog_cap (DB, authoritative). Change all
 *  three together — the capacityParity test guards the TS pair. */
export const DAILY_DOG_CAP = 14;
```

- [ ] **Step 4: Re-export it from `src/constants/index.ts`**

Add `DAILY_DOG_CAP,` to the export block from `./salon` (between `MAX_DOGS_PER_SLOT,` line 4 and `SERVICES,`):

```ts
  SALON_SLOTS,
  MAX_DOGS_PER_SLOT,
  DAILY_DOG_CAP,
  SERVICES,
```

- [ ] **Step 5: Source `DAY_CAPACITY` from it in `src/engine/utilisation.ts`**

Change line 1 import and line 12:

```ts
import { SALON_SLOTS, DAILY_DOG_CAP } from "../constants/index";
```
```ts
export const DAY_CAPACITY = DAILY_DOG_CAP;
```

- [ ] **Step 6: Source the `findGroupedSlots` default in `src/engine/capacity.ts`**

Change line 1 import:

```ts
import { LARGE_DOG_SLOTS, BOOKING_STATUS, DOG_SIZE, DAILY_DOG_CAP } from "../constants/index";
```

Change the `findGroupedSlots` signature (line 564) from `dailyDogCap = 14,` to:

```ts
  dailyDogCap = DAILY_DOG_CAP,
```

- [ ] **Step 7: Source `dailyDogCap` in `src/constants/salonSettings.ts`**

Change line 1 import and line 120:

```ts
import { LARGE_DOG_SLOTS, PRICING, SERVICES, DAILY_DOG_CAP } from "./salon";
```
```ts
    dailyDogCap: DAILY_DOG_CAP,
```

- [ ] **Step 8: Run the test + typecheck to verify green**

Run: `npm run test:logic -- src/engine/utilisation.test.js && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/constants/salon.ts src/constants/index.ts src/engine/utilisation.ts src/engine/capacity.ts src/constants/salonSettings.ts src/engine/utilisation.test.js
git commit -m "refactor(capacity): centralise the daily-dog cap into DAILY_DOG_CAP"
```

---

### Task 1.2: Close the daily-cap gap in the Deno capacity mirror

**Why:** This is the one **confirmed customer-facing bug** from the audit. The WhatsApp booking Flow runs the Deno mirror `supabase/functions/_shared/capacity.ts`, whose `findGroupedSlots` has **no** daily-cap parameter or day-total guard (frontend has both). So the Flow offers a drop-off that pushes a day past 14 dogs; the DB trigger then rejects the insert with "Day is fully booked" — the customer was told a slot was free, then bounced. Fix: mirror the frontend guard.

**Files:**
- Modify: `supabase/functions/_shared/salonConstants.ts` (add `DAILY_DOG_CAP`)
- Modify: `supabase/functions/_shared/capacity.ts:560-568` (`findGroupedSlots`)
- Verify (no change expected): `supabase/functions/_shared/flowBooking.ts:329` passes this day's non-cancelled bookings.
- Test: `src/lib/whatsapp/capacityParity.test.ts` (covered in Task 1.3)

**Interfaces:**
- Consumes: `DAILY_DOG_CAP` (mirrored value in the Deno tree).
- Produces: `findGroupedSlots(dogs, bookings, activeSlots, dailyDogCap = DAILY_DOG_CAP)` in the Deno mirror — signature and day-total behaviour now match `src/engine/capacity.ts`.

- [ ] **Step 1: Add the mirrored constant to `supabase/functions/_shared/salonConstants.ts`**

Insert after the `SALON_SLOTS` block (after line 21):

```ts
// Maximum dogs the salon will groom in one day — MIRRORS DAILY_DOG_CAP in
// src/constants/salon.ts and salon_config.daily_dog_cap (DB, authoritative).
// The capacityParity test asserts this Deno mirror and the frontend engine
// agree on a near-full day.
export const DAILY_DOG_CAP = 14;
```

- [ ] **Step 2: Import it and add the guard in `supabase/functions/_shared/capacity.ts`**

Add `DAILY_DOG_CAP,` to the import from `./salonConstants.ts` (line 23-29 block):

```ts
import {
  LARGE_DOG_SLOTS,
  BOOKING_STATUS,
  DOG_SIZE,
  DAILY_DOG_CAP,
  type DogSize,
  type LargeDogSlotRule,
} from "./salonConstants.ts";
```

Change the `findGroupedSlots` signature (lines 560-564) to add the 4th param, and insert the day-total guard immediately after the `count === 0 || count > 4` check (after line 568):

```ts
export function findGroupedSlots(
  dogs: Array<{ id: string; size: DogSize }>,
  bookings: Booking[],
  activeSlots: string[],
  dailyDogCap = DAILY_DOG_CAP,
): SlotAllocation[] {
  const count = dogs.length;

  // Out of range
  if (count === 0 || count > 4) return [];

  // Day-total cap — MIRRORS src/engine/capacity.ts. The per-slot 2-2-1 rules
  // only limit seats *within a slot*; without this guard a near-empty slot on
  // an otherwise-full day is still offered, letting the WhatsApp Flow propose a
  // drop-off the DB trigger (salon_config.daily_dog_cap) then rejects. The
  // whole group must fit (atomic). `bookings` is this day's non-cancelled
  // occupancy, one row per dog.
  if (bookings.length + count > dailyDogCap) return [];

  const results: SlotAllocation[] = [];
```

- [ ] **Step 3: Confirm the Flow caller feeds non-cancelled occupancy (read-only verification)**

Run: `grep -n "getBookingsForDate" supabase/functions/whatsapp-flow-endpoint/db.ts supabase/functions/_shared/flowBooking.ts`
Expected: `flowBooking.ts:329` calls `findGroupedSlots(dogs, existing, ...)` where `existing = await db.getBookingsForDate(dateStr)`, and `db.ts`'s `getBookingsForDate` applies `.neq("status", "Cancelled")`. No code change needed — the default `dailyDogCap` now activates the guard automatically. Note this in the commit body.

- [ ] **Step 4: Run the Deno agent tests to confirm nothing broke**

Run: `deno test --node-modules-dir=none --allow-env supabase/functions/whatsapp-agent/__tests__/`
Expected: PASS (this suite doesn't cover the Flow, but confirms the shared module still imports cleanly under Deno).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/salonConstants.ts supabase/functions/_shared/capacity.ts
git commit -m "fix(capacity): enforce the daily-dog cap in the Deno mirror so the WhatsApp Flow can't offer a slot the DB rejects"
```

---

### Task 1.3: Close the parity-test blind spot

**Why:** `capacityParity.test.ts` compares frontend vs Deno `findGroupedSlots` but never on a near-full day (its 5 cases use 0–2 existing bookings), so it could not have caught the Task 1.2 gap. Add a near-full-day case and an explicit daily-cap case. Run this test against the *pre-Task-1.2* Deno code mentally: it would FAIL — that's the proof the new case guards the right thing.

**Files:**
- Modify: `src/lib/whatsapp/capacityParity.test.ts` (add 2 `it` cases + an optional cap arg to `bothAgree`)

- [ ] **Step 1: Add a cap-aware helper + two cases**

In `src/lib/whatsapp/capacityParity.test.ts`, change `bothAgree` (lines 25-29) to accept a list of bookings of any length (it already does) and add these two cases inside the `describe` block (before the closing `});` at line 69):

```ts
  it("a full day (14 existing) offers nothing to a new dog — both engines agree", () => {
    // 14 small dogs already in, spread legally across the grid: any further
    // dog would breach the daily cap, so both engines must return [].
    const existing = [
      { slot: "08:30", size: "small" }, { slot: "08:30", size: "small" },
      { slot: "09:30", size: "small" }, { slot: "09:30", size: "small" },
      { slot: "10:30", size: "small" }, { slot: "10:30", size: "small" },
      { slot: "11:30", size: "small" }, { slot: "11:30", size: "small" },
      { slot: "12:30", size: "small" }, { slot: "12:30", size: "small" },
      { slot: "13:00", size: "small" }, { slot: "13:00", size: "small" },
      { slot: "09:00", size: "small" }, { slot: "11:00", size: "small" },
    ] as MiniBooking[];
    const { engine, shared } = bothAgree([{ id: "x", size: "small" }], existing);
    expect(shared).toEqual(engine);
    expect(shared.length).toBe(0);
  });

  it("the cap is atomic — a 2-dog group is rejected when only 1 seat-day remains", () => {
    // 13 existing → one more dog fits, but a 2-dog group (13+2=15>14) must not.
    const existing = Array.from({ length: 13 }, (_, i) => ({
      slot: ["08:30", "09:30", "10:30", "11:30", "12:30"][i % 5],
      size: "small",
    })) as MiniBooking[];
    const { engine, shared } = bothAgree(
      [{ id: "a", size: "small" }, { id: "b", size: "small" }],
      existing,
    );
    expect(shared).toEqual(engine);
    expect(shared.length).toBe(0);
  });
```

- [ ] **Step 2: Run the parity test to verify it passes with the Task 1.2 fix**

Run: `npm run test:logic -- src/lib/whatsapp/capacityParity.test.ts`
Expected: PASS (both engines now return `[]` on the full day). If you temporarily revert Task 1.2's guard, this test FAILS — confirming it catches the gap.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp/capacityParity.test.ts
git commit -m "test(capacity): assert frontend/Deno parity on a near-full day (guards the daily-cap mirror)"
```

---

### Task 1.4: Refresh stale documentation

**Why:** Audit-confirmed doc drift sends readers down dead ends: `capacity-engine.md` names the trigger function wrong and omits two gates; `whatsapp-agent.md` describes the old "draft every inbound" model; CLAUDE.md links a superseded migration as authoritative; `DESIGN.md` and `LAUNCH_PLAN.md` describe an abandoned brand and non-existent migration filenames. No tests — verification is by re-reading against code.

**Files:**
- Modify: `docs/capacity-engine.md:42-45` (+ a new daily-cap/pregnancy section)
- Modify: `docs/whatsapp-agent.md:3-13`
- Modify: `CLAUDE.md` (the capacity gotcha + architecture-map links)
- Modify: `DESIGN.md` (header annotation)
- Modify: `LAUNCH_PLAN.md` (header annotation)

- [ ] **Step 1: Fix the trigger function name + authoritative link in `docs/capacity-engine.md`**

Replace lines 42-45 (the "Database, source of truth" bullet):

```md
- **Database, source of truth** — the `validate_booking_capacity()`
  `BEFORE INSERT` trigger on `bookings`. Originally added in
  `20260331083432_capacity_trigger.sql`, but the **live body has since been
  re-issued** — the current definition lives in
  [supabase/migrations/20260622100000_daily_dog_cap.sql](../supabase/migrations/20260622100000_daily_dog_cap.sql)
  (grep migrations for `validate_booking_capacity` and read the most recent).
  This is what rejects an insert the frontend somehow let through.
```

- [ ] **Step 2: Add a daily-cap + pregnancy section to `docs/capacity-engine.md`**

Append after the "Disabling the rule" section (after line 67):

```md
## Daily dog cap (separate from per-slot seats)

Beyond the 2-2-1 per-slot rule, the salon caps the **whole day** at
`salon_config.daily_dog_cap` (default **14** dogs). This is a throughput
limit, not slots×2. It is enforced for **non-staff** inserts inside
`validate_booking_capacity()` (migration `20260622100000_daily_dog_cap.sql`),
and mirrored client-side in `findGroupedSlots()` — in the frontend engine
(`src/engine/capacity.ts`), the Deno Flow mirror
(`supabase/functions/_shared/capacity.ts`), and as the `DAILY_DOG_CAP`
constant in `src/constants/salon.ts` + `_shared/salonConstants.ts`. Staff are
never day-capped.

## Pregnancy gate

A pregnant dog (`dogs.is_pregnant`) is blocked from every non-staff booking
insert by the separate `enforce_dog_not_pregnant()` `BEFORE INSERT` trigger
(migration `20260623130000_dog_pregnancy_gate.sql`), which raises P0001. Staff
bypass it (clinical judgement). The booking wizard greys out a pregnant dog as
a preflight only — the trigger is the authority.
```

- [ ] **Step 3: Fix the "draft every inbound" framing in `docs/whatsapp-agent.md`**

Replace lines 3-13 (the opening two paragraphs) with a description of the on-demand model:

```md
The `whatsapp-agent` Edge Function is the brain of the WhatsApp inbox. It
calls Claude with the full conversation context (recent messages, customer +
dogs, availability windows, persisted agent state) to classify intent/risk and
draft a reply. It never sends to the customer directly and never mutates a
booking — both go through guarded paths (`whatsapp-send` and the
`apply_whatsapp_booking_action` RPC).

**Drafting is on demand, not on every inbound.** A *known* customer's inbound
message is persisted and the loop continues — no automatic Claude draft —
until staff click **"Generate reply"** (the `force_draft` / `suggest_only`
path). Only an *unknown* customer (no linked `human_id`) still gets one
automatic agent pass for onboarding. Auto-send is plumbed but off everywhere
unless explicitly opted in, and booking-touching intents can never auto-send.
```

- [ ] **Step 4: Repoint CLAUDE.md's authoritative-gate references**

In `CLAUDE.md`, in both the "Capacity — the 2-2-1 rule" domain bullet and the "Gotchas" capacity bullet, change the link text/target from `migration 20260331083432` "the authoritative gate" to note the live body. Find each occurrence of `20260331083432_capacity_trigger.sql` used as *the authoritative gate* and append: `(original trigger; the live body is now in 20260622100000_daily_dog_cap.sql — grep validate_booking_capacity for the latest)`. Leave the historical reference intact, just disambiguate which file holds the current definition.

- [ ] **Step 5: Annotate `DESIGN.md` as superseded**

Insert a blockquote at the very top of `DESIGN.md` (before line 1's `# Smarter Dog — Design System`):

```md
> **⚠️ SUPERSEDED (annotated 2026-06-25).** This early rebrand spec describes a
> cyan/`#00C2FF` + `#FFCC00` + Montserrat design the code does NOT use. The
> shipped system is purple `#2D004B` / action `#FECC13` / paper `#FAF9F6` with
> Quicksand display + Montserrat body — see `src/index.css` and
> `docs/modal-standard.md`, which are canonical. Kept for history only.

```

- [ ] **Step 6: Annotate `LAUNCH_PLAN.md` as superseded**

Insert a blockquote at the top of `LAUNCH_PLAN.md` (before line 1):

```md
> **⚠️ SUPERSEDED (annotated 2026-06-25).** Pre-launch context; the app is live
> on Vercel. Migration filenames here (`001_…`, `002_…`, `003_…`) are stale —
> the repo uses timestamp names (`20260330095121_initial_schema.sql`, etc.).
> See `docs/migrations.md` for the current process. Kept for history only.

```

- [ ] **Step 7: Verify lint passes (docs don't break the import-extension check) and commit**

Run: `npm run lint`
Expected: PASS.

```bash
git add docs/capacity-engine.md docs/whatsapp-agent.md CLAUDE.md DESIGN.md LAUNCH_PLAN.md
git commit -m "docs(audit): fix capacity-engine trigger name + daily-cap/pregnancy sections, whatsapp on-demand model, annotate superseded DESIGN/LAUNCH_PLAN"
```

**Wave 1 done.** Open a PR (`fix/audit-wave1-capacity-docs`). No migration to apply. This wave alone closes the confirmed bug and the worst doc traps.

---

## WAVE 2 — Customer write hardening + agent-failure visibility

> **HIGH-RISK (Task 2.1):** touches the customer write path + a hand-applied migration. Explain the change to Bleep and apply the migration to prod **before** merging the client code. Task 2.2 is client-only and lower-risk.

### Task 2.1: Route customer dog creation through an ownership-validating RPC

**Why:** `AddDogInline` raw-INSERTs into `public.dogs` relying solely on the `customer_insert_own_dogs` RLS policy — the only customer write with no SECURITY DEFINER guard (contrast `update_customer_dog`). A future RLS gap on `dogs` would be directly exploitable. Add `create_customer_dog` mirroring the existing `update_customer_dog` pattern, and route the client through it. (The raw `humans` UPDATEs in `ProfileGate`/`CustomerDashboard` are already guarded by the `prevent_customer_critical_column_update` BEFORE-UPDATE trigger, so they are a lower-priority follow-on, noted at the end.)

**Files:**
- Create: `supabase/migrations/20260625090000_create_customer_dog_rpc.sql`
- Modify: `src/supabase/rpc.ts` (add `createCustomerDog` wrapper, near `updateCustomerDog`)
- Modify: `src/supabase/repositories/dogsRepo.ts` (add `createForHuman`)
- Modify: `src/components/customer/booking/AddDogInline.tsx:27-62` (use the repo helper)
- Test: `src/security/customerDogRpc.test.ts` (new — static SQL invariant test, matching the repo's existing security-test pattern)

**Interfaces:**
- Produces (SQL): `create_customer_dog(p_name text, p_breed text, p_size text, p_human_id uuid) RETURNS TABLE(id uuid, name text, breed text, size text, human_id uuid)` — SECURITY DEFINER, validates `p_human_id` belongs to `auth.uid()`, granted `authenticated` only.
- Produces (TS): `createCustomerDog(client, { name, breed, size, humanId })` in `rpc.ts`; `createForHuman(client, { humanId, name, breed, size }): Promise<{ dog: CustomerDog | null, error: Error | null }>` in `dogsRepo.ts`.

- [ ] **Step 1: Explain the change** (per the high-risk rule). One-paragraph summary to Bleep: "Adds a `create_customer_dog` SECURITY DEFINER RPC (mirrors `update_customer_dog`) that validates the target human belongs to the signed-in customer before inserting, and switches `AddDogInline` to call it instead of a raw `dogs` INSERT. No RLS policy is removed in this task — the raw `customer_insert_own_dogs` policy stays as a fallback; tightening it is a separate follow-up. Migration must be applied to prod before merging." Get a thumbs-up before proceeding.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260625090000_create_customer_dog_rpc.sql`:

```sql
-- Migration: create_customer_dog_rpc
-- Date: 2026-06-25
--
-- Customer-self-service RPC to ADD a dog to a human they own. Mirrors
-- update_customer_dog (20260513180000): identity comes from auth.uid(), the
-- only attacker-controlled inputs are the dog fields + p_human_id, and
-- ownership of p_human_id is enforced before the INSERT. Closes the gap where
-- AddDogInline raw-INSERTed into dogs relying solely on the
-- customer_insert_own_dogs RLS policy.
--
-- Idempotent: create-or-replace + explicit grants. Safe to re-run.

CREATE OR REPLACE FUNCTION public.create_customer_dog(
  p_name     text,
  p_breed    text DEFAULT NULL,
  p_size     text DEFAULT NULL,
  p_human_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id       uuid,
  name     text,
  breed    text,
  size     text,
  human_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_my_id  uuid;
  v_dog    public.dogs%rowtype;
  v_name   text := nullif(trim(coalesce(p_name, '')), '');
  v_breed  text := nullif(trim(coalesce(p_breed, '')), '');
  v_size   text := nullif(trim(lower(coalesce(p_size, ''))), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  SELECT h.id INTO v_my_id
  FROM public.humans h
  WHERE h.customer_user_id = v_uid
  LIMIT 1;

  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'no_linked_human' USING errcode = '28000';
  END IF;

  -- Ownership gate: the target human must be the caller (or a human the
  -- caller owns is out of scope — customers only add to their OWN row).
  IF p_human_id IS NULL OR p_human_id <> v_my_id THEN
    RAISE EXCEPTION 'not_your_human' USING errcode = '42501';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'name_required' USING errcode = '22023';
  END IF;

  IF v_size IS NOT NULL AND v_size NOT IN ('small', 'medium', 'large') THEN
    RAISE EXCEPTION 'invalid_size' USING errcode = '22023';
  END IF;

  INSERT INTO public.dogs (name, breed, size, human_id)
    VALUES (v_name, v_breed, v_size, v_my_id)
  RETURNING * INTO v_dog;

  RETURN QUERY
    SELECT v_dog.id, v_dog.name, v_dog.breed, v_dog.size, v_dog.human_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_dog(text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_dog(text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_customer_dog(text, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_dog(text, text, text, uuid) TO authenticated;
```

- [ ] **Step 3: Validate migration structure**

Run: `npm run check:migrations`
Expected: PASS (filename `^\d{14}_[a-z0-9_]+\.sql$`, monotonic, non-empty).

- [ ] **Step 4: Write the failing static-invariant test**

Create `src/security/customerDogRpc.test.ts` (mirrors the existing `src/security/*.test.ts` regex-over-SQL pattern — read `pregnancyGate.test.ts` first for the exact glob/sort helper to reuse):

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260625090000_create_customer_dog_rpc.sql",
  "utf8",
);

describe("create_customer_dog RPC hardening", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    expect(sql).toMatch(/SECURITY DEFINER/i);
    expect(sql).toMatch(/SET search_path = public/i);
  });
  it("enforces ownership of p_human_id against the caller's human", () => {
    expect(sql).toMatch(/p_human_id\s+IS\s+NULL\s+OR\s+p_human_id\s*<>\s*v_my_id/i);
  });
  it("revokes anon and grants only authenticated", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.create_customer_dog.*FROM anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_customer_dog.*TO authenticated/i);
    expect(sql).not.toMatch(/TO anon/i);
  });
});
```

Run: `npm run test:logic -- src/security/customerDogRpc.test.ts`
Expected: PASS once Step 2's migration exists (this test guards the SQL invariants).

- [ ] **Step 5: Add the `createCustomerDog` wrapper to `src/supabase/rpc.ts`**

Add near `updateCustomerDog` (search for `update_customer_dog`). Match the file's wrapper style:

```ts
// Customer-self-service: add a dog to the caller's own human. SECURITY
// DEFINER, validates ownership of p_human_id; granted authenticated only.
export function createCustomerDog(
  client: SupabaseClient,
  params: { name: string; breed?: string | null; size?: string | null; humanId: string },
) {
  return client.rpc("create_customer_dog", {
    p_name: params.name,
    p_breed: params.breed ?? null,
    p_size: params.size ?? null,
    p_human_id: params.humanId,
  });
}
```

- [ ] **Step 6: Add `createForHuman` to `src/supabase/repositories/dogsRepo.ts`**

Add after `listForHuman` (and add the import of the wrapper at the top — `import { createCustomerDog } from "../rpc";`):

```ts
export async function createForHuman(
  client: SupabaseClient,
  { humanId, name, breed, size }: { humanId: string; name: string; breed?: string | null; size?: DogSize | null },
): Promise<{ dog: CustomerDog | null; error: Error | null }> {
  const { data, error } = await createCustomerDog(client, {
    name,
    breed: breed ?? null,
    size: size ?? null,
    humanId,
  });
  if (error) return { dog: null, error: new Error(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { dog: null, error: new Error("create_customer_dog returned no row") };
  return {
    dog: {
      id: row.id,
      name: row.name ?? "",
      breed: row.breed ?? "",
      size: (row.size as DogSize | null) ?? null,
      isPregnant: false, // a freshly-added dog is never pregnant; staff set it later
    },
    error: null,
  };
}
```

- [ ] **Step 7: Switch `AddDogInline` to the repo helper**

In `src/components/customer/booking/AddDogInline.tsx`, replace the raw INSERT in `handleSave` (lines 37-56) with:

```tsx
      const { dog, error: err } = await createForHuman(supabase, {
        humanId,
        name: name.trim(),
        breed: finalBreed || null,
        size: dogSize,
      });
      if (err || !dog) throw err ?? new Error("Could not save dog");
      onDogAdded(dog);
```

and add the import at the top: `import { createForHuman } from "../../../supabase/repositories/dogsRepo";`. Remove the now-unused direct `.from("dogs").insert(...)`. (Keep the `customerSupabase` import — `createForHuman` takes the client.)

- [ ] **Step 8: Run the customer booking-wizard component tests + typecheck**

Run: `npm run typecheck && npm run test:component -- src/components/customer/booking`
Expected: PASS. (The wizard's pregnant/date tests don't exercise AddDogInline's write, but they confirm no type/render regressions.)

- [ ] **Step 9: Apply the migration to prod, THEN commit**

Apply `20260625090000_create_customer_dog_rpc.sql` to prod by hand (Supabase SQL editor) per the migration process. Confirm `check-migrations-applied` will pass. Then:

```bash
git add supabase/migrations/20260625090000_create_customer_dog_rpc.sql src/security/customerDogRpc.test.ts src/supabase/rpc.ts src/supabase/repositories/dogsRepo.ts src/components/customer/booking/AddDogInline.tsx
git commit -m "feat(security): add create_customer_dog RPC and route AddDogInline through it (no more raw customer dogs INSERT)"
```

- [ ] **Step 10 (follow-on, optional, own task):** Mirror this for the raw `humans` UPDATEs in `ProfileGate.jsx` and `CustomerDashboard.jsx` via an `update_customer_human` RPC. Lower priority — those writes are already guarded by the `prevent_customer_critical_column_update` trigger, so this is consistency/defence-in-depth, not a hole. Track separately.

---

### Task 2.2: Surface swallowed WhatsApp-agent failures on the dashboard

**Why:** The agent swallows post-validation throws into an HTTP 200 "handled with error"; the real cause lives in `whatsapp_events.error_message`, invisible to staff (a "Generate reply" then shows a generic "unexpected response"). `whatsapp_events` already has a staff-only SELECT RLS policy, so a read-only card needs **no migration** — it mirrors the `useDeliveryFailures` singleton-hook + `RightWorkflowSidebar` card pattern.

**Files:**
- Create: `src/supabase/hooks/useAgentFailures.js`
- Create: `src/components/dashboard/AgentFailuresCard.jsx`
- Modify: `src/components/dashboard/RightWorkflowSidebar.jsx` (mount the card)
- Test: `src/supabase/hooks/useAgentFailures.test.js` (logic for the lookback/dedup helper)

**Interfaces:**
- Produces: `useAgentFailures(): { failures, count, loading, error, refresh }` where `failures` is `[{ id, phone, error, at, eventType }]` newest-first within a lookback window.

- [ ] **Step 1: Write the failing helper test**

Create `src/supabase/hooks/useAgentFailures.test.js`. Extract the pure shaping helper so it's unit-testable without a client (mirror how `useDeliveryFailures` exports `applyDismissals`):

```js
import { describe, expect, it } from "vitest";
import { shapeAgentFailures } from "./useAgentFailures";

describe("shapeAgentFailures", () => {
  it("keeps only failed events, newest first, mapped to the card shape", () => {
    const rows = [
      { id: "1", phone_e164: "+4471", processing_status: "processed", error_message: null, received_at: "2026-06-25T09:00:00Z", event_type: "messages" },
      { id: "2", phone_e164: "+4472", processing_status: "failed", error_message: "boom", received_at: "2026-06-25T10:00:00Z", event_type: "messages" },
      { id: "3", phone_e164: "+4473", processing_status: "failed", error_message: "kaboom", received_at: "2026-06-25T11:00:00Z", event_type: "messages" },
    ];
    const out = shapeAgentFailures(rows);
    expect(out.map((f) => f.id)).toEqual(["3", "2"]);
    expect(out[0]).toMatchObject({ phone: "+4473", error: "kaboom", eventType: "messages" });
  });
});
```

Run: `npm run test:logic -- src/supabase/hooks/useAgentFailures.test.js`
Expected: FAIL — module/helper not defined.

- [ ] **Step 2: Implement `useAgentFailures.js`**

Create `src/supabase/hooks/useAgentFailures.js`, modelled on `useDeliveryFailures.js` (singleton + `useSyncExternalStore` + one ref-counted channel on `whatsapp_events`). Include the pure helper:

```js
// ============================================================
// src/supabase/hooks/useAgentFailures.js
//
// Surfaces whatsapp_events rows the agent marked processing_status='failed'
// (it swallows post-validation throws into an HTTP 200, so the only signal is
// error_message here, not the edge logs). Staff-only SELECT RLS already exists
// on whatsapp_events, so this is read-only — no migration. Mirrors
// useDeliveryFailures: module singleton + useSyncExternalStore + one realtime
// channel.
// ============================================================
import { useSyncExternalStore, useCallback } from "react";
import { supabase } from "../client.js";
import { registerResume } from "../refreshOnResume.js";
import { logger } from "../../lib/logger";

const LOOKBACK_DAYS = 7;
const IS_TEST = import.meta.env?.MODE === "test";

export function shapeAgentFailures(rows) {
  return (rows ?? [])
    .filter((r) => r.processing_status === "failed")
    .map((r) => ({
      id: r.id,
      phone: r.phone_e164 ?? "",
      error: r.error_message ?? "Unknown error",
      at: r.received_at ?? null,
      eventType: r.event_type ?? null,
    }))
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}

let state = { failures: [], loading: true, error: null };
let channel = null;
const listeners = new Set();

function setState(next) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

async function refresh() {
  if (!supabase || IS_TEST) {
    if (state.loading) setState({ loading: false });
    return;
  }
  setState({ error: null });
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
    const { data, error } = await supabase
      .from("whatsapp_events")
      .select("id, phone_e164, processing_status, error_message, received_at, event_type")
      .eq("processing_status", "failed")
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    setState({ failures: shapeAgentFailures(data), loading: false });
  } catch (err) {
    logger.error("useAgentFailures fetch failed", err, {
      tags: { hook: "useAgentFailures", op: "fetch" },
    });
    setState({ error: err, loading: false });
  }
}

function startChannel() {
  if (channel || !supabase || IS_TEST) return;
  channel = supabase
    .channel("dashboard-agent-failures")
    .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_events" }, () => refresh())
    .subscribe();
}
function stopChannel() {
  if (!channel) return;
  supabase.removeChannel(channel);
  channel = null;
}
function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) { startChannel(); refresh(); }
  return () => { listeners.delete(listener); if (listeners.size === 0) stopChannel(); };
}
function getSnapshot() { return state; }
registerResume(() => { if (listeners.size > 0) refresh(); });

export function useAgentFailures() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refresh_ = useCallback(() => refresh(), []);
  return {
    failures: snapshot.failures,
    count: snapshot.failures.length,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh: refresh_,
  };
}
```

Run: `npm run test:logic -- src/supabase/hooks/useAgentFailures.test.js`
Expected: PASS.

- [ ] **Step 3: Build the card**

Create `src/components/dashboard/AgentFailuresCard.jsx`, matching the visual/structure conventions of the existing delivery-failures card (read `src/components/dashboard/RightWorkflowSidebar.jsx` and the delivery-failure card it renders for the shared card shell, tone classes, and "attention" styling). The card: title "AI agent issues", a count badge, one row per failure showing the masked phone tail + the error + relative time, and a "View inbox" link to `/inbox?conversation=` is not available from an event, so link to `/inbox` filtered to that phone where possible (else `/inbox`). Render nothing when `count === 0` (calm). Pull data from `useAgentFailures()`.

- [ ] **Step 4: Mount it in `RightWorkflowSidebar.jsx`**

Add `<AgentFailuresCard />` alongside the existing delivery-failures card, within the same attention-ranked group so it sorts with the other "attention" cards and folds away when empty. Import it at the top.

- [ ] **Step 5: Verify in the offline preview + run component tests**

Verify visually in offline mode (the card stays calm/empty offline since the hook is inert in tests/offline). Run: `npm run test:component -- src/components/dashboard`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/supabase/hooks/useAgentFailures.js src/supabase/hooks/useAgentFailures.test.js src/components/dashboard/AgentFailuresCard.jsx src/components/dashboard/RightWorkflowSidebar.jsx
git commit -m "feat(dashboard): surface swallowed whatsapp-agent failures as a dashboard card"
```

**Wave 2 done.** PR `feat/audit-wave2-write-hardening` — remember the migration is applied to prod first.

---

## WAVE 3 — DB tests, prod grant audit, debt paydown

> Each Wave-3 task is a **spike**: a concrete, runnable first slice plus an enumerated remainder. When you start one, graduate its remainder into its own dedicated plan (`docs/superpowers/plans/…`) — they're each multi-session.

### Task 3.1: Stand up an executable DB integration test harness (first slice: pregnancy gate)

**Why:** RLS, the three BEFORE-INSERT gates, and `create_customer_booking_group` are "tested" only by regex over SQL text — never executed against Postgres. The authoritative capacity gate has zero runtime coverage. `supabase/config.toml` exists, so `supabase start` + `supabase test db` (pgTAP) works locally. Build the harness with one real gate test, then expand.

**Files:**
- Create: `supabase/tests/pregnancy_gate.test.sql` (pgTAP)
- Modify: `package.json` (add `test:db`)
- Create (later): `supabase/tests/{capacity_daily_cap,calendar_gate,customer_booking_rpc_ownership,rls_isolation}.test.sql`

**Prerequisite (one-time, local):** Docker running; `supabase start` boots the local stack and applies all migrations. `supabase test db` runs every `supabase/tests/*.test.sql` under pgTAP.

- [ ] **Step 1: Add the `test:db` script to `package.json`**

In the `scripts` block:

```json
    "test:db": "supabase test db",
```

- [ ] **Step 2: Write the first pgTAP test — the pregnancy gate**

Create `supabase/tests/pregnancy_gate.test.sql`. This seeds a customer human + a pregnant dog, then asserts a non-staff insert raises P0001 and a staff insert succeeds:

```sql
begin;
select plan(2);

-- Seed: a customer human and a pregnant dog they own. (auth.uid() is NULL in
-- this test session => treated as non-staff by is_staff().)
insert into public.humans (id, name, surname, customer_user_id)
  values ('00000000-0000-0000-0000-0000000000a1', 'Test', 'Owner', null);
insert into public.dogs (id, name, size, is_pregnant, human_id)
  values ('00000000-0000-0000-0000-0000000000d1', 'Bump', 'small', true,
          '00000000-0000-0000-0000-0000000000a1');

-- 1. A non-staff insert for a pregnant dog must raise P0001.
select throws_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service, status)
     values (current_date + 7, '09:00',
             '00000000-0000-0000-0000-0000000000d1', 'small', 'full-groom', 'Booked') $$,
  'P0001',
  NULL,
  'pregnant dog is blocked for non-staff inserts'
);

-- 2. The pregnancy block is keyed on dogs.is_pregnant — clearing it allows the
--    booking (capacity/calendar permitting on a future open day).
update public.dogs set is_pregnant = false
  where id = '00000000-0000-0000-0000-0000000000d1';
select lives_ok(
  $$ insert into public.bookings (booking_date, slot, dog_id, size, service, status)
     values (current_date + 7, '09:00',
             '00000000-0000-0000-0000-0000000000d1', 'small', 'full-groom', 'Booked') $$,
  'a non-pregnant dog books fine on a future open day'
);

select * from finish();
rollback;
```

> Note: pick `current_date + 7` carefully so it lands on an open day (Mon–Wed) in the test, or seed a `day_settings` row forcing the date open. Adjust the date arithmetic in the test to guarantee a Monday, e.g. compute the next Monday. This is the kind of fixture detail that makes the harness real — bake it in rather than leaving it to chance.

- [ ] **Step 3: Run the harness**

Run: `supabase start && npm run test:db`
Expected: `pregnancy_gate.test.sql` reports `ok 1` / `ok 2`. If `supabase start` fails (Docker), document the requirement in `docs/migrations.md` and skip CI wiring for now.

- [ ] **Step 4: Commit the harness + first test**

```bash
git add package.json supabase/tests/pregnancy_gate.test.sql
git commit -m "test(db): add pgTAP DB integration harness + pregnancy-gate runtime test"
```

- [ ] **Step 5 (remainder — graduate to its own plan):** Add pgTAP tests for: the **daily-cap** gate (15th-dog insert raises P0001, staff bypass), the **calendar** gate (past date / closed day / invalid slot), **`create_customer_booking_group`** ownership (a dog you don't own raises, size taken from `dogs.size`), and **RLS isolation** (customer A cannot SELECT customer B's bookings/dogs/humans). Then decide on CI wiring — a dedicated job running `supabase start` + `supabase test db` (heavier Actions minutes; gate on push-to-main like E2E). Each is a discrete, high-value test; scope them in `docs/superpowers/plans/2026-…-db-integration-tests.md`.

---

### Task 3.2: Produce a read-only prod grant/policy audit script

**Why:** Several audit security findings rest on migration files that have **drifted from live prod** (live RLS uses consolidated `combined_*` policies, grants may differ). The only way to resolve the Med-severity "can't verify from files" uncertainty is a read-only query against prod — which the read-only/PII rule means **Bleep runs**, not the agent. Deliverable: a committed SQL script Bleep runs in the Supabase SQL editor (returns zero PII — only catalog metadata).

**Files:**
- Create: `scripts/prod-grant-audit.sql`
- Create: `docs/prod-grant-audit-checklist.md` (how to run + what to look for)

- [ ] **Step 1: Write the audit SQL**

Create `scripts/prod-grant-audit.sql`. Pure catalog reads — no customer data:

```sql
-- Read-only prod grant/policy audit. Run in the Supabase SQL editor against
-- PROD. Returns ONLY catalog metadata (no customer rows / no PII). Compare the
-- output against supabase/migrations to find live drift.

-- 1. Tables in `public` WITHOUT row-level security enabled (should be empty
--    for any table holding customer data).
select n.nspname as schema, c.relname as table, c.relrowsecurity as rls_on
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
order by c.relname;

-- 2. Every RLS policy on public tables (name, command, roles, USING/CHECK).
--    Diff the names against the migration files — live uses combined_* names.
select schemaname, tablename, policyname, cmd, roles,
       qual as using_expr, with_check as check_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. SECURITY DEFINER functions in public and their EXECUTE grantees. Flag any
--    that grant EXECUTE to `anon` (Supabase auto-grants this on new functions;
--    each should have an explicit revoke).
select p.proname as function,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proacl::text[], ' | '), 'default (PUBLIC)') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;

-- 4. Functions whose ACL still grants anything to anon (explicit hole check).
select p.proname as function,
       pg_get_function_identity_arguments(p.oid) as args,
       array_to_string(p.proacl::text[], ' | ') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proacl::text[] && array(select 'anon=%')  -- visual scan: look for 'anon=' entries
order by p.proname;

-- 5. Tables in the supabase_realtime publication (reconcile against the
--    piecemeal `alter publication add` statements in migrations).
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
```

> Query 4's `&&` trick is approximate; if it errors on your PG version, just eyeball query 3's `acl` column for any `anon=` substring instead.

- [ ] **Step 2: Write the checklist**

Create `docs/prod-grant-audit-checklist.md`: how to run (`Supabase Dashboard → SQL editor → paste → run`, prod project), and the pass criteria — (a) query 1 returns no customer-data tables; (b) query 2's policy set matches the documented `combined_*` model; (c) queries 3-4 show **no** SECURITY DEFINER function granting EXECUTE to `anon`; (d) query 5 matches the realtime tables the app subscribes to (`bookings`, `notification_log`, `notification_dismissals`, `whatsapp_*`, `humans`, `dogs`, `salon_todos`, `waitlist_entries`). Record findings + date; any `anon=` on a definer function is a fix-now item.

- [ ] **Step 3: Commit (Bleep runs the script out-of-band)**

```bash
git add scripts/prod-grant-audit.sql docs/prod-grant-audit-checklist.md
git commit -m "chore(security): add read-only prod grant/policy audit script + checklist"
```

- [ ] **Step 4 (Bleep, out-of-band):** Run the script against prod, fill in `docs/prod-grant-audit-checklist.md` with results, and open follow-up issues for any drift (anon grants, missing RLS, unexpected realtime tables).

---

### Task 3.3: Centralise realtime channel names (first slice of the debt paydown)

**Why:** Channel names are constructed ad hoc — some fixed (`waitlist_changes`, `dashboard-delivery-failures`, `salon-todos`, …), some unique (`bookings-realtime-${Date.now()}`). Fixed names can collide on HMR double-mount. A single source for the names makes collisions auditable and is the cheap half of the debt item. (The other half — splitting the ~960-line `useDogs.ts` into a facade mirroring `useHumans` — is a larger refactor; scope it separately.)

**Files:**
- Create: `src/supabase/realtimeChannels.ts`
- Modify: the fixed-name hooks to import from it (`useWaitlist.js`, `useWaitlistUpcoming.js`, `useTodos.js`, `useDeliveryFailures.js`, `useBookingEvents.js`, `usePendingSignupsCount.js`, `useTomorrowReminders.js`, `useWhatsAppUnread.js`, `useWhatsAppSummary.js`, `useWhatsAppInbox.js`, plus the new `useAgentFailures.js`)
- Test: `src/supabase/realtimeChannels.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/supabase/realtimeChannels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CHANNELS } from "./realtimeChannels";

describe("realtime channel registry", () => {
  it("exposes unique, stable channel names", () => {
    const values = Object.values(CHANNELS);
    expect(new Set(values).size).toBe(values.length); // no duplicates
    expect(CHANNELS.deliveryFailures).toBe("dashboard-delivery-failures");
    expect(CHANNELS.agentFailures).toBe("dashboard-agent-failures");
  });
});
```

Run: `npm run test:logic -- src/supabase/realtimeChannels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Create the registry**

Create `src/supabase/realtimeChannels.ts` listing every fixed channel name found by `grep -rn "\.channel(" src/`:

```ts
// Single registry of FIXED realtime channel names. Per-instance channels that
// already use a `${Date.now()}-${Math.random()}` suffix (useBookings,
// useDogs, useHumansData, useMonthBookings, useMonthDaySettings, useDaySettings)
// intentionally stay unique-per-mount and are NOT listed here.
export const CHANNELS = {
  waitlist: "waitlist_changes",
  waitlistUpcoming: "waitlist_upcoming_changes",
  todos: "salon-todos",
  deliveryFailures: "dashboard-delivery-failures",
  agentFailures: "dashboard-agent-failures",
  bookingEvents: "dashboard-booking-events",
  pendingSignups: "pending-signups-count",
  tomorrowReminders: "dashboard-tomorrow-reminders",
  whatsappUnread: "whatsapp-toolbar-unread",
  whatsappCounts: "whatsapp-dashboard-counts",
  whatsappSummary: "whatsapp-dashboard-summary",
  whatsappInboxList: "whatsapp-inbox-list",
} as const;
```

Run: `npm run test:logic -- src/supabase/realtimeChannels.test.ts`
Expected: PASS.

- [ ] **Step 3: Wire the fixed-name hooks to the registry**

In each listed hook, replace the string literal in `.channel("…")` with `CHANNELS.<key>` and add `import { CHANNELS } from "../realtimeChannels";` (adjust the relative path for `hooks/` vs `hooks/inbox/`). Leave the `${Date.now()}` per-instance channels untouched. Do this hook-by-hook, running `npm run test:component` for each touched hook's colocated test.

- [ ] **Step 4: Full test + typecheck**

Run: `npm run typecheck && npm run test`
Expected: PASS (both projects).

- [ ] **Step 5: Commit**

```bash
git add src/supabase/realtimeChannels.ts src/supabase/realtimeChannels.test.ts src/supabase/hooks
git commit -m "refactor(realtime): centralise fixed channel names into one registry"
```

- [ ] **Step 6 (remainder — graduate to its own plan):** Split `src/supabase/hooks/useDogs.ts` (~960 lines) into a `useDogs` facade over `hooks/dogs/*` sub-hooks, mirroring the `useHumans` + `hooks/humans/*` precedent (data/search/mutations/lifecycle/lookups, sharing state through the data sub-hook's setters). This is a pure refactor with the component test suite as the safety net; scope it in its own plan because it's large and touches every `useDogs` consumer.

---

## Self-Review

- **Spec coverage:** All nine audit improvements map to tasks — #1 Deno cap → 1.2; #2 parity gap → 1.3; #3 docs → 1.4; #4 shared constant → 1.1; #5 prod audit → 3.2; #6 raw customer writes → 2.1 (dogs) + 2.1 Step 10 (humans, deferred); #7 DB tests → 3.1; #8 agent-failure visibility → 2.2; #9 realtime channels + facade split → 3.3.
- **Risk gating:** the two high-risk items (the migration in 2.1, all of Wave 3) carry explicit "explain first / apply to prod before merge / graduate to own plan" steps.
- **Type/name consistency:** `DAILY_DOG_CAP` is defined once per module tree and consumed by name everywhere; `createCustomerDog`/`createForHuman`/`shapeAgentFailures`/`CHANNELS` are referenced with the same signatures they're defined with.
- **Known spike honesty:** Tasks 3.1 and 3.3 ship a concrete, runnable first slice and explicitly defer their large remainders to dedicated plans rather than hand-waving them — that is the intended treatment for L-effort restructures, not a placeholder.

---

## Execution order & PR plan

1. **PR 1 — `fix/audit-wave1-capacity-docs`** (Tasks 1.1–1.4). No migration. Closes the confirmed WhatsApp-Flow bug + the worst doc drift. Ship first.
2. **PR 2 — `feat/audit-wave2-write-hardening`** (Tasks 2.1–2.2). One migration (apply to prod before merge). Explain Task 2.1 to Bleep first.
3. **PR 3 — `chore/audit-wave3-db-tests-and-debt`** (Tasks 3.1–3.3 first slices). The DB-harness, prod-audit-script, and channel-registry slices. Their remainders (full DB test suite, `useDogs` facade split, the prod-audit run, humans-RPC) each become their own follow-on plan/issue.
