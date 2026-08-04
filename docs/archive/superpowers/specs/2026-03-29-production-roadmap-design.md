# Smarter Dog Booking Software — Production Roadmap

**Date:** 2026-03-29
**Status:** Approved
**Approach:** Interleaved (fixes and features move together per phase)

## Context

The app is a dog grooming salon booking system with two portals: a staff dashboard (week calendar, booking management, dog/human CRM) and a customer portal (view-only today). Built with React 19, Supabase (Postgres + Auth), deployed to Netlify.

### Constraints from assessment
- Both staff and customer portals are equally important
- No hard deadline — quality over speed, but no gold-plating
- 2-4 staff using simultaneously, growing to 300-500 dogs and 200-400 customers within a year
- Must handle concurrent multi-staff use safely

### Current state (codebase analysis, 2026-03-29)
- ~12,000 lines of JS/JSX across 40+ files
- 4 runtime dependencies (React, React DOM, React Router, Supabase)
- Capacity engine with 2-2-1 rules, well-tested
- RLS policies comprehensive, role escalation prevention in place
- No real-time subscriptions (stale data risk with multiple staff)
- Capacity validation is client-side only (bypassable)
- No security headers in production
- BookingDetailModal: 1,588 lines, App.jsx: 1,059 lines (both too large)
- All inline styles (no CSS pseudo-classes, media queries, or animations)
- No TypeScript
- Customer portal is view-only (no self-booking)
- No notifications, reporting, recurring bookings, or audit trail

---

## Phase 1 — Stabilise Foundation

**Goal:** Fix things that will cause real-world failures before building anything new. When done, the app is safe for multi-staff use and the codebase is ready to grow.

### 1.1 Server-side capacity validation

**What:** Add a Postgres trigger (or Supabase Edge Function) that enforces the 2-2-1 capacity rules on every booking INSERT and UPDATE.

**Why:** The client-side `canBookSlot()` is the only thing preventing capacity violations. Anyone with the Supabase URL and anon key can bypass it with a direct API call. With 2-4 staff, concurrent bookings could also slip past client-side checks.

**Details:**
- Implement as a Postgres `BEFORE INSERT OR UPDATE` trigger on the `bookings` table
- The trigger replicates the core logic from `capacity.js`: seat counting, 2-2-1 rule, large dog slot rules, early close detection
- Client-side validation stays for fast UI feedback — the trigger is the safety net
- Add an `enforce_server_capacity` boolean to `salon_config` so it can be disabled without a code deploy if the trigger has a bug
- Test exhaustively against all existing `capacity.test.js` cases before deploying

**Risk:** Highest-risk change in the roadmap. A bug here rejects valid bookings or allows invalid ones. The config flag mitigates this.

**Dependencies:** None.

### 1.2 Real-time subscriptions

**What:** Add `supabase.channel().on('postgres_changes')` listeners to `useBookings`, `useDogs`, and `useHumans`.

**Why:** Without this, two staff members see stale data. Staff A adds a booking, Staff B doesn't see it until they navigate away and back. This causes double-bookings and confusion.

**Details:**
- Subscribe to INSERT, UPDATE, DELETE on `bookings`, `dogs`, and `humans` tables
- On receiving an event, update local state using the existing `setBookingsByDate`, `setDogs`, `setHumans` setters
- Deduplicate: if the event was triggered by the current client's own action, skip the update (the local state is already correct)
- Clean up subscriptions on unmount
- Handle reconnection gracefully — if the WebSocket drops, refetch current data on reconnect

**Risk:** Race conditions between local optimistic updates and incoming realtime events. Mitigation: server response is always source of truth; reconcile by ID.

**Dependencies:** None.

### 1.3 Security headers

**What:** Add production security headers to `netlify.toml` and normalise auth error messages.

**Why:** No CSP, X-Frame-Options, or HSTS means the app is vulnerable to clickjacking, MIME sniffing, and downgrade attacks. Auth error messages currently leak whether an email exists.

