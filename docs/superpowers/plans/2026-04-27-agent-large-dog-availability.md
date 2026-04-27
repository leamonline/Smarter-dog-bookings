# WhatsApp Agent — Large-Dog Day-Level Availability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the WhatsApp AI agent honest day-level visibility into large-dog availability so it can name candidate days and acknowledge a tight diary, without ever proposing a specific time-of-day or a `booking_action` for a large dog.

**Architecture:** New PL/pgSQL helper `large_dog_can_fit_on_day(p_date)` that composes the existing 006 helpers and inlines the rule branches the trigger already runs. New read-only RPC `get_large_dog_day_availability(p_from, p_to)` calls it across a date range. The `whatsapp-agent` edge function gets a parallel `buildLargeDogAvailabilityBlock` cloned from `buildAvailabilityBlock` and injects an `--- Large-dog availability ---` block alongside the existing small/medium one. Two system prompt rules are updated to authorise day-level mentions for large dogs while keeping the no-`booking_action` constraint.

**Tech Stack:** PostgreSQL (PL/pgSQL), Supabase Edge Functions (Deno + TypeScript), Anthropic Claude API.

**Spec:** [docs/superpowers/specs/2026-04-27-whatsapp-agent-large-dog-availability-design.md](docs/superpowers/specs/2026-04-27-whatsapp-agent-large-dog-availability-design.md)

**Branch:** `feat/agent-large-dog-availability` (already created, spec already committed at `a83faf6`)

**Supabase project:** `nlzhllhkigmsvrzduefz` (`Smarter-dog-grooming`, region `eu-west-2`)

---

## File Map

- **Create:** `supabase/migrations/035_whatsapp_agent_large_dog_availability.sql` — defines `large_dog_can_fit_on_day` and `get_large_dog_day_availability`
- **Create (transient, not committed):** the regression-test SQL block in Task 2 — run via the Supabase MCP `execute_sql`, no file needed
- **Modify:** `supabase/functions/whatsapp-agent/index.ts`
  - Add helper `buildLargeDogAvailabilityBlock` immediately after the existing `buildAvailabilityBlock` (around line 460)
  - Add `parts.push(await buildLargeDogAvailabilityBlock(supabase, todayIso));` immediately after the existing small/medium push in `buildContext` (around line 553)
  - Modify the "NEVER invent appointment slots" rule (currently line 208) to reference both blocks
  - Insert a new bullet between the existing booking_action rule (line 203) and the banned-phrases rule (line 204)
- **Plan itself:** `docs/superpowers/plans/2026-04-27-agent-large-dog-availability.md`

---

## Testing approach

The repo has no automated test framework for Supabase edge functions or SQL RPCs. Following the same pattern as PR #58:

- **SQL:** every change is followed by an `execute_sql` verification via the Supabase MCP. Expected outputs are specified per task.
- **Regression test (new):** Task 2 ships a self-contained `DO $$ ... $$;` block that seeds a test customer/dog, walks deterministic diary states, calls the helper, and probes the trigger via savepoint-INSERTs. Cleans up after itself. Run-once via MCP `execute_sql` for now; can be added to CI later.
- **Edge function:** after deploy, manual smoke tests with WhatsApp messages and the staff inbox.

---

## Task 1: Create and apply migration 035

**Files:**
- Create: `supabase/migrations/035_whatsapp_agent_large_dog_availability.sql`

- [ ] **Step 1.1: Write the migration file**

Create `supabase/migrations/035_whatsapp_agent_large_dog_availability.sql` with this exact content:

