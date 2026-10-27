/**
 * Menu row and toggle pill ratchet.
 *
 * A row in a menu is `MenuItem` and an on/off pill is `ToggleChip` (src/components/ui).
 * Hand-written ones each carry their own padding, focus, disabled look and touch
 * size. Two counts, both of which may only go down:
 *   - `menuItems`: `role="menuitem"` outside the kit.
 *   - `toggles`: `aria-pressed` outside the kit. Some are not chips (a calendar day,
 *     one half of a segmented control), so this is a floor to reduce towards, not zero.
 * Lower a ceiling when you migrate (`npm run check:design-system -- --lower`);
 * never raise one to fit a feature.
 */
import { describe, expect, it } from "vitest";
import { CEILINGS, countMenusAndToggles, measureMenusAndToggles, topFiles } from "./designSystemHealth/ratchets";

const ceilings = CEILINGS.menusAndToggles;

describe("menus and toggles ratchet", () => {
  const { totals, perFile } = measureMenusAndToggles();
  for (const kind of Object.keys(ceilings) as Array<keyof typeof ceilings>) {
    it(`${kind === "menuItems" ? "hand-written menu rows" : "hand-written toggles"} stay at or below ${ceilings[kind]}`, () => {
      expect(
        totals[kind],
        `${totals[kind]} found (ceiling ${ceilings[kind]}). Use MenuItem or ToggleChip from components/ui. Most: ${topFiles(perFile[kind]!)}`,
      ).toBeLessThanOrEqual(ceilings[kind]);
    });
  }
});

describe("menus and toggles scanner", () => {
  it("counts the markers", () => {
    expect(countMenusAndToggles('<button role="menuitem"><button aria-pressed={on}>')).toEqual({ menuItems: 1, toggles: 1 });
  });
  it("does not count the kit's components or a menu container", () => {
    expect(countMenusAndToggles('<MenuItem/><ToggleChip pressed/><div role="menu">')).toEqual({ menuItems: 0, toggles: 0 });
  });
});
