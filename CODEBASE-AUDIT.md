# Codebase Audit Report — SmarterDog

**Date:** 2026-04-14
**Auditor:** Claude (Opus 4.6)
**Scope:** Full file-by-file read-only audit of the `leamonline/Smarter-dogs-smart-humans` repository

---

## 1. Stack Overview

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend framework** | React | 19.2.4 |
| **Routing** | react-router-dom | 7.13.2 |
| **Styling** | Tailwind CSS v4 (via `@tailwindcss/vite`) | 4.2.2 |
| **Accessibility** | react-aria (`FocusScope`, `useDialog`) | 3.47.0 |
| **Backend / BaaS** | Supabase (Postgres + Auth + Edge Functions + Realtime) | supabase-js 2.100.0 |
| **Build tool** | Vite 7 | 7.3.2 |
| **PWA** | vite-plugin-pwa (Workbox) | 1.2.0 |
| **Language** | TypeScript 6 (mixed `.js`/`.jsx`/`.ts`/`.tsx`) | 6.0.2 |
| **Testing** | Vitest | 4.1.4 |
| **Analytics** | @vercel/analytics | 2.0.1 |
| **Hosting** | Vercel (primary) + Netlify (alt config) | — |
| **Edge runtime** | Deno (Supabase Edge Functions) | std@0.168.0 |

**Architecture pattern:** Single-page app (SPA) with two entry points — a **staff dashboard** (`/`) and a **customer portal** (`/customer/*`). Both share a single Supabase project but use separate auth clients with distinct storage keys to prevent session interference. The backend is entirely Supabase: Postgres for data, RLS for authorization, Edge Functions for notifications and calendar feeds, and pg_cron for scheduled reminders.

**Source file count:** ~95 source files (excluding node_modules, build output, docs, and tooling config).

**Total estimated source lines:** ~16,000 lines across frontend components, hooks, engine logic, Supabase hooks, SQL migrations, and Edge Functions.

---

## 2. Codebase Map

### Entry Points

| Entry | File | Purpose |
|-------|------|---------|
| HTML shell | `index.html` | SPA shell, loads Google Fonts (Quicksand + Montserrat), mounts `#root` |
| React root | `src/index.jsx` | Creates `BrowserRouter`, splits routes: `/reset-password`, `/customer/*`, `/*` |
| Staff app | `src/App.jsx` (472 lines) | Main staff dashboard — auth gate, data hooks, view router, modal orchestration |
| Customer app | `src/CustomerApp.jsx` (211 lines) | Customer portal — OTP auth, demo mode, booking wizard, dashboard |

### Directory Structure