```sql
-- 035_whatsapp_agent_large_dog_availability.sql
--
-- Read-only helpers used by the WhatsApp AI agent to give honest
-- day-level availability for large dogs. The 006 trigger remains the
-- safety net for any insert; this file mirrors a subset of its rules
-- so the agent can name candidate days without ever proposing a
-- booking_action or specific slot for a large dog.
--
-- Spec: docs/superpowers/specs/2026-04-27-whatsapp-agent-large-dog-availability-design.md

-- ============================================================
-- large_dog_can_fit_on_day(p_date)
--
-- Returns true if at least one of the 5 large-dog allowed slots
-- (08:30, 09:00, 12:00, 12:30, 13:00) on p_date passes every rule
-- the 006 trigger runs for size='large'. Returns false otherwise.
--
-- Composes the 006 helpers active_slots, get_seats_used,
-- has_large_dog, is_large_dog_slot, large_dog_can_share,
-- get_max_seats_for_slot and get_seats_needed.
-- ============================================================

create or replace function large_dog_can_fit_on_day(p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enforce       boolean;
  v_slots         text[];
  v_seats_array   integer[];
  v_overrides     jsonb;
  v_large_slots   text[] := array['08:30', '09:00', '12:00', '12:30', '13:00'];
  v_slot          text;
  v_slot_index    integer;
  v_seats_used    integer;
  v_max_seats     integer;
  v_early_close   boolean;
  v_has_large     boolean;
  v_can_share     boolean;
  v_seats_needed  integer;
  v_slot_cap      integer;
  v_prev_slot     text;
  v_next_slot     text;
  i               integer;
begin
  -- Safety flag: if global enforcement disabled, fail open (matches trigger).
  select coalesce(sc.enforce_server_capacity, true)
    into v_enforce
    from salon_config sc
    limit 1;

  if not coalesce(v_enforce, true) then
    return true;
  end if;

  -- Pull day_settings.overrides once for the per-slot soft cap.
  select ds.overrides into v_overrides
    from day_settings ds
   where ds.setting_date = p_date;
  v_overrides := coalesce(v_overrides, '{}'::jsonb);

  -- Build seats_used array for ALL slots on this date (used by 2-2-1 rule).
  v_slots := active_slots();
  v_seats_array := array[]::integer[];
  for i in 1..array_length(v_slots, 1) loop
    v_seats_array := v_seats_array || get_seats_used(p_date, v_slots[i], null);
  end loop;

  v_early_close := has_large_dog(p_date, '12:00', null);

  -- Try each large-dog allowed slot in order; return true on first that fits.
  foreach v_slot in array v_large_slots loop
    -- Per-slot soft cap from day_settings.overrides; cap=0 means closed.
    v_slot_cap := coalesce(
      (v_overrides -> (p_date::text) ->> v_slot)::int,
      2
    );
    if v_slot_cap = 0 then
      continue;
    end if;

    -- Find slot index in active_slots() for 2-2-1 lookup.
    v_slot_index := null;
    for i in 1..array_length(v_slots, 1) loop
      if v_slots[i] = v_slot then
        v_slot_index := i;
        exit;
      end if;
    end loop;
    if v_slot_index is null then
      continue;
    end if;

    v_seats_used    := v_seats_array[v_slot_index];
    v_max_seats     := get_max_seats_for_slot(v_slot_index, v_seats_array);
    v_has_large     := has_large_dog(p_date, v_slot, null);
    v_can_share     := large_dog_can_share(v_slot);
    v_seats_needed  := get_seats_needed('large', v_slot);

    -- Early close: large dog at 12:00 means 13:00 capacity is 0.
    if v_slot = '13:00' and v_early_close then
      v_max_seats := 0;
    end if;

    -- Rule 5: 09:00 conditional.
    if v_slot = '09:00' then
      if get_seats_used(p_date, '08:30', null) > 0 then continue; end if;
      if get_seats_used(p_date, '10:00', null) > 1 then continue; end if;
    end if;

    -- Rule 6: 12:00 conditional (only OK if 13:00 is empty).
    if v_slot = '12:00' then
      if get_seats_used(p_date, '13:00', null) > 0 then continue; end if;
    end if;

    -- Rule 7: 13:00 early close.
    if v_slot = '13:00' and v_early_close then
      continue;
    end if;

    -- Rule 10: back-to-back, only for non-shareable slots (12:30, 13:00).
    if not v_can_share then
      -- Previous slot
      if v_slot_index > 1 then
        v_prev_slot := v_slots[v_slot_index - 1];
        if is_large_dog_slot(v_prev_slot)
           and not large_dog_can_share(v_prev_slot)
           and has_large_dog(p_date, v_prev_slot, null) then
          if not (
            (v_prev_slot = '12:30' and v_slot = '13:00') or
            (v_prev_slot = '13:00' and v_slot = '12:30')
          ) then
            continue;
          end if;
        end if;
      end if;
      -- Next slot
      if v_slot_index < array_length(v_slots, 1) then
        v_next_slot := v_slots[v_slot_index + 1];
        if is_large_dog_slot(v_next_slot)
           and not large_dog_can_share(v_next_slot)
           and has_large_dog(p_date, v_next_slot, null) then
          if not (
            (v_slot = '12:30' and v_next_slot = '13:00') or
            (v_slot = '13:00' and v_next_slot = '12:30')
          ) then
            continue;
          end if;
        end if;
      end if;
    end if;

    -- Rule 8: shareable slot, second large dog blocked.
    if v_can_share and v_has_large then
      continue;
    end if;

    -- Rule 9: full-takeover slot must be empty.
    if not v_can_share and v_seats_used > 0 then
      continue;
    end if;

    -- Rule 11: general capacity check (covers Rule 9's seats_needed > max_seats too).
    if (v_seats_used + v_seats_needed) > v_max_seats then
      continue;
    end if;

    -- All rules passed for this slot.
    return true;
  end loop;

  return false;
end;
$$;

comment on function large_dog_can_fit_on_day(date) is
  'Returns true if at least one of the 5 large-dog allowed slots passes the same rules the 006 trigger checks. Read-only; the trigger remains the source of truth on insert.';

revoke all on function large_dog_can_fit_on_day(date) from public;
grant execute on function large_dog_can_fit_on_day(date) to authenticated, service_role;

-- ============================================================
-- get_large_dog_day_availability(p_from, p_to)
--
-- Returns one row per OPEN day in [p_from, p_to], with
-- has_capacity = large_dog_can_fit_on_day(day). Closed days are
-- omitted entirely (mirrors get_small_medium_availability's filter).
-- ============================================================

create or replace function get_large_dog_day_availability(
  p_from date,
  p_to   date
)
returns table (booking_date date, has_capacity boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day date;
begin
  for v_day in
    with days as (
      select g::date as d
        from generate_series(p_from, p_to, interval '1 day') as g
    )
    select d.d
      from days d
      left join day_settings ds on ds.setting_date = d.d
     where coalesce(
             ds.is_open,
             extract(isodow from d.d) in (1, 2, 3)  -- Mon=1, Tue=2, Wed=3
           ) = true
  loop
    booking_date := v_day;
    has_capacity := large_dog_can_fit_on_day(v_day);
    return next;
  end loop;
  return;
end;
$$;

comment on function get_large_dog_day_availability(date, date) is
  'Returns (date, has_capacity) for each open day in the range. has_capacity is true if at least one large-dog slot would pass the 006 trigger rules.';

revoke all on function get_large_dog_day_availability(date, date) from public;
grant execute on function get_large_dog_day_availability(date, date) to authenticated, service_role;

-- Rollback:
--   drop function if exists get_large_dog_day_availability(date, date);
--   drop function if exists large_dog_can_fit_on_day(date);
```

