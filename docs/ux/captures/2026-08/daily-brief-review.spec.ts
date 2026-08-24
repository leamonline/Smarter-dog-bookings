/**
 * Capture + measurement harness for docs/ux/daily-brief-review-2026-08.md.
 *
 * Not part of the CI E2E suite. It lives beside the captures it produces so
 * every figure in the review is reproducible. It copies the clock/viewport
 * harness of e2e/daily-brief.spec.ts rather than inventing one.
 *
 * Run (from the repo root):
 *   VITE_FORCE_OFFLINE=1 npm run build
 *   VITE_FORCE_OFFLINE=1 npx vite preview --port 4173 --strictPort &
 *   npx playwright test --config docs/ux/captures/2026-08/pw.config.ts
 *
 * Offline fixture calendar (src/data/sample.js is keyed by WEEKDAY, mapped
 * onto the visible week by src/hooks/useOfflineState.js):
 *   2026-07-13 Mon — 7 bookings, every lane populated, 1 unknown-status row
 *   2026-07-14 Tue — 3 bookings, all Booked
 *   2026-07-15 Wed — 1 cancelled booking only => renders as an empty day
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const MON = "2026-07-13";
const TUE = "2026-07-14";
const WED = "2026-07-15";

const WIDTHS = [
  { id: "390", width: 390, height: 844 },
  { id: "1024", width: 1024, height: 1366 },
  { id: "1440", width: 1440, height: 900 },
] as const;

const DIR = "docs/ux/captures/2026-08";

async function open(page: Page, date: string, iso: string) {
  await page.clock.setFixedTime(new Date(iso));
  await page.goto(`/today?date=${date}`);
  await expect(page.getByRole("heading", { level: 1, name: "Daily Brief" })).toBeAttached();
  await page.waitForTimeout(250);
}

/** Deference counts + geometry, measured over what is actually painted. */
const AUDIT = `(() => {
  const px = (v) => Math.round(parseFloat(v) || 0);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  };
  const inViewport = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  };
  const root = document.querySelector("main") || document.body;
  const all = [...root.querySelectorAll("*")].filter(visible);

  const colours = new Map();
  const bgs = new Map();
  const borders = new Map();
  const note = (map, key, el) => {
    if (!map.has(key)) map.set(key, []);
    if (map.get(key).length < 4) map.get(key).push((el.textContent || "").trim().slice(0, 28) || el.tagName);
  };
  for (const el of all) {
    const s = getComputedStyle(el);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) note(colours, s.color, el);
    if (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") note(bgs, s.backgroundColor, el);
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const w = px(s["border" + side + "Width"]);
      if (w > 0 && s["border" + side + "Style"] !== "none") {
        const key = w + "px " + s["border" + side + "Color"];
        note(borders, key, el);
      }
    }
  }

  const controls = [...root.querySelectorAll('button,a[href],[role="button"],input,select')].filter(visible);
  const controlInfo = controls.map((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 48),
      w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top + window.scrollY),
      inViewport: inViewport(el),
      fontSize: px(s.fontSize), fontWeight: s.fontWeight,
      bg: s.backgroundColor, colour: s.color,
      primary: el.hasAttribute("data-primary-action"),
    };
  });

  // Numbers at rest: digit-bearing tokens in visible text nodes.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const numbers = [];
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.textContent || "").trim();
    if (!t || !/\\d/.test(t)) continue;
    const p = n.parentElement;
    if (!p || !visible(p)) continue;
    for (const m of t.match(/£?\\d[\\d:.,\\/]*%?/g) || []) {
      numbers.push({ text: m, inViewport: inViewport(p), context: t.slice(0, 40) });
    }
  }

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    scrollHeight: document.documentElement.scrollHeight,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    distinctTextColours: [...colours.entries()].map(([k, v]) => ({ value: k, samples: v })),
    distinctBackgrounds: [...bgs.entries()].map(([k, v]) => ({ value: k, samples: v })),
    distinctBorders: [...borders.entries()].map(([k, v]) => ({ value: k, samples: v })),
    controls: controlInfo,
    controlCount: controlInfo.length,
    controlsInViewport: controlInfo.filter((c) => c.inViewport).length,
    numbers,
    numbersInViewport: numbers.filter((x) => x.inViewport).length,
  };
})()`;

