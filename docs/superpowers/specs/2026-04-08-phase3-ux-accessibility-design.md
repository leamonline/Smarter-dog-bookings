# Phase 3: UX, Accessibility & Modal Decomposition

**Date:** 2026-04-08
**Status:** Design approved
**Scope:** BookingDetailModal decomposition, WCAG AA structural accessibility, keyboard shortcuts, staff UX (Today button)

---

## 1. BookingDetailModal Decomposition

### Goal

Reduce BookingDetailModal.jsx from 850 lines to ~350 lines by extracting self-contained sections into components and logic into hooks. The modal becomes an orchestrator that wires hooks to rendered sections.

### New Components

**LogisticsSection.jsx** (~220 lines extracted)
- Grooming notes row
- Date picker row with date display/edit
- Slot grid (delegates to SlotSelector)
- Service selector with size-based filtering
- Add-ons display/edit (Flea Bath, De-mat, etc.)
- Pick-up human dropdown

Props: `editData`, `setEditData`, `isEditing`, `booking`, `allowedServices`, `dogs`, `humans`, `trustedHumans`, `daySettings`.

**FinanceSection.jsx** (~73 lines extracted)
- Base price display (from active pricing by size)
- Payment status row (Unpaid / Deposit / Paid)
- Amount due calculation display
- Error flag for pricing mismatches
- History flag indicator

Props: `activePrice`, `editData`, `setEditData`, `isEditing`, `amountDue`, `primaryHuman`, `booking`.

**SlotSelector.jsx** (~70 lines extracted)
- Time slot grid with capacity colouring
- Shows available/taken/selected states
- Handles slot click in edit mode
- Receives pre-computed available slots

Props: `editData`, `setEditData`, `availableSlots`, `currentSlotStillValid`, `booking`.

### New Hooks

**useBookingEditState.ts**
Consolidates scattered state into a single hook:
- `editData` / `setEditData` (the mutable booking copy)
- `allergyInput` / `setAllergyInput` / `hasAllergy` / `setHasAllergy`
- `isEditing` / `setIsEditing`
- `showDatePicker` / `showExitConfirm` / `showContact` state
- `resetEditState()` function
- `buildEditState()` initialiser

Returns: `{ editData, setEditData, allergyState, modalState, isEditing, setIsEditing, resetEditState }`.

**useSlotAvailability.ts**
Memoised slot validation extracted from the component:
- Computes `availableSlots` for the selected date
- Computes `currentSlotStillValid` for the existing booking's slot
- Depends on `bookingsByDate`, `dayOpenState`, `daySettings`, `editData`

Returns: `{ availableSlots, currentSlotStillValid }`.

**useBookingSave.ts**
Extracts the 97-line `handleSave` function:

- Accepts `onUpdate`, `onUpdateDog`, and `resetEditState` as configuration
- Validates date, slot, service, day-open status, slot availability
- Updates dog data (allergies, notes) if changed via `onUpdateDog`
- Updates booking record via `onUpdate`
- Calls `resetEditState` on success
- Tracks `saving` and `saveError` state

Returns: `{ save, saving, saveError }`.

### Post-Extraction File Structure

```
src/components/modals/booking-detail/
  BookingHeader.jsx         (exists, 103 lines)
  BookingStatusBar.jsx      (exists, 115 lines)
  BookingAlerts.jsx          (exists, 102 lines)
  BookingActions.jsx         (exists, 110 lines)
  ExitConfirmDialog.jsx      (exists, 31 lines)
  shared.jsx                 (exists, 62 lines)
  LogisticsSection.jsx       (NEW, ~220 lines)
  FinanceSection.jsx         (NEW, ~73 lines)
  SlotSelector.jsx           (NEW, ~70 lines)

src/hooks/
  useBookingEditState.ts     (NEW)
  useSlotAvailability.ts     (NEW)
  useBookingSave.ts          (NEW)
```

### Target