- [ ] **Step 1.2: Apply the migration to prod via MCP**

Use the Supabase MCP tool `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__apply_migration` with:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `name`: `035_whatsapp_agent_large_dog_availability`
- `query`: the full SQL content from Step 1.1

Expected: `{"success": true}`. The migration is `create or replace` and idempotent.

- [ ] **Step 1.3: Sanity-check the helper on an empty future date**

Use `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__execute_sql` with:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `query`:
```sql
select large_dog_can_fit_on_day('2027-05-03'::date) as can_fit;
```

Expected output: `[{"can_fit": true}]`. (Date is a Monday well in the future with no bookings — every large slot should pass.)

- [ ] **Step 1.4: Sanity-check the RPC over a 14-day window**

Run via `execute_sql`:
```sql
select booking_date, has_capacity
  from get_large_dog_day_availability(current_date, current_date + 14)
 order by booking_date;
```

Expected: rows for the next up-to-15 open days (Mon/Tue/Wed by default, modulo `day_settings`). Spot-check one row with `has_capacity = false` against the Weekly Calendar view in the dashboard — confirm that day genuinely has no bookable large-dog slot.

- [ ] **Step 1.5: Commit**

```bash
git add supabase/migrations/035_whatsapp_agent_large_dog_availability.sql
git commit -m "$(cat <<'EOF'
feat(db): add large-dog day-level availability RPC for WhatsApp agent

New helper large_dog_can_fit_on_day(date) walks the 5 large-dog allowed
slots and returns true on the first that passes the same rules the 006
trigger checks (09:00/12:00 conditionals, 13:00 early close, back-to-back,
can-share/full-takeover capacity, 2-2-1 cap, day_settings overrides).

New RPC get_large_dog_day_availability(from, to) returns
(date, has_capacity) per open day in the range, mirroring 034's
open-day filter.

Composes existing 006 helpers; trigger remains the source of truth on
insert. Applied to prod.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Run a regression test asserting helper agrees with the trigger

This is a one-off `DO $$` block run via MCP `execute_sql`. It seeds a test customer and dog, walks 12 deterministic diary states (covering the main rule branches), calls the helper, then probes the trigger via savepoint-INSERTs at each of the 5 large-dog slots, and asserts agreement. It cleans up after itself.

If it fails, the helper has drifted from the trigger — fix the helper before proceeding.

**Files:** none (transient SQL via MCP).

- [ ] **Step 2.1: Run the regression test**

Use `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__execute_sql` with:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `query`:

```sql
do $$
declare
  v_customer_id     uuid;
  v_dog_id_large    uuid;
  v_dog_id_small    uuid;
  v_service         text := 'Full Groom';
  v_test_date       date;
  v_helper_result   boolean;
  v_insert_ok       boolean;
  v_disagreements   integer := 0;
  v_total_cases     integer := 0;
  v_slot            text;
  v_phone           text := '+447000' || (floor(random() * 1000000)::int)::text;
  v_case            integer;
