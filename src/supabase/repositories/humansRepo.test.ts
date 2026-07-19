import { describe, it, expect } from "vitest";
import { mergeHumanSearchHits, getBookingRules, type HumanSearchHit } from "./humansRepo";

const h = (id: string, name: string): HumanSearchHit => ({ id, name, surname: "", phone: "" });

describe("mergeHumanSearchHits", () => {
  it("dedupes by id and preserves first-seen order across lists", () => {
    const out = mergeHumanSearchHits(
      [h("a", "Amanda"), h("b", "Bob")],
      [h("b", "Bob"), h("c", "Cara")], // b is a dup
      [],
      [h("a", "Amanda"), h("d", "Dan")], // a is a dup
    );
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("tolerates null/undefined lists and rows without an id", () => {
    const out = mergeHumanSearchHits(
      null,
      undefined,
      [h("a", "Amanda"), { id: "", name: "x", surname: "", phone: "" }],
    );
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  it("caps the merged list at 20", () => {
    const many = Array.from({ length: 30 }, (_, i) => h(`id${i}`, `n${i}`));
    expect(mergeHumanSearchHits(many)).toHaveLength(20);
  });
});

describe("getBookingRules", () => {
  const mockClient = (result: { data: unknown; error: unknown }) =>
    ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => result,
          }),
        }),
      }),
    }) as never;

  it("maps snake_case rules and defaults empties", async () => {
    const client = mockClient({
      data: { preferred_slots: ["09:00"], blocked_slots: null, deposit_required: true },
      error: null,
    });
    expect(await getBookingRules(client, "h1")).toEqual({
      preferredSlots: ["09:00"],
      blockedSlots: [],
      depositRequired: true,
    });
  });

  it("returns null on error or missing row", async () => {
    expect(await getBookingRules(mockClient({ data: null, error: { message: "x" } }), "h1")).toBeNull();
    expect(await getBookingRules(mockClient({ data: null, error: null }), "h1")).toBeNull();
  });
});
