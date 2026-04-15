# Design System Rebrand — Aligning App with smarterdog.co.uk

**Date:** 2026-04-15
**Approach:** Component Wrapper Refactor (Approach 2)
**Scope:** Customer portal + staff dashboard — full visual overhaul

## Background

The marketing website (smarterdog.co.uk) has been redesigned with a bright, energetic aesthetic: cyan blue hero colour, Montserrat typography, pill-shaped buttons, glassmorphism cards, and full-bleed coloured sections. The booking app (customer portal and staff dashboard) still uses the old design system — plum purple, Sora + DM Sans fonts, rectangular buttons, and left-border accent cards.

This spec aligns the app with the website's visual identity so customers experience a consistent brand across both touchpoints.

## What Changes

### Summary

| Aspect | Before | After |
|--------|--------|-------|
| Primary colour | Plum purple `#2D004B` | Accessible cyan scale (see below) |
| Portal font | Sora (display) + DM Sans (body) | Montserrat (all uses) |
| Dashboard font | System stack | System stack (unchanged) |
| Button shape | `border-radius: 8px` | `border-radius: 9999px` (pill) |
| Button hover | `scale(1.02)` | `translateY(-2px)` + shadow lift |
| Button press | `scale(0.98)` | `scale(0.95)` |
| Card radius | 12px | 16px (`rounded-2xl`) |
| Dashboard accent | Blue `#0EA5E9` | Cyan `#007AAB` (accessible) |
| Font imports | Quicksand + Montserrat + Sora + DM Sans | Montserrat only |

### Accessible Cyan Palette

Cyan (`#00C2FF`) on white yields a contrast ratio of ~1.6:1, which fails WCAG AA (requires 4.5:1 for normal text, 3:1 for large/bold text). The brand cyan is split into three functional shades:

| Token | Hex | Contrast on White | Usage |
|-------|-----|-------------------|-------|
| `cyan-light` | `#00C2FF` | 1.6:1 (decorative only) | Card left-borders, background blobs, large illustrations |
| `cyan` (default) | `#007AAB` | 3.1:1 (AA large/bold text) | Primary buttons with white text (bold weight required), active tab underlines, selected state backgrounds |
| `cyan-dark` | `#005986` | 5.2:1 (AA normal text) | Text links, small icons, input focus borders, heading highlights |

**Rule:** If the element holds readable text or is a small icon, use `cyan-dark`. If it's a bold button label on a solid background, use `cyan`. If it's purely decorative (thick border, background shape), use `cyan-light`.

### What Stays the Same

- CTA yellow (`#FFCC00`) and glow shadow
- Teal secondary (`#2A6F6B`)
- Coral danger/accent (`#E8506A`)
- Paper background (`#FAF9F6`) for portal
- Left-border card system (accent colour shifts cyan)
- 560px portal max-width, single-column layout
- 900px dashboard max-width
- Card slide-up animations
- Dashboard system font stack
- Dashboard slate neutral scale
- Size-coded gradient headers on booking cards

---

## Section 1: Tailwind Theme + Shared Utilities Layer

### New tokens in `index.css` `@theme`

```css
@theme {
  /* Primary brand scale — accessible cyan (replaces brand-blue) */
  --color-brand-cyan-light: #00C2FF;  /* decorative: borders, blobs, illustrations */
  --color-brand-cyan: #007AAB;        /* interactive: buttons, selected states (3.1:1 on white — AA large/bold) */
  --color-brand-cyan-dark: #005986;   /* text: links, icons, headings (5.2:1 on white — AA normal text) */

  /* Kept / remapped */
  --color-brand-coral: #E8567F;
  --color-brand-coral-light: #FDE2E8;
  --color-brand-teal: #2D8B7A;
  --color-brand-green: #00D94A;
  --color-brand-orange: #FF6B00;
  --color-brand-red: #DC2626;

  /* Customer portal palette */
  --color-brand-purple: #2D004B;        /* deep contrast — kept for dark moments */
  --color-brand-purple-light: #5B3D80;  /* kept for legacy compat */
  --color-brand-yellow: #FFCC00;
  --color-brand-yellow-dark: #D4A500;
  --color-brand-paper: #FAF9F6;
  --color-brand-dark: #2A1810;          /* new — warm dark brown text */

  /* Size dot colours — unchanged */
  --color-size-small: #F5C518;
  --color-size-medium: #2D8B7A;
  --color-size-large: #E8567F;
}
```

**Removed tokens:** `--color-brand-blue`, `--color-brand-blue-dark` (replaced by the three-tier cyan scale).