begin
  -- Test fixtures: a brand-new customer with one large dog and one small dog.
  insert into customers (name, phone)
    values ('TEST_REGRESSION_LARGE', v_phone)
    returning id into v_customer_id;

  insert into dogs (customer_id, name, size, breed)
    values (v_customer_id, 'TestLarge', 'large', 'Test')
    returning id into v_dog_id_large;

  insert into dogs (customer_id, name, size, breed)
    values (v_customer_id, 'TestSmall', 'small', 'Test')
    returning id into v_dog_id_small;

  -- Walk 12 deterministic diary states.
  for v_case in 1..12 loop
    v_test_date := current_date + (v_case + 365);  -- far future, avoids real bookings
    v_total_cases := v_total_cases + 1;

    -- Seed each case's bookings.
    case v_case
      when 1 then
        -- Empty day. Helper expected: true.
        null;
      when 2 then
        -- 1 small at 09:00 (blocks 09:00 for large via seats_used; other slots free).
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '09:00', v_dog_id_small, 'small', v_service);
      when 3 then
        -- 1 small at 08:30 + 2 small at 10:00 (kills 09:00 conditional; others free).
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '08:30', v_dog_id_small, 'small', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '10:00', v_dog_id_small, 'small', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '10:00', v_dog_id_small, 'small', v_service);
      when 4 then
        -- Large at 12:00 (blocks 13:00 via early close; others free including 12:30).
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '12:00', v_dog_id_large, 'large', v_service);
      when 5 then
        -- Large at 12:30 + large at 13:00 (the only allowed pair). Others free.
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '12:30', v_dog_id_large, 'large', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '13:00', v_dog_id_large, 'large', v_service);
      when 6 then
        -- Large at 13:00 only. 12:30 still bookable via the pair exception.
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '13:00', v_dog_id_large, 'large', v_service);
      when 7 then
        -- Fill 08:30 and 09:00 with smalls (uses seats_used cap=2). 12:00/12:30/13:00 still free.
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '08:30', v_dog_id_small, 'small', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '08:30', v_dog_id_small, 'small', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '09:00', v_dog_id_small, 'small', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '09:00', v_dog_id_small, 'small', v_service);
      when 8 then
        -- Disable global capacity enforcement → helper should return true regardless.
        update salon_config set enforce_server_capacity = false;
        -- Also fill the day completely so the only path to "true" is the safety flag.
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '08:30', v_dog_id_small, 'small', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '08:30', v_dog_id_small, 'small', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '09:00', v_dog_id_small, 'small', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '09:00', v_dog_id_small, 'small', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '12:00', v_dog_id_large, 'large', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '12:30', v_dog_id_large, 'large', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '13:00', v_dog_id_large, 'large', v_service);
      when 9 then
        -- Re-enable enforcement.
        update salon_config set enforce_server_capacity = true;
        -- Mark this date closed via day_settings → RPC will skip; helper still callable.
        insert into day_settings (setting_date, is_open) values (v_test_date, false);
      when 10 then
        -- Empty day but with day_settings.overrides setting all 5 large slots to 0.
        insert into day_settings (setting_date, overrides) values (
          v_test_date,
          jsonb_build_object(
            v_test_date::text,
            jsonb_build_object(
              '08:30', 0, '09:00', 0, '12:00', 0, '12:30', 0, '13:00', 0
            )
          )
        );
      when 11 then
        -- Override: 12:30 cap=0 only, otherwise empty day. Other 4 slots free → helper=true.
        insert into day_settings (setting_date, overrides) values (
          v_test_date,
          jsonb_build_object(
            v_test_date::text,
            jsonb_build_object('12:30', 0)
          )
        );
      when 12 then
        -- Two larges at 08:30 and 12:00 (both shareable slots, no second large allowed).
        -- 09:00 blocked by 08:30 conditional. 13:00 blocked by 12:00 early close.
        -- 12:30: back-to-back check from 12:00 is shareable so doesn't trigger; OK if empty.
        -- So helper expected: true (12:30 fits).
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '08:30', v_dog_id_large, 'large', v_service);
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, '12:00', v_dog_id_large, 'large', v_service);
    end case;

    -- Call the helper.
    v_helper_result := large_dog_can_fit_on_day(v_test_date);

    -- Probe the trigger: try inserting a large dog at each slot inside savepoints.
    v_insert_ok := false;
    foreach v_slot in array array['08:30', '09:00', '12:00', '12:30', '13:00'] loop
      begin
        savepoint sp;
        insert into bookings (booking_date, slot, dog_id, size, service)
          values (v_test_date, v_slot, v_dog_id_large, 'large', v_service);
        v_insert_ok := true;
        rollback to savepoint sp;
      exception
        when others then
          rollback to savepoint sp;
      end;
    end loop;

    if v_helper_result <> v_insert_ok then
      v_disagreements := v_disagreements + 1;
      raise notice 'Case %: DISAGREE date=% helper=% insert_ok=%',
        v_case, v_test_date, v_helper_result, v_insert_ok;
    else
      raise notice 'Case %: agree date=% result=%', v_case, v_test_date, v_helper_result;
    end if;
  end loop;

  -- Cleanup.
  delete from bookings where dog_id in (v_dog_id_small, v_dog_id_large);
  delete from day_settings where setting_date >= current_date + 366;
  delete from dogs where id in (v_dog_id_small, v_dog_id_large);
  delete from customers where id = v_customer_id;
  -- Restore enforcement flag in case Case 8 left it disabled and a later case raised.
  update salon_config set enforce_server_capacity = true where coalesce(enforce_server_capacity, true) = false;

  raise notice 'REGRESSION SUMMARY: % disagreements / % cases', v_disagreements, v_total_cases;
  if v_disagreements > 0 then
    raise exception 'Helper drifted from trigger on % out of % cases', v_disagreements, v_total_cases;
  end if;