**Details:**
- Add to `netlify.toml`:
  - `Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://*.supabase.co wss://*.supabase.co;`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- In `LoginPage.jsx` and `CustomerLoginPage.jsx`: catch all Supabase auth errors and display "Invalid credentials" regardless of the specific error

**Dependencies:** None.

### 1.4 Break up BookingDetailModal

**What:** Split the 1,588-line `BookingDetailModal.jsx` into focused sub-components.

**Why:** This is the most-edited file in the app and every feature in Phase 2-3 will touch it. At its current size, it's unmaintainable — hard to debug, hard to review changes, easy to introduce regressions.

**Details:**
- Extract into: `BookingViewMode`, `BookingEditForm`, `BookingStatusBar`, `BookingAddons`, `BookingPayment`, `BookingNotes`
- The modal itself becomes an orchestrator: manages which mode to show (view/edit), handles save/close, delegates rendering to sub-components
- Each sub-component receives only the props it needs
- Extract one sub-component at a time, test the modal after each extraction
- Target: no single file over 300 lines

**Dependencies:** None, but do this before any Phase 2 work that touches the booking modal.

### 1.5 Begin TypeScript migration

**What:** Set up TypeScript config and convert the engine, hooks, and type-definition files.

**Why:** At ~12,000 lines with implicit types, property name typos and shape mismatches won't surface until runtime. The engine and hooks are where type bugs are most dangerous (wrong capacity calculation, malformed booking payload).

**Details:**
- Add `tsconfig.json` with strict mode
- Define core types in `src/types/index.ts`: `Dog`, `Human`, `Booking`, `SlotCapacity`, `SalonConfig`, `DaySettings`, `BookingStatus`, `DogSize`, `Service`
- Convert engine files: `capacity.ts`, `bookingRules.ts`, `utils.ts`
- Convert hook files: `useBookings.ts`, `useDogs.ts`, `useHumans.ts`, `useAuth.ts`, `useSalonConfig.ts`, `useDaySettings.ts`
- Convert transforms: `transforms.ts`
- All new files from this point forward are `.tsx`/`.ts`
- Existing components convert when touched in later phases — no big-bang migration

**Dependencies:** None.

---

## Phase 2 — Core Functionality Completion

**Goal:** Build the features that make this a complete product. Customer self-booking, notifications, and the data infrastructure for growth.

### 2.1 Customer self-booking flow

**What:** Customers can book their own grooming appointments through the `/customer` portal.

**Why:** This is the core value proposition of an online booking system. Without it, the app is just a staff calendar.

**Details:**
- Flow: Login via OTP -> See their dogs -> Select dog -> Pick service (filtered by size) -> See available dates (calendar showing open/closed/full) -> Pick available slot (capacity-aware via `canBookSlot`) -> Confirm booking
- Booking lands with status "Not Arrived", visible to staff via real-time sync
- Customers can cancel their own future bookings (RLS already supports this)
- Reuses: capacity engine, date/slot picker patterns from `NewBookingModal`, existing Supabase hooks (adapted for customer client)
- New components: `BookingWizard`, `ServicePicker`, `DateCalendar`, `SlotPicker`, `BookingConfirmation`

**Dependencies:** 1.1 (server-side validation — customers booking without it is dangerous), 1.2 (real-time sync so staff see new customer bookings immediately).

### 2.2 Notifications via Edge Functions

**What:** Automated booking notifications sent via WhatsApp/email.

**Why:** Customers expect confirmation when they book, and reminders reduce no-shows.

**Details:**
- Three notification triggers:
  - **Booking confirmed** — sent when staff confirms a customer booking (or immediately on self-book if auto-confirm is enabled)
  - **Booking reminder** — sent 24 hours before appointment (scheduled Edge Function via pg_cron or Supabase cron)
  - **Booking cancelled** — sent when either party cancels
- Implemented as Supabase Edge Functions
- Edge Function handles message formatting using brand voice
- Notification channel preference from `humans` table contact fields (WhatsApp preferred, email fallback)
- Add `notification_log` table to track what was sent and delivery status

**Dependencies:** 2.1 (bookings must exist to notify about).