```
src/
├── index.jsx                    — React entry, route splitting
├── index.css                    — Tailwind v4 import + brand theme tokens + global button classes
├── customer-portal.css          — 851-line CSS file for customer portal (non-Tailwind)
├── App.jsx                      — Staff dashboard root component
├── CustomerApp.jsx              — Customer portal root component
├── vite-env.d.ts                — Vite client type declarations
│
├── types/
│   └── index.ts                 — Core TypeScript interfaces (Dog, Human, Booking, SalonConfig, etc.)
│
├── constants/
│   ├── index.ts                 — Barrel re-export for all constants
│   ├── brand.ts                 — BRAND colour map, SIZE_THEME, SIZE_FALLBACK
│   ├── salon.ts                 — SALON_SLOTS, MAX_DOGS_PER_SLOT, SERVICES, ALL_DAYS, LARGE_DOG_SLOTS, PRICING, BOOKING_STATUSES, ALERT_OPTIONS
│   └── breeds.ts                — BREED_SIZE_MAP, BREED_LIST, getSizeForBreed()
│
├── engine/
│   ├── bookingRules.ts          — Service validation, price helpers, entity lookup helpers
│   ├── capacity.ts              — Core capacity engine: 2-2-1 rule, large dog rules, slot validation
│   ├── capacity.test.js         — 492 lines, 55+ tests for capacity engine
│   └── utils.ts                 — Date formatting, default open-day check, pickup time helpers
│
├── contexts/
│   ├── SalonContext.tsx          — React context providing dogs/humans/bookings/callbacks to all components
│   └── ToastContext.jsx          — Toast notification system (show/dismiss/undo)
│
├── data/
│   └── sample.js                — Offline/demo mode sample data (humans, dogs, bookings)
│
├── hooks/
│   ├── useAutosave.js           — Debounced autosave with status tracking
│   ├── useBookingActions.ts     — Online/offline booking action resolver
│   ├── useBookingEditState.ts   — Booking detail modal edit state management
│   ├── useBookingSave.ts        — Booking save logic with validation
│   ├── useKeyboardShortcuts.ts  — Global keyboard shortcuts (N, T, arrows)
│   ├── useModalState.ts         — Modal open/close state for App.jsx
│   ├── useOfflineState.js       — Full offline mode state + CRUD (322 lines)
│   ├── useRebookFlow.js         — Rebook-from-previous-appointment logic
│   ├── useReportsData.ts        — Reports data fetching + analytics computation (378 lines)
│   ├── useSlotAvailability.ts   — Slot availability computation for edit modal
│   └── useWeekNav.js            — Week navigation (offset, date computation, date picking)
│
├── supabase/
│   ├── client.js                — Staff Supabase client (with navigator.locks fallback)
│   ├── customerClient.js        — Customer Supabase client (separate storage key)
│   ├── seed.js                  — Database seeder script (service_role key, CLI only)
│   ├── transforms.ts            — DB row ↔ app model transforms (319 lines)
│   ├── transforms.test.ts       — 665-line test suite for transforms
│   └── hooks/
│       ├── useAuth.js           — Staff auth (email/password, staff profiles, role checks)
│       ├── useBookings.js       — Booking CRUD + realtime subscription (486 lines)
│       ├── useCustomerAuth.js   — Customer OTP auth (phone-based)
│       ├── useDaySettings.js    — Per-date open/closed, overrides, extra slots
│       ├── useDogs.ts           — Dog CRUD + pagination + search (435 lines)
│       ├── useHumans.ts         — Human CRUD + pagination + search + trusted contacts (601 lines)
│       ├── useSalonConfig.js    — Single-row salon config CRUD
│       └── useWaitlist.js       — Waitlist entries + realtime subscription
│
├── components/
│   ├── icons/
│   │   └── index.jsx            — 7 SVG icon components (Tick, Block, Reopen, Edit, Message, Plus, Search)
│   │
│   ├── shared/
│   │   ├── AccessibleModal.tsx  — FocusScope + useDialog modal wrapper (react-aria)
│   │   ├── ConfirmDialog.jsx    — Reusable confirm/cancel dialog
│   │   ├── LiveAnnouncer.tsx    — ARIA live region provider (NOT USED)
│   │   ├── PullToRefresh.jsx    — Touch pull-to-refresh wrapper
│   │   └── SkeletonCard.jsx     — Loading placeholder card
│   │
│   ├── ui/
│   │   ├── AvailableSeat.jsx    — Available seat row display (NOT USED)
│   │   ├── BlockedSeat.jsx      — Blocked seat row display (NOT USED)
│   │   ├── CapacityBar.jsx      — 2-bar capacity indicator (NOT USED)
│   │   ├── ErrorBanner.jsx      — Error alert banner
│   │   ├── ErrorBoundary.jsx    — React error boundary (class component)
│   │   ├── Legend.jsx           — Icon legend popover (NOT USED)
│   │   ├── LoadingSpinner.jsx   — Centred spinner
│   │   ├── SizeTag.jsx          — Coloured size dot indicator
│   │   └── StaffIconBtn.jsx     — Small icon button
│   │
│   ├── auth/
│   │   ├── LoginPage.jsx        — Staff email/password login + forgot password
│   │   ├── CustomerLoginPage.jsx — Customer OTP login (UK mobile)
│   │   └── ResetPasswordPage.jsx — Password recovery flow
│   │
│   ├── layout/
│   │   ├── AppToolbar.jsx       — Top nav bar + mobile bottom tab bar
│   │   ├── CalendarTabs.jsx     — Day tab strip + month tab + waitlist tab
│   │   ├── ClosedDayView.jsx    — "Salon closed" placeholder with open button
│   │   ├── DashboardHeader.jsx  — Date header + revenue card + search bar
│   │   ├── DayTab.jsx           — Individual day tab with dog count
│   │   ├── FloatingActions.jsx  — Floating revenue note + book button (NOT USED)
│   │   ├── MonthTab.jsx         — Mini month calendar tab
│   │   ├── ShopSign.jsx         — Open/Closed shop sign decoration (NOT USED)
│   │   └── WeekCalendarView.jsx — Main calendar view (506 lines) — day/month mode, slot grid, rebook
│   │
│   ├── booking/
│   │   ├── AddBookingForm.jsx   — Inline booking form (dog search, size/service select)
│   │   ├── BlockedSeatCell.jsx  — Blocked seat grid cell (dashed border)
│   │   ├── BookingCard.jsx      — Original booking card row (NOT USED — replaced by BookingCardNew)
│   │   ├── BookingCardNew.jsx   — Current booking card (gradient accent, size dot)
│   │   ├── GhostSeat.jsx       — Empty seat placeholder with book/block buttons
│   │   ├── SlotGrid.jsx         — Time slot grid rendering all seats
│   │   ├── WaitlistNote.jsx     — Compact waitlist tab/popover
│   │   └── WaitlistPanel.jsx    — Inline waitlist panel with confirm dialog
│   │
│   ├── modals/
│   │   ├── AddDogModal.jsx      — New dog creation form (419 lines)
│   │   ├── AddHumanModal.jsx    — New human creation form
│   │   ├── BookingDetailModal.jsx — Full booking detail/edit modal (635 lines)
│   │   ├── ChainBookingModal.jsx — Recurring/chain booking creation (517 lines)
│   │   ├── ContactPopup.jsx     — Human contact info popup
│   │   ├── DatePickerModal.jsx  — Month calendar date picker
│   │   ├── DogCardModal.jsx     — Dog detail/edit card (453 lines)
│   │   ├── HumanCardModal.jsx   — Human detail/edit card (618 lines)
│   │   ├── NewBookingModal.jsx  — Multi-dog new booking orchestrator
│   │   ├── RecurringBookingModal.jsx — View/cancel recurring booking series
│   │   ├── RescheduleModal.jsx  — 7-day reschedule picker
│   │   ├── booking-detail/      — BookingDetailModal sub-components (6 files)
│   │   ├── dog-card/            — DogCardModal sub-components + helpers (6 files)
│   │   └── new-booking/         — NewBookingModal sub-components + helpers (5 files)
│   │
│   ├── views/
│   │   ├── DogsView.jsx         — Dogs directory with search + pagination
│   │   ├── HumansView.jsx       — Humans directory with search + pagination
│   │   ├── ReportsView.jsx      — Reports dashboard (7 widget sub-components)
│   │   ├── SettingsView.jsx     — Settings hub (9 settings sub-components)
│   │   ├── StatsView.jsx        — Weekly stats snapshot
│   │   ├── reports/             — Report widget components (7 files)
│   │   └── settings/            — Settings panel components (10 files)
│   │
│   └── customer/
│       ├── CustomerDashboard.jsx — Customer home (appointments, dogs, details, trusted humans)
│       ├── AppointmentsSection.jsx — Upcoming/past appointments list
│       ├── DogsSection.jsx      — Customer's dogs display
│       ├── MyDetailsCard.jsx    — Editable customer details card
│       ├── TrustedHumansSection.jsx — Trusted humans list
│       ├── AddToCalendarButton.tsx — Single-event .ics download
│       ├── CalendarSubscribeModal.tsx — Calendar subscription (iCal feed URL)
│       ├── dashboardConstants.js — Customer portal display constants
│       └── booking/             — Customer booking wizard (7 files)

supabase/
├── migrations/                  — 21 SQL migration files (001–021)
│   ├── 001_initial_schema.sql   — Core tables: humans, dogs, bookings, salon_config, day_settings
│   ├── 002–005                  — Auth, staff profiles, RLS, role escalation prevention
│   ├── 006_capacity_trigger.sql — Server-side capacity validation (372 lines)
│   ├── 007–009                  — Group bookings, notification log, staff phone
│   ├── 010_revoke_demo_rpcs.sql — Revoke demo RPC access from anon/authenticated
│   ├── 011_indexes_and_functions.sql — FK indexes, search_path hardening, INITPLAN fix
│   ├── 012–014                  — Waitlist table, pg_cron reminder job, waitlist trigger
│   ├── 015_cancel_reason.sql    — Customer cancellation with reason
│   ├── 016_security_hardening.sql — Staff profile visibility, audit log, customer notification access
│   ├── 017_calendar_feed_tokens.sql — Calendar feed token management
│   ├── 018–020                  — Waitlist RLS fix, customer self-update restriction, trigger auth fix
│   └── 021_reminder_preferences.sql — Per-customer reminder hours/channels
│
└── functions/
    ├── _shared/
    │   ├── calendar-auth.ts     — Feed token validation
    │   └── ics-generator.ts     — RFC 5545 iCal generation (VTIMEZONE, VEVENT, folding)
    ├── calendar-feed/index.ts   — Subscribable multi-event iCal feed (customer/staff scoped)
    ├── calendar-ics/index.ts    — Single-booking .ics download
    ├── notify-booking-cancelled/index.ts — Cancellation notification (Twilio/SendGrid)
    ├── notify-booking-confirmed/index.ts — Confirmation notification (group dedup)
    ├── notify-booking-reminder/index.ts  — Daily reminder (pg_cron triggered)
    └── notify-waitlist-joined/index.ts   — Staff alert on waitlist join
```

