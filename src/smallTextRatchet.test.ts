/**
 * Small text ratchet.
 *
 * Readable text is 12px or larger: the named sizes `text-micro`, `text-caption`
 * and `text-label` are all 12px, `text-xs` is 12px, `text-body` 13px. A
 * hand-written `text-[10px]` or `text-[11px]` bypasses that scale, and 10 to
 * 11px is small on a busy salon screen.
 *
 * What is left under 12px are deliberate exceptions: decorative glyphs (the
 * `▼` and `●` marks, aria-hidden), tiny count badges, micro-labels such as
 * "over" in cramped time-slot cells, and a few phone-first pairs such as
 * `text-[11px] sm:text-[12px]` on the booking card, where 12px on a 390px-wide
 * card truncates owner and service names on the main calendar (measured: 7
 * clipped labels became 16). They are counted so the list can only shrink. Lower the ceiling as one is resolved; never raise it. If new text
 * must be small, use a named size.
 */
import { describe, expect, it } from "vitest";
import { CEILINGS, belowFloor, measureSmallText, topFiles } from "./designSystemHealth/ratchets";

const ceilings = CEILINGS.smallText;

describe("small text ratchet", () => {
  const { totals, perFile } = measureSmallText();

  it(`hand-written text sizes under 12px stay at or below ${ceilings.underFloor}`, () => {
    expect(
      totals.underFloor,
      `${totals.underFloor} text-[Npx] sizes under 12px (ceiling ${ceilings.underFloor}). Use text-micro, text-caption or text-xs. Most: ${topFiles(perFile.underFloor!)}`,
    ).toBeLessThanOrEqual(ceilings.underFloor);
  });

  // The sizes the named scale already has (text-xs 12, text-body 13, text-sm 14,
  // text-base 16) should be those names, not hand-written pixels: the named
  // sizes carry a line-height and one place to change them. 15px stays spelled
  // out because text-title also forces a bold weight.
  it("has no hand-written 12, 13, 14 or 16px sizes where a named size exists", () => {
    expect(
      totals.namedSizes,
      `${totals.namedSizes} hand-written sizes. Use text-xs (12), text-body (13), text-sm (14) or text-base (16). Most: ${topFiles(perFile.namedSizes!)}`,
    ).toBeLessThanOrEqual(ceilings.namedSizes);
  });

  it("counts only sizes under 12px", () => {
    expect(belowFloor('className="text-[11px] text-[12px] text-[13px] text-[9px] text-[11.5px]"')).toEqual([
      "text-[11px]",
      "text-[9px]",
      "text-[11.5px]",
    ]);
  });
});
