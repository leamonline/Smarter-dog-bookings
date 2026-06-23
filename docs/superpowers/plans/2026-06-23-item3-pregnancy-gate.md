# Item 3 — Pregnancy soft gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop pregnant dogs being booked through any non-staff path, enforced authoritatively by a
`BEFORE INSERT` trigger on `bookings`; staff retain judgement (their inserts bypass).

**Architecture:** A `dogs.is_pregnant` boolean (staff-managed). A `BEFORE INSERT` trigger
(`enforce_dog_not_pregnant`) mirrors the existing `trg_enforce_booking_calendar`: for any insert where
`not is_staff()`, it calls a trigger-only `SECURITY DEFINER` helper that rejects a pregnant (or
missing) dog with `P0001`. This single point covers the customer RPC, WhatsApp Flow, autonomous apply,
and any future route. The staff dog-edit form gets a checkbox; the customer booking wizard disables a
pregnant dog client-side as **preflight UX only**.

**Tech Stack:** PostgreSQL (plpgsql), React 19 + TypeScript, Vitest (logic + component projects).

## Global Constraints

- Enforcement lives in the **`BEFORE INSERT` trigger**, gating on `not is_staff()` — never on
  role/service-role identity or a client-settable flag. (Spec v5, Final requirement 1.)
- `assert_booking_dog_not_pregnant(uuid)` is **trigger-only**: `security definer`,
  `set search_path = public, pg_temp`, `revoke EXECUTE` from `public`/`anon`/`authenticated`,
  `for share` lock, **distinct** integrity vs pregnancy `P0001` messages.
- `enforce_dog_not_pregnant()` must be `security definer` so the revoked helper is callable through
  the definer-owned call chain (AC1) while clients cannot call the helper directly.
- Pregnancy message (DB): `We can't book a pregnant dog online — please call the salon.`
  Integrity message (DB): `That dog is no longer available. Please refresh and try again.`
  Wizard message (client): `Can't book online while pregnant — please call us`
- `is_pregnant boolean not null default false`. Staff-managed: customers have **no** UPDATE path to
  `dogs`, and `update_customer_dog`'s `SET` list must continue to exclude it.
- Migrations: idempotent (`add column if not exists`, `create or replace function`,
  `drop trigger if exists` before `create trigger`). UK English. The migration is **applied to prod by
  hand before merge** (release dependency).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## Rollout note (read before Task 2/3)

Local dev points at the **live cloud Supabase**. The Task 2/3 frontend code SELECTs/saves
`is_pregnant`, which fails until the Task 1 column exists in that project. Component tests mock Supabase
and pass without it, but **manual** verification needs the migration applied. Apply Task 1's migration
to the dev project (and to prod before merge) by hand — do not assume the merge applies it.

---

### Task 1: Migration — column, trigger-only helper, BEFORE INSERT gate + static SQL tests

**Files:**
- Create: `supabase/migrations/20260623130000_dog_pregnancy_gate.sql` (use a later 14-digit timestamp if newer migrations exist)
- Test: `src/security/pregnancyGate.test.ts`

**Interfaces:**
- Produces: column `public.dogs.is_pregnant boolean`; functions
  `public.assert_booking_dog_not_pregnant(uuid)` and `public.enforce_dog_not_pregnant()`; trigger
  `trg_enforce_dog_not_pregnant` `BEFORE INSERT ON public.bookings`.

- [ ] **Step 1: Write the failing static tests**