### Data Flow

```
Customer Portal                    Staff Dashboard
     │                                   │
     ▼                                   ▼
customerSupabase                     supabase
(separate auth session)          (staff auth session)
     │                                   │
     └──────────┐           ┌────────────┘
                ▼           ▼
           Supabase Postgres
           (RLS enforced)
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
 pg_cron    Webhooks    Edge Functions
 (daily)   (on INSERT/  (notify-*, calendar-*)
           DELETE)
    │           │           │
    ▼           ▼           ▼
         Twilio / SendGrid
         (WhatsApp, SMS, Email)
```

---

## 3. Critical Issues

These are bugs or misconfigurations that are broken or will break in production. Fix these first.

### 3.1 CRITICAL — Booking reminder Edge Function is non-functional

**File:** `supabase/functions/notify-booking-reminder/index.ts`, lines 1–13 and 134–139

The `WEBHOOK_SECRET` constant is **never declared** in the environment variable block (lines 4–12). Every other notification function (`notify-booking-confirmed`, `notify-booking-cancelled`, `notify-waitlist-joined`) declares it on line 13 as:

```ts
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
```

This line is missing from `notify-booking-reminder`. At line 134 the function checks `if (!WEBHOOK_SECRET)` — since the variable is undefined, this will either throw a `ReferenceError` or always return `500 "WEBHOOK_SECRET not set"`. **No daily booking reminders are being sent.**

