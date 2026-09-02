/**
 * Debt 6 / 7 / 9 ratchet — the three register rows that regressed between
 * the June and September audits without anyone noticing (see the register's
 * "Status refresh" note). App.jsx has its own ratchet (appShell.test.ts);
 * these three did not, which is exactly how they regressed.
 *
 * Budgets are the file's size at the time the ratchet was added, rounded
 * up a little for ordinary edits. Lower a budget when a split lands; never
 * raise one to fit a feature — extract instead.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BUDGETS: Array<{ file: string; maxLines: number; debt: string }> = [
  // Debt 6 — 943 lines on 2 Sept 2026, 595 after the types/helpers/fetchers split.
  { file: "./supabase/hooks/useWhatsAppInbox.ts", maxLines: 620, debt: "Debt 6" },
  // Debt 7 — 541 lines on 2 Sept 2026 (399 when closed in June); 457 after the trusted-owner extraction.
  { file: "./components/modals/HumanCardModal.jsx", maxLines: 480, debt: "Debt 7" },
  // Debt 9 — 532 lines on 2 Sept 2026 (392 when closed in June).
  { file: "./components/modals/BookingDetailModal.jsx", maxLines: 550, debt: "Debt 9" },
];

describe("register size ratchet (Debt 6, 7, 9)", () => {
  for (const { file, maxLines, debt } of BUDGETS) {
    it(`${debt}: ${file} stays within ${maxLines} lines`, () => {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      const lines = source.split("\n").length;
      expect(lines, `${file} is ${lines} lines; extract before growing it`).toBeLessThanOrEqual(maxLines);
    });
  }
});