/** Visual-weight probe for the disagreement table. */
const weighFor = (selectors: Array<[string, string]>) => `(() => {
  const selectors = ${JSON.stringify(selectors)};
  const out = [];
  for (const [name, sel] of selectors) {
    const el = sel.startsWith("text=")
      ? [...document.querySelectorAll("button,a")].find(
          (n) => (n.textContent || "").trim() === sel.slice(5),
        )
      : document.querySelector(sel);
    if (!el) { out.push({ name, sel, found: false }); continue; }
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    out.push({
      name, sel, found: true,
      x: Math.round(r.left), y: Math.round(r.top + window.scrollY),
      w: Math.round(r.width), h: Math.round(r.height),
      area: Math.round(r.width * r.height),
      aboveFold: r.top + window.scrollY < window.innerHeight,
      fontSize: Math.round(parseFloat(s.fontSize)),
      fontWeight: s.fontWeight,
      colour: s.color, background: s.backgroundColor,
      text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 70),
    });
  }
  return out;
})()`;

const PROBES: Array<[string, string]> = [
  ["H:date", '[data-testid="daily-brief-date"]'],
  ["H:openPill", '[data-testid="daily-brief-header-full"] [class*="rounded-full"]'],
  ["H:availabilityText", '[data-testid="daily-brief-header-full"] [aria-label="Availability"]'],
  ["H:opStatusGrid", '[aria-label="Daily Brief operational status"]'],
  ["H:secondaryTotals", '[aria-label="Daily Brief secondary totals"]'],
  ["H:chooseDate", '[aria-label^="Choose date"]'],
  ["H:manageAvailability", "text=Manage availability"],
  ["B:unknownStatusAlert", '[role="alert"]'],
  ["B:laneDue", '[aria-label^="Arriving,"]'],
  ["B:laneWithUs", '[aria-label^="With us,"]'],
  ["B:laneReady", '[aria-label^="Ready to go,"]'],
  ["B:home", '[aria-label^="Home "]'],
  ["B:summaryStrip", '[aria-label="Daily progress"]'],
];