Create `src/security/pregnancyGate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function migrationSqls(): string[] {
  const dir = join(root, "supabase/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"));
}

// SQL of the LAST migration (filename order) matching the predicate — the
// definition currently in effect.
function lastDefinitionOf(predicate: RegExp): string {
  const matches = migrationSqls().filter((sql) => predicate.test(sql));
  expect(matches.length, "expected at least one matching migration").toBeGreaterThan(0);
  return matches[matches.length - 1];
}

describe("pregnancy gate: dogs.is_pregnant column", () => {
  it("adds an is_pregnant boolean defaulting to false", () => {
    const sql = lastDefinitionOf(/add column if not exists is_pregnant/i);
    expect(sql).toMatch(/is_pregnant\s+boolean\s+not\s+null\s+default\s+false/i);
  });
});

describe("pregnancy gate: trigger-only helper", () => {
  const helper = () =>
    lastDefinitionOf(/create\s+or\s+replace\s+function\s+public\.assert_booking_dog_not_pregnant/i);

  it("is SECURITY DEFINER with a pinned search_path", () => {
    const sql = helper();
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i);
  });

  it("locks the dog row FOR SHARE", () => {
    expect(helper()).toMatch(/from\s+public\.dogs[\s\S]*?where\s+id\s*=\s*p_dog_id[\s\S]*?for\s+share/i);
  });

  it("raises distinct integrity vs pregnancy messages", () => {
    const sql = helper();
    expect(sql).toMatch(/no longer available/i);
    expect(sql).toMatch(/pregnant dog online/i);
  });

  it("is not client-callable (revoked from public/anon/authenticated)", () => {
    const sql = helper();
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.assert_booking_dog_not_pregnant\(uuid\)\s+from\s+public/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.assert_booking_dog_not_pregnant\(uuid\)\s+from\s+anon/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.assert_booking_dog_not_pregnant\(uuid\)\s+from\s+authenticated/i);
  });
});

describe("pregnancy gate: trigger function + wiring", () => {
  const trig = () =>
    lastDefinitionOf(/create\s+or\s+replace\s+function\s+public\.enforce_dog_not_pregnant/i);

  it("gates on NOT is_staff() and calls the helper with NEW.dog_id", () => {
    const sql = trig();
    expect(sql).toMatch(/if\s+not\s+is_staff\(\)\s+then/i);
    expect(sql).toMatch(/perform\s+public\.assert_booking_dog_not_pregnant\(\s*new\.dog_id\s*\)/i);
  });

  it("is SECURITY DEFINER so the definer-owned call chain reaches the revoked helper (AC1)", () => {
    expect(trig()).toMatch(/security\s+definer/i);
  });

  it("is wired BEFORE INSERT on bookings, for each row", () => {
    const sql = lastDefinitionOf(/create\s+trigger\s+trg_enforce_dog_not_pregnant/i);
    expect(sql).toMatch(
      /create\s+trigger\s+trg_enforce_dog_not_pregnant\s+before\s+insert\s+on\s+public\.bookings\s+for\s+each\s+row\s+execute\s+function\s+public\.enforce_dog_not_pregnant\(\)/i,
    );
  });
});

describe("pregnancy gate: is_pregnant write boundary", () => {
  it("the customer update_customer_dog RPC does NOT write is_pregnant", () => {
    const sql = lastDefinitionOf(/create\s+or\s+replace\s+function\s+public\.update_customer_dog/i);
    expect(sql).not.toMatch(/is_pregnant/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/security/pregnancyGate.test.ts`