**Impact:** Complete failure of the daily reminder cron job. Customers receive no appointment reminders.

### 3.2 CRITICAL — CSP blocks Google Fonts in production

**Files:** `vercel.json` line 14, `netlify.toml` line 19, `index.html` lines 13–15

The Content-Security-Policy header specifies:
- `font-src 'self'` — blocks font files from `fonts.gstatic.com`
- `style-src 'self' 'unsafe-inline'` — blocks the external stylesheet from `fonts.googleapis.com`

But `index.html` loads Google Fonts (Quicksand + Montserrat) from these exact origins:
```html
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@...&family=Montserrat:wght@...&display=swap" rel="stylesheet">
```

The customer portal CSS (`src/customer-portal.css`) references `font-family: 'Quicksand'` and `font-family: 'Montserrat'` in 25+ declarations. **In production, all custom fonts are silently blocked by CSP — the entire customer portal renders in fallback system fonts.**

The CSP also lacks `connect-src` entries for `@vercel/analytics` endpoints, which may silently fail.

**Fix:** Add `https://fonts.googleapis.com` to `style-src`, add `https://fonts.gstatic.com` to `font-src`, and add Vercel analytics domains to `connect-src` in both `vercel.json` and `netlify.toml`.

### 3.3 HIGH — `BookingDetailModal` uses undeclared `SALON_SLOTS`

**File:** `src/components/modals/BookingDetailModal.jsx`, line 203

```js
const newActiveSlots = [...SALON_SLOTS, ...(newSettings.extraSlots || [])];
```

`SALON_SLOTS` is **not imported** in this file (lines 1–40 contain all imports; only `SERVICES`, `SIZE_THEME`, `SIZE_FALLBACK` are imported from `constants/index.js`). This will throw a `ReferenceError` at runtime when a staff member changes the date while editing a booking via the date picker.

**Impact:** Editing a booking's date crashes the modal. The error is hidden behind the `ErrorBoundary` — the user sees "Something went wrong" with no explanation.

### 3.4 HIGH — Hardcoded Supabase project URL in SQL migrations

**Files:** `supabase/migrations/013_cron_and_waitlist_notify.sql` line 36, `supabase/migrations/014_waitlist_pg_net_trigger.sql` line 12, `supabase/migrations/020_fix_waitlist_trigger_auth.sql` line 13

The Supabase project URL `https://nlzhllhkigmsvrzduefz.supabase.co` is hardcoded in three migrations. These migrations create `pg_cron` jobs and `pg_net` triggers that call Edge Functions at this specific URL. If the project is migrated, forked, or the project ref changes, the cron job and waitlist notification trigger will silently point to the wrong (or dead) endpoint.

**Impact:** Not currently broken, but a deployment hazard. Should be parameterised via `current_setting('app.settings...')` or a migration variable.

### 3.5 HIGH — `SlotGrid` block/unblock logic is identical

**File:** `src/components/booking/SlotGrid.jsx`, lines 30–42

Both `block` and `unblock` callbacks call `onOverride(slot, seatIndex, "blocked")` — they are **functionally identical**:

```js
const block = useCallback((slot, seatIndex) => {
  onOverride(slot, seatIndex, "blocked");       // ← "blocked"
  toast.show("Seat blocked", ...);
}, ...);

const unblock = useCallback((slot, seatIndex) => {
  onOverride(slot, seatIndex, "blocked");       // ← also "blocked" (toggle)
  toast.show("Seat unblocked", ...);
}, ...);
```

The underlying override system uses a toggle mechanism (set if absent, remove if already set), so this *happens to work* — but the "Undo" callbacks in both toasts also pass `"blocked"`, meaning clicking Undo on a block toast would re-block the seat, and clicking Undo on an unblock toast would re-unblock it. The undo action is backwards in both cases.

**Impact:** The "Undo" button on block/unblock toasts does the opposite of what the user expects.

### 3.6 MEDIUM — `ResetPasswordPage` placeholder contradicts validation

