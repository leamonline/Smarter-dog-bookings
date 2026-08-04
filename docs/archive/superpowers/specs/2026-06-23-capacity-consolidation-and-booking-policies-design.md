# Design — Capacity-rule consolidation & booking policies

**Date:** 2026-06-23
**Status:** Approved (design v5 — item 3 enforcement moved to a BEFORE INSERT trigger); implementation pending
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
2. Enforce the no-pregnant-dogs policy on **every** non-staff booking insert, with staff retaining
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

> Status: implemented on branch `refactor/depersonalise-approval-message` → [PR #407](https://github.com/leamonline/Smarter-dog-bookings/pull/407).

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
- **Staff-managed.** Surfaced as a checkbox in the staff dog-edit form (`DogDetailsSection`, mirroring
  the existing `neutered` field). Save path: `useDogEditForm` → `useDogs.updateDog` → direct
  `dogs` UPDATE (staff-only via RLS).

### `is_pregnant` write boundary — only staff can set/clear it (confirmed by exploration)
> **Only staff-authorised code paths can set or clear `dogs.is_pregnant`.**

Verified against the code:
- Customers have **no** UPDATE policy on `public.dogs` at all — only `staff_update_dogs` (gated by
  `is_staff()`). Customers get only `customer_select_own_dogs` + `customer_insert_own_dogs`.
- The customer `update_customer_dog` RPC uses an **explicit** `SET name/breed/size/dob` whitelist
  (`20260513180000`) — adding `is_pregnant` to the table does not expose it.
- The customer INSERT path can only ever leave `is_pregnant` at its `false` default for a *new* dog;
  a customer can't un-flag a staff-set dog because they have **no** UPDATE path.
- No other RPC writes arbitrary dog columns (grep confirms `update_customer_dog` is the only
  customer-facing SECURITY DEFINER writer to `dogs`).

### Enforcement — a BEFORE INSERT trigger on `bookings` (v5 — the authoritative gate)
**The rule (replaces the earlier per-RPC helper):**

> **Every booking insert is checked by a database trigger. Non-staff routes are rejected for a
> pregnant dog; staff-authorised routes may proceed. RPC/wizard-level checks are optional preflight
> UX only and are NOT relied upon for enforcement.**

Planning found a **third** non-staff insert path the per-RPC approach would have missed — the
autonomous, service-role `apply_whatsapp_booking_action` (`state='confirmed'`,
`bookings.source='whatsapp_ai_auto'`, effective in migration `20260513140000`) — and the repo already
gates non-staff inserts at the trigger layer (`trg_enforce_booking_calendar`). So the gate belongs in
the trigger, where booking integrity already lives, not in each RPC.

**Trigger (mirrors `trg_enforce_booking_calendar`):**
- `enforce_dog_not_pregnant()` runs `BEFORE INSERT ON public.bookings FOR EACH ROW`.
- Body: `if not is_staff() then perform public.assert_booking_dog_not_pregnant(NEW.dog_id); end if;`
- Staff inserts bypass — that **is** the staff override.
- Automatically covers customer self-service, customer reschedule/rebook (new rows), the WhatsApp
  Flow RPC, the autonomous apply path, **and any future route** that inserts a booking.

**Staff override = the existing `is_staff()` test, already proven.** `is_staff()` reads the JWT
(`auth.uid()`); service-role connections have `auth.uid() = null → is_staff() = false`, so the
autonomous/Flow/apply paths are gated exactly as `trg_enforce_booking_calendar` gates them today. Do
**not** treat `service_role` as staff, and do not invent a client-settable override flag. If a
staff-authorised *service* path ever needs to book a pregnant dog, add a narrowly scoped staff-context
set only by a staff-only RPC — never a client-settable flag or the connection's role identity.

| Route | Trigger sees as staff? | Pregnant dog |
| --- | --- | --- |
| Customer self-service booking | No | **Block** |
| Customer reschedule / rebook (new row) | No | **Block** |
| WhatsApp Flow booking (service-role) | No | **Block** |
| WhatsApp autonomous apply (service-role) | No | **Block** |
| Staff dashboard booking | Yes | Allow |
| Staff editing an existing booking | Yes | Allow (normal capacity rules) |

**Trigger-only helper `assert_booking_dog_not_pregnant(p_dog_id uuid)`** — one dog per booking row, so
no array/dedupe logic at the enforcement layer:
```sql
create or replace function public.assert_booking_dog_not_pregnant(p_dog_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp           -- pg_temp guards against object shadowing
as $$
declare v_pregnant boolean;
begin
  -- Integrity: the dog must exist; lock it so a concurrent staff flag flip
  -- can't race the insert (mirrors the capacity helpers' SECURITY DEFINER read).
  select is_pregnant into v_pregnant from public.dogs where id = p_dog_id for share;
  if not found then
    raise exception using errcode = 'P0001',
      message = 'That dog is no longer available. Please refresh and try again.';
  end if;
  if v_pregnant then
    raise exception using errcode = 'P0001',
      message = 'We can''t book a pregnant dog online — please call the salon.';
  end if;
end;
$$;

-- Called ONLY by the trigger (which runs as the table owner). Never client-callable.
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from public;
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from anon;
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from authenticated;
```

- Distinct `P0001` messages for **integrity** (missing dog) vs **pregnancy**, so an invalid request
  never shows a misleading medical-policy message.
- The earlier `assert_booking_dogs_not_pregnant(uuid[])` array helper is **dropped**: the trigger is
  the boundary, so a client-callable array helper (and its grant/oracle/dedupe hardening) is moot.

### Wizard UX (preflight only)
The booking wizard disables a pregnant dog client-side with a clear message — **usability only; the
trigger is the enforcement point.** Needs `is_pregnant` added to the customer dog query
(`dogsRepo.listForHuman` selects only `id, name, breed, size` today) and the `CustomerDog` shape, then
a `disabled` + message branch in `DogSelection.tsx` (mirroring the existing "Size not confirmed" copy).

### Existing bookings untouched
The trigger fires `BEFORE INSERT` only (reschedules create new rows, which are covered). It does
**not** re-check on unrelated booking edits, so a dog flagged pregnant after an existing booking does
not retroactively invalidate that booking.

### Tests
The repo has **no live-DB harness** — DB behaviour is tested by **static assertions over the migration
SQL** (`capacityTrigger.test.ts`, `supabaseSecurityReview.test.ts`). Item-3 DB tests follow that
pattern; the truth table is enforced *structurally* (the gate is the proven `is_staff()` test,
identical to the calendar gate). Live truth-table behaviour is verified in staging before prod apply.

| Test (static over the latest matching migration defn, unless noted) | Asserts |
| --- | --- |
| `enforce_dog_not_pregnant` trigger wired `before insert on public.bookings ... for each row` | path-agnostic gate exists |
| Trigger body gates on `not is_staff()` (not on a role / service-role check) | service-role ≠ staff; staff bypass |
| `assert_booking_dog_not_pregnant` is `security definer` + `set search_path = public, pg_temp` | hardening |
| Helper revokes `public`/`anon`/`authenticated` | not client-callable |
| Helper raises **distinct** integrity vs pregnancy `P0001` messages | correct messaging |
| `update_customer_dog` `SET`-list excludes `is_pregnant` | write boundary |
| Component test (jsdom): a pregnant dog renders `disabled` with the message | preflight UX |

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
| A new/forgotten booking route skips the pregnancy gate | Gate is a `BEFORE INSERT` trigger on `bookings`, not per-RPC — every non-staff insert is covered, present and future |
| Service-role path mistaken for staff | Gate uses `is_staff()` (JWT/`auth.uid()`), which is false for service-role — same proven test as `trg_enforce_booking_calendar`; no role/connection-identity override |
| Pregnancy gate blocks staff edge cases | Soft gate — staff inserts bypass via `is_staff()` (staff override) |
| Customer sets `is_pregnant` to bypass | No customer UPDATE path to `dogs`; `update_customer_dog` SET-list excludes it; INSERT only ever leaves the `false` default |
| Staff flips flag mid-booking | `for share` row lock in `assert_booking_dog_not_pregnant` |
| Pregnancy helper becomes a privilege footgun / oracle | Trigger-only; revoke `public`/`anon`/`authenticated`; `search_path = public, pg_temp` |
| Snapshot migration copies the wrong generated SQL | SHA-256 of `capacity-parameters.sql` embedded in the migration header |
| Migration merged before applied to prod | `check-migrations-applied` gate + manual-apply discipline |

## Testing summary

- **Item 4:** exact-string contract test; update old-string tests. (Implemented — PR #407.)
- **Item 3:** static SQL assertions for the trigger + helper (wiring, `not is_staff()` gate,
  `security definer`/`search_path`, revoked grants, distinct messages, `update_customer_dog`
  whitelist) + a jsdom component test for the wizard's disabled pregnant-dog state. No live-DB tests
  (repo convention); truth-table behaviour verified in staging.
- **Item 5 (review #6):** existing *behavioural* expectations remain unchanged (`capacity.test.js`,
  `capacityParity.test.ts` stay green with no changed booking outcomes). The *static structural*
  assertions in `capacityTrigger.test.ts` are **updated by design** — the trigger stops containing
  inline `CASE`/`IN` bodies — only to verify helper usage and preserve the existing structural
  invariants (advisory locks, un-cancel guard, daily-cap gate). Plus: new `sync:capacity` check,
  parameter-coverage test over the generated SQL, and a hand-reviewed generated-SQL diff.

## Final implementation requirements (v5 — must be honoured)

1. The pregnancy gate is a **`BEFORE INSERT` trigger on `bookings`** (`enforce_dog_not_pregnant`),
   gating on `not is_staff()` — never on role/service-role identity or a client-settable flag. It
   covers every non-staff insert path (customer, WhatsApp Flow, autonomous apply, future routes).
2. `assert_booking_dog_not_pregnant(uuid)` is **trigger-only**: `security definer`,
   `set search_path = public, pg_temp`, `revoke EXECUTE` from `public`/`anon`/`authenticated`,
   `for share` lock on the dog row, and **distinct** integrity vs pregnancy `P0001` messages.
3. The wizard's `is_pregnant` disable is **preflight UX only** — not relied on for enforcement.
4. `capacityTrigger.test.ts` (item 5) deterministically tests the **final** migration definition of
   `validate_booking_capacity()` (latest filename-timestamp), not any matching historical definition.

## Implementation acceptance criteria (v5 — verified, not architecture)

These are sign-off gates for the implementation, not design changes.

**AC1 — staff vs non-staff truth table holds, and `service_role ≠ staff`.** The single most important
new test: a service-role insert with no staff context is **blocked**. Verified structurally (the gate
is `not is_staff()`, identical to the calendar gate) and in staging:

| Route | Expected |
| --- | --- |
| Customer route inserts pregnant dog | `P0001` (pregnancy message) |
| WhatsApp Flow route inserts pregnant dog | `P0001` |
| WhatsApp autonomous apply inserts pregnant dog | `P0001` |
| Staff dashboard inserts pregnant dog | Allowed |
| Service-role insert, no staff context | **Blocked** |
| Non-pregnant dog, any route | Existing behaviour unchanged |
| Missing dog id | Generic integrity `P0001` (not the pregnancy message) |

**AC2 — `SALON_SLOTS` is genuinely consumed where it matters (item 5), not just present in the
generated SQL.** Otherwise normal slot values could drift while the large-dog parameters stay synced:

> Every value in `SALON_SLOTS` must either be consumed by the **effective database validation path**
> (e.g. a generated `is_valid_salon_slot(slot)` helper used by the trigger/calendar gate) **or** be
> covered by an explicit parity assertion against the database's authoritative slot constraint.

## Implementation order

1. **Item 4** — safe, isolated copy change. *(Done — PR #407.)*
2. **Item 3** — add `is_pregnant` column + staff checkbox; `assert_booking_dog_not_pregnant` helper +
   `enforce_dog_not_pregnant` BEFORE INSERT trigger; wizard preflight; write-boundary + trigger
   static tests + wizard component test.
3. **Item 5** — extract shared core, generate mirrors + SQL params, write the effective trigger
   replacement migration, run the full capacity regression suite.
