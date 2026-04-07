# Tailwind Migration — Phase 1: Foundation

Migrate from inline styles to Tailwind CSS. This phase installs Tailwind, configures the design system, builds a responsive layout shell, and rewrites AppToolbar with a bottom tab bar on mobile. No feature changes — just the structural layer for Phases 2 and 3.

**Tech:** Tailwind CSS v4, Vite plugin, React 19.

---

## Colour System

### Base Palette (Tailwind slate scale)

| Token | Hex | Tailwind | Usage |
|---|---|---|---|
| bg-surface | #F8FAFC | slate-50 | Page background |
| bg-card | #FFFFFF | white | Card/panel surfaces |
| text-primary | #1E293B | slate-800 | Headings, body text |
| text-secondary | #64748B | slate-500 | Labels, hints, muted text |
| border-default | #E2E8F0 | slate-200 | Card borders, dividers |

### Brand Accents (custom theme tokens)

| Token | Hex | Usage |
|---|---|---|
| brand-blue | #0EA5E9 | Primary actions, active tabs, links (sky-500) |
| brand-blue-dark | #0284C7 | Hover states for primary (sky-600) |
| brand-coral | #E8567F | Alerts, blocking, delete, warnings |
| brand-teal | #2D8B7A | Owner names, secondary actions, recurring |
| brand-green | #16A34A | Open status, confirmed, success (green-600) |
| brand-red | #DC2626 | Closed status, cancelled, danger (red-600) |

### Size Dot Colours (unchanged)

| Size | Hex | Tailwind token |
|---|---|---|
| Small | #F5C518 | size-small |
| Medium | #2D8B7A | size-medium (same as brand-teal) |
| Large | #E8567F | size-large (same as brand-coral) |

---

## Layout Shell

### Root Container

- Body: `bg-slate-50 m-0` — removes default 8px browser margin
- Root `<div>`: `max-w-5xl mx-auto px-4 sm:px-6 py-5` — fluid up to ~1100px, centred on large screens, `px-4` (16px) on mobile, `px-6` (24px) on sm+
- Font family: system stack via Tailwind defaults (`font-sans`) — matches current `-apple-system, BlinkMacSystemFont, ...`

### Responsive Breakpoints

Using Tailwind's defaults:
- `sm`: 640px (large phone / small tablet)
- `md`: 768px (tablet — desktop nav kicks in here)
- `lg`: 1024px (desktop)
- `xl`: 1280px (wide desktop)

The `md` breakpoint is the primary split: below md = mobile layout (bottom tabs), md and up = desktop layout (top tabs).

---

## AppToolbar

### Desktop (md and up)

Horizontal bar fixed to top of the content area (not the viewport — scrolls with page):

```
[ SmarterDog logo ]  [ Bookings | Dogs | Humans | Stats ]  [ ☰ ]
```

- Logo: "Smarter" in `brand-blue`, "Dog" in `text-primary`, bold
- Nav tabs: horizontal pill group with `bg-slate-100` container, `rounded-lg`
- Active tab: `bg-white text-brand-blue font-semibold shadow-sm rounded-md`
- Inactive tabs: `text-slate-500 hover:text-slate-700`
- Hamburger: `text-slate-500`, opens dropdown with Reports, Settings, Log out

### Mobile (below md)

**Top bar** (slim):
```
[ SmarterDog logo ]                          [ ☰ ]
```
- Just logo + hamburger. No nav tabs.
- Compact height: `h-14`

**Bottom tab bar** (fixed to viewport bottom):
```
  📅          🐾          👤          📊
Bookings     Dogs      Humans      Stats
```

- Fixed: `fixed bottom-0 left-0 right-0`
- Background: `bg-white border-t border-slate-200`
- Safe area: `pb-[env(safe-area-inset-bottom)]` for notched phones
- 4 equal-width tabs, each with icon (inline SVG, 20px) + label (10px)
- Active: `text-brand-blue` icon + label
- Inactive: `text-slate-400`
- Z-index: above page content, below modals
- Body padding-bottom on mobile to prevent content hiding behind the bar

### Tab Icons (inline SVGs, no library)

- **Bookings**: Calendar icon — simple grid with header bar
- **Dogs**: Paw print — 4 pads + palm
- **Humans**: Person silhouette — head + shoulders
- **Stats**: Bar chart — 3 ascending bars

### Hamburger Dropdown

Same on both mobile and desktop:
- Absolute positioned from the hamburger button
- `bg-white rounded-lg shadow-lg border border-slate-200`
- Items: Reports, Settings, Log out (with icons)
- Click-outside-to-close behaviour (existing)

---

## Files

### New/Modified

| File | Action | Purpose |
|---|---|---|
| `src/index.css` | Create | Tailwind v4 import (`@import "tailwindcss"`) + `@theme` block with custom tokens + body reset |
| `vite.config.js` | Modify | Add `@tailwindcss/vite` plugin |
| `index.html` | Modify | Add `<link>` to index.css if not already present |
| `src/App.jsx` | Modify | Replace root container inline styles with Tailwind classes, add `pb-16 md:pb-0` for bottom bar clearance on mobile |
| `src/components/layout/AppToolbar.jsx` | Rewrite | Full Tailwind rewrite with desktop top bar + mobile bottom tabs |

### Tailwind v4 Note

Tailwind v4 uses CSS-based configuration instead of `tailwind.config.js`. Custom theme tokens are defined in a `@theme` block inside `src/index.css`. No separate config file needed.

### Install

```bash
npm install tailwindcss @tailwindcss/vite
```

### Preserved (unchanged in Phase 1)

- `src/constants/brand.js` — BRAND exports kept so all unconverted components still work. Gradually removed in Phases 2-3.
- All other components — keep inline styles until their phase.
- All hooks, engine, context, supabase — no changes.

---

## Coexistence Strategy

During migration, inline-style components and Tailwind components coexist:

- The `BRAND` constants object stays exported from `src/constants/brand.js`
- New Tailwind theme tokens mirror the same values
- Components migrated in later phases will drop their BRAND imports and use Tailwind classes
- Once all components are migrated (end of Phase 3), `brand.js` can be reduced to only programmatic uses (e.g., dynamic SVG fills that can't use classes)

---

## Scope Boundaries

**In scope:**
- Tailwind install + config + theme
- Body/CSS reset
- Root layout shell (responsive container)
- AppToolbar full rewrite (desktop + mobile)
- Bottom tab bar on mobile

**Out of scope (Phase 2):**
- Bookings page components (CalendarTabs, SlotGrid, BookingCardNew, etc.)
- Floating actions

**Out of scope (Phase 3):**
- Dogs/Humans directories
- StatsView, ReportsView, SettingsView
- All modals