### 2.3 Pagination and server-side search

**What:** Replace "fetch all" with paginated queries and server-side search.

**Why:** At 300-500 dogs, fetching everything on mount becomes slow. Client-side filtering of 500 records on every keystroke causes jank.

**Details:**
- `useDogs` and `useHumans` fetch first page (50 records) on mount
- Search inputs trigger `.ilike()` queries against Supabase instead of local filtering
- Dogs and Humans views get "load more" pagination (not infinite scroll — explicit button is simpler and more predictable)
- Dog search in `NewBookingModal` also uses server-side search with debounced input (300ms)
- Keep a local cache of recently accessed records to avoid redundant fetches

**Dependencies:** None.

### 2.4 Booking history per dog

**What:** Show last 5-10 visits in `DogCardModal`.

**Why:** Staff need to see "last groomed 6 weeks ago, full groom, sensitive ears" at a glance. Currently they have to remember or check notes manually.

**Details:**
- Query: `bookings` table filtered by `dog_id`, ordered by `booking_date` descending, limit 10
- Display in DogCardModal: date, service, status, any notes or alerts from that visit
- Highlight how long since last visit ("Last visit: 6 weeks ago")

**Dependencies:** None.

### 2.5 App.jsx decomposition

**What:** Break the 1,059-line `App.jsx` into focused pieces.

**Why:** Same rationale as 1.4. App.jsx is the router, data coordinator, modal state manager, and layout engine all at once. Every feature addition creates merge conflicts.

**Details:**
- Extract `WeekCalendarView` component (the main day/slot rendering)
- Extract `useModalState` hook (all modal open/close state and callbacks)
- Extract `AppToolbar` component (navigation, view switching, action buttons)
- App.jsx becomes: auth check -> data loading -> layout shell with composed children
- Target: App.jsx under 200 lines

**Dependencies:** Benefits from 1.4 being done first (reduces merge conflicts). Can start early Phase 2.

---

## Phase 3 — UX/UI Perfection

**Goal:** Make both portals feel polished and effortless. Remove friction, add the interactions users expect.

### 3.1 Migrate from inline styles to CSS Modules

**What:** Replace JavaScript style objects with CSS Modules (`.module.css` files co-located with components).

**Why:** Inline styles can't do hover states, focus outlines, media queries, or animations. Styles are duplicated across components. A design system needs real CSS.

**Details:**
- Convert `BRAND` constants to CSS custom properties on `:root`
- Create CSS Modules per component, co-located (e.g. `BookingCard.module.css` next to `BookingCard.tsx`)
- Convert components as they're touched — no big-bang rewrite
- Shared styles (form inputs, modals, cards) become shared CSS Modules in `src/styles/`
- Remove inline style objects as each component converts

**Dependencies:** Easier after 1.4 and 2.5 (smaller files to convert).

### 3.2 Accessibility pass

**What:** Bring the app to WCAG 2.1 AA compliance.

**Why:** Keyboard users can't navigate the app. Screen readers can't identify icon buttons. Focus escapes modals. These aren't edge cases — they affect anyone using a keyboard or assistive technology.

**Details:**
- Add `aria-label` to all icon buttons in `icons/index.jsx`
- Add focus trapping to all modals (tab cycles within modal, Escape closes)
- Add `:focus-visible` outlines via CSS Modules
- Add skip-to-content link
- Audit colour contrast on status badges and light-background text
- Add `role="dialog"` and `aria-modal="true"` to modal overlays

**Dependencies:** 3.1 (focus-visible outlines need CSS, not inline styles).

### 3.3 Keyboard shortcuts for staff

**What:** Keyboard shortcuts for common staff actions.

**Why:** Staff doing 30+ bookings a day need fast input. Mouse-only interaction slows them down.

**Details:**
- `N` — open new booking modal
- `T` — jump to today
- `Left` / `Right` arrow — navigate weeks
- `Escape` — close any open modal
- `/` — focus search bar
- Implemented as a single `useKeyboardShortcuts` hook on `keydown`
- Disabled when an input/textarea is focused
- No library needed