BookingDetailModal.jsx reduces to ~350 lines — imports, hook wiring, layout shell, and conditional rendering of sub-modals.

---

## 2. Accessibility Foundations (WCAG AA Structural)

### Dependency

Install `react-aria` — Adobe's headless accessibility library. Provides `useDialog`, `FocusScope`, `useKeyboard`, and other hooks. No styling opinions; works with existing Tailwind setup. ~15KB.

### AccessibleModal Wrapper

A shared component that all modals use instead of raw `<div>` backdrops:

```tsx
// src/components/shared/AccessibleModal.tsx
// Wraps children with:
// - useDialog() for ARIA dialog semantics
// - FocusScope with contain + restoreFocus
// - role="dialog", aria-modal="true"
// - aria-labelledby pointing to a provided title ID
// - Scroll lock on document body
// - Escape key handling (calls onClose)
```

### Modals to Migrate

All 10 modals adopt AccessibleModal:
1. BookingDetailModal
2. NewBookingModal
3. AddHumanModal
4. AddDogModal
5. ChainBookingModal
6. DogCardModal
7. HumanCardModal
8. ContactPopup
9. DatePickerModal
10. ExitConfirmDialog

Each modal replaces its current backdrop `<div>` with `<AccessibleModal>`. Focus trapping, ARIA attributes, and escape handling come for free.

### Nested Modal Focus

When a nested modal opens (e.g. DatePickerModal inside BookingDetailModal), React Aria's FocusScope handles chaining automatically — inner modal traps focus, closing it restores focus to the outer modal's trigger.

### Semantic HTML Pass

**Landmark regions:**
- `<header>` for AppToolbar / customer portal header
- `<nav>` for CalendarTabs, settings tab bar, customer portal navigation
- `<main>` for the primary content area (calendar grid, dogs list, etc.)
- `<section>` for logical groupings within views

**Skip navigation:**
- Add `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to main content</a>` at the top of both App.jsx and CustomerApp.jsx
- Target element gets `id="main-content"`

**Form labels:**
- All `<input>` elements get associated `<label>` elements (visible or `sr-only` class)
- Placeholder-only inputs get explicit labels for screen readers
- Search inputs get `role="search"` on their containing form

**Icon button labels:**
- Close buttons: `aria-label="Close"`
- Navigation arrows: `aria-label="Previous day"` / `aria-label="Next day"`
- Status advance: `aria-label="Advance to {nextStatus}"`
- All emoji-only or icon-only buttons get descriptive aria-labels

### Live Regions

**Status announcements:**
- Booking status changes announced via `aria-live="polite"` region
- Save success/failure announced
- Search results count announced when results update

**Implementation:** A shared `LiveAnnouncer` component mounted at the app root. Other components call `announce(message)` to push text to the live region. Keeps announcement logic centralised.

### Focus Management Patterns

- Modal open: focus moves to first focusable element inside
- Modal close: focus returns to the trigger element
- Day/week navigation: focus stays on the active day tab
- View switching (Bookings/Dogs/Humans): focus moves to the main content area
- After saving a booking: focus returns to the booking card that was clicked

---

## 3. Keyboard Shortcuts

### Foundation Hook

**useKeyboardShortcuts.ts**
- Built on React Aria's `useKeyboard`
- Accepts a shortcut map: `Record<string, { handler: () => void, description: string }>`
- Context-aware: shortcuts suppressed when focus is in `<input>`, `<textarea>`, `<select>`, or `[contenteditable]`
- Modal-aware: global shortcuts disabled while any modal is open; modal-specific shortcuts register separately
- Returns: `{ activeShortcuts }` for the help overlay

### Staff Shortcuts — Global (Calendar App)

