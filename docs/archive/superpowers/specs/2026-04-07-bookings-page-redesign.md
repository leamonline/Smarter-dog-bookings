# Bookings Page Redesign

**Date:** 2026-04-07
**Status:** Approved
**Mockup:** `.superpowers/brainstorm/27499-1775568694/content/bookings-v4.html`

## Summary

Complete visual redesign of the bookings page (currently `WeekCalendarView`). Replaces the current month-grid + week-column layout with a day-focused view using tear-off calendar tabs, a slim header bar, a two-seat slot grid, and redesigned booking cards with clear information hierarchy. Revenue display and booking action move to overlapping floating elements at the bottom right.

---

## 1. Calendar Tab Navigation

Replaces the current month navigation header and week column layout. Eight tabs run across the top of the page.

### 7 Day Tabs

Each tab resembles a small tear-off calendar page:

- **Coloured strip** at top: green (`#16A34A`) for open days, red (`#DC2626`) for closed days
- **Day name** in the strip: shortened format (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
- **Date number** large and bold (24px, weight 900)
- **Month name** prominent below the number (13px, weight 800) -- e.g. "April"
- **Dog count** small at the bottom (9px, weight 800, BRAND.blue) -- e.g. "6 dogs" or "Closed"
- **Active tab** has blue border (`#00B8E0`), lifts up slightly (`translateY(-3px)`), full opacity
- **Inactive tabs** at 0.7 opacity, hover to 0.9 with slight lift
- Tab styling: white background, rounded top corners (`10px 10px 0 0`), subtle border (`1.5px solid #E5E7EB`), no bottom border

### Month Tab

Sits at the end of the row, slightly wider (`flex: 1.1`):

- **Blue strip** (`#0099BD`) containing the full month+year text (e.g. "April 2026")
- **Mini calendar grid** below: 7-column grid of tiny coloured dots representing days
  - Blue dots = days with bookings
  - Grey dots = days without bookings
  - Pink dot = today
  - Empty cells for padding

### Data Requirements

- `dayOpenState` from `useDaySettings` determines green vs red strip per day
- `bookingsByDate` provides dog count per day
- Week dates derived from the currently selected date (Mon-Sun)
- Clicking a day tab selects that day as the active view
- Clicking the month tab switches to a month overview (existing MonthGrid behaviour)

---

## 2. Day Header Bar

A slim blue gradient bar sitting directly below the calendar tabs (no gap -- tabs flow into it).

- **Background:** `linear-gradient(135deg, #00B8E0, #0099BD)`
- **Height:** compact, ~56px with 12px vertical padding
- **Content:** centred hanging shop sign only
- **Paw watermark:** large faded paw emoji positioned behind, rotated -15deg, 4% opacity

### Shop Sign

An angled hanging sign showing the day's open/closed status:

- Tilted at -4deg
- Small hook arc at top (white semi-transparent border)
- Sign body: green (`#16A34A`) for open, red for closed
- Text: "Open" or "Closed" in uppercase, 15px weight 900, letter-spacing 2px
- Subtle shine line, inner shadow, border

The arrows and revenue display from the current header are removed -- navigation is handled by the calendar tabs, revenue moves to the floating element.

---

## 3. Time Slot Grid

### Layout

- **Container:** white background, 1px grey border, bottom corners rounded 14px, no top border (flows from header)
- **Grid:** 3-column layout per row: `72px 1fr 1fr` (time label | seat 1 | seat 2)
- **Row height:** minimum 100px, uniform for all rows (booked, partially booked, and empty)
- **Row separator:** 1px `#F1F3F5` border between rows
- **Time label:** 14px weight 800, centred vertically, right border 2px `#E5E7EB`

### Seat States

Each time slot has exactly two seat columns:

1. **Booked seat** -- renders a booking card (see section 4)
2. **Ghost seat (one booking, one empty)** -- dashed 2px border `#E5E7EB`, rounded 12px, centred "+" in light grey. Hover: border turns blue, "+" turns blue, faint blue background
3. **Fully empty row** -- dashed border spanning both columns (`grid-column: 2 / 4`), centred "+" only. Same hover behaviour as ghost seat

### Capacity Engine Integration

The existing capacity engine (`computeSlotCapacities`, `canBookSlot`, `getSeatStatesForSlot`) determines how many bookings each slot can hold. The two-seat visual layout is a simplification of the current 2-2-1 rule:

- **Seat 1 (left):** first booking in the slot
- **Seat 2 (right):** second booking, or ghost seat if only one booking
- Slots with capacity for more than 2 dogs (e.g. 5 small dogs) still show 2 visual seats -- the capacity engine handles validation when booking

This is a visual simplification. The actual booking limits remain governed by the capacity engine. When a user clicks a ghost seat or empty row "+", the AddBookingForm opens and the capacity engine validates whether the booking is allowed.

---

## 4. Booking Cards

Each card shows all key information in a clear vertical hierarchy.

### Structure (top to bottom)

1. **Top row** (flex, space-between):
   - Size dot (12px circle: yellow `#F5C518` small, teal `#2D8B7A` medium, coral `#E8567F` large)
   - Dog name (17px, weight 800)
   - Price (17px, weight 900, teal `#1E6B5C`, right-aligned, auto margin-left)

2. **Breed** (14px, weight 600, grey `#6B7280`, indented 20px)

3. **Owner name** (14px, weight 700, teal `#2D8B7A`, indented 20px)

4. **Pill row** (3 equal-width square pills, indented 20px, 5px gap):
   - **Service pill** -- light grey background `#F1F3F5`, dark text `#374151`
   - **Pick-up pill** -- light purple background `#F3EEFF`, purple text `#7C3AED`
   - **Status pill** -- colour-coded per booking status:
     - Not Arrived: `#FFF8E0` bg, `#92400E` text
     - Checked In: `#DCFCE7` bg, `#16A34A` text
     - In the Bath: `#E0F7FC` bg, `#0099BD` text
     - Ready: `#EDE9FE` bg, `#7C3AED` text
     - Completed: `#F3F4F6` bg, `#374151` text

### Pill Styling

All three pills use identical dimensions:
- `flex: 1` (equal width)
- `border-radius: 6px` (square, not round)
- `padding: 5px 0`
- `font-size: 10px, weight 700`
- Centred text (`display: inline-flex, align-items: center, justify-content: center`)

### Card Styling

- White background, 1.5px grey border, **4px left border** colour-coded by size
- Border radius 12px, padding 14px 16px
- Hover: blue border, subtle shadow, slight lift
- Cursor: pointer (clicking opens booking detail/edit)

### Data Mapping

- **Dog name**: from `dogs` array via `dog_id`
- **Breed**: from `dogs` array
- **Owner**: from `humans` array via dog's `owner_id`
- **Price**: from `PRICING[service][size]` constant
- **Service**: from `SERVICES` array, display name only (no emoji in pill)
- **Pick-up time**: from `pickup_time` field or calculated estimate
- **Status**: from booking `status` field, matched to `BOOKING_STATUSES`

---

## 5. Floating Elements

Two overlapping elements fixed to the bottom-right corner, replacing the current FAB button and the header revenue display.

### Revenue Note (left, behind)

Styled like a banknote:

- **Position:** tilted -4deg, overlaps the business card by ~18px (negative right margin)
- **Background:** green gradient (`#16A34A` to `#15803D`)
- **Border:** 2px semi-transparent white, 8px radius
- **Content:**
  - "Today's Revenue" label (8px, uppercase, 55% white opacity)
  - Amount in large text (24px, weight 900, white)
- **Decorative:** dashed inner border (1.5px, 15% white), pound symbols in corners (7px, 20% white)
- **Shadow:** `0 4px 16px rgba(22,163,74,0.35)`
- **Hover:** lifts 6px, scales 1.04, z-index jumps to 210 (comes to front)

### Book Now Card (right, in front)

Styled like a business card:

- **Position:** tilted +3deg, sits in front of the money note
- **Background:** white, 10px radius
- **Border:** 1.5px grey `#E5E7EB`
- **Content:**
  - "Smarter Dog" (9px, uppercase, letter-spacing 1.5px, blue `#0099BD`)
  - "Book Now" (18px, weight 900, dark `#1F2937`)
- **Decorative:** blue gradient accent line at top (3px), subtle accent at bottom (2px, 30% opacity)
- **Shadow:** `0 4px 20px rgba(0,0,0,0.12)`
- **Hover:** lifts 6px, scales 1.04, z-index jumps to 210 (comes to front)
- **Click:** opens the new booking flow (same as current `onNewBooking`)

### Overlap Behaviour

Both elements use `cubic-bezier(0.4, 0, 0.2, 1)` transition. Default z-index: money note 201, business card 202. On hover, the hovered element jumps to z-index 210, creating a "shuffled cards" effect.

### Data

- Revenue: sum of all booked prices for the selected day
- Booking count could optionally show on the revenue note but is not required

---

## 6. Components to Create/Modify

### New Components

| Component | Purpose |
|-----------|---------|
| `CalendarTabs` | 7 day tabs + month tab navigation bar |
| `DayTab` | Individual tear-off calendar page tab |
| `MonthTab` | Month overview tab with mini-grid |
| `BookingCard` | Redesigned card with 4-row hierarchy |
| `PillRow` | Three equal-width square pills |
| `SlotGrid` | Two-seat grid layout for time slots |
| `GhostSeat` | Dashed empty seat placeholder |
| `FloatingActions` | Overlapping revenue note + book now card |
| `ShopSign` | Angled open/closed hanging sign |

### Modified Components

| Component | Change |
|-----------|--------|
| `WeekCalendarView` | Major rewrite -- new layout structure |
| `App.jsx` | No changes needed (view switching unchanged) |

### Removed/Replaced

| Component | Replaced By |
|-----------|-------------|
| `WeekNav` | `CalendarTabs` |
| `MonthGrid` header | `CalendarTabs` month tab |
| Current FAB button | `FloatingActions` |
| `DayHeader` | `ShopSign` in slim header bar |
| `DaySummary` | Removed (revenue in floating element, dog count in tab) |

---

## 7. Styling Approach

All styles remain inline, consistent with the rest of the app. No CSS files. Colours reference `BRAND` constants. The existing `SIZE_THEME` applies to booking card left-border colours.

---

## 8. Interaction Behaviour

- **Tab click:** switches to that day's view, updates all slot data
- **Month tab click:** shows month overview grid
- **Booking card click:** opens booking detail modal (existing behaviour)
- **Ghost seat / empty row "+" click:** opens `AddBookingForm` for that slot
- **Book Now card click:** opens new booking flow (existing `onNewBooking`)
- **Floating elements hover:** hovered element lifts and comes to front
- **Card hover:** border turns blue, subtle shadow, slight lift

---

## 9. Scope Boundaries

**In scope:**
- Visual redesign of the bookings page layout
- New calendar tab navigation
- Redesigned booking cards
- Floating revenue + book now elements
- Slim header with shop sign

**Out of scope:**
- Changes to the capacity engine logic
- Changes to the booking data model
- Changes to the AddBookingForm
- Changes to other views (Dogs, Humans, Settings, Reports)
- Mobile-specific responsive behaviour (follow-up task)
