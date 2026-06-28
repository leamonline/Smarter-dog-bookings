import { describe, it, expect } from "vitest";
import { mergeHumanSearchHits, type HumanSearchHit } from "./humansRepo";

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