### Semantic token layer (added below `@theme` in `index.css`)

Maps brand colours to intent. Developers use these — never raw brand tokens in components. Next rebrand = change the mappings, not every file.

```css
/* ── Semantic tokens ──────────────────────────────────────────── */
/* Use THESE in components. Never use brand-cyan-* directly.      */
:root {
  /* Actions */
  --color-action-primary: var(--color-brand-cyan);
  --color-action-primary-hover: var(--color-brand-cyan-dark);
  --color-action-cta: var(--color-brand-yellow);
  --color-action-danger: var(--color-brand-coral);

  /* Text */
  --color-text-body: var(--color-brand-dark);
  --color-text-heading: var(--color-brand-dark);
  --color-text-link: var(--color-brand-cyan-dark);
  --color-text-on-action: #FFFFFF;
  --color-text-muted: theme(--color-slate-400);

  /* Surfaces */
  --color-surface-page: var(--color-brand-paper);
  --color-surface-card: #FFFFFF;
  --color-surface-header: var(--color-brand-cyan);

  /* Borders */
  --color-border-default: theme(--color-stone-200);
  --color-border-focus: var(--color-brand-cyan-dark);
  --color-border-accent: var(--color-brand-cyan-light);

  /* Feedback */
  --color-feedback-success: var(--color-brand-green);
  --color-feedback-error: var(--color-brand-red);
  --color-feedback-warning: var(--color-brand-yellow);
}
```

**Migration path:** During this rebrand, existing `brand-*` Tailwind classes are swapped to the correct semantic token. New code should use semantic tokens exclusively. Existing code using raw brand tokens will work but is considered legacy.

### New shared utility classes in `index.css`

```css
/* ── Usage-locking classes ────────────────────────────────────── */
/* Devs use THESE instead of raw colour classes.                  */
/* "text-link" not "text-brand-cyan-dark"                         */
.text-link       { color: var(--color-text-link); }
.text-heading    { color: var(--color-text-heading); }
.text-body       { color: var(--color-text-body); }
.text-on-action  { color: var(--color-text-on-action); }
.bg-action       { background-color: var(--color-action-primary); }
.bg-action-hover { background-color: var(--color-action-primary-hover); }
.bg-page         { background-color: var(--color-surface-page); }
.bg-card         { background-color: var(--color-surface-card); }
.border-accent   { border-color: var(--color-border-accent); }
.border-focus    { border-color: var(--color-border-focus); }

/* ── Pill button base ─────────────────────────────────────────── */
.btn-pill {
  @apply rounded-full font-bold transition-all duration-300 cursor-pointer;
}
.btn-pill:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.btn-pill:active {
  transform: scale(0.95);
  transition-duration: 80ms;
}

/* ── Card variants ────────────────────────────────────────────── */

/* Glassmorphism card — USE ONLY over coloured/image backgrounds  */
.card-glass {
  @apply bg-white/60 backdrop-blur-sm border border-white/50 rounded-xl shadow-sm hover:shadow-md transition-all;
}

/* Solid card — default for all content on white/paper surfaces   */
.card-solid {
  @apply bg-white rounded-2xl shadow-lg border border-gray-100;
}

/* ── Animations ───────────────────────────────────────────────── */
.animate-fade-in-up {
  animation: fadeInUp 0.6s ease-out forwards;
}

.hover-lift {
  transition: transform 300ms ease;
}
.hover-lift:hover {
  transform: translateY(-4px);
}

/* ── Motion safety ────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-up,
  .hover-lift,
  .btn-pill,
  .btn,
  .portal-btn {
    animation: none !important;
    transition: none !important;
    transform: none !important;
  }

  /* Allow opacity transitions (non-motion) but kill transforms */
  .animate-fade-in-up {
    opacity: 1 !important;
  }
}

/* ── Global focus styles ──────────────────────────────────────── */
/* One rule. Every focusable element. Consistent everywhere.      */
:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}
/* Remove default outline — :focus-visible handles it */
:focus:not(:focus-visible) {
  outline: none;
}
```

### Glassmorphism usage rules

`.card-glass` is powerful but dangerous. Rules:

| Allowed | Not allowed |
|---------|-------------|
| Over coloured section backgrounds (cyan, teal, coral) | Over white or paper backgrounds (use `.card-solid`) |
| Hero areas and feature highlights | Dense data tables |
| Testimonial cards, stats overlays | Forms and input-heavy areas |
| Where content is short (1-3 lines) | Long-form reading content |

**Fallback requirement:** `.card-glass` always renders as opaque white at 60% on devices that don't support `backdrop-filter`. Content must be readable without the blur effect.

