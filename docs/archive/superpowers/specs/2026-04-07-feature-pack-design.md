# Feature Pack — Design Spec

Four independent features to improve the bookings page and broader app.

**Tech:** React 19, inline styles, Supabase backend, BRAND constants from `src/constants/brand.js`.

---

## Feature 1: Dog Alert Indicator on Booking Cards

### What
A coral warning triangle (▲ with !) appears on BookingCardNew when the dog has one or more alerts. Positioned in row 1, after the dog name, before the price.

### Visual
- Inline SVG, ~14px tall
- `BRAND.coral` fill (#E8567F), white exclamation mark
- No tooltip, no text — just the icon
- Tapping the card opens the detail modal where full alerts are visible

### Data
- `BookingCardNew` already resolves the dog record via `getDogByIdOrName(dogs, ...)`
- Dog records have `alerts: string[]` populated from the DB
- Render the triangle when `dog?.alerts?.length > 0`

### Files
- Modify: `src/components/booking/BookingCardNew.jsx` — add triangle after dog name span

---

## Feature 2: Slot Blocking

### What
Staff can block and unblock individual seats directly from the slot grid. This prevents bookings in specific seats at specific times (e.g., taking a break, cleaning, reserving for a walk-in).

### Interaction
- **Ghost seat** (empty, available): shows two side-by-side buttons — "+" (book) and "🚫" (block)
- **Blocked seat**: coral dashed border, strike-through or block icon centred. Tapping the blocked seat unblocks it.
- **Both seats blocked**: merges into a single full-width "Blocked" bar spanning both columns (like how an empty row shows a single spanning ghost seat)
- **To book into a blocked seat**: unblock first, then book. No direct override.

### Data Flow
The infrastructure already exists end-to-end:

1. `useDaySettings.js` exposes `setOverride(dateStr, slot, seatIndex, action)` where action is `"blocked"` or `"open"`
2. App.jsx wraps this as `handleOverride` (with online/offline handling)
3. `handleOverride` was previously passed to WeekCalendarView but removed during the redesign — needs re-adding
4. The capacity engine's `getSeatStatesForSlot()` already returns `{ type: "blocked", staffBlocked: true }` for override-blocked seats
5. `day_settings` table in Supabase stores overrides as JSON: `{ "10:00": { "0": "blocked" } }`

### Component Changes

**GhostSeat.jsx** — gains `onBlock` prop
- Renders two buttons: "+" (calls `onClick` / book) and a block icon (calls `onBlock`)
- When `span` is true (both seats empty), the spanning ghost seat shows "+" on the left and a block icon on the right. Tapping "+" opens new booking for that slot. Tapping block opens a choice: "Block seat 1", "Block seat 2", or "Block both" — since the spanning view doesn't distinguish seats visually, the user picks which to block.

**New: BlockedSeatCell component** (inside SlotGrid or its own file)
- Coral dashed border (`BRAND.coral`), rounded 12px
- Block icon centred (inline SVG, strike-through circle)
- Click triggers unblock
- When `span` is true (both blocked), spans both columns like ghost seat does

**SlotGrid.jsx** — major changes:
- New props: `overrides` (the day's override map), `onOverride` (callback)
- Switches from simple booking-or-ghost logic to using `getSeatStatesForSlot()` for each row
- Renders: `BookingCardNew` for "booking" type, `GhostSeat` for "available" type, `BlockedSeatCell` for "blocked" + `staffBlocked` type
- Reserved seats (large dog spillover) render as a muted card

**WeekCalendarView.jsx** — re-add `handleOverride` to destructured props, pass to SlotGrid as `onOverride`. Also pass `currentSettings.overrides` (or compute per-slot from `daySettings`).

**App.jsx** — `handleOverride` is already passed at line 395. Was removed from WeekCalendarView's props during cleanup (commit 6aabdd0). Re-add it.

### Edge Cases
- Blocking a seat that has a booking: not possible — only ghost seats show the block button
- Blocking during offline mode: handled by existing offline override logic
- Unblocking: tapping a blocked seat toggles the override off (same `setOverride` call — if current value matches action, it deletes the override)

---

## Feature 3: Stats/Revenue View

### What
A new "Stats" tab in the nav bar (alongside Bookings, Dogs, Humans) showing weekly revenue breakdown and operational metrics.

### Layout

**Top Section: Revenue**
- Hero: "This Week: £X" — large, prominent
- Bar chart: 7 bars (Mon–Sun), each bar's height proportional to that day's revenue. Bars use `BRAND.blue`, with today's bar highlighted in `BRAND.teal`
- Below the chart: "Last Week: £X" as a comparison figure
- Monthly total as a smaller line below

**Bottom Section: Operations**
- **Busiest Day**: calculated from last 4 weeks — "Tuesdays are your busiest day (avg 8.2 bookings)"
- **Service Breakdown**: ranked list with counts — "Full Groom: 24 | Bath & Brush: 12 | ..."
- **Top 5 Customers**: by booking count in the loaded data window, showing name and count
- **Daily Average**: this week vs last week — "This week: 4.2/day | Last week: 3.8/day"

### Data Source
- All computed from `bookingsByDate` which is already loaded via `useBookings`
- Revenue: sum prices from `PRICING[booking.service][booking.size]` (same as `FloatingActions.computeRevenue`)
- Customer data: resolved via `getDogByIdOrName` → `getHumanByIdOrName` from `useSalon()`
- "Last 4 weeks" for busiest day: needs bookings beyond the current week. Check what date range `useBookings` loads — may need widening or a separate lightweight query.

### Bar Chart Implementation
Simple inline-styled divs — no charting library:
```
<div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 120 }}>
  {days.map(day => (
    <div key={day.label} style={{ flex: 1, textAlign: "center" }}>
      <div style={{ height: `${day.pct}%`, background: BRAND.blue, borderRadius: 6 }} />
      <div style={{ fontSize: 11 }}>{day.label}</div>
      <div style={{ fontSize: 11 }}>£{day.revenue}</div>
    </div>
  ))}
</div>
```

### Files
- Create: `src/components/views/StatsView.jsx`
- Modify: `src/components/layout/AppToolbar.jsx` — add "Stats" to NAV_ITEMS
- Modify: `src/App.jsx` — add StatsView to the view switcher, lazy-load it

---

## Feature 4: Chain Booking (Recurring)

### What
A "Recurring Bookings" button on DogCardModal lets staff build a chain of up to 10 future appointments, each spaced a chosen number of weeks apart. Each appointment in the chain inherits the dog's last booking as a template (service, slot, size) but can be individually tweaked.

### Entry Point
- DogCardModal gains a "Recurring Bookings" button
- Only visible when the dog has at least one booking in the system (to use as template)
- Tapping opens the ChainBookingModal

### Chain Builder Flow

1. **Template**: shows the dog's most recent booking — service, slot, size. All three are editable dropdowns.
2. **First link**: "Book in [ ] weeks' time" — numeric input. Below it, the calculated date appears live (e.g., "→ Mon 19 May 2026").
3. **Add**: confirming adds it to the chain list below.
4. **Next link**: another "Book in [ ] weeks' time" row appears, counting from the last added date. Template defaults carry forward. Service, slot, size editable per link.
5. **Repeat**: up to 10 links in the chain.
6. **Review**: the chain list shows all pending bookings:
   - "1. Mon 19 May — 09:00 — Full Groom"
   - "2. Mon 30 Jun — 09:00 — Full Groom"
   - Each row has a remove (✕) button
   - Rows where the slot is already full on that date show a warning icon (orange ⚠)
7. **Confirm All**: creates all bookings at once.

### Availability Warning
When a chain link lands on a date where the chosen slot is full, show an orange warning: "This slot may be full on 19 May". The booking is still allowed — the date might be opened or slots added later. It's informational, not blocking.

### Data

**Booking creation**: each chain link creates a normal booking via the existing `handleAdd(booking, dateStr)`. No special recurrence field on the booking record.

**Chain ID**: a shared `chain_id` (UUID) on all bookings created in one chain. This is purely for traceability — "these 6 bookings were created together". It doesn't affect any booking logic.

**DB change**: add nullable `chain_id UUID` column to the `bookings` table.

**Template resolution**: find the dog's most recent booking by scanning `bookingsByDate` in reverse date order, or query the dog's bookings directly.

### Slot Availability Check
For the warning indicator, check availability using existing `canBookSlot()`:
```js
const dateStr = toDateStr(calculatedDate);
const dayBookings = bookingsByDate[dateStr] || [];
const settings = daySettings[dateStr] || { overrides: {}, extraSlots: [] };
const slots = [...SALON_SLOTS, ...(settings.extraSlots || [])];
const { allowed } = canBookSlot(dayBookings, selectedSlot, dogSize, slots, {
  overrides: settings.overrides?.[selectedSlot] || {},
});
```

Note: this check uses currently loaded data. Dates far in the future may not have `bookingsByDate` entries loaded yet — in that case, assume available (no warning shown). The warning is best-effort, not a guarantee.

### Files
- Create: `src/components/modals/ChainBookingModal.jsx`
- Modify: `src/components/modals/DogCardModal.jsx` — add "Recurring Bookings" button
- DB migration: add `chain_id UUID` column to `bookings` table (nullable, no foreign key)

---

## Scope Boundaries

**In scope:**
- All four features as described above
- Inline styles only (no CSS files)
- UK English throughout
- BRAND constants for all colours

**Out of scope:**
- Collapsing empty slots (explicitly declined)
- Mobile bottom nav / responsive redesign
- Dark mode
- Drag and drop
- SMS reminders
- Print day sheet
