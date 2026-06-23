# Design — Capacity-rule consolidation & booking policies

**Date:** 2026-06-23
**Status:** Approved (design v4 — core security fixes applied); implementation pending
**Scope:** Three related changes to the booking-integrity layer, shippable independently in the
order 4 → 3 → 5.

## Context

The salon's booking rules (slots, the 2-2-1 seat engine, large-dog rules, daily cap) are currently
written out by hand in **three** places that must agree:

- `src/engine/capacity.ts` — frontend engine (React/Vite).
- `supabase/functions/_shared/capacity.ts` — a deliberate Deno "behavioural mirror" (the Edge
  runtime can't import the frontend barrel). Already guarded against drift by
  `src/lib/whatsapp/capacityParity.test.ts`.
- `validate_booking_capacity()` — the Postgres `BEFORE INSERT/UPDATE` trigger
  ([migration 20260331083432](../../../supabase/migrations/20260331083432_capacity_trigger.sql)),
  the authoritative gate. Already guarded by **static SQL invariants** in
  `src/engine/capacityTrigger.test.ts` (regex over migration files — no live DB needed).

Two policy gaps were also identified:

- The large-dog rejection string hardcodes the owner's name (`"…need Leam's approval…"`).
- "Pregnant dogs not accepted" is salon policy but is **not enforced anywhere in code** — it only
  nudges the WhatsApp agent to escalate.

This design tightens the existing mirror/guard machinery rather than inventing new infrastructure.

## Goals

1. Remove the owner's name from engine logic (item 4).
2. Enforce the no-pregnant-dogs policy on **every** self-service booking path, with staff retaining
   judgement (item 3).
3. Make the rule **parameters** single-sourced so the three surfaces can't silently drift on rule
   *values*, while keeping the capacity engine **behaviour-preserving** (item 5).

## Non-goals (YAGNI)

- No change to any booking *outcome* in item 5 — it is a pure refactor.
- No full TS→plpgsql algorithm code generation (deliberately avoided; the plpgsql algorithm stays
  hand-written).
- No retroactive handling of bookings that exist before a dog is flagged pregnant.
- No customer-facing UI for declaring pregnancy (staff-managed only).

## Guiding rule for generated SQL (from review)

> **Generated artefacts may stay in sync with source. Applied migrations must stay historically
> accurate.**

A migration is an immutable record of a change already applied to production. It must **never**
become "out of sync" just because `salon.ts` changes later. Therefore the CI sync-check validates
the **generated mirror artefacts**, never historical migrations.

---

## Item 4 — De-personalise the approval message

**Change:** in `src/engine/capacity.ts`, replace `"Large dogs need Leam's approval for this slot"`
with `"Needs manager approval for this slot"` in both the `CAPACITY_REASONS` set and the
`canBookSlot()` return. The `needsApproval: true` flag is unchanged.

**Surface:** frontend reason string only (the plpgsql trigger uses its own generic messages and does
not contain the name). Copy-only; no behaviour change.

**Tests:** assert the exact public contract — `expect(reason).toBe("Needs manager approval for this
slot")` — and update any test asserting the old string. (Not a vague name-detector: brittle or too
weak.)

---

## Item 3 — Pregnancy soft gate

### Policy statement (precise wording)
> **Pregnant dogs cannot be booked through self-service or autonomous booking. Staff may assess and
> arrange an exception where appropriate.**

This avoids a future reader interpreting "not accepted" as "staff must never book one" and treating
the intended staff override as a bug.

### Data model
- New migration: `alter table public.dogs add column if not exists is_pregnant boolean not null
  default false;`
- **Staff-managed.** Surfaced as a checkbox in the staff dog-edit form (`DogsView` / dog profile
  edit).

### Security guarantee (strengthened — review #3)
The intended, testable guarantee is:

> **Only staff-authorised code paths can set or clear `dogs.is_pregnant`.**

"Not added to the customer dog RPC" is necessary but not sufficient. Implementation must **audit and
verify all of**:
- Customers have **no** direct `UPDATE` grant/RLS path on `public.dogs`.
- No RLS policy permits broad customer updates of dog rows.
- No other RPC can update arbitrary dog columns reachable by a customer JWT.
- No admin-like endpoint is accidentally callable with a customer JWT.
- The customer dog-update RPC (`update_customer_dog`) uses an **explicit field whitelist** that
  excludes `is_pregnant` (not a dynamic JSON / broad row update).

### Enforcement — every non-staff booking path (review #4)
Policy:

> **Every non-staff path that creates a booking for a dog must run the pregnancy check.**

Add a shared DB helper so this can't be missed when a new route is added later:

```sql
create or replace function public.assert_booking_dogs_not_pregnant(p_dog_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp           -- pg_temp guards against object shadowing
as $$ ... $$;

-- NOT a client-callable RPC (review #2). Authorised booking RPCs are SECURITY
-- DEFINER (same owner) and invoke it internally under their own definer role,
-- so customers reach it only via the booking RPC, never directly.
revoke all on function public.assert_booking_dogs_not_pregnant(uuid[]) from public;
revoke all on function public.assert_booking_dogs_not_pregnant(uuid[]) from anon;
revoke all on function public.assert_booking_dogs_not_pregnant(uuid[]) from authenticated;
-- Grant service_role ONLY if a deliberate operational caller genuinely needs
-- direct execution. None in this design — leave ungranted unless one appears.
```

**Not a client-callable endpoint (review #2):** because it is SECURITY DEFINER, a direct `authenticated`
grant would turn it into a public-ish oracle (a logged-in customer could probe arbitrary UUIDs for
existence / pregnancy via error/timing). Revoke from `public`, `anon`, **and** `authenticated`; the
approved booking RPCs call it internally under their own definer role. Implementation must verify:
customers can only call the customer booking RPC (not the helper), and WhatsApp/service-role calls
`create_whatsapp_booking_group` (not the helper as a general endpoint).

**Helper scope = policy enforcement, NOT authorisation (review #3).** The helper guarantees existence
and non-pregnancy only; it must *not* become the ownership/authority check. Ownership ("does this
customer have authority to book this dog?") stays in the booking RPC's existing validation.

**Robust sequence — duplicate detection BEFORE dedupe (review #1):** a count-vs-deduped comparison can
never catch duplicates (`[A, A]` → deduped `[A]` → 1 = 1 passes), so reject duplicates/nulls/empty
*first*:
```sql
-- 1. Validate non-null, non-empty, UNIQUE ids (before any dedupe/lookup).
if p_dog_ids is null
   or cardinality(p_dog_ids) = 0
   or exists (select 1 from unnest(p_dog_ids) as x(id) where x.id is null)
   or cardinality(p_dog_ids) <> (select count(distinct id) from unnest(p_dog_ids) as x(id))
then
  raise exception using errcode = 'P0001', message = 'Invalid dog selection.';
end if;
```
2. **Lock** the matching rows: `select id, is_pregnant from public.dogs where id = any(p_dog_ids) for
   share;` (race-safe against a staff member flipping the flag mid-booking — review #5).
3. **Reject if any requested ID is missing** (locked-row count ≠ requested count) — deleted / invalid
   / inaccessible — with a generic integrity message (review #3), e.g. *"One of the selected dogs is
   no longer available. Please refresh and try again."*
4. **Reject** if any returned row has `is_pregnant = true` — with the pregnancy-specific message,
   e.g. *"We can't book a pregnant dog online — please call the salon."*

- **Called by** `create_customer_booking_group` and `create_whatsapp_booking_group`. Staff paths
  simply do not call it.
- All rejections use `P0001` (the existing wizard convention) but with **distinct messages** —
  pregnancy vs integrity — so an invalid request never shows a misleading medical-policy message.

**Audit requirement (must be completed during implementation):** enumerate and confirm every
non-staff booking-creating path runs the check — customer reschedule/rebook RPCs, waitlist→booking
promotion, booking-group edits, any customer insert via a view, any Edge Function that inserts
bookings directly, and any service-role automation besides WhatsApp.

### Service-role wording (review #6)
Do **not** rely on `is_staff() = false` as proof the caller is non-staff (service-role bypasses RLS).
The protection is intentional, not incidental:

> `create_whatsapp_booking_group` is categorised as an autonomous customer-facing booking route and
> **always** applies the pregnancy gate, regardless of its database execution role.

### Wizard UX
The booking wizard checks `is_pregnant` client-side to pre-emptively disable the dog with the same
message. This is **usability only** — the RPC helper is the enforcement point.

### Existing bookings untouched.

### Tests (review additions)
| Scenario | Expected |
| --- | --- |
| Pregnant dog → customer booking RPC | `P0001`, friendly message |
| Pregnant dog → WhatsApp booking RPC | `P0001`, same policy |
| Non-pregnant dog | Booking behaviour unchanged |
| Mixed group: one pregnant, one not | **Entire group rejected** |
| Staff direct insert (pregnant dog) | Allowed (assuming capacity passes) |
| Customer dog-update attempts to set `is_pregnant` | Rejected / field ignored |
| Duplicate dog ID passed to RPC | Rejected before booking creation (`Invalid dog selection.`) |
| Missing/deleted dog ID passed to RPC | Rejected with generic refresh message |
| Customer directly invokes the pregnancy helper | Permission denied — not exposed (proves the boundary) |
| Wizard dog list | Pregnant dog disabled with clear explanation |

---

## Item 5 — Consolidate the capacity rules (behaviour-preserving)

### Single source → generated artefacts (review #1)
`src/constants/salon.ts` is the canonical definition of the rule **parameters**: `SALON_SLOTS`,
`LARGE_DOG_SLOTS` (`seats`, `canShare`, `conditional`), and the **daily-cap default**.

```
src/constants/salon.ts
        ↓  scripts/sync-capacity.mjs   (npm run sync:capacity; supports --fix)
        ├─→ supabase/functions/_shared/salonConstants.ts        (generated mirror)
        └─→ supabase/generated/capacity-parameters.sql          (generated snapshot)
```

- **`supabase/generated/capacity-parameters.sql`** is a generated *artefact*, **not** a migration.
  It always reflects current `salon.ts`.
- **CI sync-check** (added to `npm run lint`, mirroring `scripts/check-import-extensions.mjs`) fails
  if either generated artefact is out of sync with `salon.ts`. It validates the **generated mirror
  files only** — never historical migrations.
- **When a rule changes:** (1) edit `salon.ts`; (2) run `npm run sync:capacity`; (3) create a **new**
  migration that contains a copy of the regenerated SQL (see "trigger replacement" below);
  (4) apply that migration to prod. The migration is a point-in-time snapshot and is never
  re-checked against `salon.ts` afterwards.
- **Safe snapshot (review #7):** to remove "copied the wrong file" risk, `sync-capacity.mjs` emits a
  SHA-256 of `capacity-parameters.sql` and the snapshot migration carries it in a header comment:
  ```sql
  -- Generated from src/constants/salon.ts via npm run sync:capacity
  -- capacity-parameters.sql SHA-256: <hash>
  ```
  A reviewer confirms the migration snapshot exactly matches the reviewed generated artefact. (A
  `npm run make:capacity-migration` helper may automate the copy; no full migration generator needed.)

### Parameters emitted to SQL (review #2)
The generated SQL must cover **all** behaviour-affecting parameters, not just three helpers:
- `slot_seats(slot)` — large-dog seat cost per slot.
- `is_large_dog_slot(slot)` — slot has a `LARGE_DOG_SLOTS` entry.
- `large_dog_can_share(slot)` — `canShare`.
- `is_conditional_large_dog_slot(slot)` — the `conditional` flag (e.g. 09:00). The *condition logic*
  stays hand-written; only the flag is a parameter.
- `capacity_daily_cap_default()` — the canonical daily-cap default. The runtime value remains
  configurable in `salon_config.daily_dog_cap`; the trigger uses
  `coalesce(sc.daily_dog_cap, public.capacity_daily_cap_default())`, single-sourcing the fallback
  that is currently the literal `14` in three places.
- A parity test asserts the generated SQL contains **every** `SALON_SLOTS` entry and every
  `LARGE_DOG_SLOTS` property (seat cost, large-dog flag, `canShare`, `conditional`) plus the cap.

### TS algorithm
Extract the verbatim-copied engine functions into a **Deno-safe core** (leaf imports only) so
`_shared/capacity.ts` is generated from `src/engine/` rather than hand-mirrored. The existing
`capacityParity.test.ts` remains as the behavioural backstop.

### Generated-file headers — source-specific (review #4)
Every generated file carries a loud banner naming its **actual** source, so future maintainers don't
get misleading metadata:

- Parameter mirrors (`salonConstants.ts`, `capacity-parameters.sql`):
  ```
  GENERATED FILE — DO NOT EDIT
  Source: src/constants/salon.ts
  Run: npm run sync:capacity
  ```
- Generated Deno capacity core (`_shared/capacity.ts`), whose source is the extracted engine core
  *and* the parameters:
  ```
  GENERATED FILE — DO NOT EDIT
  Source: src/engine/capacityCore.ts and src/constants/salon.ts
  Run: npm run sync:capacity
  ```

### Trigger replacement is explicit (review #7)
The generated parameter helpers alone **cannot** change the already-applied trigger body. The
item-5 migration must do **both**:
1. `create or replace` the generated parameter helper functions (`slot_seats`, `is_large_dog_slot`,
   `large_dog_can_share`, `is_conditional_large_dog_slot`, `capacity_daily_cap_default`).
2. `CREATE OR REPLACE FUNCTION validate_booking_capacity()` so its body **calls those helpers**
   instead of the inline `CASE`/`IN` lists it embeds today.

Update `capacityTrigger.test.ts` to assert against the **effective** `validate_booking_capacity()`
definition, identified **deterministically (review #5)**: collect every migration file that defines
`validate_booking_capacity()`, select the one in the **latest** filename-timestamp order, and assert
against that body (the repo's existing `lastDefinitionOf()` helper already does this). Otherwise a
future migration could redefine the function while the test still scans an older one and gives false
confidence.

### Behaviour-preservation guarantee + accurate drift claim (review #8)
No rule values or control flow change. Stated precisely:

> **Rule parameters cannot drift across the frontend, the Edge Function mirror, and the database
> helper functions. Behavioural parity remains protected by the existing engine and trigger tests.**

(Parameter drift is eliminated; *algorithm* parity is still guarded by tests, not guaranteed by
construction, because the plpgsql algorithm stays hand-written.)

Safety net: `capacity.test.js`, `capacityParity.test.ts`, `capacityTrigger.test.ts`, the new
sync-check + parameter-coverage test, and a hand review diffing the regenerated trigger against the
prior hand-written helper bodies to confirm identical behaviour before applying.

---

## Rollout / migration notes

- DB migrations are **applied to prod by hand**. For items 3 and 5, treat the production migration as
  a **release dependency, not an afterthought**: the app merge must not rely on schema that has not
  yet been applied. CI's `check-migrations-applied` enforces this.
- New migrations must be **idempotent** (`add column if not exists`, `create or replace function`).
- The item-5 migration must be reviewed as a diff against the current trigger-helper bodies to
  confirm it is behaviourally equivalent.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Item 5 silently changes a booking outcome | Intended behaviour-preserving (trigger body is manually refactored); protected by generated parameter parity, regression suites, structural trigger assertions, and a manual SQL diff review |
| A historical migration flagged "stale" by CI | CI checks generated artefacts only; migrations are immutable snapshots (guiding rule) |
| Daily-cap default drifts across surfaces | Single-sourced via `capacity_daily_cap_default()`; runtime override stays in `salon_config` |
| Pregnancy gate blocks staff edge cases | Soft gate — staff path doesn't call the helper |
| Customer sets `is_pregnant` to bypass | Audited: no customer write path to the column; explicit field whitelist in the dog RPC |
| New booking route added later misses the gate | Shared `assert_booking_dogs_not_pregnant()` helper + audit requirement |
| Staff flips flag mid-booking | `for share` row lock in the helper |
| Customer probes the helper as an existence/pregnancy oracle | Helper is not client-callable: revoke `public`/`anon`/`authenticated`; reached only via booking RPCs |
| Duplicate/null/missing dog ID dodges the check | Reject duplicates/nulls/empty *before* dedupe; locked-row count must equal requested count |
| SECURITY DEFINER helper becomes a privilege footgun | No client grants; `search_path = public, pg_temp` |
| Snapshot migration copies the wrong generated SQL | SHA-256 of `capacity-parameters.sql` embedded in the migration header |
| Migration merged before applied to prod | `check-migrations-applied` gate + manual-apply discipline |

## Testing summary

- **Item 4:** exact-string contract test; update old-string tests.
- **Item 3:** the scenario table above (incl. mixed-group rejection and customer-cannot-set-flag).
- **Item 5 (review #6):** existing *behavioural* expectations remain unchanged (`capacity.test.js`,
  `capacityParity.test.ts` stay green with no changed booking outcomes). The *static structural*
  assertions in `capacityTrigger.test.ts` are **updated by design** — the trigger stops containing
  inline `CASE`/`IN` bodies — only to verify helper usage and preserve the existing structural
  invariants (advisory locks, un-cancel guard, daily-cap gate). Plus: new `sync:capacity` check,
  parameter-coverage test over the generated SQL, and a hand-reviewed generated-SQL diff.

## Final implementation requirements (v4 — must be honoured)

1. `assert_booking_dogs_not_pregnant()` rejects **null, empty, missing, and duplicate** dog IDs as
   well as pregnant dogs. **Duplicate/null detection happens before any dedupe/count comparison**
   (a count-vs-deduped check alone can't catch duplicates). It enforces existence + non-pregnancy
   only — **not** ownership. Integrity failures and pregnancy use distinct `P0001` messages.
2. The SECURITY DEFINER helper is **not exposed as a client-callable RPC**: revoke `EXECUTE` from
   `public`, `anon`, **and** `authenticated`; authorised booking RPCs invoke it internally under
   their approved (definer) execution role. Grant `service_role` only where an independently
   authorised operational caller genuinely requires direct execution (none currently). Use
   `set search_path = public, pg_temp`.
3. `capacityTrigger.test.ts` deterministically tests the **final** migration definition of
   `validate_booking_capacity()` (latest filename-timestamp), not any matching historical definition.

## Implementation acceptance criteria (v4 — verified, not architecture)

These are sign-off gates for the implementation, not design changes.

**AC1 — the definer-to-definer call chain still works after the revokes.** Revoking client `EXECUTE`
must not break the legitimate internal call. The whole booking happens in one transaction, so the
`FOR SHARE` lock holds until booking creation finishes. Prove it in the migration/RPC test suite:

| Check | Expected |
| --- | --- |
| Customer calls `assert_booking_dogs_not_pregnant()` directly | Permission denied |
| Customer calls the customer booking RPC | RPC invokes the helper and behaves correctly |
| WhatsApp booking RPC | Invokes the helper and behaves correctly |
| Staff insert path | Does **not** call the helper and remains available |

**AC2 — `SALON_SLOTS` is genuinely consumed where it matters, not just present in the generated SQL.**
Otherwise normal slot values could drift while the large-dog parameters stay perfectly synced.
Requirement:

> Every value in `SALON_SLOTS` must either be consumed by the **effective database validation path**
> (e.g. a generated `is_valid_salon_slot(slot)` helper used by the trigger/calendar gate) **or** be
> covered by an explicit parity assertion against the database's authoritative slot constraint.

## Implementation order

1. **Item 4** — safe, isolated copy change.
2. **Item 3** — add column, staff edit control, shared RPC guard + `for share` lock, customer
   write-path audit, wizard UX, tests.
3. **Item 5** — extract shared core, generate mirrors + SQL params, write the effective trigger
   replacement migration, run the full capacity regression suite.
