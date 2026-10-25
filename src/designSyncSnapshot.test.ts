import { describe, expect, it } from "vitest";
import { diffSnapshots, hasDrift, parseCustomProperties, snapshotOf } from "../scripts/design-sync-snapshot.mjs";

// The drift report is only useful if it is right, so check the logic that
// builds and compares the snapshots.

describe("parseCustomProperties", () => {
  it("reads every custom property and ignores comments", () => {
    const css = `
      :root {
        --color-a: #fff; /* --color-hidden: #000; */
        /* --color-also-hidden: red; */
        --color-b:   var(--color-a);
      }
    `;
    expect(parseCustomProperties(css)).toEqual({ "--color-a": "#fff", "--color-b": "var(--color-a)" });
  });

  it("keeps every value of a name that is declared more than once, in order", () => {
    const css = ":root { --text-micro: 0.625rem; } @media (width < 40rem) { :root { --text-micro: 0.75rem; } }";
    expect(parseCustomProperties(css)).toEqual({ "--text-micro": "0.625rem | 0.75rem" });
  });

  it("collapses whitespace inside a value, including across lines", () => {
    const css = ":root { --shadow-x: 0   8px\n   32px rgba(0, 0, 0, 0.18); }";
    expect(parseCustomProperties(css)).toEqual({ "--shadow-x": "0 8px 32px rgba(0, 0, 0, 0.18)" });
  });

  it("returns names in a stable, sorted order", () => {
    expect(Object.keys(parseCustomProperties(":root { --b: 1; --a: 2; --c: 3; }"))).toEqual(["--a", "--b", "--c"]);
  });
});

describe("diffSnapshots", () => {
  const base = snapshotOf({
    cssSources: [":root { --color-a: #111; --color-b: #222; }"],
    componentSources: { "Button.jsx": "export const Button = 1;" },
  });

  it("reports no drift for identical code", () => {
    const same = snapshotOf({
      cssSources: [":root { --color-a: #111; --color-b: #222; }"],
      componentSources: { "Button.jsx": "export const Button = 1;" },
    });
    expect(hasDrift(diffSnapshots(base, same))).toBe(false);
  });

  it("finds an added, a changed and a removed token", () => {
    const next = snapshotOf({
      cssSources: [":root { --color-a: #999; --color-c: #333; }"],
      componentSources: { "Button.jsx": "export const Button = 1;" },
    });
    const diff = diffSnapshots(base, next);
    expect(diff.tokens).toEqual({ added: ["--color-c"], removed: ["--color-b"], changed: ["--color-a"] });
    expect(hasDrift(diff)).toBe(true);
  });

  it("finds an added and an edited component, but not an untouched one", () => {
    const next = snapshotOf({
      cssSources: [":root { --color-a: #111; --color-b: #222; }"],
      componentSources: { "Button.jsx": "export const Button = 2;", "Input.jsx": "export const Input = 1;" },
    });
    const diff = diffSnapshots(base, next);
    expect(diff.components).toEqual({ added: ["Input.jsx"], removed: [], changed: ["Button.jsx"] });
  });

  it("counts a removed component as drift", () => {
    const next = snapshotOf({ cssSources: [":root { --color-a: #111; --color-b: #222; }"], componentSources: {} });
    expect(diffSnapshots(base, next).components.removed).toEqual(["Button.jsx"]);
    expect(hasDrift(diffSnapshots(base, next))).toBe(true);
  });
});