end;
$$;
```

Expected output: 12 `Case N: agree …` notices and a `REGRESSION SUMMARY: 0 disagreements / 12 cases` notice. No exception raised.

If any case disagrees, the trace shows which date/case failed. Read the trigger logic in `006_capacity_trigger.sql` for that slot's rules and reconcile with the helper in `035_whatsapp_agent_large_dog_availability.sql`. Fix the helper, re-apply the migration via MCP `apply_migration` (it's `create or replace`), and re-run this step.

- [ ] **Step 2.2: Verify clean state after the test**

Run via `execute_sql`:
```sql
select count(*) as orphan_test_data
  from customers
 where name = 'TEST_REGRESSION_LARGE';
```

Expected: `[{"orphan_test_data": 0}]`. If the regression block raised mid-way, cleanup may not have run; manually delete leftover rows before continuing:

```sql
-- Manual cleanup if needed:
delete from bookings where dog_id in (
  select id from dogs where customer_id in (
    select id from customers where name = 'TEST_REGRESSION_LARGE'
  )
);
delete from day_settings where setting_date >= current_date + 366;
delete from dogs where customer_id in (
  select id from customers where name = 'TEST_REGRESSION_LARGE'
);
delete from customers where name = 'TEST_REGRESSION_LARGE';
update salon_config set enforce_server_capacity = true;
```

- [ ] **Step 2.3: Commit (regression test result, no file change)**

No file changes here; the regression test was transient. Skip the commit step for this task.

---

## Task 3: Add `buildLargeDogAvailabilityBlock` and wire into `buildContext`

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts`

- [ ] **Step 3.1: Add the helper function**

In `supabase/functions/whatsapp-agent/index.ts`, find the closing `}` of the existing `buildAvailabilityBlock` function (around line 460, immediately before the `// ── Context for Claude ──` divider comment).

Insert this block immediately after `buildAvailabilityBlock`'s closing `}` and before the `// ── Context for Claude ──` divider:

```typescript

// ── Large-dog availability block ──────────────────────────────
// Queries get_large_dog_day_availability (migration 035) and formats
// the result as a compact prompt section. Day-level only: the agent
// may name candidate days but never a time-of-day for a large dog.
// Spec: docs/superpowers/specs/2026-04-27-whatsapp-agent-large-dog-availability-design.md
//
// Format example:
//   --- Large-dog availability (next 30 days) ---
//   Days with capacity: Mon 27 Apr, Wed 29 Apr, Tue 05 May
//   Days fully booked: Tue 28 Apr, Mon 04 May, Wed 06 May
//
// - "Days fully booked" is omitted if every open day has capacity.
// - Body is a single "(no large-dog capacity ...)" line if no day has capacity.
// - On RPC error, returns an "(unavailable ...)" body and logs a warning.
async function buildLargeDogAvailabilityBlock(
  supabase: SupabaseClient,
  todayIso: string,
): Promise<string> {
  const toIso = new Date(Date.now() + AVAILABILITY_WINDOW_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase.rpc("get_large_dog_day_availability", {
    p_from: todayIso,
    p_to: toIso,
  });

  const header = `--- Large-dog availability (next ${AVAILABILITY_WINDOW_DAYS} days) ---`;

  if (error) {
    console.warn("buildLargeDogAvailabilityBlock RPC error:", error.message);
    return `${header}\n(unavailable — tell the customer the team will check the diary)`;
  }

  const daysWithCapacity: string[] = [];
  const daysFullyBooked: string[] = [];

  for (const row of (data ?? []) as Array<{ booking_date: string; has_capacity: boolean }>) {
    const label = formatShortDate(row.booking_date);
    if (row.has_capacity) {
      daysWithCapacity.push(label);
    } else {
      daysFullyBooked.push(label);
    }
  }

  if (daysWithCapacity.length === 0) {
    return `${header}\n(no large-dog capacity in the next ${AVAILABILITY_WINDOW_DAYS} days — tell the customer the team will check the diary)`;
  }

  const lines = [`Days with capacity: ${daysWithCapacity.join(", ")}`];
  if (daysFullyBooked.length > 0) {
    lines.push(`Days fully booked: ${daysFullyBooked.join(", ")}`);
  }
  return `${header}\n${lines.join("\n")}`;
}
```

