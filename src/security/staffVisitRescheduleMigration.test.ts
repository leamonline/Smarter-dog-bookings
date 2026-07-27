import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260726144007_staff_visit_write_commands.sql",
  "utf8",
);

const functionStart =
  "create or replace function smarter_dog_private.reschedule_staff_visit_dispatch(";
const start = sql.indexOf(functionStart);
const bodyStart = sql.indexOf("as $$", start);
const bodyEnd = sql.indexOf("$$;", bodyStart);
const body = sql.slice(bodyStart, bodyEnd);
const updateStart = sql.indexOf(
  "create or replace function smarter_dog_private.update_staff_visit_dispatch(",
);
const updateBodyStart = sql.indexOf("as $$", updateStart);
const updateBodyEnd = sql.indexOf("$$;", updateBodyStart);
const updateBody = sql.slice(updateBodyStart, updateBodyEnd);

describe("staff visit reschedule migration", () => {
  it("validates the complete one-per-source-dog assignment set before mutation", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(body).toContain("'invalid_slot_assignments'");
    expect(body).toContain("jsonb_array_length(p_slot_assignments) = 0");
    expect(body).toContain("active_slots_for(p_booking_date)");
    expect(body).toContain("v_source_dog_count");
    expect(body).toContain("v_assignment_dog_count");
    const containerGuard = body.indexOf(
      "or jsonb_typeof(p_slot_assignments) <> 'array' then",
    );
    const containerGuardEnd = body.indexOf("end if;", containerGuard);
    const emptyGuard = body.indexOf(
      "if jsonb_array_length(p_slot_assignments) = 0 then",
    );
    const arrayElements = body.indexOf(
      "for v_elem in select * from jsonb_array_elements(p_slot_assignments) loop",
    );
    const objectGuard = body.indexOf(
      "if jsonb_typeof(v_elem) <> 'object' then",
    );
    const objectGuardEnd = body.indexOf("end if;", objectGuard);
    const objectOperators = body.indexOf(
      "if (v_elem - 'dog_id' - 'slot') <> '{}'::jsonb",
    );
    for (const index of [
      containerGuard,
      containerGuardEnd,
      emptyGuard,
      arrayElements,
      objectGuard,
      objectGuardEnd,
      objectOperators,
    ]) {
      expect(index).toBeGreaterThanOrEqual(0);
    }
    expect(emptyGuard).toBeGreaterThan(containerGuardEnd);
    expect(arrayElements).toBeGreaterThan(emptyGuard);
    expect(objectGuard).toBeGreaterThan(arrayElements);
    expect(objectOperators).toBeGreaterThan(objectGuardEnd);
    expect(body).not.toMatch(/\bif\s+case\b/i);
    expect(body.indexOf("'invalid_slot_assignments'")).toBeLessThan(
      body.indexOf("set lifecycle_state = 'superseded'"),
    );
  });

  it("moves a received deposit through destination-bound immutable evidence", () => {
    expect(body).toContain("'deposit_transferred'");
    expect(body).toContain(
      "insert into public.booking_deposit_transfer_reservations",
    );
    expect(body).toContain(
      "'applied', 'retain', p_at",
    );
    expect(body).toContain(
      "'received', d.amount_pence",
    );
    expect(body).toContain(
      "'transfer', v_deposit_transfer_event",
    );
    expect(body).toContain(
      "d.bank_instruction_id, d.due_at",
    );
    expect(body).toContain(
      "d.terms_publication_id, d.terms_accepted_at",
    );
    expect(body).not.toContain(
      "values (v_new_visit, d.origin, d.state",
    );
  });

  it("blocks unsupported, incomplete, and already-consumed deposit evidence", () => {
    for (const reason of [
      "deposit_state_not_transferable",
      "deposit_transfer_evidence_incomplete",
      "deposit_transfer_already_used",
    ]) {
      expect(body).toContain(`'${reason}'`);
      expect(body.indexOf(`'${reason}'`)).toBeLessThan(
        body.indexOf("set lifecycle_state = 'superseded'"),
      );
    }
  });

  it("keeps the superseded source and replacement IDs in their named receipt fields", () => {
    expect(body).toContain(
      "smarter_dog_private.staff_visit_receipt(\n    p_visit_id, 'rescheduled', v_new_visit,",
    );
    expect(body).not.toContain(
      "smarter_dog_private.staff_visit_receipt(\n    v_new_visit, 'rescheduled', p_visit_id,",
    );
  });
});

describe("staff visit update migration", () => {
  it("checks JSON containers before calling array-only functions", () => {
    expect(updateBody).toContain(
      "p_changes is null\n     or jsonb_typeof(p_changes) <> 'array'",
    );
    expect(updateBody).toContain(
      "if jsonb_array_length(p_changes) = 0 then",
    );
    const containerGuard = updateBody.indexOf(
      "or jsonb_typeof(p_changes) <> 'array' then",
    );
    const containerGuardEnd = updateBody.indexOf("end if;", containerGuard);
    const emptyGuard = updateBody.indexOf(
      "if jsonb_array_length(p_changes) = 0 then",
    );
    const arrayElements = updateBody.indexOf(
      "for v_elem in select * from jsonb_array_elements(p_changes) loop",
    );
    const objectGuard = updateBody.indexOf(
      "if jsonb_typeof(v_elem) <> 'object' then",
    );
    const objectGuardEnd = updateBody.indexOf("end if;", objectGuard);
    const objectOperators = updateBody.indexOf(
      "if coalesce(v_elem->>'bookingId','') !~*",
    );
    const addonsArrayGuard = updateBody.indexOf(
      "and jsonb_typeof(v_elem->'addons') <> 'array'",
    );
    const addonsArrayGuardEnd = updateBody.indexOf(
      "end if;",
      addonsArrayGuard,
    );
    const addonsArrayUse = updateBody.indexOf(
      "from jsonb_array_elements(v_elem->'addons') add_on",
    );
    for (const index of [
      containerGuard,
      containerGuardEnd,
      emptyGuard,
      arrayElements,
      objectGuard,
      objectGuardEnd,
      objectOperators,
      addonsArrayGuard,
      addonsArrayGuardEnd,
      addonsArrayUse,
    ]) {
      expect(index).toBeGreaterThanOrEqual(0);
    }
    expect(emptyGuard).toBeGreaterThan(containerGuardEnd);
    expect(arrayElements).toBeGreaterThan(emptyGuard);
    expect(objectGuard).toBeGreaterThan(arrayElements);
    expect(objectOperators).toBeGreaterThan(objectGuardEnd);
    expect(addonsArrayGuard).toBeGreaterThan(objectOperators);
    expect(addonsArrayUse).toBeGreaterThan(addonsArrayGuardEnd);
    expect(updateBody).not.toMatch(/\bif\s+case\b/i);
  });
});