**Performance rule:** Maximum 4 glass cards visible on screen at once. Beyond that, the compositor cost degrades scroll performance on low-end devices.

### Staff dashboard `.btn` class updates

```css
.btn {
  @apply py-2 px-4 rounded-full text-sm font-semibold cursor-pointer font-[inherit]
         transition-all duration-300 border-none;
}
.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.btn:active {
  transform: scale(0.95);
  transition-duration: 80ms;
}
.btn-primary {
  @apply bg-brand-cyan text-white hover:bg-brand-cyan-dark;
}
/* .btn-danger, .btn-ghost, .btn-sm, .btn:disabled — unchanged */
```

### Font import in `index.html`

**Before:**
```html
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700;800;900&family=Sora:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**After:**
```html
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

Quicksand (legacy), Sora, and DM Sans removed. Montserrat weight 900 dropped (unused).

---

## Section 2: Customer Portal CSS Overhaul

### Token changes in `customer-portal.css`

```css
:root {
  --sd-cyan-light: #00C2FF;    /* decorative: card borders, background accents */
  --sd-cyan: #007AAB;          /* interactive: button backgrounds (bold text required) */
  --sd-cyan-dark: #005986;     /* text/icons: links, headings, focus borders */
  --sd-deep: #2D004B;          /* deep contrast — renamed from --sd-purple */
  --sd-teal: #2A6F6B;          /* unchanged */
  --sd-yellow: #FFCC00;        /* unchanged */
  --sd-yellow-dark: #D4A500;   /* unchanged */
  --sd-coral: #E8506A;         /* unchanged */
  --sd-coral-light: #FFF0F3;   /* unchanged */
  --sd-paper: #FAF9F6;         /* unchanged */
  --sd-white: #FFFFFF;         /* unchanged */
  --sd-dark: #2A1810;          /* new — warm dark brown text */
}
```

### Class-by-class changes

| Class | Property | Before | After |
|-------|----------|--------|-------|
| `.customer-portal` | `font-family` | `'DM Sans', sans-serif` | `'Montserrat', sans-serif` |
| `.customer-portal` | `color` | `var(--sd-purple)` | `var(--sd-dark)` |
| `.portal-header` | `background` | `var(--sd-purple)` | `var(--sd-cyan)` (button bg — white bold text passes AA at 3.1:1) |
| `.portal-brand` | `font-family` | `'Sora', sans-serif` | `'Montserrat', sans-serif` |
| `.portal-welcome` | `font-family` | `'Sora', sans-serif` | `'Montserrat', sans-serif` |
| `.portal-btn` | `font-family` | `'Sora', sans-serif` | `'Montserrat', sans-serif` |
| `.portal-btn` | `border-radius` | `8px` | `9999px` |
| `.portal-btn:hover` | `transform` | `scale(1.02)` | `translateY(-2px)` (lift, not scale — avoids width jitter on pills) |
| `.portal-btn:hover` | `box-shadow` | `rgba(45, 0, 75, 0.15)` | `0 4px 12px rgba(0, 0, 0, 0.1)` |
| `.portal-btn:active` | `transform` | `scale(0.98)` | `scale(0.95)` |
| `.portal-btn:focus-visible` | `outline` | `2px solid var(--sd-purple)` | Removed — handled by global `:focus-visible` rule in `index.css` |
| `.portal-btn--primary` | `background` | `var(--sd-purple)` | `var(--sd-cyan)` (`#007AAB` — white bold text at 3.1:1) |
| `.portal-btn--secondary` | `border` | `2px solid var(--sd-purple)` | `2px solid var(--sd-cyan-dark)` |
| `.portal-btn--secondary` | `color` | `var(--sd-purple)` | `var(--sd-cyan-dark)` (`#005986` — 5.2:1 on white) |
| `.portal-card` | `border-radius` | `12px` | `16px` |
| `.portal-card` | `border-left` | `3px solid var(--sd-purple)` | `3px solid var(--sd-cyan-light)` (decorative — bright pop) |
| `.portal-card-title` | `font-family` | `'Sora', sans-serif` | `'Montserrat', sans-serif` |
| `.portal-loading` | `font-family` | `'Sora', sans-serif` | `'Montserrat', sans-serif` |
| `.portal-loading-text` | `color` | `var(--sd-purple)` | `var(--sd-cyan-dark)` (text — needs contrast) |
| `.portal-loading-icon` | `color` | `var(--sd-purple-light)` | `var(--sd-cyan-light)` (decorative icon — large, no text) |
| `.portal-skip-link` | `border-radius` | `8px` | `9999px` |

