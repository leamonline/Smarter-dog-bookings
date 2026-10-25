// src/components/ui/formControl.js
//
// The one recipe behind Input, Textarea and Select, so a text control looks
// and behaves the same wherever it appears. Until this existed, every form
// carried its own class string (radius, border, focus and text size all
// drifted), and the iOS focus-zoom fix lived in a `.bm-fields` wrapper each
// form had to remember to opt into.
//
// Tailwind v4 detects classes by literal occurrence, so every option is a full
// literal string in the maps below — never interpolated.
//
// Decisions worth knowing:
//  - Border is `border-ink-muted` (#64748B, 4.76:1 on white). The old
//    `border-slate-200` is about 1.2:1, which does not meet the 3:1 WCAG 1.4.11
//    asks of a control's outline.
//  - Text is 16px on touch screens (below that iOS Safari zooms the page on
//    focus) and 13px with a mouse, the density the staff screens were built
//    for. This replaces the `.bm-fields` wrapper rule.
//  - The global `:focus-visible` outline (3px charcoal, 2px offset) is left
//    alone; focus adds a charcoal border on top of it. Never `outline-none`.
//  - Placeholders use slate-500 (4.76:1), not `color-text-placeholder`, which
//    is 2.6:1 and meant only for hints nobody has to read.
//  - Disabled follows Button: slate-100 fill, slate-600 text, not just faded.

const BASE =
  "block w-full border-[1.5px] bg-white font-[inherit] font-semibold text-ink " +
  "text-base pointer-fine:text-body " +
  "placeholder:font-medium placeholder:text-slate-500 " +
  "motion-safe:transition-colors motion-safe:duration-[var(--duration-fast)] " +
  "hover:border-ink focus:border-ink " +
  "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600 " +
  "disabled:border-slate-300 disabled:hover:border-slate-300";

const BORDER = {
  default: "border-ink-muted",
  invalid: "border-brand-coral-dark hover:border-brand-coral-deep focus:border-brand-coral-deep",
};

const SIZES = {
  sm: "px-2.5 py-1.5 pointer-coarse:min-h-11",
  md: "px-3 py-2 pointer-coarse:min-h-11",
};

// "page" is the staff canvas; "paper" is the cream customer portal, whose
// inputs have always been 12px rather than 10px.
const SURFACES = {
  page: "rounded-control",
  paper: "rounded-sd-input",
};

export function controlClassName({ invalid = false, size = "md", surface = "page", className = "" } = {}) {
  return [
    BASE,
    invalid ? BORDER.invalid : BORDER.default,
    SIZES[size] ?? SIZES.md,
    SURFACES[surface] ?? SURFACES.page,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