test.describe("Daily Brief — UX review captures", () => {
  for (const v of WIDTHS) {
    test(`populated live day (Mon ${MON}, 11:00) @${v.id}`, async ({ page }) => {
      await page.setViewportSize(v);
      await open(page, MON, `${MON}T11:00:00+01:00`);
      await page.screenshot({ path: `${DIR}/E-mon-${v.id}-fold.png` });
      // At 1024 the whole day fits, so the full-page shot is byte-identical to
      // the fold shot; only 390 and 1440 get a separate full-page capture.
      if (v.id !== "1024") {
        await page.screenshot({ path: `${DIR}/E-mon-${v.id}-full.png`, fullPage: true });
      }
      const audit = await page.evaluate(AUDIT);
      const weights = await page.evaluate(weighFor(PROBES));
      console.log(`\n===AUDIT mon ${v.id}===\n` + JSON.stringify({ audit, weights }));
    });
  }

  test(`nothing arrived yet (Tue ${TUE}, 06:30) @1024`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1366 });
    await open(page, TUE, `${TUE}T06:30:00+01:00`);
    await page.screenshot({ path: `${DIR}/E-earlymorning-1024-fold.png` });
    const audit = await page.evaluate(AUDIT);
    console.log(`\n===AUDIT early 1024===\n` + JSON.stringify(audit));
  });

  test(`empty day (Wed ${WED}) @390 and @1440`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, WED, `${WED}T11:00:00+01:00`);
    await expect(page.getByText("No bookings on this date")).toBeVisible();
    await page.screenshot({ path: `${DIR}/E-empty-390-fold.png` });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${DIR}/E-empty-1440-fold.png` });
    const audit = await page.evaluate(AUDIT);
    console.log(`\n===AUDIT empty 1440===\n` + JSON.stringify(audit));
  });

  test(`single-dog day, derived from Tue ${TUE} by two no-shows @1440`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, TUE, `${TUE}T09:15:00+01:00`);
    for (const dog of ["Coco", "Teddy"]) {
      const card = page.getByRole("article", { name: new RegExp(`^${dog},`) });
      await card.getByRole("button", { name: `More actions for ${dog}` }).click();
      await page.getByRole("menuitem", { name: "Didn't show" }).click();
      await page.waitForTimeout(200);
    }
    await expect(page.getByRole("region", { name: "Arriving, 1 dog" })).toBeVisible();
    await page.screenshot({ path: `${DIR}/E-singledog-1440-fold.png` });
    const audit = await page.evaluate(AUDIT);
    console.log(`\n===AUDIT singledog 1440===\n` + JSON.stringify(audit));
  });

  test(`200% browser zoom (Mon ${MON}) — 1440x900 at 2x = 720x450 CSS px`, async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await open(page, MON, `${MON}T11:00:00+01:00`);
    await page.screenshot({ path: `${DIR}/E-zoom200-720-fold.png` });
    const audit = await page.evaluate(AUDIT);
    console.log(`\n===AUDIT zoom200===\n` + JSON.stringify(audit));
  });

  test(`prefers-reduced-motion (Mon ${MON}) @1440`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, MON, `${MON}T11:00:00+01:00`);
    const animated = await page.evaluate(`(() => {
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        const s = getComputedStyle(el);
        const hasTransition = s.transitionDuration !== "0s" && s.transitionProperty !== "none";
        const hasAnimation = s.animationName !== "none";
        if (hasTransition || hasAnimation) {
          out.push({
            tag: el.tagName,
            cls: String(el.className).slice(0, 90),
            transition: s.transitionProperty + " " + s.transitionDuration,
            animation: s.animationName + " " + s.animationDuration,
          });
        }
      }
      return { count: out.length, sample: out.slice(0, 12) };
    })()`);
    console.log(`\n===REDUCED MOTION===\n` + JSON.stringify(animated));
    // Deliberately no capture stored: the reduced-motion render is byte-identical
    // to E-mon-1440-fold.png, which IS the result. Assert that rather than
    // committing a duplicate PNG — this keeps the review's claim self-verifying.
    const md5 = (buf: Buffer) => createHash("md5").update(buf).digest("hex");
    const reduced = md5(await page.screenshot());
    const normal = md5(readFileSync(`${DIR}/E-mon-1440-fold.png`));
    console.log(`\n===REDUCED MOTION MD5===\n` + JSON.stringify({ reduced, normal }));
    expect(reduced).toBe(normal);
  });

  test(`keyboard traversal + focus-visible rings (Mon ${MON}) @1024`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1366 });
    await open(page, MON, `${MON}T11:00:00+01:00`);
    const order: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 45; i += 1) {
      await page.keyboard.press("Tab");
      const step = await page.evaluate(`(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
          tag: el.tagName,
          label: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 46),
          h: Math.round(r.height), w: Math.round(r.width),
          y: Math.round(r.top + window.scrollY),
          outline: s.outlineWidth + " " + s.outlineStyle,
          boxShadow: s.boxShadow === "none" ? "none" : "ring",
        };
      })()`);
      if (step) order.push(step as Record<string, unknown>);
    }
    console.log(`\n===TAB ORDER===\n` + JSON.stringify(order));
    // Capture a focus ring on the first card primary action.
    await page.getByRole("button", { name: "Check in Max" }).focus();
    await page.screenshot({ path: `${DIR}/E-focusring-1024-fold.png` });
  });

  /**
   * Contrast is measured by resolving every CSS colour through a 1x1 canvas
   * (Tailwind v4 emits oklch(), which naive rgb() parsing mangles), then
   * compositing translucent layers onto their painted ancestors.
   */
  const CONTRAST = `(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const toRgba = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const over = (fg, bg) => [0, 1, 2].map((i) => Math.round(fg[i] * fg[3] + bg[i] * (1 - fg[3])));
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (fg, bg) => {
      const a = lum(fg), b = lum(bg);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };
    // Paint the element's ancestor background stack, bottom-up.
    const paintedBg = (el) => {
      const stack = [];
      let node = el;
      while (node && node !== document.documentElement) {
        const c = toRgba(getComputedStyle(node).backgroundColor);
        if (c[3] > 0) stack.push(c);
        if (c[3] === 1) break;
        node = node.parentElement;
      }
      let base = [255, 255, 255];
      for (let i = stack.length - 1; i >= 0; i -= 1) base = over(stack[i], base);
      return base;
    };
    const find = (sel) =>
      sel.startsWith("text=")
        ? [...document.querySelectorAll("*")].find(
            (n) => (n.textContent || "").trim() === sel.slice(5) && n.children.length === 0,
          )
        : document.querySelector(sel);
    const probes = ${JSON.stringify([
      ["secondary totals label text", '[aria-label="Daily Brief secondary totals"] > span'],
      ["secondary totals value (7/14)", '[aria-label="Daily Brief secondary totals"] strong'],
      ["operational fact LABEL (LATE/ON SITE)", '[aria-label="Daily Brief operational status"] > div > span:last-child'],
      ["operational fact VALUE", '[aria-label="Daily Brief operational status"] > div > span:first-child'],
      ["ACTION cell label", '[aria-label^="Filter"] span:last-child'],
      ["ACTION cell value", '[aria-label^="Filter"] span:first-child'],
      ["availability strapline", '[data-testid="daily-brief-header-full"] [aria-label="Availability"]'],
      ["lane title", '[aria-label^="Arriving,"] h2'],
      ["lane count", '[aria-label^="Arriving,"] header span.shrink-0'],
      ["lane warning (1 late)", "text=1 late"],
      ["slot heading time", '[aria-label^="Arriving,"] h3'],
      ["card dog name", '[aria-label^="Arriving,"] h4 button'],
      ["card service/owner line", '[aria-label^="Arriving,"] article .text-slate-600'],
      ["card payment due (non-action)", "text=£42 due"],
      ["card payment due (action)", "text=£32 due"],
      ["welfare chip", "text=Bites / Nips"],
      ["primary action on yellow", '[data-primary-action="true"]'],
      ["More button", '[aria-label^="More actions"]'],
      ["Message button", '[aria-label^="Message "]'],
      ["slot chip on purple", '[aria-label="Open 09:00 booking"]'],
      ["daily progress value", '[aria-label="Daily progress"] .grid > div > span:first-child'],
      ["daily progress label", '[aria-label="Daily progress"] .grid > div > span:nth-child(2)'],
      ["Ready lane 'Waiting'", "text=Waiting"],
      ["Paid marker", "text=Paid"],
    ])};
    const out = [];
    for (const [name, sel] of probes) {
      const el = find(sel);
      if (!el) { out.push({ name, sel, found: false }); continue; }
      const s = getComputedStyle(el);
      const bg = paintedBg(el);
      const fg = over(toRgba(s.color), bg);
      const fontSize = Math.round(parseFloat(s.fontSize) * 10) / 10;
      const fontWeight = Number(s.fontWeight);
      const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const r = ratio(fg, bg);
      out.push({
        name, sel, found: true,
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 34),
        colourToken: s.color,
        fgResolved: "rgb(" + fg.join(",") + ")",
        bgResolved: "rgb(" + bg.join(",") + ")",
        fontSize, fontWeight, large,
        threshold: large ? 3 : 4.5,
        ratio: r,
        passesAA: r >= (large ? 3 : 4.5),
      });
    }
    return out;
  })()`;

  test("contrast — populated live day (Mon)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, MON, `${MON}T11:00:00+01:00`);
    console.log(`\n===CONTRAST MON===\n` + JSON.stringify(await page.evaluate(CONTRAST)));
  });

  test("contrast — calm day (Tue 06:30, nothing late, ACTION cell absent)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, TUE, `${TUE}T06:30:00+01:00`);
    await page.screenshot({ path: `${DIR}/E-calm-1440-fold.png` });
    console.log(`\n===CONTRAST TUE===\n` + JSON.stringify(await page.evaluate(CONTRAST)));
    const header = await page.evaluate(`(() => {
      const cells = [...document.querySelectorAll('[aria-label="Daily Brief operational status"] > *')];
      return cells.map((c) => ({
        tag: c.tagName,
        text: (c.textContent || "").trim().replace(/\\s+/g, " "),
        interactive: c.tagName === "BUTTON",
      }));
    })()`);
    console.log(`\n===HEADER CELLS TUE===\n` + JSON.stringify(header));
  });

  /**
   * Control for the tab-order finding: the empty day performs no auto-scroll,
   * so if the first Tab lands on "Skip to content" here but on a card control
   * on the populated day, the cause is the auto-scroll moving Chrome's
   * sequential-focus starting point — not DOM order.
   */
  test("tab entry point — empty day control vs populated day", async ({ page }) => {
    const firstStops = async (date: string, iso: string, n: number) => {
      await open(page, date, iso);
      const stops: string[] = [];
      for (let i = 0; i < n; i += 1) {
        await page.keyboard.press("Tab");
        const s = await page.evaluate(`(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return "(body)";
          return (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\\s+/g, " ").slice(0, 40);
        })()`);
        stops.push(s as string);
      }
      return stops;
    };
    await page.setViewportSize({ width: 1024, height: 1366 });
    const empty = await firstStops(WED, `${WED}T11:00:00+01:00`, 4);
    const populated = await firstStops(MON, `${MON}T11:00:00+01:00`, 4);
    const scroll = await page.evaluate("window.scrollY");
    console.log(`\n===TAB ENTRY===\n` + JSON.stringify({ empty, populated, populatedScrollY: scroll }));
  });

  test("focus ring mechanism on Daily Brief controls", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1366 });
    await open(page, MON, `${MON}T11:00:00+01:00`);
    const probe = await page.evaluate(`(() => {
      const targets = [
        ['card primary', '[data-primary-action="true"]'],
        ['dog name', '[aria-label^="Open Max"]'],
        ['owner name', '[aria-label^="Open Dave"]'],
        ['More', '[aria-label^="More actions"]'],
        ['header filter', '[aria-label^="Filter"]'],
      ];
      const out = [];
      for (const [name, sel] of targets) {
        const el = document.querySelector(sel);
        if (!el) { out.push({ name, found: false }); continue; }
        el.focus();
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        out.push({
          name, found: true,
          w: Math.round(r.width), h: Math.round(r.height),
          outline: s.outlineWidth + " " + s.outlineStyle + " " + s.outlineColor,
          outlineOffset: s.outlineOffset,
          boxShadow: s.boxShadow,
        });
      }
      return out;
    })()`);
    console.log(`\n===FOCUS RINGS===\n` + JSON.stringify(probe));
  });

  /**
   * The header scrolls itself out of view on load: TodayView requests a
   * scrollIntoView({block:"start"}) on the live-focus card. These element
   * shots capture the header regardless, and record how far it moved.
   */
  test("header element shots + measured auto-scroll offset", async ({ page }) => {
    for (const v of WIDTHS) {
      await page.setViewportSize(v);
      await open(page, MON, `${MON}T11:00:00+01:00`);
      const scrolled = await page.evaluate("window.scrollY");
      await page.evaluate("window.scrollTo(0, 0)");
      await page.waitForTimeout(120);
      if (v.id === "1440") {
        await page.locator("header").first().screenshot({ path: `${DIR}/E-header-mon-1440.png` });
      }
      if (v.id !== "1024") {
        await page.screenshot({ path: `${DIR}/E-mon-${v.id}-top.png` });
      }
      console.log(`\n===SCROLL mon ${v.id}===\n` + JSON.stringify({ width: v.width, height: v.height, autoScrollY: scrolled }));
    }
    // The calm day, where LATE reads "On time" and unpaid == expected.
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, TUE, `${TUE}T06:30:00+01:00`);
    const calmScroll = await page.evaluate("window.scrollY");
    await page.evaluate("window.scrollTo(0, 0)");
    await page.waitForTimeout(120);
    await page.locator("header").first().screenshot({ path: `${DIR}/E-header-calm-1440.png` });
    console.log(`\n===SCROLL calm 1440===\n` + JSON.stringify({ autoScrollY: calmScroll }));
  });

  test("reduced-motion audit scoped to the Daily Brief itself", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, MON, `${MON}T11:00:00+01:00`);
    const res = await page.evaluate(`(() => {
      const root = document.querySelector("main") || document.body;
      const animations = [];
      const transitions = [];
      for (const el of root.querySelectorAll("*")) {
        const s = getComputedStyle(el);
        if (s.animationName !== "none") {
          animations.push({ name: s.animationName, cls: String(el.className).slice(0, 70) });
        }
        if (s.transitionDuration !== "0s" && s.transitionProperty !== "none") {
          transitions.push({ prop: s.transitionProperty, dur: s.transitionDuration, cls: String(el.className).slice(0, 70) });
        }
      }
      return {
        animationCount: animations.length,
        animations: animations.slice(0, 8),
        transitionCount: transitions.length,
        transitionProps: [...new Set(transitions.map((t) => t.prop + " " + t.dur))],
      };
    })()`);
    console.log(`\n===REDUCED MOTION MAIN===\n` + JSON.stringify(res));
  });
});
