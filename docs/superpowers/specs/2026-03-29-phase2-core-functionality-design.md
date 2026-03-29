# Phase 2 — Core Functionality Completion: Design Spec

**Date:** 2026-03-29
**Status:** Approved
**Parent:** `docs/superpowers/specs/2026-03-29-production-roadmap-design.md`
**Dependencies:** Phase 1 complete (server-side capacity validation, real-time subscriptions, security headers, BookingDetailModal decomposition, TypeScript foundation)

## Overview

Phase 2 builds the features that make this a complete product: customer self-booking, automated notifications, paginated data views, booking history per dog, and App.jsx decomposition. Five workstreams, three of which are independent and can run in parallel.

## Workstream Structure

```
Parallel from day one:
  2.3 Pagination & server-side search (independent)
  2.4 Booking history per dog (independent)
  2.5 App.jsx decomposition (independent)

Sequential:
  2.1 Customer self-booking flow (independent, but biggest piece)
  2.2 Notifications via Edge Functions (depends on 2.1)
```

---

## 2.1 Customer Self-Booking Flow

### Route and Architecture

New route: `/customer/book` in `CustomerApp.jsx`.

Architecture: Orchestrator + step components. `BookingWizard.jsx` holds shared state and manages step transitions. Each step is a focused component that receives props from the wizard and calls back up on completion.

### Components

| Component | Purpose | Approximate size |
|-----------|---------|-----------------|
| `BookingWizard.jsx` | Orchestrator — wizard state, step transitions, final submission | ~200 lines |
| `DogSelection.jsx` | Customer's dogs as selectable cards (multi-select, 1-4). Includes "Add new dog" option | ~150 lines |
| `ServiceSelection.jsx` | Pick service per dog, filtered by size. "Same service for all" shortcut when sizes are similar | ~120 lines |
| `DateSelection.jsx` | Calendar grid showing next 4 weeks. Days marked open/closed/full | ~150 lines |
| `SlotSelection.jsx` | Available drop-off times for chosen date. Runs multi-dog grouping logic | ~150 lines |
| `BookingConfirmation.jsx` | Summary of all bookings. Dog names, services, date, drop-off time. Confirm button | ~100 lines |
| `AddDogInline.jsx` | Compact form for adding a new dog (name, breed, size auto-detected from breed) | ~120 lines |

File location: `src/components/customer/booking/`

### Wizard Flow

1. **Select dogs** — customer sees their dogs as cards, selects 1-4. Can add a new dog inline. 5+ dogs requires staff booking.
2. **Choose services** — per-dog service selection filtered by dog size. Shortcut for "same service for all".
3. **Pick date** — calendar grid showing next 4 weeks. Days colour-coded: open (available), closed, full.
4. **Pick drop-off time** — available times calculated by the multi-dog grouping engine. Customer sees a single drop-off time per option.
5. **Confirm** — summary screen. Confirm creates individual booking records per dog.

### Wizard State Shape

```typescript
interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  selectedDogs: Array<{ dogId: string; name: string; size: DogSize }>;
  services: Record<string, Service>; // keyed by dogId
  selectedDate: string | null;       // ISO date
  selectedSlot: string | null;       // e.g. "08:30"
  slotAllocation: SlotAllocation | null; // output from grouping engine
}

interface SlotAllocation {
  dropOffTime: string;
  assignments: Array<{ dogId: string; slot: string }>;
  groupId: string; // UUID generated client-side, shared across bookings
}
```

### Multi-Dog Slot Grouping

New function in `src/engine/capacity.ts`:

```typescript
function findGroupedSlots(
  dogs: Array<{ id: string; size: DogSize }>,
  date: string,
  bookings: Booking[],
  salonConfig: SalonConfig,
  daySettings: DaySettings | null
): SlotAllocation[]
```

**Grouping rules:**

| Dogs | Slot allocation | Drop-off time |
|------|----------------|---------------|
| 1 | 1 slot | That slot |
| 2 | Same slot | That slot |
| 3 | 2 in one slot + 1 in adjacent slot | Earlier slot |
| 4 | 2 in one slot + 2 in adjacent slot | Earlier slot |

**How it works:**
1. Compute all slot capacities for the date using existing `computeSlotCapacities`
2. Based on dog count, find valid slot arrangements by checking capacity per slot via existing `canBookSlot`
3. For 3-4 dogs, check pairs of adjacent slots in both orders (2+1 or 1+2, 2+2) and return valid pairs
4. Return available drop-off times (always the earlier slot in a pair)

**Edge cases:**
- Mixed sizes — each dog's size checked independently against the slot
- Last slot of the day can't pair forward
- Large dog at 12:00 triggers early close (existing rule still applies)
- All-full day returns empty array; wizard shows "No availability on this date"

**Testing:** Unit tests in `capacity.test.js` covering all dog count combinations, mixed sizes, edge-of-day slots, and capacity boundary conditions.

### Booking Creation

- Creates individual `bookings` records per dog (not a grouped record)
- All bookings in a multi-dog group share a `group_id` (UUID)
- Status: "Not Arrived" immediately (auto-confirmed, no staff approval needed)
- Triggers the `notify-booking-confirmed` Edge Function via database webhook

