/**
 * Raw button ratchet.
 *
 * Action buttons should be `Button` (or `IconButton` when it is only an icon)
 * from src/components/ui. Hand-written buttons each carry their own radius,
 * size, focus ring and disabled look, and the old `.btn-*` CSS classes are a
 * second system that Button already covers.
 *
 * Two counts, both of which may only go down:
 *   - `legacy`: a <button> styled with the `.btn` / `.btn-primary` /
 *     `.btn-danger` / `.btn-ghost` / `.btn-sm` classes. These are near
 *     drop-ins for <Button>, so this one is meant to reach zero.
 *   - `raw`: every <button> outside the shared kit. Some of these are
 *     legitimately not a Button (a whole-row or card that is clickable, a tab,
 *     a toggle chip, the day card's heading), so this ceiling is a floor to
 *     reduce towards, not a target of zero.
 *
 * Ceilings are the counts when the ratchet was added. Lower one when you
 * migrate; never raise one to fit a feature, use Button or IconButton.
 *
 * Not counted: the shared kit itself (src/components/ui), test files, and the
 * customer portal's `portal-btn` buttons, which are a separate system on purpose.
 */
import { describe, expect, it } from "vitest";
import { CEILINGS, countRawButtons as countInSource, measureRawButtons, topFiles } from "./designSystemHealth/ratchets";

const ceilings = CEILINGS.rawButtons;
type Kind = keyof typeof ceilings;

describe("raw buttons ratchet", () => {
  const { totals, perFile } = measureRawButtons();

  for (const kind of Object.keys(ceilings) as Kind[]) {
    it(`${kind === "raw" ? "hand-written <button>" : "<button> using .btn classes"} stays at or below ${ceilings[kind]}`, () => {
      expect(
        totals[kind],
        `${totals[kind]} found (ceiling ${ceilings[kind]}). Use Button, or IconButton for an ` +
          `icon-only one, from components/ui. Most: ${topFiles(perFile[kind]!)}`,
      ).toBeLessThanOrEqual(ceilings[kind]!);
    });
  }
});

// A ratchet that miscounts is worse than none, so check the scanner itself.
describe("raw buttons scanner", () => {
  it("counts a plain button and a legacy-class button", () => {
    expect(countInSource('<button className="x">a</button><button className="btn btn-ghost">b</button>')).toEqual({
      raw: 2,
      legacy: 1,
    });
  });

  it("does not count the shared Button or IconButton (capitalised)", () => {
    expect(countInSource("<Button>a</Button><IconButton label=\"x\" />")).toEqual({ raw: 0, legacy: 0 });
  });

  it("does not count the portal's separate portal-btn system", () => {
    expect(countInSource('<button className="portal-btn portal-btn--primary">a</button>')).toEqual({ raw: 0, legacy: 0 });
  });

  it("matches btn as a whole class token only", () => {
    expect(countInSource('<button className="btn-like">a</button>').legacy).toBe(0);
    expect(countInSource('<button className="px-3 btn">a</button>').legacy).toBe(1);
    expect(countInSource("<button className={`btn ${extra}`}>a</button>").legacy).toBe(1);
  });

  it("reads past an arrow function inside the tag to find a later className", () => {
    expect(countInSource('<button onClick={(e) => go(e)} className="btn btn-primary">a</button>').legacy).toBe(1);
  });

  it("is not fooled by > inside a string", () => {
    expect(countInSource('<button title="a>b" className="btn">a</button>').legacy).toBe(1);
  });

  it("counts every element, not every line", () => {
    expect(countInSource('<button>a</button><button>b</button>\n<button>c</button>').raw).toBe(3);
  });
});