**File:** `src/components/auth/ResetPasswordPage.jsx`, line 132 vs line 51

The password input placeholder says `"Min. 8 characters"` but the validation on line 51 enforces `password.length < 12` (minimum 12 characters). Users who enter 8–11 character passwords get a confusing error.

**Impact:** UX confusion on password reset. Minor but trivially fixable.

---

## 4. Dead Code & Orphans

Every item below was traced through the full import graph. "Orphan" means no file imports or references it. "Dead" means exported/defined but never called.

### 4.1 Orphan Components — Never Imported

| File | Export | Lines | Evidence |
|------|--------|-------|----------|
| `src/components/ui/AvailableSeat.jsx` | `AvailableSeat` | 17 | Zero imports across codebase. `grep 'AvailableSeat'` returns only the file itself. |
| `src/components/ui/BlockedSeat.jsx` | `BlockedSeat` | 17 | Zero imports. Superseded by `BlockedSeatCell` in `booking/`. |
| `src/components/ui/CapacityBar.jsx` | `CapacityBar` | 31 | Zero imports. Capacity is now shown via the slot grid seat layout. |
| `src/components/ui/Legend.jsx` | `Legend` | 34 | Zero imports. Only internal reference is `BookingHealth.jsx` importing it — **correction**: `BookingHealth.jsx` does import `Legend`, so this is used in the Reports view. **Not orphaned.** |
| `src/components/layout/FloatingActions.jsx` | `FloatingActions` (default) | 105 | Zero imports. Superseded by `DashboardHeader.jsx` which now embeds revenue + "Book Now" inline. |
| `src/components/layout/ShopSign.jsx` | `ShopSign` | 24 | Zero imports. Decorative component, never mounted. |
| `src/components/booking/BookingCard.jsx` | `BookingCard` | 244 | Zero imports. Fully replaced by `BookingCardNew`. |
| `src/components/shared/LiveAnnouncer.tsx` | `LiveAnnouncerProvider`, `useAnnounce` | 37 | Zero imports. Provider is never mounted in `App.jsx` or `CustomerApp.jsx`. The `useAnnounce` hook is never called. |

**Total orphan lines:** ~474 lines of dead component code.

### 4.2 Dead Exports — Exported but Never Consumed

| File | Export | Evidence |
|------|--------|----------|
| `src/constants/brand.ts` | `BRAND` object (23 colour values) | Never imported anywhere. Only `SIZE_THEME` and `SIZE_FALLBACK` from this file are used. |
| `src/supabase/hooks/useAuth.js:170` | `signUp` function | Exported from hook but never destructured or called by any consumer. Staff registration is intentionally disabled (LoginPage comment confirms this). |
| `src/supabase/hooks/useAuth.js:173` | `isStaff` boolean | Exported but never destructured in `App.jsx` (only `isOwner` is used). |
| `src/hooks/useModalState.ts:77-78` | `closeNewBooking`, `closeRebook` | Destructured in `App.jsx` line 92 but never passed to any component or called. `App.jsx` uses inline `() => setShowNewBooking(null)` instead. |
| `src/hooks/useReportsData.ts:17` | `pctChange()` function | Defined but never called within the file. A separate copy in `ReportWidgets.jsx` is used instead. |
| `src/components/modals/booking-detail/BookingStatusBar.jsx` | `ClientConfirmedToggle` | Exported component, never imported anywhere. |
| `src/components/modals/dog-card/helpers.js:13` | `telLink()` | Exported but not re-exported from the barrel `dog-card/index.js`. Consumed directly by `DogDetailsSection.jsx` (which imports from `./helpers.js`), but the barrel omits it — inconsistency, not fully dead. |

### 4.3 Unused Interface Fields

| File | Fields | Evidence |
|------|--------|----------|
| `src/hooks/useSlotAvailability.ts` | `editDateStr`, `editDayOpen`, `isEditing` in `UseSlotAvailabilityInput` | Declared in the interface but the function body only destructures `editSettings`, `otherBookings`, `bookingSize`, `bookingSlot`. The three extra fields are passed by callers but silently ignored. |

### 4.4 Duplicated Utility Functions

These are not dead, but represent duplicated logic that should be consolidated:

| Function | Canonical Location | Duplicated In |
|----------|-------------------|---------------|
| `titleCase(str)` | `src/components/modals/dog-card/helpers.js:1` | `BookingCard.jsx:12`, `BookingCardNew.jsx:16`, `BookingDetailModal.jsx:44`, `BookingHeader.jsx:8`, `HumanCardModal.jsx:11`, `ContactPopup.jsx:3`, `AddDogModal.jsx:14`, `DogsView.jsx:7`, `HumansView.jsx:6`, `new-booking/helpers.js:45` — **10 duplicate copies** |
| `computeRevenue(bookings, dogs)` | `src/components/layout/DashboardHeader.jsx:4` | `FloatingActions.jsx:5` (orphan, but identical logic also in `StatsView.jsx:32` as `RevenueForDay`) |
| `getDefaultOpenForDate(date)` | `src/engine/utils.ts:14` | `DatePickerModal.jsx:6` (local re-implementation instead of importing) |
| `telLink(phone)` | `src/components/modals/dog-card/helpers.js:13` | `HumanCardModal.jsx:23` (local re-implementation) |
| `waLink(phone)` | `src/components/modals/dog-card/helpers.js:7` | `HumanCardModal.jsx:17` (local re-implementation) |
| `pctChange(cur, prev)` | `src/components/views/reports/ReportWidgets.jsx:3` | `src/hooks/useReportsData.ts:17` (defined but unused — the widget version is the one actually called) |

### 4.5 Commented-Out Code

No significant commented-out code blocks were found. The codebase is clean in this regard.

---

## 5. Improvement Opportunities

Ranked by impact (highest first). Each includes what, where, the improvement, and why it matters.

### 5.1 Extract `titleCase` into a shared utility (HIGH impact, LOW effort)

**What:** The `titleCase` function is copy-pasted identically in 10+ files.
**Where:** See Section 4.4 for full list.
**Improvement:** Create `src/utils/text.ts` with a single `titleCase` export. Replace all local copies with imports.
**Why:** Eliminates ~40 lines of duplication, reduces risk of divergent implementations, and makes future changes (e.g. locale-aware casing) a single edit.

### 5.2 Consolidate the customer portal onto Tailwind (HIGH impact, HIGH effort)

**What:** The staff dashboard uses Tailwind CSS v4 exclusively (via `@tailwindcss/vite`), but the customer portal uses a separate 851-line CSS file (`customer-portal.css`) with hardcoded pixel values, custom class names, and inline `font-family` declarations.
**Where:** `src/customer-portal.css`, all files in `src/components/customer/`.
**Improvement:** Migrate `customer-portal.css` to Tailwind utility classes, using the existing `@theme` tokens in `index.css`. Delete the CSS file.
**Why:** Two parallel styling systems means double the maintenance. The CSS file duplicates colours already defined as Tailwind tokens (e.g. `--sd-teal: #2D8B7A` vs `--color-brand-teal: #2D8B7A`). Responsive design is harder to maintain with manual `@media` queries vs Tailwind breakpoints.

### 5.3 Delete orphan components (HIGH impact, LOW effort)

**What:** 6 components totalling ~474 lines are never imported (see Section 4.1).
**Where:** `AvailableSeat.jsx`, `BlockedSeat.jsx`, `CapacityBar.jsx`, `FloatingActions.jsx`, `ShopSign.jsx`, `BookingCard.jsx`, `LiveAnnouncer.tsx`.
**Improvement:** Delete the files. If any are intentionally reserved for future use, document that.
**Why:** Dead code increases cognitive load, inflates the bundle (Vite tree-shaking catches unused exports but not files that are only lazy-imported), and creates false positives in grep searches.

### 5.4 Replace `window.confirm` and `alert()` with `ConfirmDialog` / `useToast` (MEDIUM impact, LOW effort)

**What:** Native browser dialogs (`window.confirm`, `alert`) are used in 5 places despite the codebase having purpose-built alternatives (`ConfirmDialog`, `useToast`).
**Where:**
- `BookingCard.jsx:80` — `window.confirm` for no-show marking
- `CustomerDashboard.jsx:245` — `window.confirm` for unsaved changes on sign-out
- `WeekCalendarView.jsx:293` — `window.confirm` for removing timeslots
- `WaitlistNote.jsx:39` — `alert("Failed to join waitlist")`
- `WaitlistPanel.jsx:24` — `alert("Failed to join waitlist")`

**Improvement:** Replace with `ConfirmDialog` (for confirmations) and `toast.show(message, "error")` (for error alerts).
**Why:** Native dialogs are blocking, unstyled, inconsistent across browsers, inaccessible, and jarring on mobile. The app already has polished alternatives.

### 5.5 Move `RecurringBookingModal` Supabase call behind a hook/context (MEDIUM impact, LOW effort)

**What:** `RecurringBookingModal.jsx` imports `supabase` directly and makes raw queries to the `bookings` table, bypassing the hook/context layer used everywhere else.
**Where:** `src/components/modals/RecurringBookingModal.jsx`, lines ~15–25.
**Improvement:** Add a `fetchGroupBookings(groupId)` method to `useBookings` or expose it via `SalonContext`.
**Why:** Direct Supabase access in components breaks the abstraction boundary. If the schema or RLS policies change, this component won't benefit from centralised updates. It also makes offline mode impossible for this feature.

### 5.6 Reduce `App.jsx` prop drilling (MEDIUM impact, MEDIUM effort)