**Dependencies:** None.

### 3.4 Staff dashboard UX improvements

**What:** Today highlight, jump-to-today, drag-and-drop rebooking, quick status advancement.

**Why:** These are the daily-use friction points. Staff interact with the calendar dozens of times per day — small improvements compound.

**Details:**
- **Today highlight:** Subtle background colour on today's column in week view, "Today" badge on `DayHeader`
- **Jump to today:** Button in nav bar that resets `weekOffset` to 0 and `selectedDay` to today's index
- **Drag-and-drop rebooking:** HTML Drag and Drop API. Drag a BookingCard to another slot. On drop: validate via `canBookSlot`, call `updateBooking` on success. Show error toast if validation fails. Must test on tablet — may need a "move to" button fallback for touch devices.
- **Quick status advancement:** Single-click button on BookingCard to advance to next status (Not Arrived -> Checked In -> In Bath -> Ready -> Completed). No modal needed for simple status changes.

**Dependencies:** Drag-and-drop depends on 1.1 (server validation) and 1.2 (real-time sync). Today highlight and jump-to-today have no dependencies (quick wins).

### 3.5 Customer portal UX

**What:** Post-booking confirmation, rebooking prompts, cancellation with reason.

**Why:** The customer experience doesn't end at booking. Confirmation builds trust, rebooking prompts drive retention, cancellation reasons give staff insight.

**Details:**
- **Confirmation screen:** After booking, show summary (date, time, service, dog name) with "Add to calendar" link (`.ics` file generation)
- **Rebooking prompt:** When a booking is completed, show "Book your next appointment?" with same dog and service pre-filled
- **Cancel with reason:** Dropdown on cancel: "Changed plans", "Dog unwell", "Other" (free text). Stored as `cancel_reason` on the booking record.

**Dependencies:** 2.1 (customer booking flow must exist).

---

## Phase 4 — Optimisation & Polish

**Goal:** Make the app fast and efficient at the data volumes expected within a year.

### 4.1 Fix capacity computation redundancy

**What:** Compute slot capacities once per day, not once per slot.

**Why:** `getSeatStatesForSlot` calls `computeSlotCapacities` internally for every slot. Rendering 10 slots means computing all capacities 10 times. Wasteful and gets worse with more complex rules.

**Details:**
- Call `computeSlotCapacities` once at the day level (in the parent component that renders `SlotRow` components)
- Pass the pre-computed capacities map down as a prop
- `getSeatStatesForSlot` accepts the pre-computed map instead of recalculating

**Dependencies:** None.

### 4.2 Virtualised lists

**What:** Add `react-window` to Dogs and Humans grid views.

**Why:** At 400+ records, rendering all cards causes visible scroll jank. Virtualisation renders only the visible rows.

**Details:**
- Add `react-window` dependency
- Wrap Dogs and Humans grids in a virtualised container
- Combined with server-side search from 2.3, the views stay responsive regardless of total record count

**Dependencies:** 2.3 (server-side search should be in place first).

### 4.3 Optimistic updates

**What:** Update local state immediately on user actions, reconcile when server responds.

**Why:** Currently every action waits for Supabase's response. This adds 100-300ms latency to every click. Optimistic updates make the app feel instant.

**Details:**
- On booking add/update/delete: update local state immediately
- On server success: do nothing (state is already correct)
- On server failure: roll back local state, show error message
- The pattern partially exists in offline mode code — extend to online operations
- Real-time subscription deduplication (from 1.2) prevents double-updates

**Dependencies:** 1.1 (server-side validation as safety net), 1.2 (real-time sync for reconciliation).

### 4.4 Smart data fetching

**What:** Stale-while-revalidate caching for week navigation.

**Why:** Navigating to a previously-viewed week re-fetches all bookings. With caching, it shows instantly and refreshes in the background.

**Details:**
- Cache bookings by week key (e.g. `2026-W14`)
- On navigate: show cached data immediately, refetch in background
- Real-time subscriptions keep current week's cache fresh
- Cache invalidation: clear entry when a booking in that week is modified via realtime event
- Simple in-memory cache — no external library needed