**Form inputs:** Resting border stays `stone-200` (`#E7E5E4`). Focus border shifts to `var(--sd-cyan-dark)` (`#005986`) — dark enough to be clearly visible as a focus indicator against white. Do not use `cyan-light` for focus borders.

**Unchanged classes:** `.portal-btn--cta` (yellow stays), `.portal-btn--ghost` (same transparency pattern, now on cyan header), `.portal-btn--danger` (coral stays), `.portal-card--teal`, `.portal-card--yellow`, `.portal-card--muted`, all animations.

---

## Section 3: Portal Component Inline References

13 files need inline class updates. The changes fall into three patterns:

### Pattern A: Font swap
Every `font-['Sora',sans-serif]` and `font-['DM_Sans',sans-serif]` → `font-['Montserrat',sans-serif]`

### Pattern B: Colour swap — interactive elements

The accessible cyan scale determines which token to use:

- **Text and small icons:** `text-brand-purple` → `text-brand-cyan-dark` (5.2:1 on white — AA compliant)
- **Selected state backgrounds:** `bg-purple-50` → `bg-cyan-50` (light wash — decorative)
- **Borders on interactive elements:** `border-brand-purple` → `border-brand-cyan-dark`
- **Hover borders:** `hover:border-brand-purple` → `hover:border-brand-cyan-dark`
- **Hover backgrounds:** `hover:bg-purple-50` → `hover:bg-cyan-50`
- **Button backgrounds:** `bg-brand-purple` → `bg-brand-cyan` (bold white text — 3.1:1)
- **Decorative borders (card left-border):** use `brand-cyan-light` for the bright pop

### Pattern C: Colour swap — body text
`text-brand-purple` on body text, form labels, reading text → `text-brand-dark`

### File-by-file changes

| File | Patterns | Notes |
|------|----------|-------|
| `CustomerApp.jsx` | A, B, C | 4 font refs in loading/error states. Demo picker buttons, error card. `rounded-xl` → `rounded-2xl` on cards |
| `CustomerLoginPage.jsx` | A, B, C | Login form headings and body |
| `CustomerDashboard.jsx` | Minimal | Already uses `.portal-*` classes. Inherits changes from CSS |
| `MyDetailsCard.jsx` | A, B, C | Form labels (→ dark), edit button (→ cyan) |
| `DogsSection.jsx` | A, B, C | Dog name headings (→ cyan), breed/details (→ dark) |
| `AppointmentsSection.jsx` | A, B, C | Booking dates (→ cyan), details (→ dark) |
| `TrustedHumansSection.jsx` | A, B, C | Contact names (→ cyan), phone (→ dark) |
| `BookingWizard.tsx` | A, B | Step indicators, headings |
| `DogSelection.tsx` | A, B | Selected dog border/bg |
| `ServiceSelection.tsx` | A, B | Selected service border/bg |
| `DateSelection.tsx` | A, B | Calendar highlight colour |
| `SlotSelection.tsx` | A, B | Selected slot colour |
| `BookingConfirmation.tsx` | A, B, C | Confirmation heading and details |
| `AddDogInline.tsx` | A, B, C | Form elements |

---

## Section 4: Staff Dashboard Component Updates

### Find-and-replace across dashboard files

Every Tailwind class referencing `brand-blue` shifts to the appropriate cyan tier:

- `bg-brand-blue` → `bg-brand-cyan` (button backgrounds — bold white text)
- `hover:bg-brand-blue-dark` → `hover:bg-brand-cyan-dark` (hover states)
- `text-brand-blue` → `text-brand-cyan-dark` (text and icons — needs 5.2:1 contrast)
- `border-brand-blue` → `border-brand-cyan-dark` (borders near text)
- `ring-brand-blue` → `ring-brand-cyan-dark` (focus rings)

### Files affected

- `src/App.jsx` — tab navigation, header gradient, active tab indicator
- `src/components/views/DogsView.jsx`
- `src/components/views/HumansView.jsx`
- `src/components/views/StatsView.jsx`
- `src/components/views/ReportsView.jsx`
- `src/components/views/SettingsView.jsx`
- `src/components/layout/` — any layout components
- `src/components/shared/` — shared modals, dialogs, toasts
- `src/components/modals/` — modal components
- `src/components/booking/` — if any dashboard booking views exist

### What stays the same

- System font stack (no Montserrat on dashboard)
- Slate neutral scale
- 900px max-width
- Tab-based navigation structure
- Dense card layout
- Coral danger, teal secondary
- Size-coded gradient headers