This reuses `AVAILABILITY_WINDOW_DAYS` and `formatShortDate` from the existing small/medium block — do not redeclare them.

- [ ] **Step 3.2: Wire the new helper into `buildContext`**

In the same file, find this exact existing line in `buildContext` (around line 553):

```typescript
  parts.push(await buildAvailabilityBlock(supabase, todayIso));
```

Add a new line **immediately after** it:

```typescript
  parts.push(await buildLargeDogAvailabilityBlock(supabase, todayIso));
```

The final shape of that block:

```typescript
  // Availability applies whether or not the customer is matched — the agent
  // might still propose a slot for a matched dog attached to a different
  // conversation, and unmatched customers will see it via staff approval anyway.
  parts.push(await buildAvailabilityBlock(supabase, todayIso));
  parts.push(await buildLargeDogAvailabilityBlock(supabase, todayIso));

  return parts.join("\n\n");
```

- [ ] **Step 3.3: Type-check the file (best effort)**

Run:
```bash
cd supabase/functions/whatsapp-agent && deno check index.ts
```

Expected: no type errors. If `deno` is not installed, skip this step — the MCP deploy in Task 5 will surface any issues.

- [ ] **Step 3.4: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts
git commit -m "$(cat <<'EOF'
feat(whatsapp-agent): inject large-dog day-level availability into prompt

New buildLargeDogAvailabilityBlock helper calls
get_large_dog_day_availability (migration 035) and formats the result
as a compact "Days with capacity / Days fully booked" block injected
alongside the existing small/medium --- Availability --- block.

