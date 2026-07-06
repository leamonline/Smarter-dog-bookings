// One card per booking across the Today concern sections: attention wins,
// then collection, then payments. The view hides a section this empties.
import { describe, expect, it } from "vitest";
import { dedupeConcernSections } from "./today";
import type { AttentionItem, CollectionEntry, PaymentEntry } from "./today";

function attention(id: string): AttentionItem {
  return {
    booking: { id },
    kinds: ["ready"],
    primary: "ready",
    overdueMinutes: 0,
    waitMinutes: 30,
  } as unknown as AttentionItem;
}

function coll(id: string): CollectionEntry {
  return { booking: { id }, waitMinutes: 10 } as unknown as CollectionEntry;
}

function paym(id: string): PaymentEntry {
  return {
    booking: { id },
    payment: { kind: "due", label: "Balance due", amountDue: 42, depositPaid: 0, subtotal: 42 },
  } as unknown as PaymentEntry;
}

describe("dedupeConcernSections", () => {
  it("keeps a booking only in its highest-priority section", () => {
    const out = dedupeConcernSections(
      [attention("a")],
      [coll("a"), coll("b")],
      [paym("a"), paym("b"), paym("c")],
    );
    expect(out.collection.map((e) => e.booking.id)).toEqual(["b"]);
    expect(out.payments.map((e) => e.booking.id)).toEqual(["c"]);
  });

  it("changes nothing when the sections don't overlap", () => {
    const out = dedupeConcernSections([], [coll("x")], [paym("y")]);
    expect(out.collection.map((e) => e.booking.id)).toEqual(["x"]);
    expect(out.payments.map((e) => e.booking.id)).toEqual(["y"]);
  });

  it("can empty a lower section entirely (the view then hides it)", () => {
    const out = dedupeConcernSections([attention("a")], [coll("a")], [paym("a")]);
    expect(out.collection).toHaveLength(0);
    expect(out.payments).toHaveLength(0);
  });
});
