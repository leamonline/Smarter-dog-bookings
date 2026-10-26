/**
 * Hand-rolled dialog ratchet.
 *
 * Every dialog is built on `AccessibleModal` or `ModalShell` (src/components/ui),
 * which own the focus trap, Escape (topmost dialog only), the reference-counted
 * scroll lock and hiding the page from screen readers. A dialog written by hand
 * quietly loses all four. The ceiling is zero: there are none today, so this is a
 * lock rather than a target. If a genuinely different overlay is needed, extend
 * the kit instead of writing the markup again.
 *
 * Not counted: the kit itself (src/components/ui) and test files.
 */
import { describe, expect, it } from "vitest";
import { CEILINGS, countHandRolledDialogs, measureHandRolledDialogs, topFiles } from "./designSystemHealth/ratchets";

const ceilings = CEILINGS.handRolledDialogs;

describe("hand-rolled dialogs ratchet", () => {
  const { totals, perFile } = measureHandRolledDialogs();

  it(`hand-built dialog markup stays at or below ${ceilings.overlays}`, () => {
    expect(
      totals.overlays,
      `${totals.overlays} found (ceiling ${ceilings.overlays}). Build on ModalShell or AccessibleModal from components/ui. Most: ${topFiles(perFile.overlays!)}`,
    ).toBeLessThanOrEqual(ceilings.overlays);
  });
});

// A ratchet that miscounts is worse than none, so check the scanner itself.
describe("hand-rolled dialogs scanner", () => {
  it("counts the dialog roles, aria-modal and a full-screen overlay", () => {
    expect(countHandRolledDialogs('<div role="dialog">')).toBe(1);
    expect(countHandRolledDialogs('<div role="alertdialog">')).toBe(1);
    expect(countHandRolledDialogs('<div aria-modal="true">')).toBe(1);
    expect(countHandRolledDialogs('<div className="fixed inset-0 z-50">')).toBe(1);
  });

  it("ignores a selector that merely looks for a modal", () => {
    expect(countHandRolledDialogs(`if (active?.closest?.('[aria-modal="true"]')) return;`)).toBe(0);
  });

  it("does not count the kit's components", () => {
    expect(countHandRolledDialogs("<ModalShell onClose={close}><AccessibleModal /></ModalShell>")).toBe(0);
  });
});
