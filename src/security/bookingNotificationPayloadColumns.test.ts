// Every column of `bookings` is forwarded to the notification functions.
//
// Two paths carry the same payload:
//
//   1. the Postgres triggers, which send `'record', row_to_json(NEW)` — the
//      whole row — on every booking status change. This is the path every
//      automatic confirmation, ready and cancellation notification takes.
//   2. `resend-booking-notification`, whose `select("*")` mirrors that shape
//      so staff can replay a failed send down the identical code path.
//
// The 2026-08-18 data-exposure audit flagged the wildcard select as its only
// finding, and recommended against narrowing it: the consuming functions read
// eleven columns directly and `_shared/recipients.ts` reads three more off the
// same object, so a partial column list would leave deposit-gated suppression
// undefined and silently change which customers get messaged. Narrowing would
// also make the two payloads diverge, so a future consumer change could work
// on the trigger path and break on the resend path.
//
// What that leaves unaddressed is the audit's actual residual concern: a
// column added to `bookings` later is forwarded automatically, with no review.
// Narrowing the resend select would not have fixed that either — the trigger
// path forwards the identical row far more often.
//
// So this guard makes the forwarding reviewed instead of silent. Every column
// is classified once, here. Add a column to `bookings` and this test fails
// until someone states what it is and whether a notification payload should
// carry it. It asserts no runtime behaviour and changes none; it exists so the
// decision happens at the point of change, while a human is looking.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

// The functions that receive the forwarded row as payload.record /
// payload.old_record. notify-booking-reminder is deliberately absent: it takes
// a booking_id and loads its own row, so it consumes nothing from the payload.
const RECORD_CONSUMERS = [
  "supabase/functions/notify-booking-confirmed/index.ts",
  "supabase/functions/notify-booking-ready/index.ts",
  "supabase/functions/notify-booking-cancelled/index.ts",
  "supabase/functions/_shared/recipients.ts",
];

// Columns a consumer actually reads off the forwarded row. Changing this list
// by hand is not enough — it is recomputed from the sources below.
const CONSUMED: Record<string, string> = {
  booking_date: "message body — the appointment date",
  cancel_reason: "cancellation message, and the reason line in recipients.ts",
  confirmation_channel: "recipients.ts — 'none' suppresses the send entirely",
  deposit_received_at: "recipients.ts — deposit-gated suppression",
  deposit_required: "recipients.ts — deposit-gated suppression",
  dog_id: "looks up the dog's name for the message",
  group_id: "groups a multi-dog booking into one message",
  id: "idempotency key for the notification_log row",
  notify_human_ids: "the recipient list itself",
  payment: "recipients.ts — deposit-gated suppression",
  service: "message body — which groom was booked",
  slot: "message body — the appointment time",
  status: "guards which status transition warrants a message",
  visit_id: "links a cancellation to its visit",
};

// Columns forwarded but read by nobody. Each states what it is, so that
// "harmless" is a judgement on the record rather than an assumption.
const FORWARDED_UNUSED: Record<string, string> = {
  addons: "operational — extras chosen for the groom",
  breed_snapshot: "operational — breed captured at booking time",
  chain_id: "operational — links a recurring chain",
  checked_in_at: "operational — arrival timestamp",
  completed_at: "operational — completion timestamp",
  confirmed: "operational — legacy confirmation flag",
  created_at: "operational — row creation timestamp",
  created_by_id: "staff attribution — internal user id",
  created_by_name: "staff attribution — a STAFF member's name, not a customer's",
  created_by_role: "staff attribution — role label",
  deposit_amount: "financial — deposit value",
  deposit_due_by: "financial — deposit deadline",
  deposit_reference: "financial — payment reference string",
  dog_name_snapshot: "customer data — dog name captured at booking time",
  notes: "FREE TEXT — staff notes on the booking. See the sensitivity test.",
  owner_name_snapshot: "customer data — owner name captured at booking time",
  paid_amount: "financial — amount paid",
  paid_at: "financial — payment timestamp",
  payment_method: "financial — how it was paid",
  pickup_by_id: "operational — who collects the dog",
  price_override: "financial — manual price adjustment",
  ready_at: "operational — ready-for-collection timestamp",
  reminder_confirmed_at: "operational — reminder acknowledgement",
  size: "operational — dog size, drives capacity",
  source: "operational — booking channel",
  staff_capacity_override: "operational — capacity override flag",
  staff_capacity_override_at: "operational — override timestamp",
  staff_capacity_override_by: "operational — overriding staff member",
  updated_at: "operational — last write timestamp",
  visit_membership_state: "operational — visit grouping state",
  whatsapp_conversation_id: "links the booking to a WhatsApp thread",
  whatsapp_message_id: "links the booking to a WhatsApp message",
};