The agent gets day-level truth only; the system prompt still forbids
booking_action and time-of-day proposals for large dogs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update system prompt rules

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts` (the `SYSTEM_PROMPT` const's `HARD RULES` block, around lines 199–210)

- [ ] **Step 4.1: Modify the "NEVER invent appointment slots" rule**

In `supabase/functions/whatsapp-agent/index.ts`, find this exact line (currently line 208):

```
- NEVER invent appointment slots. If the "--- Availability ---" block is present, you may only cite dates and times from that block. If it's missing, empty, or says "unavailable", say "let me just check the diary and come back to you".
```

Replace it with:

```
- NEVER invent appointment slots or days. For SMALL/MEDIUM, you may only cite dates and times from "--- Availability ---". For LARGE, you may only cite days from "--- Large-dog availability ---" (and never times of day). If a block is missing, empty, or says "unavailable", say "let me just check the diary and come back to you".
```

- [ ] **Step 4.2: Insert a new rule about large-dog day-level mentions**

In the same file, find the existing booking_action size-gating rule (currently line 203):

```
- For booking_action proposals: if the dog's size is "small" or "medium", the booking_date + slot you cite MUST appear in the "--- Availability ---" block. If the dog's size is "large" (or unknown), do NOT propose a booking_action regardless of availability — say "the team will check the diary".
```

Insert a new bullet **immediately after** that line and **before** the existing banned-phrases rule (which currently begins `- If you include booking_action, the proposed_text MUST NOT imply…`):

```
- For LARGE dogs: when "--- Large-dog availability ---" is present, you MAY name specific days from "Days with capacity" to be helpful ("looks like Wed 13 May has space — would that work?") and you MAY acknowledge a tight diary when "Days fully booked" is long ("the next few weeks are very busy for large dogs"). You MUST NOT cite a time-of-day for a large dog. You MUST NOT propose a booking_action for a large dog. The customer must still clearly expect a follow-up confirmation from staff — banned phrasing from above still applies.
```

The existing line 203 is **left as-is**: the existing "if size is large, no booking_action regardless of availability" rule remains correct and the new rule sits alongside it as additive guidance.

- [ ] **Step 4.3: Verify the prompt block reads cleanly**

Open `supabase/functions/whatsapp-agent/index.ts` to the `HARD RULES — always` section (around lines 198–212) and read top-to-bottom. The flow should now read in this order:

1. NEVER directly confirm/move/cancel a booking
2. You MAY propose a booking_action when these things are explicit/resolved
3. For booking_action proposals, size-gated rule (line 203, **unchanged**)
4. For LARGE dogs, day-level mentions allowed (**new**, from Step 4.2)
5. If you include booking_action, banned phrasing
6. If any detail missing, no booking_action
7. Do not propose reschedules/cancellations
8. NEVER quote prices as fixed guarantees
9. NEVER invent appointment slots or days (**modified**, from Step 4.1)
10. NEVER promise same-day turnaround
11. Distress/complaint → escalate
12. Medical/safety → escalate

If the order is different, fix in place.

- [ ] **Step 4.4: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts
git commit -m "$(cat <<'EOF'
feat(whatsapp-agent): authorise day-level honesty for large-dog enquiries

Generalises the "NEVER invent appointment slots" rule to cover both
availability blocks. Adds an explicit rule that large-dog responses
MAY name candidate days from the new "Days with capacity" list and
MAY acknowledge a tight diary, but MUST NOT cite a time-of-day or
propose a booking_action for a large dog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Deploy and smoke test

**Files:**
- Deploy: `supabase/functions/whatsapp-agent/index.ts` to prod Supabase

- [ ] **Step 5.1: Deploy the edge function via MCP**

Load the deploy tool if needed:
```
ToolSearch: select:mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__deploy_edge_function
```

Then invoke with:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `name`: `whatsapp-agent`
- `files`: an array with one entry, `{ path: "index.ts", content: <full content of supabase/functions/whatsapp-agent/index.ts> }`

Expected: a successful response. Manually deploying rather than waiting for CI because we're still on a feature branch; CI deploys on merge to main.

- [ ] **Step 5.2: Check the deploy logs for startup errors**

Use `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__get_logs` with:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `service`: `edge-function`

Scan recent log lines for `whatsapp-agent` startup errors (Deno boot failures, missing env vars, type errors). Expected: none.

- [ ] **Step 5.3: Manual smoke test — large-dog enquiry against live diary**

Via WhatsApp, send to the salon's test number (or from a known test contact):

> "Hi! Can I book my Husky in for a deshed soon? What's the soonest available?"

Wait ~5 seconds. Expected observations in the staff inbox (`/whatsapp` in the app):

1. The agent's draft reply arrives.
2. **No booking-proposal panel** — the response must contain no `booking_action` JSON.
3. Reply text either:
   - Names a specific day from "Days with capacity" (e.g. "looks like Wed 13 May has space — would that work?"), OR
   - Acknowledges a tight diary (e.g. "the next few weeks are very busy for large dogs, but I'll get the team to confirm…"),
   AND
   - Contains no time-of-day (no "08:30", "12:00", "afternoon", etc.).
4. Reply ends with the brand sign-off `🎓🐶❤️ X`.

If the agent cites a time-of-day, the prompt rule isn't being followed — re-check Step 4.1 and 4.2 wording, redeploy, retest.

- [ ] **Step 5.4: Manual smoke test — small-dog regression**

Send:

> "Hi! Can I book my Boston Terrier in for a full groom? Soonest please."

Expected:

1. The agent's draft reply arrives.
2. **A green booking-proposal panel** appears under the draft (this is the small/medium flow from #58, which must continue working unchanged).
3. The date + slot in the panel is one that appears in the small/medium `--- Availability ---` block.

If this regresses, the most likely cause is an accidental edit to `buildAvailabilityBlock` or the original size-gating rule (line 203). Fix and redeploy.

- [ ] **Step 5.5: Manual smoke test — diary-tight large-dog day**

Optional but recommended: temporarily fill a near-future Monday's large-dog capacity via the staff UI (book all 5 large slots manually with 12:30+13:00 pair + 08:30 + 09:00 + 12:00). Then send a Husky enquiry. Expected: the agent acknowledges the next few weeks being busy and names later days from "Days with capacity".

After the test, clean up the test bookings via the staff UI.

- [ ] **Step 5.6: Commit any deploy-surfaced fixes**

If Steps 5.1–5.5 surface bugs, fix them in source, redeploy via 5.1, and re-run the affected smoke test. Commit each fix:

```bash
git add <path>
git commit -m "fix(whatsapp-agent): <what the smoke test revealed>"
```

If no fixes needed, skip this step.

---

## Task 6: Push the branch and open a PR

- [ ] **Step 6.1: Push the branch**

```bash
git push -u origin feat/agent-large-dog-availability
```

- [ ] **Step 6.2: Open the PR**

```bash
gh pr create --title "feat(whatsapp-agent): large-dog day-level availability" --body "$(cat <<'EOF'
## Summary

