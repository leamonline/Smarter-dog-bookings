# Dashboard Header Redesign

**Date:** 2026-04-08
**Status:** Design approved

## Context

The current staff dashboard header is a slim blue bar (56px) containing only a centred Open/Closed shop sign. Today's Revenue and Book Now are floating overlays fixed to the bottom-right corner. This wastes header space and the floating elements obscure content on scroll. The header should feel like a proper dashboard — showing what day it is at a glance with actions immediately accessible.

## Design

### Layout: Single-row header with date left, actions right

The blue gradient header becomes a full dashboard bar:

**Left side:**
- Full date in large bold white text: "Monday 6th April"
- Subtitle line: "2026 · 3 dogs booked" (year + booking count for the day)

**Right side — two tilted, overlapping action cards:**

1. **Revenue card** (brand teal `#2D8B7A` → `#236b5d` gradient):
   - Tilted -3deg, z-index 2, overlaps Book Now by ~14px
   - "Today's Revenue" label (8px, uppercase, white/55% opacity)
   - Amount in 22px white bold
   - Dashed inner border, corner £ symbols (matching current money-note style)
   - Shadow: `0 4px 16px rgba(45,139,122,0.4)`

2. **Book Now card** (brand coral `#E8567F` → `#c9405f` gradient):
   - Tilted +3deg, z-index 1, tucked slightly behind revenue card
   - "Smarter Dog" label (8px, uppercase, white/55% opacity)
   - "Book Now" in 18px white bold
   - Same dashed inner border style as revenue card
   - Shadow: `0 4px 16px rgba(232,86,127,0.35)`
   - Clickable — triggers new booking modal

**Removed:** Open/Closed shop sign (redundant — visible in the slot grid below).

### Responsive (mobile)

On screens below `md` (768px):
- Date stacks above action cards (flex-col instead of flex-row)
- Date text shrinks slightly (24px instead of 28px)
- Action cards remain side-by-side with their tilts and overlap
- Action cards centre below the date

### Background

- Same blue gradient: `from-brand-blue to-brand-blue-dark`
- Paw emoji watermark at 100px, 4% opacity, -15deg rotation (kept from current)
- Rounded corners: 14px (consistent with month grid header)
- Padding: 24px 28px

## Files to modify

- `src/components/layout/WeekCalendarView.jsx` — replace the slim header bar (lines 258-264) with the new dashboard header. Remove `<ShopSign>` import and usage. Move revenue computation and Book Now trigger into this component.
- `src/components/layout/FloatingActions.jsx` — delete entirely (no longer needed)
- `src/components/layout/WeekCalendarView.jsx` — remove `FloatingActions` import and rendering (lines 318-322)

## Verification

- Build passes (`vite build`)
- Dev server shows the new header with date, revenue card, and Book Now card
- Clicking Book Now opens the new booking modal
- Revenue updates when bookings change
- Mobile layout stacks correctly (preview_resize to 375px width)
- No floating elements remain in the bottom-right corner
