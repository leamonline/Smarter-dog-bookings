# Tailwind Migration — Phase 2: Bookings Page

Migrate all bookings page components from inline styles to Tailwind CSS. Add responsive behaviour: horizontal-scrolling calendar tabs, compact booking cards on mobile, tighter slot grid. No feature changes.

**Tech:** Tailwind CSS v4 (already installed from Phase 1), React 19.

**Depends on:** Phase 1 complete (Tailwind installed, theme tokens defined, AppToolbar migrated).

---

## Components to Migrate

10 components, listed in dependency order (leaves first, container last):

1. `src/components/layout/ShopSign.jsx`
2. `src/components/layout/DayTab.jsx`
3. `src/components/layout/MonthTab.jsx`
4. `src/components/layout/CalendarTabs.jsx`
5. `src/components/booking/BookingCardNew.jsx`
6. `src/components/booking/GhostSeat.jsx`
7. `src/components/booking/BlockedSeatCell.jsx`
8. `src/components/booking/SlotGrid.jsx`
9. `src/components/layout/FloatingActions.jsx`
10. `src/components/layout/WeekCalendarView.jsx`

---

## ShopSign

Straight conversion — no responsive changes needed. Same tilted hanging sign.

- Outer wrapper: `transform -rotate-[4deg] shrink-0`
- Hook arc: `w-[18px] h-[9px] border-2 border-white/25 border-b-0 rounded-t-[9px] -mb-0.5`
- Sign body: dynamic background via inline `style={{ background: colour }}` (open green or closed red — needs to stay inline since it's conditional on props). Text: `text-[15px] font-black text-white uppercase tracking-[2px]`
- Shine line: `absolute top-[3px] left-2 right-2 h-[3px] bg-white/15 rounded-full`

Note: `BRAND.openGreen` and `BRAND.closedRed` are still needed for the dynamic background colour. Keep the BRAND import for these two values only, or use inline `style` with the hex values directly.

---

## DayTab

Responsive sizing. Same tear-off calendar page look.

**Desktop (md+):**
- Container: `flex-1 min-w-[72px] rounded-t-[10px] bg-white text-center border-[1.5px] border-slate-200 border-b-0 select-none cursor-pointer transition-all`
- Active: `border-brand-blue opacity-100 -translate-y-[3px] z-[2] shadow-[0_-4px_14px_rgba(0,184,224,0.12)]`
- Inactive: `opacity-70 hover:opacity-90 hover:-translate-y-0.5`
- Colour strip: `py-[3px] text-[8px] font-extrabold text-white uppercase tracking-[0.8px] rounded-t-lg` with dynamic `style={{ background: stripColour }}`
- Date number: `text-2xl font-black leading-none mt-0.5`
- Month name: `text-[13px] font-extrabold leading-none mt-px`
- Dog count: `text-[9px] font-extrabold mt-[3px] leading-none`

**Mobile (below md):**
- Container: `min-w-[56px]` (narrower)
- Date number: `text-lg` (shrinks from `text-2xl`)
- Month name: `text-[10px]` (shrinks from `text-[13px]`)
- Dog count: stays `text-[9px]`
- Scroll snap: `snap-center` for horizontal scrolling

Remove: `useState(hovered)` — replaced by Tailwind `hover:` classes. Remove BRAND import.

---

## MonthTab

Same shrink pattern as DayTab on mobile.

- Container: `flex-[1.1] min-w-[80px] md:min-w-[80px]` — on mobile `min-w-[64px]`
- Blue strip: `bg-brand-blue-dark` with month label
- Mini calendar grid: `grid grid-cols-7 gap-0 p-[3px_4px] mt-0.5`
- Dots: `w-[5px] h-[5px] rounded-sm` with conditional background colours (today pink, bookings blue, empty grey)
- Scroll snap: `snap-center`

Dynamic colours for dots stay as inline `style={{ background: dotColour }}` since they're computed per-cell.

Remove: `useState(hovered)` — use Tailwind `hover:`. Remove BRAND import.

---

## CalendarTabs

Container adds horizontal scrolling on mobile.

- Container: `flex gap-1.5 px-1 overflow-x-auto md:overflow-x-visible snap-x snap-mandatory scrollbar-none`
- `scrollbar-none` hides the scrollbar (Tailwind v4 utility)
- On mount, a `useEffect` scrolls the active tab into view: `activeTabRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })`
- Each DayTab/MonthTab gets `snap-center shrink-0`

No BRAND import needed — pure Tailwind container.

---

## BookingCardNew

The most detailed responsive work. Same 4-row card layout, but compact on mobile.

**Desktop (md+):**
- Card: `bg-white border-[1.5px] border-slate-200 border-l-4 rounded-xl p-3.5 flex flex-col gap-1 cursor-pointer transition-all hover:border-brand-blue hover:shadow-md hover:-translate-y-px`
- Border-left colour stays inline `style={{ borderLeftColor: sizeColour }}` (dynamic per booking size)
- Row 1 (name + price): `flex items-center gap-2` — name `text-[17px] font-extrabold text-slate-800`, alert triangle stays inline SVG, price `ml-auto text-[17px] font-black text-[#1E6B5C]`
- Row 2 (breed): `text-sm font-semibold text-slate-500 pl-5`
- Row 3 (owner): `text-sm font-bold text-brand-teal pl-5`
- Row 4 (pills): `flex gap-[5px] pl-5 mt-1.5` — each pill `flex-1 text-[10px] font-bold py-[5px] rounded-md inline-flex items-center justify-center whitespace-nowrap overflow-hidden text-ellipsis`

**Mobile (below md):**
- Card: `p-2.5` (tighter padding)
- Name: `text-sm` (14px, down from 17px)
- Price: `text-sm`
- Breed/owner: `text-xs` (12px, down from 14px)
- Pills: `text-[8px] py-1 gap-1`
- Row indent: `pl-4` instead of `pl-5`

Pill background colours stay inline since they're per-pill:
- Service: `bg-slate-100 text-slate-700`
- Pickup: `bg-[#F3EEFF] text-[#7C3AED]`
- Status: dynamic background/colour per status (inline style)

Remove: `useState(hovered)` and onMouseEnter/Leave — use Tailwind `hover:`. Keep BRAND import only for dynamic SVG fills (alert triangle, size dot) or replace with direct hex values.

The `BookingDetailModal` lazy-load and `useSalon()` context usage stay unchanged — this is a visual-only migration.

---

## GhostSeat

Convert to Tailwind. Two modes: simple (no onBlock) and with block button.

**Simple mode (no onBlock):**
- `border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 text-[22px] cursor-pointer transition-all min-h-[80px] md:min-h-[80px] hover:border-brand-blue hover:text-brand-blue hover:bg-sky-50`
- Mobile: `min-h-[60px]`
- Span: `col-span-2` (replaces `gridColumn: "2 / 4"`)

**With block button:**
- Same border/layout but contains two child buttons (book + block)
- Book button: `w-8 h-8 rounded-lg bg-sky-50 text-brand-blue hover:bg-brand-blue hover:text-white`
- Block button: `w-8 h-8 rounded-lg bg-brand-coral-light text-brand-coral hover:bg-brand-coral hover:text-white`
- BlockMenu popup: `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-[10px] shadow-lg border border-slate-200 p-2 flex flex-col gap-1 z-10 min-w-[140px]`

Remove: all onMouseEnter/Leave handlers. Remove BRAND import.

---

## BlockedSeatCell

- `border-2 border-dashed border-brand-coral rounded-xl flex items-center justify-center cursor-pointer transition-all min-h-[80px] bg-brand-coral/[0.04] hover:border-brand-red hover:bg-brand-coral/[0.08]`
- Mobile: `min-h-[60px]`
- Span: `col-span-2`
- Block icon SVG stays as inline JSX with `stroke-brand-coral` via `stroke="currentColor"` and `text-brand-coral` on parent

Remove BRAND import.

---

## SlotGrid

Grid layout with responsive column widths.

- Container: `bg-white border border-slate-200 border-t-0 rounded-b-[14px]`
- Each row: `grid grid-cols-[72px_1fr_1fr] md:grid-cols-[72px_1fr_1fr] gap-1.5 md:gap-2.5 p-2 md:p-[10px_14px] min-h-[80px] md:min-h-[100px] items-center`
- Mobile grid: `grid-cols-[56px_1fr_1fr]` — narrower time column
- Row divider: `border-b border-[#F1F3F5] last:border-b-0` (use array index check or Tailwind `last:`)
- Time label: `text-sm md:text-sm font-extrabold text-slate-800 text-center border-r-2 border-slate-200 pr-2 md:pr-2.5 self-stretch flex items-center justify-center`

The `getSeatStatesForSlot` capacity engine integration stays exactly the same — only the JSX wrapper styles change.

Remove BRAND import. Keep capacity engine imports unchanged.

---

## FloatingActions

Fixed-position revenue note + Book Now card. Adjust position on mobile to sit above the bottom tab bar.

- Container: `fixed z-[200] flex items-end`
- Desktop: `bottom-6 right-7`
- Mobile: `bottom-20 right-4` (above the 80px bottom tab bar)

**Revenue note:**
- Wrapper: `transform -rotate-[4deg] -mr-[18px] mb-1 transition-all cursor-default` with hover lift
- Body: green gradient stays inline `style={{ background: "linear-gradient(...)" }}` (Tailwind arbitrary gradients are verbose)
- Inner border, corner £ symbols, text — convert padding/sizing to Tailwind, keep structural inline styles for the gradient

**Book Now card:**
- Wrapper: `transform rotate-[3deg] transition-all cursor-pointer` with hover lift
- Body: `bg-white rounded-[10px] p-[14px_30px] text-center min-w-[150px] border-[1.5px] border-slate-200 shadow-lg relative overflow-hidden`
- Top/bottom accent lines: `absolute top-0 left-0 right-0 h-[3px]` with brand-blue gradient (inline style for gradient)

Hover z-index shuffling: keep `useState` for noteHover/cardHover since Tailwind can't do z-index-on-hover-of-sibling. Apply via inline `style={{ zIndex: ... }}`.

Remove BRAND import where possible. Keep for gradient strings and dynamic z-index.

---

## WeekCalendarView

The container component. Convert its own inline styles for:

- Day header bar: `bg-gradient-to-br from-brand-blue to-brand-blue-dark p-[12px_20px] flex items-center justify-center min-h-[56px] relative overflow-hidden`
- Paw watermark: `absolute right-10 -top-3.5 text-[100px] opacity-[0.04] -rotate-[15deg] pointer-events-none`
- Add/remove slot buttons: convert to Tailwind button classes
- ClosedDayView wrapper: stays as-is (it's a separate component, Phase 3)
- MonthGrid: stays inline-styled (complex internal component, not worth migrating in this phase)

The rebook modal and DatePickerModal keep their inline styles — they're modal components covered in Phase 3.

---

## Migration Strategy

Each component is migrated independently and committed separately. Order: leaves first (ShopSign, DayTab, MonthTab), then containers (CalendarTabs, SlotGrid), then the page wrapper (WeekCalendarView). This means each commit produces a working app.

**BRAND import removal:** Each migrated component drops its BRAND import where possible. Some components need to keep it for dynamic inline `style` values (conditional colours, gradients). These remaining usages are noted per-component above.

**Hover state cleanup:** All `useState(hovered)` + `onMouseEnter`/`onMouseLeave` patterns are replaced by Tailwind `hover:` utilities. This removes state, event handlers, and several lines of code per component.

---

## Scope Boundaries

**In scope:**
- All 10 bookings page components listed above
- Responsive behaviour (scrolling tabs, compact cards, tighter grid)
- Remove BRAND imports where fully convertible
- Remove hover state management (useState + mouse handlers)

**Out of scope (Phase 3):**
- MonthGrid (inside WeekCalendarView — complex, not worth migrating separately)
- ClosedDayView
- All modals (BookingDetailModal, NewBookingModal, DatePickerModal, ChainBookingModal)
- Dogs/Humans directories
- StatsView, ReportsView, SettingsView
- WaitlistPanel, AddBookingForm