Expected: FAIL — "expected at least one matching migration" (the migration doesn't exist yet).

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260623130000_dog_pregnancy_gate.sql`:

```sql
-- 20260623130000_dog_pregnancy_gate.sql
--
-- Item 3: pregnant dogs cannot be booked through self-service or autonomous
-- booking; staff may arrange an exception. Enforced as a BEFORE INSERT trigger
-- on bookings (mirrors trg_enforce_booking_calendar) so EVERY non-staff insert
-- path is covered — customer RPC, WhatsApp Flow, autonomous apply, and any
-- future route. Staff inserts bypass via is_staff().
--
-- Design: docs/superpowers/specs/2026-06-23-capacity-consolidation-and-booking-policies-design.md
-- Apply to prod BY HAND before merging the app code that depends on it.

-- 1. Staff-managed flag. Default false. Only staff can UPDATE dogs (RLS:
--    staff_update_dogs); customers have no UPDATE path, so they can't set it.
alter table public.dogs
  add column if not exists is_pregnant boolean not null default false;

-- 2. Trigger-only gate helper. One dog per booking row, so no array logic.
--    SECURITY DEFINER so it reads the true flag regardless of the caller's RLS
--    view; FOR SHARE locks the dog so a concurrent staff flag flip can't race
--    the insert. Distinct integrity vs pregnancy P0001 messages.
create or replace function public.assert_booking_dog_not_pregnant(p_dog_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pregnant boolean;
begin
  select is_pregnant into v_pregnant
    from public.dogs
   where id = p_dog_id
   for share;

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

comment on function public.assert_booking_dog_not_pregnant(uuid) is
  'Trigger-only pregnancy gate. Raises P0001 with distinct integrity vs pregnancy messages. Never client-callable.';

-- Not a client-callable endpoint: only the trigger (running as the function
-- owner, see enforce_dog_not_pregnant below) calls it.
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from public;
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from anon;
revoke all on function public.assert_booking_dog_not_pregnant(uuid) from authenticated;

-- 3. The gate. SECURITY DEFINER so the definer-owned call chain can reach the
--    revoked helper (clients still can't call the helper directly). is_staff()
--    reads the JWT, so service-role (auth.uid() null) is non-staff and gated,
--    exactly like trg_enforce_booking_calendar.
create or replace function public.enforce_dog_not_pregnant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    perform public.assert_booking_dog_not_pregnant(new.dog_id);
  end if;
  return new;
end;
$$;

comment on function public.enforce_dog_not_pregnant() is
  'BEFORE INSERT trigger on bookings: blocks a pregnant dog for every non-staff insert (customer, WhatsApp Flow, autonomous apply, future routes). Staff bypass via is_staff().';

drop trigger if exists trg_enforce_dog_not_pregnant on public.bookings;
create trigger trg_enforce_dog_not_pregnant
  before insert on public.bookings
  for each row execute function public.enforce_dog_not_pregnant();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/security/pregnancyGate.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Validate migration structure + lint**

Run: `npm run check:migrations && npm run lint`
Expected: PASS (filename `20260623130000_dog_pregnancy_gate.sql` is valid; no lint errors).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260623130000_dog_pregnancy_gate.sql src/security/pregnancyGate.test.ts
git commit -m "$(cat <<'EOF'
feat(bookings): block pregnant dogs via a BEFORE INSERT trigger

Add dogs.is_pregnant plus a trigger-only SECURITY DEFINER helper and an
enforce_dog_not_pregnant() BEFORE INSERT trigger on bookings. Gates every
non-staff insert (customer RPC, WhatsApp Flow, autonomous apply, future
routes) via is_staff(); staff bypass. Static SQL tests assert the wiring,
hardening, grant revocation, and the update_customer_dog write boundary.

Migration applied to prod by hand before merge.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Staff dog-edit `is_pregnant` checkbox (data-model write chain)

**Files:**
- Modify: `src/types/index.ts:55-72` (Dog interface)
- Modify: `src/supabase/transforms.ts:34-50` (DbDogRow) and `:265-292` (dbDogsToMap)
- Modify: `src/supabase/hooks/useDogs.ts:403-422` (updateDog camelCase→snake_case map)
- Modify: `src/components/modals/dog-card/useDogEditForm.js` (state, re-sync, save, cancel, return)
- Modify: `src/components/modals/dog-card/DogDetailsSection.jsx` (props + checkbox UI)
- Modify: `src/components/modals/DogCardModal.jsx:291-292` (thread the two props; add to the hook destructure)
- Test: `src/components/modals/dog-card/useDogEditForm.isPregnant.component.test.jsx`

**Interfaces:**
- Consumes: `Dog.isPregnant` (added here), staff dogs read via `select("*")` (no select change).
- Produces: `updates.isPregnant` flowing through `useDogs.updateDog` → `dbUpdates.is_pregnant` → a
  direct `dogs` UPDATE (staff-only via RLS).

- [ ] **Step 1: Write the failing test**

Create `src/components/modals/dog-card/useDogEditForm.isPregnant.component.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn() }),
}));

import { useDogEditForm } from "./useDogEditForm.js";

const baseDog = {
  id: "d1",
  name: "Alfie",
  breed: "Poodle",
  size: "small",
  isPregnant: false,
  alerts: [],
};

describe("useDogEditForm: is_pregnant save mapping", () => {
  it("includes isPregnant in the update when toggled on", async () => {
    const onUpdateDog = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDogEditForm({ resolvedDog: baseDog, ownerOpenValue: "", humans: {}, onUpdateDog }),
    );

    act(() => result.current.setEditIsPregnant(true));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(onUpdateDog).toHaveBeenCalledWith("d1", expect.objectContaining({ isPregnant: true }));
  });

  it("omits isPregnant when unchanged", async () => {
    const onUpdateDog = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDogEditForm({ resolvedDog: baseDog, ownerOpenValue: "", humans: {}, onUpdateDog }),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(onUpdateDog.mock.calls[0][1]).not.toHaveProperty("isPregnant");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/modals/dog-card/useDogEditForm.isPregnant.component.test.jsx`
Expected: FAIL — `result.current.setEditIsPregnant` is not a function (state not added yet).

- [ ] **Step 3: Add `isPregnant` to the Dog type**

In `src/types/index.ts`, inside `interface Dog`, add the field after `neutered`:

```ts
  neutered?: boolean | null;
  isPregnant?: boolean | null;
```

- [ ] **Step 4: Add `is_pregnant` to the DB row type + map (read side)**

In `src/supabase/transforms.ts`, in `interface DbDogRow`, after `neutered`:

```ts
  neutered?: boolean | null;
  is_pregnant?: boolean | null;
```

In the same file, in `dbDogsToMap`'s returned object, after the `neutered` line:

```ts
      neutered: row.neutered ?? null,
      isPregnant: row.is_pregnant ?? null,
```

- [ ] **Step 5: Map `isPregnant` → `is_pregnant` in the staff update**

In `src/supabase/hooks/useDogs.ts`, in `updateDog`'s `dbUpdates` block, after the `neutered` line:

```ts
      if (updates.neutered !== undefined) dbUpdates.neutered = updates.neutered;
      if (updates.isPregnant !== undefined) dbUpdates.is_pregnant = updates.isPregnant;
```

- [ ] **Step 6: Add form state, re-sync, save, cancel, and return in `useDogEditForm.js`**

In `src/components/modals/dog-card/useDogEditForm.js`:

(a) After the `editNeutered` state (line ~41), add:
```js
  const [editIsPregnant, setEditIsPregnant] = useState(resolvedDog.isPregnant === true);
```

(b) In the `useEffect` re-sync block, after `setEditNeutered(...)` (line ~72), add:
```js
      setEditIsPregnant(resolvedDog.isPregnant === true);
```

(c) In `handleSave`, after the `nextNeutered` lines (line ~152), add:
```js
    if (editIsPregnant !== (resolvedDog.isPregnant ?? false)) updates.isPregnant = editIsPregnant;
```

(d) In `handleCancel`, after `setEditNeutered(...)` (line ~174), add:
```js
    setEditIsPregnant(resolvedDog.isPregnant === true);
```

(e) In the returned object, after `setEditNeutered,` add:
```js
    editIsPregnant,
    setEditIsPregnant,
```

- [ ] **Step 7: Add the checkbox props + UI in `DogDetailsSection.jsx`**

In `src/components/modals/dog-card/DogDetailsSection.jsx`, add the two props to the destructured
parameter list, after `setEditNeutered,`:

```jsx
  editNeutered,
  setEditNeutered,
  editIsPregnant,
  setEditIsPregnant,
```

Then, immediately after the existing "Neutered" `<div>…</div>` block (the `<select>` at ~282-293), add:

```jsx
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editIsPregnant}
                onChange={(e) => setEditIsPregnant(e.target.checked)}
                aria-label="Pregnant"
              />
              <span className={SECTION_LABEL_CLS}>Pregnant</span>
            </label>
```

(If the read-only/display branch renders other fields when `!isEditing`, leave it unchanged — staff
toggle the flag in edit mode only.)

- [ ] **Step 8: Thread the props through `DogCardModal.jsx`**

In `src/components/modals/DogCardModal.jsx`, add `editIsPregnant, setEditIsPregnant` to the object
destructured from `useDogEditForm(...)` (alongside the existing `editNeutered, setEditNeutered`), then
pass them to `<DogDetailsSection>` after `setEditNeutered={setEditNeutered}` (line ~292):

```jsx
          editNeutered={editNeutered}
          setEditNeutered={setEditNeutered}
          editIsPregnant={editIsPregnant}
          setEditIsPregnant={setEditIsPregnant}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run src/components/modals/dog-card/useDogEditForm.isPregnant.component.test.jsx`
Expected: PASS (both cases).

- [ ] **Step 10: Typecheck, lint, and the component suite**

Run: `npm run typecheck && npm run lint && npm run test:component`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/types/index.ts src/supabase/transforms.ts src/supabase/hooks/useDogs.ts \
  src/components/modals/dog-card/useDogEditForm.js \
  src/components/modals/dog-card/DogDetailsSection.jsx \
  src/components/modals/DogCardModal.jsx \
  src/components/modals/dog-card/useDogEditForm.isPregnant.component.test.jsx
git commit -m "$(cat <<'EOF'
feat(dogs): staff can flag a dog as pregnant

Add an is_pregnant checkbox to the staff dog-edit form, wired through the
Dog type, transforms, and useDogs.updateDog to a staff-only dogs UPDATE.
Mirrors the existing neutered field. Saves only when changed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Customer wizard preflight (disable pregnant dog)

**Files:**
- Modify: `src/supabase/repositories/dogsRepo.ts` (CustomerDog, DbDogRow, dbRowToCustomerDog, listForHuman select)
- Modify: `src/components/customer/booking/DogSelection.tsx` (RawDog, toggle guard, disabled + message)
- Test: `src/components/customer/booking/DogSelection.pregnant.component.test.tsx`

**Interfaces:**
- Consumes: `dogs.is_pregnant` (Task 1 column).
- Produces: `CustomerDog.isPregnant` and `RawDog.isPregnant`, surfaced as a disabled wizard option.

- [ ] **Step 1: Write the failing test**

Create `src/components/customer/booking/DogSelection.pregnant.component.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DogSelection } from "./DogSelection";

const noop = () => {};

const dogs = [
  { id: "d1", name: "Alfie", breed: "Poodle", size: "small" as const, isPregnant: false },
  { id: "d2", name: "Bella", breed: "Labrador", size: "small" as const, isPregnant: true },
];

describe("DogSelection blocks a pregnant dog (preflight UX)", () => {
  it("disables the pregnant dog with an explanation, leaving others selectable", () => {
    render(
      <DogSelection
        dogs={dogs}
        selectedDogs={[]}
        onSelect={noop}
        onNext={noop}
        onDogAdded={noop}
        humanId="h1"
        loading={false}
      />,
    );

    const bella = screen.getByRole("button", { name: /Bella/i });
    expect(bella).toBeDisabled();
    expect(screen.getByText(/can't book online while pregnant/i)).toBeInTheDocument();

    const alfie = screen.getByRole("button", { name: /Alfie/i });
    expect(alfie).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/customer/booking/DogSelection.pregnant.component.test.tsx`
Expected: FAIL — Bella's button is not disabled / the message isn't rendered.

- [ ] **Step 3: Carry `is_pregnant` through the customer dog repo**

In `src/supabase/repositories/dogsRepo.ts`:

(a) `CustomerDog` interface — add the field:
```ts
export interface CustomerDog {
  id: string;
  name: string;
  breed: string;
  size: DogSize | null;
  isPregnant: boolean;
}
```

(b) `DbDogRow` interface — add the column:
```ts
interface DbDogRow {
  id: string;
  name: string | null;
  breed: string | null;
  size: string | null;
  is_pregnant: boolean | null;
}
```

(c) `dbRowToCustomerDog` — map it:
```ts
function dbRowToCustomerDog(row: DbDogRow): CustomerDog {
  return {
    id: row.id,
    name: row.name ?? "",
    breed: row.breed ?? "",
    size: (row.size as DogSize | null) ?? null,
    isPregnant: row.is_pregnant ?? false,
  };
}
```

(d) `listForHuman` — fetch the column:
```ts
    .from("dogs")
    .select("id, name, breed, size, is_pregnant")
    .eq("human_id", humanId)
    .order("name");
```

- [ ] **Step 4: Disable a pregnant dog in `DogSelection.tsx`**

In `src/components/customer/booking/DogSelection.tsx`:

(a) `RawDog` interface — add the field:
```ts
interface RawDog {
  id: string;
  name: string;
  breed: string;
  size: DogSize | null;
  isPregnant: boolean;
}
```

(b) `toggleDog` — guard before selecting, after the size guard:
```ts
  const toggleDog = (dog: RawDog) => {
    if (!dog.size) return;
    if (dog.isPregnant) return;
    const already = isSelected(dog.id);
    if (!already && selectedDogs.length >= 4) return;
    onSelect({ dogId: dog.id, name: dog.name, size: dog.size });
  };
```

(c) In the `dogs.map(...)` body, fold pregnancy into `disabled` and add the message. Change the
`disabled` line to:
```tsx
            const disabled = !sizeKnown || dog.isPregnant || (!selected && selectedDogs.length >= 4);
```
and, immediately after the existing `{!sizeKnown && ( … )}` span block, add:
```tsx
                  {dog.isPregnant && (
                    <span className="text-[12px] font-semibold text-[var(--sd-coral)]">
                      Can't book online while pregnant — please call us
                    </span>
                  )}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/customer/booking/DogSelection.pregnant.component.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck, lint, and the component suite**

Run: `npm run typecheck && npm run lint && npm run test:component`
Expected: PASS. (Confirm `dogsRepo` callers still type-check — `CustomerDog` gained a required
`isPregnant`; the wizard's `RawDog` now matches the repo shape.)

- [ ] **Step 7: Commit**

```bash
git add src/supabase/repositories/dogsRepo.ts \
  src/components/customer/booking/DogSelection.tsx \
  src/components/customer/booking/DogSelection.pregnant.component.test.tsx
git commit -m "$(cat <<'EOF'
feat(wizard): disable a pregnant dog in the booking wizard (preflight)

Fetch dogs.is_pregnant for the customer wizard and disable a pregnant dog
with a clear message. Preflight UX only — the BEFORE INSERT trigger is the
enforcement point.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- **Spec coverage (v5):**
  - Trigger gate on `not is_staff()` covering all non-staff paths → Task 1 (migration) + tests.
  - Trigger-only helper hardening (SECURITY DEFINER, `search_path`, revoked grants, `for share`,
    distinct messages) → Task 1 Step 3 + Step 1 assertions.
  - AC1 (definer call chain works after revokes) → `enforce_dog_not_pregnant` is SECURITY DEFINER
    (Step 3) + test "is SECURITY DEFINER … (AC1)".
  - `service_role ≠ staff` → gated by `is_staff()` (JWT); asserted structurally (gate uses
    `not is_staff()`, not a role check).
  - `is_pregnant` write boundary → `update_customer_dog` whitelist test (Task 1) + staff-only UPDATE
    via RLS (no customer write path touched).
  - Staff-managed checkbox → Task 2.
  - Wizard preflight (disable + message; query gains `is_pregnant`) → Task 3.
  - Existing bookings untouched → trigger is `BEFORE INSERT` only (no UPDATE).
- **Placeholder scan:** none — every step shows the exact code/command. The migration timestamp is a
  concrete value with a documented "use later if newer migrations exist" rule.
- **Type consistency:** `isPregnant` (camelCase) in `Dog`, `CustomerDog`, `RawDog`, form state, and
  `updates.isPregnant`; `is_pregnant` (snake_case) in `DbDogRow` (both files), the SQL column, and
  `dbUpdates`/select. `assert_booking_dog_not_pregnant(uuid)` and `enforce_dog_not_pregnant()` names
  match across the migration and the tests.
- **No live-DB tests:** matches repo convention (static SQL assertions); live truth-table behaviour is
  verified in staging before prod apply, per the spec.