**Dependencies:** 1.2 (real-time subscriptions are the cache invalidation mechanism).

### 4.5 Bundle and loading optimisation

**What:** Consistent lazy loading, loading skeletons, preloading on hover.

**Why:** Initial load speed affects perceived quality. Layout jumps during loading feel broken.

**Details:**
- Lazy-load all modals consistently (NewBookingModal is currently eager)
- Replace spinner with skeleton loader for the week view (grey placeholder cards)
- Preload `NewBookingModal` chunk on hover over the "New Booking" button (`import()` on mouseenter)
- Audit Vite chunk config for unnecessary splits or missing splits

**Dependencies:** None.

---

## Phase 5 — Production Readiness

**Goal:** Everything needed to run confidently in production with real customers and real money.

### 5.1 Audit trail

**What:** Automatic logging of who did what and when.

**Why:** With multiple staff, "who cancelled this booking?" and "who changed this dog's alerts?" become real questions. Also useful for dispute resolution with customers.

**Details:**
- New `audit_log` table: `id`, `timestamp`, `user_id`, `action` (created/updated/deleted), `table_name`, `record_id`, `old_values` (JSONB), `new_values` (JSONB)
- Implemented as Postgres triggers on `bookings`, `dogs`, `humans` tables — fires automatically, no client code needed
- New "Activity" tab in Settings view showing recent actions with filters
- Retention: keep 90 days, auto-purge older entries via pg_cron

**Dependencies:** None. Do early in Phase 5 so it starts capturing history.

### 5.2 Error monitoring and logging

**What:** Error boundary, error tracking service, Edge Function logging.

**Why:** Without this, you find out about production errors when customers complain. With it, you know before they do.