| Key | Action | Description |
|-----|--------|-------------|
| `←` | Select previous day | Navigate to previous day |
| `→` | Select next day | Navigate to next day |
| `Shift+←` | Previous week | Navigate to previous week |
| `Shift+→` | Next week | Navigate to next week |
| `T` | Jump to today | Select today and navigate to today's week |
| `N` | New booking | Open the new booking modal |
| `Escape` | Close modal | Close the currently open modal |
| `/` | Focus search | Move focus to the search input (Dogs/Humans views) |
| `?` | Shortcuts help | Open the shortcuts help overlay |

### Staff Shortcuts — Modal Context

| Key | Action | Description |
|-----|--------|-------------|
| `E` | Toggle edit | Enter/exit edit mode in BookingDetailModal |
| `Cmd+S` / `Ctrl+S` | Save | Save current changes (prevents browser default) |
| `Escape` | Close | Close modal (triggers exit confirm if dirty) |

### Customer Shortcuts (Booking Portal)

| Key | Action | Description |
|-----|--------|-------------|
| `Escape` | Back / close | Go back one step in wizard, or close modal |
| `Enter` | Confirm / next | Proceed to next step or confirm current selection |
| `Tab` / `Shift+Tab` | Navigate fields | Standard tab order (ensured by proper focus management) |
| `?` | Shortcuts help | Open shortcuts help overlay |

### ShortcutsHelpOverlay

- Triggered by `?` key in both staff and customer contexts
- Uses AccessibleModal for proper focus trapping
- Displays active shortcuts for the current context (staff global, staff modal, or customer)
- Grouped by category (Navigation, Actions, Modal)
- Simple two-column layout: key combo on left, description on right
- Closed by `Escape` or clicking outside

### Input Suppression Rules

Shortcuts are suppressed when:
- Focus is inside any text input, textarea, select, or contenteditable element
- Exception: `Escape` always works (closes modal or blurs input)
- Exception: `Cmd+S` / `Ctrl+S` always works when in edit mode (prevents browser save dialog)

---

## 4. Staff UX — Today Button

### Placement

Added to AppToolbar, positioned between the backward/forward week navigation arrows:

```
[ ◀ ] [ Today ] [ ▶ ]    7 – 13 Apr 2026    [ + New Booking ]
```

### Behaviour

- Calls existing `handleDatePick(new Date())` from `useWeekNav` — no new navigation logic needed
- Selects today's date and navigates to today's week in one action
- Visual states:
  - **Active (green):** current week does not contain today — clicking will navigate
  - **Muted/disabled:** already viewing today's week with today selected — no action needed
- Gets `aria-label="Jump to today"` for screen readers
- Responds to `T` keyboard shortcut (registered in global shortcuts)

### Keyboard Integration for Existing Features

- Quick-status button on BookingCard: add `aria-label="Advance to {nextStatus}"` for screen readers
- Today column: add `aria-current="date"` to the active day tab when it's today
- Week navigation arrows: ensure they're keyboard-focusable with `aria-label="Previous week"` / `aria-label="Next week"`

---

## Implementation Order

These four workstreams have dependencies that determine the build order:

1. **React Aria installation + AccessibleModal wrapper** — foundation for everything else
2. **BookingDetailModal decomposition** — extract hooks and components; apply AccessibleModal during extraction
3. **Semantic HTML pass** — landmarks, labels, live regions across both apps
4. **Keyboard shortcuts** — useKeyboardShortcuts hook, staff shortcuts, customer shortcuts, help overlay
5. **Today button** — small addition to AppToolbar with keyboard shortcut integration

Steps 2 and 3 can partially overlap. Step 4 depends on the modal work being complete (modal-aware shortcut suppression needs AccessibleModal in place). Step 5 is independent but benefits from the keyboard system being ready.

---

## Out of Scope

- WCAG AA fine-grained audit (contrast ratios, text sizing, spacing) — follow-up phase
- Drag-and-drop for booking cards
- Advanced staff features (multi-select bookings, bulk actions)
- Performance optimisation (Phase 4)
- TypeScript migration of remaining JSX files (incremental, as files are touched)
