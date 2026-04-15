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
| Primary colour | Plum purple `#2D004B` | Cyan blue `#00C2FF` |
| Portal font | Sora (display) + DM Sans (body) | Montserrat (all uses) |
| Dashboard font | System stack | System stack (unchanged) |
| Button shape | `border-radius: 8px` | `border-radius: 9999px` (pill) |
| Button hover | `scale(1.02)` | `scale(1.05)` |
| Button press | `scale(0.98)` | `scale(0.95)` |
| Card radius | 12px | 16px (`rounded-2xl`) |
| Dashboard accent | Blue `#0EA5E9` | Cyan `#00C2FF` |
| Font imports | Quicksand + Montserrat + Sora + DM Sans | Montserrat only |

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
  /* Primary brand — replaces brand-blue */
  --color-brand-cyan: #00C2FF;
  --color-brand-cyan-dark: #00A3D9;

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

**Removed tokens:** `--color-brand-blue`, `--color-brand-blue-dark` (replaced by `brand-cyan` / `brand-cyan-dark`).

### New shared utility classes in `index.css`

```css
/* Pill button base — shared by portal and dashboard */
.btn-pill {
  @apply rounded-full font-bold transition-all duration-300 hover:scale-105 cursor-pointer;
}
.btn-pill:active {
  transform: scale(0.95);
  transition-duration: 80ms;
}

/* Glassmorphism card */
.card-glass {
  @apply bg-white/60 backdrop-blur-sm border border-white/50 rounded-xl shadow-sm hover:shadow-md transition-all;
}

/* Solid card */
.card-solid {
  @apply bg-white rounded-2xl shadow-lg border border-gray-100;
}

/* Entrance animation */
.animate-fade-in-up {
  animation: fadeInUp 0.6s ease-out forwards;
}

/* Hover lift for cards */
.hover-lift {
  transition: transform 300ms ease;
}
.hover-lift:hover {
  transform: translateY(-4px);
}
```

### Staff dashboard `.btn` class updates

```css
.btn {
  @apply py-2 px-4 rounded-full text-sm font-semibold cursor-pointer font-[inherit]
         transition-all duration-300 border-none hover:scale-105;
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
  --sd-cyan: #00C2FF;          /* new primary — replaces --sd-purple as dominant */
  --sd-cyan-dark: #00A3D9;     /* hover state */
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
| `.portal-header` | `background` | `var(--sd-purple)` | `var(--sd-cyan)` |
| `.portal-brand` | `font-family` | `'Sora', sans-serif` | `'Montserrat', sans-serif` |
| `.portal-welcome` | `font-family` | `'Sora', sans-serif` | `'Montserrat', sans-serif` |
| `.portal-btn` | `font-family` | `'Sora', sans-serif` | `'Montserrat', sans-serif` |
| `.portal-btn` | `border-radius` | `8px` | `9999px` |
| `.portal-btn:hover` | `transform` | `scale(1.02)` | `scale(1.05)` |
| `.portal-btn:hover` | `box-shadow` | `rgba(45, 0, 75, 0.15)` | `rgba(0, 194, 255, 0.2)` |
| `.portal-btn:active` | `transform` | `scale(0.98)` | `scale(0.95)` |
| `.portal-btn:focus-visible` | `outline` | `2px solid var(--sd-purple)` | `2px solid var(--sd-cyan)` |
| `.portal-btn--primary` | `background` | `var(--sd-purple)` | `var(--sd-cyan)` |
| `.portal-btn--secondary` | `border` | `2px solid var(--sd-purple)` | `2px solid var(--sd-cyan)` |
| `.portal-btn--secondary` | `color` | `var(--sd-purple)` | `var(--sd-cyan-dark)` |
| `.portal-card` | `border-radius` | `12px` | `16px` |
| `.portal-card` | `border-left` | `3px solid var(--sd-purple)` | `3px solid var(--sd-cyan)` |
| `.portal-card-title` | `font-family` | `'Sora', sans-serif` | `'Montserrat', sans-serif` |
| `.portal-loading` | `font-family` | `'Sora', sans-serif` | `'Montserrat', sans-serif` |
| `.portal-loading-text` | `color` | `var(--sd-purple)` | `var(--sd-cyan)` |
| `.portal-loading-icon` | `color` | `var(--sd-purple-light)` | `var(--sd-cyan)` |
| `.portal-skip-link` | `border-radius` | `8px` | `9999px` |

**Unchanged classes:** `.portal-btn--cta` (yellow stays), `.portal-btn--ghost` (same transparency pattern, now on cyan header), `.portal-btn--danger` (coral stays), `.portal-card--teal`, `.portal-card--yellow`, `.portal-card--muted`, all animations.

---

## Section 3: Portal Component Inline References

13 files need inline class updates. The changes fall into three patterns:

### Pattern A: Font swap
Every `font-['Sora',sans-serif]` and `font-['DM_Sans',sans-serif]` → `font-['Montserrat',sans-serif]`

### Pattern B: Colour swap — interactive elements
`text-brand-purple` on headings, icons, selected states, interactive elements → `text-brand-cyan`
`border-brand-purple` → `border-brand-cyan`
`hover:border-brand-purple` → `hover:border-brand-cyan`
`hover:bg-purple-50` → `hover:bg-cyan-50`
`bg-purple-50` → `bg-cyan-50`

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

Every Tailwind class referencing `brand-blue` shifts to `brand-cyan`:

- `bg-brand-blue` → `bg-brand-cyan`
- `hover:bg-brand-blue-dark` → `hover:bg-brand-cyan-dark`
- `text-brand-blue` → `text-brand-cyan`
- `border-brand-blue` → `border-brand-cyan`
- `ring-brand-blue` → `ring-brand-cyan`

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

## Out of Scope

- Marketing website (smarterdog.co.uk) — already uses the new design
- Database schema or API changes — none needed
- Functional behaviour changes — this is purely visual
- New component creation — existing structure is reused