Extends the WhatsApp agent's availability awareness to large dogs at day-level granularity. The agent can now name candidate days from "Days with capacity" or acknowledge a tight diary when "Days fully booked" is long, instead of always saying "the team will check the diary."

Large dogs still never get a `booking_action` (staff picks the slot) and the agent still never cites a time-of-day for a large dog (we only have day-level signal).

- New SQL: migration 035 adds `large_dog_can_fit_on_day(date)` and `get_large_dog_day_availability(from, to)`. Composes existing 006 helpers; the trigger remains the source of truth on insert. Already applied to prod.
- Edge function: new `buildLargeDogAvailabilityBlock` injects an `--- Large-dog availability (next 30 days) ---` block alongside the existing small/medium one. Already deployed to prod via MCP.
- System prompt: two rules updated to authorise day-level mentions for large dogs while keeping the no-booking_action and no-time-of-day constraints.

Spec: [docs/superpowers/specs/2026-04-27-whatsapp-agent-large-dog-availability-design.md](docs/superpowers/specs/2026-04-27-whatsapp-agent-large-dog-availability-design.md)
Plan: [docs/superpowers/plans/2026-04-27-agent-large-dog-availability.md](docs/superpowers/plans/2026-04-27-agent-large-dog-availability.md)

## Test plan

- [x] Migration applied + helper/RPC sanity-checked (Task 1)
- [x] Regression test: 12 deterministic diary states, helper agrees with trigger via savepoint-INSERT probe (Task 2)
- [x] Edge function deployed + logs clean (Task 5 Steps 1-2)
- [x] Large-dog test produced no booking_action panel; reply named a day with no time-of-day (Task 5 Step 3)
- [x] Small-dog regression: booking_action panel still works as in #58 (Task 5 Step 4)
- [ ] Monitor next ~5 inbound large-dog messages in prod for false positives

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: a PR URL is returned. Paste it into your follow-up comment so the reviewer can find it.

---

## Self-review

### Spec coverage

- New helper `large_dog_can_fit_on_day(p_date)` with rule branches matching trigger: Task 1.1 ✓
- New RPC `get_large_dog_day_availability(p_from, p_to)` with same open-day filter as 034: Task 1.1 ✓
- Reuses `active_slots`, `get_seats_needed`, `get_seats_used`, `has_large_dog`, `is_large_dog_slot`, `large_dog_can_share`, `get_max_seats_for_slot`: Task 1.1 ✓
- `enforce_server_capacity` fail-open: Task 1.1 (in helper) ✓
- `day_settings.overrides` per-slot soft cap honoured: Task 1.1 ✓
- 30-day window: Task 3.1 (reuses existing `AVAILABILITY_WINDOW_DAYS`) ✓
- Compact "Days with capacity / Days fully booked" format: Task 3.1 ✓
- "Days fully booked" omitted if empty; "no capacity" body if no day has capacity: Task 3.1 ✓
- RPC error handling with "(unavailable ...)" fallback: Task 3.1 ✓
- Edge function block injected after small/medium block: Task 3.2 ✓
- System prompt: modify line 208 + insert new rule between 203 and the banned-phrases rule: Tasks 4.1 + 4.2 ✓
- Line 203 left unchanged (no booking_action for large): Task 4.2 ✓
- No 006 trigger changes: confirmed — only migration 035 is new ✓
- SQL hand-built rule cases (spec testing items 2-3): Task 1.3 + 1.4 sanity, deferred specific cases to Task 2 regression run ✓
- Trigger-agreement regression test (spec testing item 4): Task 2 ✓
- Edge function smoke tests (spec testing items 5-7): Task 5 ✓

### Placeholder scan

No "TBD", "TODO", "implement later", or "similar to Task N" references. All code blocks are complete and copy-pasteable.

### Type consistency

- RPC signature `get_large_dog_day_availability(date, date)` used identically in migration (Task 1.1) and edge function client call (Task 3.1 via `supabase.rpc(...)`).
- Helper signature `large_dog_can_fit_on_day(date)` used identically in helper definition, RPC body, and Task 2 regression test (`v_helper_result := large_dog_can_fit_on_day(v_test_date)`).
- `buildLargeDogAvailabilityBlock(supabase, todayIso)` defined in Task 3.1 with `SupabaseClient` + `string`, called in Task 3.2 with the `supabase` and `todayIso` already in scope inside `buildContext` — same types, mirrors `buildAvailabilityBlock`'s call.
- Return type `Promise<string>` — `parts.push(await buildLargeDogAvailabilityBlock(...))` matches.
- Constants `AVAILABILITY_WINDOW_DAYS` and `formatShortDate` reused from the existing small/medium block — Task 3.1 explicitly notes "do not redeclare them."
