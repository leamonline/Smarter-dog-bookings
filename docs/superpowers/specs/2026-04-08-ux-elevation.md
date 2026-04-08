# UX Elevation — Bold Dashboard Cohesion

**Date:** 2026-04-08
**Status:** Design approved

## Context

The new dashboard header (teal revenue card, coral Book Now card, blue gradient, bold shadows) looks great but the rest of the page — calendar tabs, slot grid, booking cards, ghost seats, and month grid — still uses flat white styling with thin grey borders. This spec brings the header's design language (gradients, brand-coloured shadows, accent bars) into every visible component for a cohesive look.

## Design

### 1. Active Day Tab — Blue Gradient Fill

**File:** `src/components/layout/DayTab.jsx`

When `isActive` is true:
- Background changes from white to `bg-gradient-to-b from-brand-blue to-brand-blue-dark`
- All text becomes white:
  - Day name strip: `bg-white/20` instead of `bg-brand-green`/`bg-brand-red`
  - Date number: `text-white` instead of `text-slate-800`
  - Month name: `text-white/90`
  - Dog count: `text-white/80` instead of `text-brand-blue-dark`
- Shadow upgraded: `shadow-[0_-4px_16px_rgba(14,165,233,0.25),0_4px_12px_rgba(14,165,233,0.15)]`
- Border: `border-brand-blue` (unchanged)
- Lift: `-translate-y-[3px]` (unchanged)

Inactive tabs remain white, no changes.

### 2. Booking Cards — Gradient Top Accent Bar

**File:** `src/components/booking/BookingCardNew.jsx`

Replace the `border-l-4` left accent with a 3px gradient top bar:
- Remove: `border-l-4` and `borderLeftColor` inline style
- Add: `overflow-hidden` on the card container, remove left padding adjustment
- Add a child `<div>` as first element inside the card:
  - `className="h-[3px]"` with inline `background: linear-gradient(90deg, ${colour1}, ${colour2})`
  - Colours by size:
    - Small: `#F5C518` → `#FACC15` (yellow gradient)
    - Medium: `#2D8B7A` → `#3BA594` (teal gradient)
    - Large: `#E8567F` → `#F472B6` (coral→pink gradient)

Shadow upgrade — add brand-coloured glow:
- Current: `hover:shadow-md`
- New default: `shadow-[0_1px_4px_rgba(0,0,0,0.04),0_2px_8px_${sizeGlow}]`
  - Small: `rgba(245,197,24,0.08)`
  - Medium: `rgba(45,139,122,0.08)`
  - Large: `rgba(232,86,127,0.08)`
- Hover: `hover:shadow-[0_4px_16px_${sizeGlow}]` with stronger opacity (0.15)

Size dot ring — add a subtle outer ring:
- `box-shadow: 0 0 0 2px ${sizeColour}33` (colour at 20% opacity)

Padding adjustment: since we're removing the left border accent, add `p-0` on the outer container and `p-2.5 md:p-3.5` on the inner content wrapper (after the gradient bar).

### 3. Ghost Seats — Gradient Button Fills

**File:** `src/components/booking/GhostSeat.jsx`

Book button (the + button):
- Current: `bg-sky-50 text-brand-blue`
- New: `bg-gradient-to-br from-sky-50 to-sky-100 text-brand-blue shadow-[0_1px_3px_rgba(14,165,233,0.15)]`
- Hover: unchanged (`bg-brand-blue text-white`)

Block button (the ⊘ button):
- Current: `bg-brand-coral-light text-brand-coral`
- New: `bg-gradient-to-br from-[#FFF1F3] to-[#FFE4E9] text-brand-coral shadow-[0_1px_3px_rgba(232,86,127,0.15)]`
- Hover: unchanged (`bg-brand-coral text-white`)

Simple ghost seat (no block, just +):
- Add very subtle gradient background on hover: `hover:bg-gradient-to-b hover:from-sky-50/50 hover:to-transparent` (or keep current `hover:bg-sky-50` — this is a subtle tweak)

### 4. Slot Grid — Subtle Row Treatment

**File:** `src/components/booking/SlotGrid.jsx`

- Add `overflow-hidden` to the container (it already has `rounded-b-[14px]`)
- No alternating row backgrounds (keep clean white — the booking card shadows now provide enough visual depth)
- No changes to time labels or dividers — they're clean and functional

### 5. Month Grid — Subtle Cell Elevation

**File:** `src/components/layout/WeekCalendarView.jsx` (MonthGrid function)

Day cells get slightly richer treatment:
- Default cells: add `shadow-[0_1px_3px_rgba(0,0,0,0.04)]` for subtle depth
- Today (not selected): `border-2 border-brand-blue shadow-[0_2px_6px_rgba(14,165,233,0.12)]` (blue glow)
- Selected: `bg-gradient-to-b from-brand-blue to-brand-blue-dark` (gradient instead of flat) with `shadow-[0_2px_8px_rgba(14,165,233,0.2)]`
- Hover on non-selected open cells: `hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:-translate-y-px`

### 6. Add/Remove Slot Buttons

**File:** `src/components/layout/WeekCalendarView.jsx` (lines 275-290)

These already use `bg-brand-coral` and `bg-brand-blue` with hovers — no changes needed.

## Files to modify

1. `src/components/layout/DayTab.jsx` — active tab blue gradient
2. `src/components/booking/BookingCardNew.jsx` — gradient top bar, brand shadows, dot ring
3. `src/components/booking/GhostSeat.jsx` — gradient button fills
4. `src/components/booking/SlotGrid.jsx` — overflow-hidden (minor)
5. `src/components/layout/WeekCalendarView.jsx` — month grid cell elevation

## Files NOT modified

- `DashboardHeader.jsx` — already elevated
- `CalendarTabs.jsx` — just a container, DayTab/MonthTab hold the styles
- `MonthTab.jsx` — already has brand-blue-dark strip, no changes needed
- `BlockedSeatCell.jsx` — already uses brand-coral styling, fine as-is

## Verification

- Build passes (`vite build`)
- Active day tab shows blue gradient fill with white text
- Booking cards show gradient top accent bar matching dog size colour
- Booking cards have subtle brand-coloured shadow glow
- Ghost seat buttons have gradient fills with micro-shadows
- Month grid cells have subtle depth, selected cell has blue gradient
- Today's cell in month grid has blue glow ring
- No visual regressions on mobile (375px width)
- Hover states work smoothly on all interactive elements
