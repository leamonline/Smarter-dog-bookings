import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Check production CSS values, rather than documenting a second free-floating palette.
const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const portal = readFileSync(new URL("./customer-portal.css", import.meta.url), "utf8");
const button = readFileSync(new URL("./components/ui/Button.jsx", import.meta.url), "utf8");

function literal(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`Expected literal colour token ${name}`);
  return match[1];
}
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dark + 0.05);
}

describe("design system: WCAG AA text pairs", () => {
  it.each([
    ["dark coral danger", "color-brand-coral-dark", "#FFFFFF"],
    ["danger hover", "color-brand-coral-deep", "#FFFFFF"],
    ["solid success badge", "color-brand-green-600", "#FFFFFF"],
    ["WhatsApp link", "color-brand-whatsapp-dark", "#FFFFFF"],
    ["muted text on white", "color-text-muted", "#FFFFFF"],
    ["muted text on paper", "color-text-muted", "#F7EFE6"],
    ["portal green CTA", "color-sd-green", "#1F1F1F"],
    ["portal green CTA hover", "color-sd-green-dark", "#1F1F1F"],
    ["bright WhatsApp action", "color-brand-whatsapp", "#1F1F1F"],
  ])("%s remains at least 4.5:1", (_label, fg, bg) => {
    expect(contrast(literal(fg), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses a contrasting focus/selected border and keeps decorative yellow separate", () => {
    expect(css).toContain("--color-border-focus: var(--color-brand-ink);");
    expect(css).toContain("--color-border-accent: var(--color-brand-ink);");
    expect(contrast(literal("color-brand-ink"), "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(css).toContain("--color-border-accent-decorative: var(--color-brand-yellow);");
    expect(css).toMatch(/:focus-visible\\s*\\{\\s*outline: 3px solid var\\(--color-border-focus\\)/);
  });

  it("uses readable action text in all three button systems", () => {
    expect(css).toContain("@apply bg-brand-coral-dark text-white");
    expect(button).toContain("bg-brand-coral-dark text-white border-transparent");
    expect(portal).toMatch(/\\.portal-btn--danger\\s*\\{\\s*background: var\\(--color-brand-coral-dark\\);/);
    expect(portal).toMatch(/\\.portal-btn--cta\\s*\\{\\s*background: var\\(--sd-green\\);\\s*color: var\\(--sd-navy\\)/);
    expect(portal).toMatch(/\\.portal-btn--whatsapp\\s*\\{\\s*background: var\\(--color-brand-whatsapp\\);\\s*color: var\\(--sd-navy\\)/);
  });

  it("does not hide the only inline-link cue until hover", () => {
    expect(css).toContain("a:not([class]) { text-decoration: underline");
    expect(button).toContain("border-transparent underline underline-offset-2");
  });

  it("grows meaningful micro text and tappable controls on touch/small screens", () => {
    expect(css).toContain("--text-micro: 0.75rem; --text-caption: 0.75rem");
    expect(css).toContain(".btn, .btn-pill { min-height: 44px; min-width: 44px; }");
    expect(portal).toContain(".portal-btn { min-height: 44px; min-width: 44px; }");
    expect(button).toContain("pointer-coarse:min-h-11 pointer-coarse:min-w-11");
  });
});