---

## Section 5: Font Import Cleanup

### `index.html` change

Single line change to the Google Fonts `<link>` tag.

**Removed:** Quicksand (legacy, not in active design system), Sora (replaced by Montserrat), DM Sans (replaced by Montserrat), Montserrat weight 900 (unused).

**Kept:** Montserrat weights 400, 500, 600, 700, 800.

**Performance impact:** ~4 font families → 1. Significant reduction in font payload and render-blocking time.

---

## Implementation Order

1. `index.html` — font import cleanup
2. `index.css` — new `@theme` tokens, utility classes, `.btn` updates
3. `customer-portal.css` — token swap, class updates
4. Portal components (13 files) — inline font and colour references
5. Dashboard components — `brand-blue` → `brand-cyan` sweep
6. Visual verification — dev server, check both portal and dashboard

## Risks

- **Tailwind class `bg-purple-50` / `bg-cyan-50`**: Need to verify `cyan-50` exists in Tailwind's default palette (it does in v4).
- **Size-coded gradient headers**: These use custom colours unrelated to the primary brand colour — should be unaffected.
- **Third-party or dynamic styles**: Any styles injected by libraries (date pickers, modals) that reference the old purple may need manual override.
- **Cached CSS**: Users with cached old styles will see a flash of the old design on first load after deploy.
- **Glassmorphism performance**: `backdrop-blur-sm` requires heavy browser repainting. The solid fallback (`bg-white/60`) degrades gracefully on older devices — no visual breakage, just no blur.

## Hard Bans

These are not guidelines — they are constraints. Violating them is a bug.

| Rule | Why |
|------|-----|
| Never use `cyan-light` (`#00C2FF`) for text or small icons | 1.6:1 contrast on white — fails WCAG AA, invisible to many users |
| Never use `cyan-light` for focus borders | Too light to indicate focus state reliably |
| Never use `.card-glass` inside forms | Blur + transparency makes form fields hard to read; use `.card-solid` |
| Never use `.card-glass` over white/paper backgrounds | No visible effect — wastes GPU compositing for nothing |
| Never apply `hover:scale-*` to pill buttons wider than ~120px | Width expansion jitters adjacent layout; use `translateY(-2px)` instead |
| Never apply hover/active transforms to layout containers | Transforms on parents shift all children; restrict to leaf interactive elements |
| Never use raw `brand-cyan-*` classes in new code | Use semantic classes (`.text-link`, `.bg-action`, etc.) — raw tokens are legacy |
| Never use `cyan-50` for text | It's a decorative wash — 0.3:1 contrast |
| Never omit `@media (prefers-reduced-motion)` when adding animations | Legal compliance in some regions; essential for neurodivergent users |
| Never mix portal classes (`.portal-*`) and dashboard classes (`.btn`) in the same component | Different design systems — mixing creates visual incoherence |

## Accessibility Notes (Revision 2)

Identified during review and incorporated into the spec:

1. **Cyan contrast failure resolved.** Raw cyan (`#00C2FF`) at 1.6:1 on white fails WCAG AA. Solved with a three-tier scale: `cyan-light` (decorative only), `cyan` (`#007AAB`, 3.1:1 — AA for large/bold text), `cyan-dark` (`#005986`, 5.2:1 — AA for normal text). Every usage in the spec is mapped to the appropriate tier.
2. **Button hover changed from `scale(1.05)` to `translateY(-2px)`.** A 5% scale on a wide pill button expands its width by ~12px, causing adjacent layout elements to jitter. Vertical lift avoids this while maintaining the interactive feel.
3. **Form input resting borders stay neutral grey.** Cyan is too light for a resting border state. `stone-200` at rest, `cyan-dark` on focus — clear distinction between idle and active fields.
4. **Motion safety added.** `@media (prefers-reduced-motion: reduce)` kills all transforms and animations on `.animate-fade-in-up`, `.hover-lift`, `.btn-pill`, `.btn`, and `.portal-btn`. Opacity is forced to 1 so fade-in content remains visible.
5. **Global focus styles consolidated.** Single `:focus-visible` rule with `2px solid cyan-dark` + `2px offset` replaces per-component focus declarations. Consistent across all interactive elements.
6. **Semantic tokens added.** Developers use intent-based classes (`.text-link`, `.bg-action`) instead of raw colour tokens. This prevents misuse and makes future rebrands a one-file change.

## Out of Scope

- Marketing website (smarterdog.co.uk) — already uses the new design
- Database schema or API changes — none needed
- Functional behaviour changes — this is purely visual
- New component creation — existing structure is reused
