# New Booking Drawer — Design

**Date:** 2026-07-10
**Status:** Approved for planning
**Branch:** feat/new-booking-drawer

## Problem

The New Booking popup is a narrow (440px) centred modal floating over the calendar. Two
complaints drive this redesign:

1. **It looks dated and cramped** — a single skinny column with the old size-themed gradient
   header, out of step with the warm cream-paper design language the /today command centre
   now uses.
2. **It loses the context of the day** — the modal covers the calendar, so staff pick a
   date and slot blind, unable to see how the day is filling up around the booking they're
   making.

## Decision summary

- **Shape:** right-hand side drawer on desktop (~500px), full-screen on mobile (unchanged
  structurally). Chosen over a bigger centred modal and over inline-in-day-view editing.
- **Live calendar:** while the drawer is open the calendar stays interactive — clicking an
  empty seat/slot feeds the draft; the draft's chosen slot is highlighted on the day view.
- **Look:** full /today paper language (cream surface, soft card sections, paper-line
  borders). The size-themed gradient header goes; the dog-size cue survives as a coloured
  size chip on each selected dog row.
- **Build strategy:** reshape in place. All logic in `NewBookingModal.jsx` (prefills, parked
  drafts, save flow, capacity/confirmation dialogs) is untouched; only the shell, styling,
  and App-level plumbing change. A fresh `BookingDrawer` + `useBookingDraft` extraction was
  considered and rejected — a rewrite touching booking-save logic for zero user-visible
  gain, with regression risk across six entry points.

## 1. Shell & layout

### DrawerShell non-modal mode

[src/components/shared/DrawerShell.tsx](../../../src/components/shared/DrawerShell.tsx)
currently delegates everything to `AccessibleModal`: backdrop, focus trap (`FocusScope
contain`), reference-counted body scroll lock, `aria-modal="true"`. That is correct for the
existing drawers (day settings, overview, inbox slide-over) but wrong for a panel the user
must be able to click *past*.

Add a `modal?: boolean` prop (default `true`, existing callers unaffected). When
`modal={false}`:

- **No backdrop** — no full-screen overlay intercepting clicks. The panel itself is a
  `position: fixed` element pinned to the right edge, portalled to `<body>`.
- **No focus trap** — keyboard focus may move freely between the drawer and the calendar
  (that is the point of the live link).
- **No body scroll lock** — the page behind remains scrollable.
- **Keeps:** Escape-to-close, `role="dialog"` + `aria-labelledby`, the paper surface and
  branded shadow, the slide-in animation. Drops `aria-modal`.
- Backdrop-click-to-close obviously no longer applies; the close button and Escape do the
  job.

Implementation note: `modal={false}` cannot simply pass different classes to
`AccessibleModal` — the focus trap and scroll lock live in its component body. Either
`AccessibleModal` grows the same `modal` prop (conditionally skipping FocusScope /
scroll-lock / backdrop) or `DrawerShell` renders its own thin non-modal branch. Prefer
extending `AccessibleModal`, keeping one portal/Escape/dialog-props implementation.

### NewBookingModal adopts the drawer

- Desktop (`sm` and up): `DrawerShell side="right" modal={false}` with a width around
  `max-w-[500px]`. The main calendar view remains visible and usable to its left.
- Mobile (below `sm`): full-width, full-height panel exactly as today. The drawer is
  full-screen there anyway; the non-modal behaviour is harmless because nothing else is
  visible. (Focus-trap loss on mobile is accepted; `role="dialog"`, labelled title, and
  Escape/close remain.)
- The z-index must sit **below** the follow-up dialogs (ConfirmDialog, notify recipients,
  confirmation method), which continue to render as true modals on top.

## 2. Live calendar link

All plumbing lives in `App.jsx`, which already owns both the day view and the
`showNewBooking` state.

### Draft picks

- New App state: `draftPick = { dateStr, slot, nonce }` (or `null`). Passed to
  `NewBookingModal` as a prop.
- While `showNewBooking` is open, the day view's empty-seat / "+ Book" / time-click
  handlers are routed to `setDraftPick({...})` instead of `setShowNewBooking({...})`.
  Day clicks in the week strip / mini calendar only navigate the calendar —
  they do NOT move the draft. (Amended during planning: staff peeking at
  another day to compare must not wipe an already-chosen date+slot. Only
  explicit slot-level picks — "+ Book", a ghost seat, the slot menu — feed
  the draft.)