**What:** `App.jsx` (472 lines) passes 30+ props to `WeekCalendarView`, which in turn passes many of them further down. The `SalonContext` was introduced to solve this but only covers a subset of the data.
**Where:** `src/App.jsx` lines 349–381 (the `WeekCalendarView` prop block).
**Improvement:** Expand `SalonContext` to include `salonConfig`, `daySettings`, `currentSettings`, `activeSlots`, and action handlers like `toggleDayOpen`, `handleOverride`, `handleAddSlot`, `handleRemoveSlot`. This would let `WeekCalendarView` and its children consume context instead of props.
**Why:** Reduces the surface area of `App.jsx`, makes component refactoring easier, and eliminates the "prop plumbing" anti-pattern where props pass through 3–4 layers untouched.

### 5.7 Add missing `SALON_SLOTS` import and add a lint rule (MEDIUM impact, LOW effort)

**What:** The `BookingDetailModal.jsx` bug (Section 3.3) would have been caught by TypeScript if the file were `.tsx` instead of `.jsx`, or by ESLint's `no-undef` rule.
**Where:** `tsconfig.json` (currently `checkJs: false`).
**Improvement:** Either rename critical `.jsx` files to `.tsx` to get type checking, or enable `checkJs: true` in `tsconfig.json`, or add ESLint with `no-undef`.
**Why:** The codebase is a mix of `.js`/`.jsx`/`.ts`/`.tsx`. The TypeScript files get checked, the JavaScript files don't. This means bugs like undeclared variables only surface at runtime.

### 5.8 Consolidate `computeRevenue` logic (LOW impact, LOW effort)

