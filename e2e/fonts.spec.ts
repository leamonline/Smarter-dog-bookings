import { expect, test } from "@playwright/test";

// Which font actually painted the text, as Chromium reports it.
//
// Unit tests see `font-family: Montserrat` in the CSS; they cannot see that the
// browser then used the system font instead. That happened once: a single
// `font-weight: 400 700` @font-face for the accented-letter file out-ranked the
// real Montserrat faces for every weight, so ALL ordinary text silently fell
// back to the system font. It looked fine on a Mac (a narrow fallback) and broke
// a layout test on Linux CI (a wide one). This is the check that would have
// said so at once.

const BRAND = /Montserrat|Poppins|Barlow/i;

test.describe("Fonts", () => {
  test("ordinary text in each weight is painted in a brand font, not the system fallback", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/staff/today?date=2026-10-26");
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.fonts.ready);

    const client = await page.context().newCDPSession(page);
    await client.send("DOM.enable");
    await client.send("CSS.enable");
    const { root } = await client.send("DOM.getDocument", { depth: -1 });

    // Pick leaf elements of plain ASCII letters, one set per weight, so the
    // check does not depend on any particular screen's wording.
    const marked = await page.evaluate(() => {
      const picked: Record<string, number> = {};
      let i = 0;
      for (const el of document.querySelectorAll("body *")) {
        if (el.children.length) continue;
        const text = (el.textContent ?? "").trim();
        if (!/^[A-Za-z][A-Za-z ,.'-]{3,}$/.test(text)) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const weight = Number(style.fontWeight) >= 700 ? "bold" : Number(style.fontWeight) >= 600 ? "semibold" : "regular";
        const key = `${weight}`;
        if ((picked[key] ?? 0) >= 4) continue;
        picked[key] = (picked[key] ?? 0) + 1;
        el.setAttribute("data-font-probe", `${weight}-${i++}`);
      }
      return picked;
    });
    expect(Object.keys(marked).length, "no text found to probe").toBeGreaterThan(0);
    expect(marked.regular ?? 0, "no regular-weight text found").toBeGreaterThan(0);

    const { nodeIds } = await client.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-font-probe]" });
    const wrong: string[] = [];
    for (const nodeId of nodeIds) {
      const { fonts } = await client.send("CSS.getPlatformFontsForNode", { nodeId });
      const names = fonts.map((f) => f.familyName);
      const { attributes } = await client.send("DOM.getAttributes", { nodeId });
      const label = attributes[attributes.indexOf("data-font-probe") + 1];
      if (!names.length || !names.every((n) => BRAND.test(n))) {
        wrong.push(`${label}: ${names.join(", ") || "(none)"}`);
        continue;
      }
      // A bold or semibold element must be painted in a face that really is
      // bold, not the regular face with a bold smear added by the browser.
      const faces = fonts.map((f) => f.postScriptName ?? "").join(" ");
      if (label.startsWith("bold-") && !/(?<!semi)bold|black|heavy/i.test(faces)) wrong.push(`${label}: no bold face (${faces})`);
      if (label.startsWith("semibold-") && !/semibold|bold|black|heavy/i.test(faces)) wrong.push(`${label}: no semibold face (${faces})`);
    }
    expect(wrong, `text painted in a non-brand font:\n  ${wrong.join("\n  ")}`).toEqual([]);
  });
});