### Database Changes

- Add `bookings.group_id` column: UUID, nullable, no foreign key (it's a correlation ID)
- Update customer RLS policy: allow INSERT on `bookings` for authenticated customers (currently read-only + cancel)
- Customer can only insert bookings for their own dogs (RLS enforces `dog_id` belongs to a dog owned by the customer's `human_id`)

### Cancellation

- Customers can cancel their own future bookings (existing behaviour)
- For multi-dog bookings: cancel one shows "Cancel just this booking, or all bookings in this group?"
- Cancelling all: updates all bookings with matching `group_id` to cancelled status
- Each cancellation triggers the `notify-booking-cancelled` Edge Function

---

## 2.2 Notifications via Edge Functions

### Edge Functions

Three Supabase Edge Functions, triggered by database webhooks and pg_cron.

**`notify-booking-confirmed`**
- Trigger: Supabase database webhook on `bookings` INSERT where status = 'Not Arrived'
- Looks up: dog name via `dog_id`, customer details via `dogs.human_id` → `humans`
- Multi-dog grouping: if multiple bookings share a `group_id`, consolidate into a single notification listing all dogs (e.g. "Bella and Max are booked in for Full Groom on Tuesday 14th April at 08:30"). The Edge Function queries all bookings with the same `group_id` before sending.
- Channel preference: Twilio WhatsApp (if `humans.whatsapp` = true) → Twilio SMS (if `humans.sms` = true) → SendGrid email (fallback)
- Message format: Brand voice using reassure → inform → close warmly formula
- Logs result to `notification_log`

**`notify-booking-reminder`**
- Trigger: pg_cron job running daily at 6pm
- Queries: bookings where `booking_date = tomorrow` and status = 'Not Arrived'
- Groups multi-dog bookings by `group_id` into single reminder
- Same channel preference and brand voice
- Logs result to `notification_log`

**`notify-booking-cancelled`**
- Trigger: database webhook on `bookings` UPDATE where status changes to cancelled
- Two tones:
  - Customer-initiated: "We've cancelled your appointment for Bella on Tuesday 14th April. You can rebook anytime through your account."
  - Staff-initiated: "Unfortunately, we've had to make a change to your appointment for Bella on Tuesday 14th April. We're sorry for the inconvenience — please get in touch and we'll get you rebooked."
- Logs result to `notification_log`

### External Services

- **Twilio:** WhatsApp Business API and SMS. Requires approved WhatsApp message templates for each trigger type.
- **SendGrid:** Email fallback. Simple transactional email with salon branding.

### Database Changes

New `notification_log` table:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID (PK) | Primary key |
| `booking_id` | UUID (FK → bookings) | Which booking triggered this |
| `group_id` | UUID (nullable) | For multi-dog consolidated notifications |
| `human_id` | UUID (FK → humans) | Recipient |
| `channel` | text | 'whatsapp', 'sms', or 'email' |
| `trigger_type` | text | 'confirmed', 'reminder', or 'cancelled' |
| `status` | text | 'sent', 'failed', or 'pending' |
| `error_message` | text (nullable) | Error detail if failed |
| `sent_at` | timestamptz (nullable) | When successfully sent |
| `created_at` | timestamptz | When the log entry was created |

### Supabase Secrets

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM` (e.g. `whatsapp:+14155238886`)
- `TWILIO_SMS_FROM`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`

### Error Handling

- If preferred channel fails, fall back to next channel in priority order
- If all channels fail, log the failure but don't block the booking
- Staff can see failed notifications in the `notification_log` table (admin view deferred to a later phase)

---

## 2.3 Pagination & Server-Side Search

Scope: Staff-side only — `useDogs`, `useHumans` hooks, `DogsView`, `HumansView`, and dog search in `NewBookingModal`.

### Hook Changes

**`useDogs.js` → `useDogs.ts`:**
- Initial load: first 50 dogs ordered by name
- `hasMore` flag based on whether 50 records were returned
- `loadMore()` function: cursor-based pagination using last dog's name + id for stable ordering
- `searchDogs(query)` function: `.ilike('name', '%query%')` against Supabase, debounced at 300ms
- When search is active, pagination resets to search results. Clear search returns to paginated browse
- Local cache: Map by id of recently viewed dogs, avoids redundant refetches

**`useHumans.js` → `useHumans.ts`:**
- Same pattern: 50 per page, "load more", server-side search
- Search query: `.or('name.ilike.%query%,surname.ilike.%query%')`

### View Changes

**`DogsView.jsx` and `HumansView.jsx`:**
- Search input triggers server-side search instead of client-side filtering
- "Load more" button at the bottom of the grid when `hasMore` is true
- Total count from a lightweight count query: `.select('*', { count: 'exact', head: true })`
- Display: "Showing 50 of 342 dogs"

**`NewBookingModal` dog search:**
- Replace client-side array filter with debounced `searchDogs` call
- Small loading spinner while search is in flight

### What Doesn't Change

- Bookings: stay date-range fetched (week view scopes them naturally)
- Customer portal: fetches only their own dogs (small list, no pagination needed)
- Real-time subscription updates still apply to locally loaded records

---

## 2.4 Booking History Per Dog

### Location

New section in `DogCardModal`, below existing dog details.

### Data Fetching

- New function in `useBookings` hook: `fetchBookingHistoryForDog(dogId)` — queries `bookings` where `dog_id` matches, ordered by `booking_date` descending, limit 10
- Fetched on modal open, not preloaded (keeps initial data load light)
- Returns: array of bookings with date, service, status, notes

### Display

- Section heading: "Grooming History"
- Prominent line at top: "Last visit: 6 weeks ago" (calculated from most recent completed booking)
- Frequency indicator: average gap between visits (e.g. "Usually every 5-6 weeks")
- Overdue highlight: if longer than usual interval, subtle emphasis — "Overdue — last visit was 9 weeks ago"
- List of past visits: date, service, status, any notes or alerts from that visit
- Alerts from past bookings shown inline so staff can spot patterns (e.g. "anxious" appearing repeatedly)
- Empty state: "No previous visits recorded"

### Scope Boundaries

- Read-only — staff don't edit history from this view
- 10 records maximum — no infinite scroll, no "load more". This is at-a-glance context
- No separate page or route — just a section within the existing modal
- No new database changes — queries existing `bookings` table

---

## 2.5 App.jsx Decomposition

### Current State

1,059 lines handling: auth check, data loading (5 hooks), computed state (useMemo for capacities, slots, day state), modal state (8+ useState hooks), event handlers (useCallback functions), view switching, and the full week calendar render.

### Target

App.jsx under 200 lines — auth check, data loading, layout shell, view switcher.

### Extractions

**`useModalState` hook (~100 lines)**
File: `src/hooks/useModalState.ts`

Contains:
- All modal open/close state: `showDatePicker`, `showNewBooking`, `showAddDogModal`, `showAddHumanModal`, `selectedHumanId`, `selectedDogId`, `rebookData`, `showRebookDatePicker`
- All modal toggle callbacks: `openNewBooking`, `closeNewBooking`, `openDogCard`, `closeDogCard`, etc.
- Returns a single object with all modal state and handlers

**`useBookingActions` hook (~100 lines)**
File: `src/hooks/useBookingActions.ts`

Contains:
- `handleAddBooking` — creates a booking via Supabase
- `handleRemoveBooking` — cancels/deletes a booking
- `handleToggleDayOpen` — opens/closes a day
- `handleOverrideSlots` — overrides slot configuration for a day
- `handleRebook` — initiates rebook flow
- Takes data hooks as dependencies (useBookings setters, etc.)

**`WeekCalendarView` component (~300 lines)**
File: `src/components/layout/WeekCalendarView.jsx`

Contains:
- The main day/slot rendering: `DayHeader`, `SlotRow`, `BookingCard` composition
- `useMemo` computations for `activeSlots`, `dayOpenState`, capacity per slot
- Receives: bookings, capacities, day settings, modal handlers as props

**`AppToolbar` component (~80 lines)**
File: `src/components/layout/AppToolbar.jsx`

Contains:
- Navigation between views (Dashboard, Dogs, Humans, Settings)
- Week navigation arrows and date display
- Action buttons (New Booking, Add Dog, Add Human)

### What Stays in App.jsx (~150-200 lines)

- Auth check and redirect to login
- Data loading hooks: `useBookings`, `useDogs`, `useHumans`, `useSalonConfig`, `useDaySettings`
- `useModalState` and `useBookingActions` hook calls
- `activeView` state and view switcher (renders `WeekCalendarView` or `DogsView` or `HumansView` or `SettingsView`)
- Lazy-loaded modal declarations with Suspense boundaries
- Layout shell (header + main content area)

---

## Cross-Cutting Concerns

### TypeScript

All new files in Phase 2 are `.ts` / `.tsx`. New types to add to `src/types/index.ts`:

- `WizardState`, `SlotAllocation` (for booking wizard)
- `NotificationLog`, `NotificationChannel`, `NotificationTrigger` (for notifications)
- `PaginatedResult<T>`, `SearchState` (for pagination hooks)
- `BookingHistory` (for dog history display)

### Real-Time Sync

Customer self-bookings appear on the staff dashboard immediately via the real-time subscriptions set up in Phase 1. No additional real-time work needed — Phase 1's subscriptions on the `bookings` table already cover new inserts.

### Error Handling

- Booking wizard: validation errors shown inline per step. Network errors show a retry-able error state on the confirmation step
- Notifications: failures logged but never block the booking flow
- Pagination: network errors on "load more" show an error toast with retry button
- Booking history: fetch failure shows "Couldn't load history" with retry link

### Testing Strategy

- Multi-dog grouping engine: unit tests in `capacity.test.js` (pure logic, no UI)
- Booking wizard: manual testing of the full flow with 1, 2, 3, and 4 dogs
- Edge Functions: test locally with Supabase CLI before deploying
- Pagination: manual testing with seed data scaled to 200+ dogs
- App.jsx decomposition: regression testing — app behaviour must be identical before and after
