/**
 * Hand-typed radius and shadow ratchet.
 *
 * Corner radius and shadow come from a short scale (docs/ux/radius-and-elevation.md):
 * `rounded-control`, `rounded-card`, `rounded-full`, and `shadow-card-resting`,
 * `shadow-elevated`, `shadow-modal`. A `shadow-[0_2px_8px_rgba(…)]` or
 * `rounded-[10px]` typed into a class list is a value that skipped the scale,
 * and eight of the shadows found were exact copies of a token that already
 * existed.
 *
 * This counts the hand-typed ones still left. Ceilings are the counts when the
 * ratchet was added. Lower one when you replace a value with a token; never
 * raise one to fit a feature.
 *
 * `card16` counts the stock `rounded-2xl`. That is exactly 16px, the card radius, so
 * it is written `rounded-card` and the card radius stays one edit. `tile12` counts
 * the stock `rounded-xl`, exactly 12px, which is written `rounded-tile`. The
 * customer portal keeps its own radius tokens and is not counted.
 *
 * Not counted: test files, CSS files and inline style objects (where the tokens
 * themselves are defined and a literal is sometimes the point).
 */
import { describe, expect, it } from "vitest";
import { CEILINGS, countOffScale as countInSource, measureOffScale, topFiles } from "./designSystemHealth/ratchets";

const ceilings = CEILINGS.offScale;
type Kind = keyof typeof ceilings;

describe("hand-typed radius and shadow ratchet", () => {
  const { totals, perFile } = measureOffScale();

  for (const kind of Object.keys(ceilings) as Kind[]) {
    const label = {
      shadow: "hand-typed shadow-[…]",
      radius: "hand-typed rounded-[…]",
      card16: "stock rounded-2xl (use rounded-card)",
      tile12: "stock rounded-xl (use rounded-tile)",
    }[kind];
    it(`${label} stays at or below ${ceilings[kind]}`, () => {
      expect(
        totals[kind],
        `${totals[kind]} found (ceiling ${ceilings[kind]}). Use a token from ` +
          `docs/ux/radius-and-elevation.md. Most: ${topFiles(perFile[kind]!)}`,
      ).toBeLessThanOrEqual(ceilings[kind]!);
    });
  }
});

// A ratchet that miscounts is worse than none, so check the scanner itself.
describe("hand-typed radius and shadow scanner", () => {
  it("counts an arbitrary shadow and an arbitrary radius", () => {
    expect(countInSource('className="shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-[10px]"')).toEqual({ shadow: 1, radius: 1, card16: 0, tile12: 0 });
  });

  it("counts them with a variant prefix and a corner suffix", () => {
    expect(countInSource('className="hover:shadow-[0_4px_12px_black] md:rounded-t-[14px]"')).toEqual({ shadow: 1, radius: 1, card16: 0, tile12: 0 });
  });

  it("does not count the tokens", () => {
    expect(countInSource('className="shadow-card-resting shadow-modal rounded-control rounded-card rounded-full"')).toEqual({
      shadow: 0,
      radius: 0,
      card16: 0,
      tile12: 0,
    });
  });

  it("counts stock rounded-2xl with variants and corners, but not rounded-card or rounded-xl", () => {
    expect(countInSource('"rounded-2xl md:rounded-2xl rounded-t-2xl rounded-card rounded-xl rounded-2xl-x"').card16).toBe(3);
  });

  it("counts stock rounded-xl, but not rounded-tile or rounded-2xl", () => {
    const counts = countInSource('"rounded-xl md:rounded-xl rounded-b-xl rounded-tile rounded-2xl rounded-xl-x"');
    expect(counts.tile12).toBe(3);
    expect(counts.card16).toBe(1);
  });

  it("does not mistake a JS index for a class", () => {
    expect(countInSource("const a = shadow[0]; const b = x.rounded[1];")).toEqual({ shadow: 0, radius: 0, card16: 0, tile12: 0 });
  });

  it("counts every utility, not every line", () => {
    expect(countInSource('"shadow-[a] shadow-[b]"\n"shadow-[c]"').shadow).toBe(3);
  });
});