// Forwarded columns carrying customer-identifying or free-text content. They
// reach only other Edge Functions in the same project, and none is rendered
// into a customer message from the payload — but they travel, so they are
// named rather than left to be discovered.
const SENSITIVE_FORWARDED = [
  "notes",
  "owner_name_snapshot",
  "dog_name_snapshot",
  "breed_snapshot",
  "deposit_reference",
  "created_by_name",
];

function bookingsColumns(): string[] {
  const types = read("src/supabase/database.types.ts");
  const start = types.indexOf("      bookings: {");
  expect(start, "bookings table not found in database.types.ts").toBeGreaterThan(-1);
  const row = types.slice(types.indexOf("Row: {", start), types.indexOf("Insert:", start));
  return [...row.matchAll(/^\s{10}([a-z_]+):\s*.+$/gm)].map((m) => m[1]).sort();
}

function columnsReadByConsumers(columns: string[]): string[] {
  const known = new Set(columns);
  const found = new Set<string>();
  for (const path of RECORD_CONSUMERS) {
    const src = read(path);
    for (const m of src.matchAll(/\bbooking\.([a-z_]+)\b/g)) {
      // Intersect with real columns: a consumer may also read derived
      // properties off other objects that happen to be named `booking`.
      if (known.has(m[1])) found.add(m[1]);
    }
  }
  return [...found].sort();
}

describe("booking notification payload columns", () => {
  it("classifies every column of bookings exactly once", () => {
    const columns = bookingsColumns();
    const classified = [...Object.keys(CONSUMED), ...Object.keys(FORWARDED_UNUSED)].sort();

    const unclassified = columns.filter((c) => !classified.includes(c));
    expect(
      unclassified,
      `bookings gained ${unclassified.length} column(s) that nothing has classified: ` +
        `${unclassified.join(", ")}. Every column of this table is forwarded whole to the ` +
        `notification functions — by the Postgres trigger (row_to_json(NEW)) and by ` +
        `resend-booking-notification's select("*"). Decide whether a notification payload ` +
        `should carry this data, then add it to CONSUMED or FORWARDED_UNUSED in this file.`,
    ).toEqual([]);

    const stale = classified.filter((c) => !columns.includes(c));
    expect(stale, `classified column(s) no longer exist on bookings: ${stale.join(", ")}`).toEqual([]);

    // No column may appear in both maps.
    const overlap = Object.keys(CONSUMED).filter((c) => c in FORWARDED_UNUSED);
    expect(overlap, "a column cannot be both consumed and unused").toEqual([]);
  });

  it("recomputes the consumed set from the consuming sources", () => {
    // The point of recomputing: CONSUMED is prose, and prose rots. If a
    // consumer starts reading a column, or stops, this fails rather than
    // letting the classification drift away from the code.
    const columns = bookingsColumns();
    const actuallyRead = columnsReadByConsumers(columns);

    expect(
      actuallyRead,
      "the columns consumers read no longer match CONSUMED — update it, and check " +
        "whether the change affects what a notification says or who receives it",
    ).toEqual(Object.keys(CONSUMED).sort());
  });

  it("keeps the deposit-suppression columns in the consumed set", () => {
    // These three are the trap the audit called out: they are read only by the
    // shared helper, so an enumeration based on the notify functions alone
    // misses them, and losing them would send confirmations for bookings whose
    // deposit is unpaid — silently, with no error.
    for (const column of ["deposit_required", "deposit_received_at", "payment"]) {
      expect(CONSUMED, `${column} drives deposit-gated suppression`).toHaveProperty(column);
    }
    expect(read("supabase/functions/_shared/recipients.ts")).toMatch(
      /booking\.deposit_required[\s\S]*booking\.deposit_received_at[\s\S]*booking\.payment/,
    );
  });

  it("names the sensitive columns that travel in the payload", () => {
    for (const column of SENSITIVE_FORWARDED) {
      expect(
        FORWARDED_UNUSED,
        `${column} is forwarded and sensitive; it must stay classified and acknowledged`,
      ).toHaveProperty(column);
    }
  });

  it("still forwards the whole row on both paths, so neither is narrowed alone", () => {
    // If someone narrows one path without the other, the payloads diverge and
    // a consumer change can work on the trigger path while breaking on resend.
    // Narrowing is a deliberate two-path change; this makes a one-sided one loud.
    expect(read("supabase/functions/resend-booking-notification/index.ts")).toContain(
      'from("bookings")\n      .select("*")',
    );
    const triggerMigration = read(
      "supabase/migrations/20260507132400_dehardcode_notify_urls.sql",
    );
    expect(triggerMigration).toContain("'record', row_to_json(NEW)");
  });
});
