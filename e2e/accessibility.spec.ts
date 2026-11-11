import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// An automated accessibility pass over the main screens, as a ratchet.
//
// Hand review found most of what this catches (unnamed controls, a visible
// label that did not match its accessible name, white on coral at 3.6:1), and
// the unit tests cannot see any of it: they check class names, not whether the
// colours that result are readable. axe measures the rendered page.
//
// The numbers below are the violations that exist TODAY, counted in nodes per
// rule. A screen may never get worse: more nodes, or a rule that was not there
// before, fails the build. Lower a number when you fix some; never raise one.
// Run `npx playwright test e2e/accessibility.spec.ts` for the list of what is
// left; the failure message names the first few offenders for each rule.
//
// Desktop only, with a pinned window and a frozen clock: contrast and layout
// change with the viewport, and the calendar styles each day relative to
// "today", so an unpinned run would drift as the real date moves on.

type Ceilings = Record<string, number>;

const SCREENS: Array<{ name: string; path: string; ceilings: Ceilings }> = [
  { name: "Daily Brief", path: "/staff/today?date=2026-10-26", ceilings: {} },
  { name: "Calendar", path: "/staff?date=2026-10-26", ceilings: {} },
  { name: "Dogs", path: "/staff/dogs", ceilings: {} },
  { name: "Customers", path: "/staff/humans", ceilings: {} },
  { name: "Inbox", path: "/staff/inbox", ceilings: { "nested-interactive": 4 } },
  { name: "Settings", path: "/staff/settings", ceilings: {} },
  { name: "Reports", path: "/staff/reports", ceilings: {} },
  // The customer sign-in is clean today, so it must stay clean.
  { name: "Customer sign-in", path: "/book", ceilings: {} },
];

test.describe("Accessibility (axe)", () => {
  for (const screen of SCREENS) {
    test(`${screen.name} has no more violations than the recorded ceiling`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Pinned to the desktop window; layouts differ by viewport.");
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.clock.setFixedTime(new Date("2026-10-26T09:00:00"));
      // The first staff entry of a tab session redirects to Daily Brief, so the
      // calendar needs a second visit to land on itself.
      await page.goto(screen.path);
      await page.waitForTimeout(1200);
      if (screen.path.startsWith("/staff?")) {
        await page.goto(screen.path);
        await page.waitForTimeout(1200);
      }

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const found: Ceilings = {};
      const examples: Record<string, string[]> = {};
      for (const violation of results.violations) {
        found[violation.id] = violation.nodes.length;
        examples[violation.id] = violation.nodes
          .slice(0, 3)
          .map((node) => `${node.target.join(" ")}  ${node.html.slice(0, 100)}`);
      }

      const worse = Object.keys(found).filter((rule) => found[rule] > (screen.ceilings[rule] ?? 0));
      const report = worse
        .map(
          (rule) =>
            `${rule}: ${found[rule]} nodes (ceiling ${screen.ceilings[rule] ?? 0})\n    ` +
            examples[rule].join("\n    "),
        )
        .join("\n");
      expect(worse, `${screen.name} got worse:\n${report}`).toEqual([]);
    });
  }
});