**What:** Revenue computation is implemented three times with slight variations.
**Where:** `DashboardHeader.jsx:4`, `FloatingActions.jsx:5` (orphan), `StatsView.jsx:32`.
**Improvement:** Create `src/engine/revenue.ts` with a single `computeDayRevenue(bookings, dogs)` function.
**Why:** Revenue calculation is business-critical. Having it in three places risks them diverging (e.g. one version handles `customPrice`, another doesn't).

### 5.9 Increase test coverage beyond the engine layer (LOW impact, HIGH effort)

**What:** Tests exist only for `capacity.ts` (492 lines, 55+ tests) and `transforms.ts` (665 lines). No component tests, no hook tests, no integration tests.
**Where:** `src/engine/capacity.test.js`, `src/supabase/transforms.test.ts`.
**Improvement:** Add tests for `bookingRules.ts`, `useWeekNav`, `useBookingActions`, and critical UI flows (e.g. the new booking modal). Vitest + React Testing Library are already configured.
**Why:** The existing tests cover the pure logic layer well, but the hooks and components that orchestrate that logic have zero coverage. Regressions in the orchestration layer (like the `SALON_SLOTS` import bug) would be caught by integration tests.

### 5.10 Add `aria-label` to interactive elements missing them (LOW impact, LOW effort)

**What:** Several interactive elements lack ARIA labels, particularly in the modals and settings views.
**Where:** Various — the staff dashboard has 33 `aria-label`/`role` attributes across 19 files, but many `<button>` elements with only icon content (e.g. close buttons rendered as `✕`) have no accessible name.
**Improvement:** Audit all `<button>` and clickable `<div>` elements, adding `aria-label` where the visible text is absent or insufficient.
**Why:** Screen readers cannot describe unlabelled buttons. The codebase already uses `react-aria` for modals — extending accessibility to all interactive elements is consistent with that investment.

---

## 6. Backend/Frontend Integration

### 6.1 API Contracts & Data Layer

**Overall assessment: GOOD.** The Supabase data layer is well-structured with a clear transform boundary.

**Strengths:**
- The `src/supabase/transforms.ts` file (319 lines, 665 lines of tests) provides a clean boundary between DB snake_case rows and app-layer camelCase models. All hooks go through these transforms — there's no raw DB shape leaking into components.
- Type definitions in `src/types/index.ts` cover all major entities (`Human`, `Dog`, `Booking`, `SalonConfig`, `DaySettings`, etc.) and are used consistently in `.ts`/`.tsx` files.
- The single-row `salon_config` pattern (with `appConfigToDb` / `dbConfigToApp` converters) is clean and avoids the complexity of a multi-row settings system.

**Weaknesses:**
- `.jsx` files (the majority of components) don't benefit from type checking. Props are passed untyped, so shape mismatches between what a hook returns and what a component expects are only caught at runtime. The `tsconfig.json` has `checkJs: false`.
- The `useBookings` hook (486 lines) handles add, remove, update, and history fetch — it's doing too much. A cross-date booking move (reschedule) requires the caller to manage the "remove from old date, add to new date" dance rather than the hook providing an atomic `moveBooking(id, fromDate, toDate)`.
- The `useHumans` hook (601 lines) is the largest hook and combines CRUD, pagination, search, and trusted-contact management. Trusted contact logic could be extracted.

### 6.2 Realtime & Caching

**Strengths:**
- `useBookings` subscribes to Postgres changes via Supabase Realtime (`postgres_changes` channel) and refetches on INSERT/UPDATE/DELETE. Multi-tab and multi-device sync works.
- `useWaitlist` similarly subscribes to realtime changes on `waitlist_entries`.
- The PWA service worker (Workbox via `vite-plugin-pwa`) caches Supabase API responses with `NetworkFirst` strategy and 5-minute expiration — appropriate for a booking system.

**Weaknesses:**
- `useDogs` and `useHumans` do **not** subscribe to realtime changes. If a second staff member adds a dog or updates a customer's phone number, the first staff member won't see it until they refresh.
- Booking data is fetched per-week (`useBookings(weekStart, ...)`). When viewing the month calendar or reports, the bookings for out-of-view weeks are not loaded. The `StatsView` and `ReportsView` work around this by querying Supabase directly (via `useReportsData`) rather than using the shared booking state — a pragmatic but architecturally inconsistent approach.

### 6.3 Loading, Error, and Empty States

**Strengths:**
- The main `App.jsx` has three explicit loading gates: auth loading, data loading, and bookings loading. Each shows `<LoadingSpinner />`.
- `ErrorBoundary` wraps every `<Suspense>` boundary and every lazy-loaded view/modal — uncaught errors show a "Try again" button rather than a white screen.
- `ErrorBanner` is shown when any data hook returns an error.
- `SlotGrid` renders `<SkeletonCard />` placeholders while bookings load.
- Empty slot grids show a centred "No bookings today — Tap a slot to add one" message.

**Weaknesses:**
- The customer portal has no `ErrorBoundary` inside the dashboard. If `AppointmentsSection` or `DogsSection` throws, the entire customer view crashes.
- `useSalonConfig` has an `error` state but it's never exposed or checked — config load failures are silently swallowed.
- Pagination in `useHumans` and `useDogs` doesn't show loading states for the "Load More" action — the button just appears unresponsive until data arrives.

### 6.4 Authentication & Authorization

**Strengths:**
- **Dual auth architecture:** Staff use email/password (`useAuth`), customers use phone OTP (`useCustomerAuth`). Separate Supabase clients with separate `storageKey` values prevent session cross-contamination.
- **RLS is comprehensive:** 21 migration files build up a layered RLS policy set. Staff-only access is gated by the `is_staff()` function (SECURITY DEFINER). Customer access is scoped to their own `customer_user_id`.
- **Role escalation prevention:** Migration `005` prevents staff from self-promoting to `owner`. Migration `019` prevents customers from modifying `customer_user_id`, `history_flag`, or `phone`.
- **Demo RPC lockdown:** Migration `010` revokes `get_demo_customers` and `get_demo_customer` from `anon`/`authenticated`, so demo RPCs only work with the service role key.
- **Security headers:** Both `vercel.json` and `netlify.toml` set `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `HSTS`, `Permissions-Policy`, and CSP (albeit with the font-src bug noted in Section 3.2).
- **Password policy:** Minimum 12 characters enforced in `LoginPage.jsx` and `ResetPasswordPage.jsx`.

**Weaknesses:**
- **No frontend route guards for customer portal.** The `/customer/*` routes rely entirely on `useCustomerAuth` returning `null` for unauthenticated users, which is correct, but there's no redirect-to-login for deep links — an unauthenticated user hitting `/customer/book` sees a loading skeleton indefinitely until the auth check completes and the login page renders.
- **Demo mode in customer portal is guarded only by `import.meta.env.DEV`.** This is correct (demo mode won't run in production builds), but the `get_demo_customers` RPC is separately locked down at the DB level by migration `010` — defence in depth is good, but the two layers should be documented together.
- **The `link_customer_to_human` RPC** (migration `004`) links a phone number to an auth user on first OTP login. If two humans have the same phone number in the DB, only the first match is linked. There's no handling for duplicate phones.

### 6.5 Race Conditions & Stale Data

**Potential issues:**
- **Optimistic updates without rollback in several hooks.** `useSalonConfig.updateConfig` does an optimistic `setConfig(newConfig)` before the Supabase call, and rolls back on error — this is correct. But `useBookings.addBooking` does an optimistic insert and does not roll back on error — the local state shows a booking that was never persisted.
- **Trusted contact updates** in `HumanCardModal.jsx` and `DogCardModal.jsx` perform bidirectional inserts (A trusts B, B trusts A) as two separate Supabase calls. If the second call fails, the trust relationship is half-created. There's a rollback attempt, but it's best-effort.
- **The confirmed notification Edge Function** (`notify-booking-confirmed`) waits 2 seconds before checking for duplicate group sends. This is a pragmatic approach but could miss very rapid sequential inserts within the 2-second window.