- Inside `NewBookingModal`, an effect applies incoming picks: set `selectedDateStr`; if the
  pick carries a slot, set `selectedSlot`, else clear it (matching the existing
  date-change-resets-slot behaviour). The `nonce` (monotonic counter) makes re-clicking the
  same slot after manual fiddling still take effect.
- The drawer's internal date/slot controls are unchanged — the calendar is a faster way in,
  not the only way.

### Highlight

- The day view shows a "booking here" marker on the slot row matching the draft's current
  date+slot (only when the day view is showing that date). Visual: a small paper-language
  chip/outline, styled in the implementation phase.
- Day view receives the draft's `{dateStr, slot}` (or null) as a prop for this.

### Interaction boundaries

- Clicking an **existing booking card** while the drawer is open keeps its current
  behaviour (opens BookingDetailModal on top). Only empty-capacity clicks are rerouted.
- Picking a **full slot** from the calendar does not pre-trigger the override dialog; the
  drawer's existing capacity-override confirm handles it at save time. The day-view
  time-click flow that today pre-confirms an override and opens the modal with
  `capacityOverride: true` only applies when the drawer is *not* already open.
- Closing the drawer clears `draftPick` and restores all calendar click behaviour.

## 3. Visual restyle (/today paper language)

- **Header:** cream paper, no gradient. Title "New booking", the existing live subtitle
  (dog names · time · date), close button. The `SIZE_THEME` gradient and header-text colour
  theming are removed from the shell.
- **Size cue relocates:** each selected dog row gets a coloured size chip (using the
  existing `SIZE_THEME` palette) so the at-a-glance size signal survives where it is
  actually read.
- **Sections as soft cards** on the paper surface, separated by paper-line borders,
  matching /today: Who (search + selected dog cards with service/add-ons), When (date +
  slot picker), recurring control, pinned footer (error + price/confirm actions).
- **Search results list** gets the same card treatment — clearer rows, same data.
- **Unchanged:** ConfirmationMethodDialog, NotifyRecipientsDialog, past-date and
  capacity-override ConfirmDialogs (all recently aligned to ConfirmDialog), and the
  WhatsApp context banner (restyled to paper tones only).
- Copy stays in the established warm/calm staff-app voice; no wording changes required.

## 4. Explicitly out of scope / unchanged

- All booking logic in `NewBookingModal.jsx`: prefill paths (initialDogId "book again",
  initialEntries parked-draft resume, initialHumanId/ownerName WhatsApp), multi-dog
  entries, recurring bookings, duplicate/closed-day guards, `buildBookingsForOverride`,
  the save flow and honest error reporting.
- All six entry points keep working with the same props: calendar "+ Book", day-view
  time-click (incl. capacity pre-confirm), WhatsApp inbox, book-again, new-client wizard
  hand-off, parked-draft resume.
- No engine, DB, migration, RPC, or Edge Function changes. No changes to the three
  BEFORE INSERT gates.
- Existing modal-mode DrawerShell consumers (OverviewDrawer, DaySettingsDrawer,
  SlideOverPanel) are unaffected (`modal` defaults to `true`).

## 5. Testing & verification

- **Existing tests must pass untouched:** DogSearchSection, TimeSlotPicker,
  AvailabilityCalendar, DrawerShell, helpers — they assert behaviour/roles, not styling.
- **New component tests:**
  - `DrawerShell modal={false}`: no backdrop element, body scroll not locked, focus not
    trapped, Escape still closes, `aria-modal` absent.
  - Draft-pick application: incoming `draftPick` sets date+slot; date-only pick clears the
    slot; a repeated pick with a new nonce reapplies; picks are ignored/na when drawer
    closed.
- **CI bar:** `npm run lint && npm run typecheck && npm run check:migrations && npm run
  test && npm run build` — all green before PR.
- **Visual verification:** offline preview server (`:5174`, `VITE_FORCE_OFFLINE=1`, sample
  data — no real PII) for desktop drawer + live-link behaviour and mobile full-screen
  layout.

## Risks & trade-offs

- **Non-modal dialog a11y:** losing the focus trap is deliberate (the calendar must be
  reachable) but means keyboard users can tab out of the drawer. Mitigated by Escape,
  a clearly focusable close button, and `aria-labelledby`.
- **Two sources of slot truth:** calendar clicks and in-drawer picker both set date/slot.
  The nonce + single App-owned `draftPick` value keeps this one-directional (calendar →
  drawer) and race-free.
- **Stacking:** the drawer must not swallow the follow-up dialogs; verified by z-index
  ordering and a manual pass through the save flow.