**Details:**
- React error boundary at app root: catches rendering crashes, shows recovery screen with "Reload" button
- Connect to Sentry free tier (or similar): automatic error capture with stack traces, user context, breadcrumbs
- Structured logging in Edge Functions (from 2.2): log notification send/failure with booking ID, recipient, channel
- Alert on error spike (Sentry's built-in alerting)

**Dependencies:** None.

### 5.3 Recurring bookings

**What:** "Repeat every N weeks" option when creating bookings.

**Why:** Most grooming clients are regulars on a 4-8 week cycle. Manually rebooking each time is the biggest daily time sink for staff.

**Details:**
- New `booking_series` table: `id`, `dog_id`, `service`, `interval_weeks`, `day_of_week`, `preferred_slot`, `start_date`, `end_date` (nullable), `active`
- When creating a booking with repeat: create the series record, generate bookings for the next 3 months
- A weekly pg_cron job extends active series (generates bookings for the next rolling 3-month window)
- Cancelling one booking in a series: option to cancel just this one or the whole series
- Editing a series: change service/interval/slot, applies to future bookings only
- Customer portal shows upcoming recurring bookings with "Skip this one" option

**Dependencies:** 2.1 (customer booking flow), 1.1 (server-side validation must handle series bookings).

### 5.4 Reporting dashboard

**What:** Simple analytics view for staff.

**Why:** You can't improve what you can't measure. Basic metrics drive better business decisions.

**Details:**
- New "Reports" view in staff dashboard
- Metrics (all from aggregate queries on `bookings` table):
  - Bookings this week / this month (count + trend vs previous period)
  - Revenue this week / this month (sum of booking prices)
  - Slot utilisation (booked seats / available seats as percentage)
  - Service breakdown (pie/bar of full-groom vs bath-and-brush vs deshed vs puppy)
  - Cancellation rate (cancelled / total as percentage)
- Displayed as stat cards and simple bar charts
- One small charting dependency (e.g. `recharts`) or hand-rolled SVG bars
- Date range picker to view custom periods

**Dependencies:** None.

### 5.5 Backup, recovery, and deployment confidence

**What:** Infrastructure for safe production operations.

**Why:** One bad migration or accidental delete shouldn't mean lost data or downtime.

**Details:**
- Enable Supabase Point-in-Time Recovery (PITR) if not already active
- Set up a staging Supabase project for testing migrations before production
- Pre-deployment checklist: run capacity tests, verify RLS policies, check Edge Function health
- Health check Edge Function: confirms DB connectivity, returns 200/500
- Document the deployment process and rollback procedure

**Dependencies:** None.

---

## Quick Wins

High impact, low effort. Can be done in a day or less:

| Task | Effort | Impact | Phase |
|------|--------|--------|-------|
| Security headers in `netlify.toml` | 10 min | High — immediate production hardening | 1.3 |
| Normalise auth error messages | 30 min | Medium — prevents user enumeration | 1.3 |
| Jump-to-today button | 1 hour | Medium — daily staff convenience | 3.4 |
| Today highlight in week view | 30 min | Medium — visual orientation | 3.4 |
| Quick status advancement on BookingCard | 2 hours | High — biggest daily workflow improvement | 3.4 |
| Lazy-load NewBookingModal | 30 min | Low-medium — reduces initial bundle | 4.5 |

---

## Risky Areas

Changes that could break things if not handled carefully:

1. **Server-side capacity trigger (1.1):** Most important and most dangerous. A bug rejects valid bookings or allows invalid ones. Mitigated by `enforce_server_capacity` config flag and exhaustive testing against existing test cases.

2. **Real-time subscriptions (1.2):** Race conditions between local updates and incoming events can cause duplicate or missing bookings. Mitigated by ID-based deduplication and server-as-source-of-truth reconciliation.

3. **BookingDetailModal decomposition (1.4):** 1,588 lines of intertwined state. Extract one sub-component at a time, test after each extraction. Don't try to split all at once.

4. **TypeScript migration (1.5):** Converting a file imported by many others causes cascading type errors. Start with leaf files (engine, utils) that have few importers, work outward.

5. **Drag-and-drop (3.4):** HTML Drag and Drop API is inconsistent across browsers and poor on touch devices. Test on iPad/tablet early. May need a "move to" button fallback for mobile.

---

## Early Refactors

Refactors that pay dividends if done early:

1. **BookingDetailModal split (1.4)** — Before any Phase 2/3 feature touches this modal. Every feature added to a 1,588-line file makes the next split harder.

2. **Core TypeScript types (1.5)** — Define `Dog`, `Human`, `Booking`, `SlotCapacity` before building new features. Every new file in Phase 2+ benefits from having these types.

3. **App.jsx decomposition (2.5)** — Pull into Phase 1 if possible. The longer it stays monolithic, the more merge conflicts across parallel work.

---

## Dependency Graph Summary

```
Phase 1 (all independent, can parallelise):
  1.1 Server-side validation
  1.2 Real-time subscriptions
  1.3 Security headers
  1.4 BookingDetailModal split
  1.5 TypeScript migration

Phase 2:
  2.1 Customer self-booking -----> depends on 1.1, 1.2
  2.2 Notifications -----------> depends on 2.1
  2.3 Pagination/search -------> independent
  2.4 Booking history ---------> independent
  2.5 App.jsx decomposition ---> benefits from 1.4

Phase 3:
  3.1 CSS Modules -------------> benefits from 1.4, 2.5
  3.2 Accessibility -----------> depends on 3.1
  3.3 Keyboard shortcuts ------> independent
  3.4 Staff UX (drag-drop) ----> depends on 1.1, 1.2
  3.5 Customer UX -------------> depends on 2.1

Phase 4:
  4.1 Capacity computation ----> independent
  4.2 Virtualised lists -------> depends on 2.3
  4.3 Optimistic updates ------> depends on 1.1, 1.2
  4.4 Smart data fetching -----> depends on 1.2
  4.5 Bundle optimisation -----> independent

Phase 5:
  5.1 Audit trail -------------> independent
  5.2 Error monitoring --------> independent
  5.3 Recurring bookings ------> depends on 2.1, 1.1
  5.4 Reporting dashboard -----> independent
  5.5 Backup/recovery ---------> independent
```
