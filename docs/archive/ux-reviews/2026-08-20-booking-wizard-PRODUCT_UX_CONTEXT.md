> **Historical (archived 2 September 2026).** Product context gathered for the 20 August 2026 booking-wizard UX review (`2026-08-20-booking-wizard-UX_REVIEW.md`). Dated evidence at `main@c1da6852`; not current instruction.

# Product UX Context

## 1. Analysis scope and version

- **Review target:** The customer self-service **booking wizard** (`/customer` portal, `BookingWizard`) — the five-step flow that takes an approved, logged-in customer from "I want an appointment" to a committed booking, plus its terminal screens (booked, deposit-held, waitlisted, request-sent, invalid-reschedule).
- **Product, repository, or project:** `leamonline/Smarter-dog-bookings`.
- **Branch and commit:** `main` at `c1da6852b1a2bcd1edba7f45f0bb4a8569cd6e58`, working tree clean.
- **Date of analysis:** 2026-08-20.
- **Product surfaces inspected:** repository onboarding (`CLAUDE.md`), the customer app shell and its gating lifecycle, all five wizard step components, the wizard composition root, the desktop summary sidebar, the wizard stylesheet, both Supabase browser clients, the offline test guard, the customer booking-rules helper, the per-human booking-rules repository, the migrations that grant the availability RPCs and the customer write-path RPC, the wizard's eleven component test files, the Playwright E2E directory, the dev harness for this surface, and `git log` for currency.
- **Rendered behaviour observed:** one dev-harness session at `http://localhost:5174/dev/booking-wizard-shell-preview` (see E23). **No authenticated state of the wizard was rendered at all** — see §7 and the material gaps below.
- **Inaccessible or incomplete areas:** the authenticated customer portal, every wizard step in its real data state (steps 1, 2, 4 and 5 were never rendered), production analytics, funnel telemetry results, real-customer research or observation, assistive-technology test results, design files, and the deposit, reschedule and waitlist branches end to end.
- **Potentially outdated sources:** the dev harness's own source comments assert that offline mode nulls the customer Supabase client; E23 disproves that. `docs/ux-review-2026-06.md` pre-dates this surface's current form and never names it.

**Evidence:** E1–E24.

## 2. Evidence map

| Evidence ID | Source and version | Currency | What it demonstrates | Limitations or conflicts |
| --- | --- | --- | --- | --- |
| E1 | `CLAUDE.md`, `main@c1da6852` | Current repository guidance | Staff/customer split; the customer write path is the `create_customer_booking_group` RPC only; the three `BEFORE INSERT` gates; the claim that offline mode means "you never touch real customer data" | Self-flags staleness. Its offline-safety claim is contradicted for the customer portal by E11/E23 |
| E2 | `src/CustomerApp.jsx`, `main@c1da6852` | Current implementation | The portal's gated lifecycle — login → human record → password → signup approval → profile → dashboard/wizard. Establishes that every wizard user is authenticated and approved | Static inspection only |
| E3 | `src/components/customer/booking/BookingWizard.tsx` (947 lines), `main@c1da6852` | Current implementation | Composition root: five steps, draft persistence, reschedule/approval modes, client re-check before commit, deposit read-back, error mapping, all terminal screens, funnel + denial telemetry | Static inspection; never executed in an authenticated session |
| E4 | `DogSelection.tsx`, `main@c1da6852` | Current implementation | Step 1: up to four dogs; pregnant and unknown-size dogs disabled with an inline reason; WhatsApp escape hatch for pregnancy only | — |
| E5 | `ServiceSelection.tsx`, `main@c1da6852` | Current implementation | Step 2: per-dog service choice, size-filtered options, "apply to everyone" shortcut when all dogs share a size, starting-price framing | — |
| E6 | `DateSelection.tsx` (414 lines), `main@c1da6852` | Current implementation | Step 3: 28-day pages, capacity-aware day states (`open`/`full`/`closed`), the incomplete-availability hint, the "Today — last minute" affordance, skeleton loading, full accessible day names | — |
| E7 | `SlotSelection.tsx`, `main@c1da6852` | Current implementation | Step 4: grouped drop-off times, "Your usual time", morning/afternoon grouping, an explicit distinction between a fetch failure and a genuinely full day, waitlist offer, same-day fail-closed filter | — |
| E8 | `BookingConfirmation.tsx`, `main@c1da6852` | Current implementation | Step 5, the commitment point: when/dog/service/price summary, "From £X (paid at pick-up)", cancellation note, submit-disabled-while-submitting | Contains **no** deposit awareness — see E16 and §18 |
| E9 | `BookingSummarySidebar.tsx`, `main@c1da6852` | Current implementation | Desktop-only sticky "Your booking so far" panel, always rendered and hidden by CSS below the two-column breakpoint | — |
| E10 | `booking-wizard.css` (735 lines), `main@c1da6852` | Current implementation | The responsive contract (sidebar hidden `<1024px`, two-column at `≥1024px`, sticky at `top:32px`); the deliberate strikethrough on fully-booked days as a non-colour cue; two `prefers-reduced-motion` blocks | — |
| E11 | `src/supabase/customerClient.ts`, `main@c1da6852` | Current implementation | The customer client is built purely from credential presence. It **never** consults `VITE_FORCE_OFFLINE` | Directly contradicts E21's source comments and E1's offline-safety claim |
| E12 | `src/supabase/client.ts`, `main@c1da6852` | Current implementation | The staff client **does** honour `VITE_FORCE_OFFLINE`, nulling both URL and key | Establishes the asymmetry against E11 |
| E13 | `src/supabase/offlineTestGuard.test.ts`, `main@c1da6852` | Current automated coverage | The self-enforcing offline guard asserts `./client` (staff) is null | Asserts nothing about `customerClient`; the customer portal is outside the guard |
| E14 | Migrations `20260603130000`, `20260622110000`, `20260627120000`, `main@c1da6852` | Current server authority | `get_open_days`, `get_occupancy_range` and `get_blocked_seats` are each revoked from `anon` and granted only to `authenticated` | Confirms the 401/42501 responses in E23 are correct designed behaviour, not a defect |
| E15 | Migration `20260712115759_legal_risk_tranche1.sql` L901-902, `main@c1da6852` | Current server authority | `create_customer_booking_group` is revoked from and re-granted only to `authenticated` — the sole customer write path | — |
| E16 | `src/supabase/repositories/humansRepo.ts` L97-124, `main@c1da6852` | Current implementation | `getBookingRules` returns `{preferredSlots, blockedSlots, depositRequired}` and is already called at step 4 (E7); `depositRequired` is then discarded | The read fails open (returns `null` on error), so its absence never proves "no deposit" |
| E17 | `src/supabase/customerBookingRules.ts`, `main@c1da6852` | Current implementation | Booking horizon: 28 days legacy default, overridable 1–730 by RPC; a failed read never blocks booking | — |
| E18 | `npx vitest run --project component src/components/customer/booking/`, executed 2026-08-20 | Current, executed | 11 test files, 38 tests, all passing — covering horizon boundaries, deposit truthfulness, partial reschedule, pregnancy gating, size verification, last-minute rules, calendar paging and full-day handling | jsdom component tests; they prove implemented logic, not rendered quality or production behaviour |
| E19 | `e2e/` directory listing, `main@c1da6852` | Current, by absence | Five Playwright specs, all staff-facing (daily-brief, directories, modal-sheet, new-booking-search, settings-tabs, smoke) | **No customer-portal E2E coverage exists** |
| E20 | `git log -- src/components/customer/booking/ src/CustomerApp.jsx`, `main@c1da6852` | Current release evidence | Surface last touched 2026-08-06 (`8314fc90`, copy truthfulness); before that the desktop summary sidebar (PR #591) and deposit-messaging work | Command-line history only |
| E21 | `src/components/dev/BookingWizardShellPreview.jsx`, `main@c1da6852` | Current implementation, **stale comments** | The only harness for this surface. Mounts the real sidebar and the real `DateSelection`; substitutes static placeholders for every other step and static mocks for the calendar legend and success screen | Its comments claim offline nulls the customer client and that the real `DateSelection` "can never reach the complete branch" — E23 shows the client is live, and the reason the complete branch is unreachable is server permission, not a null client |
| E22 | `src/engine/` — `capacity.ts`, `deposits.ts`, `denials.ts`, `slotGrid.ts`, `immediateBooking.ts`, `bookingRules.ts`, `main@c1da6852` | Current implementation | The wizard is a thin client over shared pure engines that the staff app and the Deno edge functions also use | Logic only |
| E24 | `supabase/migrations/20260712115759_legal_risk_tranche1.sql` L1355-1670 (`cancel_customer_booking`), plus `src/constants/salonSettings.ts` L29/L84 and `CustomerPortalSettings.jsx`, `main@c1da6852` | Current server authority | Online cancellation is governed by two staff-configurable settings: `customerPortal.allowCancellations` (default true, toggleable in Settings) and `minCancellationHours` (default **24**), measured backwards from the appointment's **start time** and raising `SDC01`/`SDC02` | Contradicts step 5's hardcoded copy "up until the day before" (E8). Migration file plus defaults; the production `salon_config` values were not queried |
| E23 | Dev-harness session, `http://localhost:5174/dev/booking-wizard-shell-preview`, `main@c1da6852`, 2026-08-20 | Observed rendered behaviour, **narrow scope** | Rendered the wizard shell, the real sidebar at three fill states and the real `DateSelection` in its incomplete-availability state; measured responsive behaviour, touch-target geometry and text contrast | Runs inside the **staff** app shell, not the customer portal shell. Screenshot capture failed (pane hidden), so all findings rest on the accessibility tree, computed styles and geometry. The harness fired six live requests to production Supabase, **all rejected** (401 / `42501 permission denied`) — no data read, nothing written |

## 3. Executive summary

Smarter Dog Bookings runs a single dog-grooming salon from one codebase with two interfaces. This review targets the **customer booking wizard** — the self-service flow in the `/customer` portal through which an existing, approved customer books a groom themselves rather than messaging the salon.

The primary user is an approved dog owner, on their own phone, booking occasionally — realistically a handful of times a year. That infrequency is the defining characteristic: unlike the staff Daily Brief, nobody builds fluency here. Every run is effectively a first run, so the interface must carry its own explanation, and a single confusing moment costs a booking rather than a few seconds.

The flow is five steps — dogs, services, date, time, confirm — over a shared pure capacity engine, with a draft persisted to `localStorage`, a client re-check immediately before commit, and a Postgres RPC as the only write path behind three `BEFORE INSERT` gates. The build quality is high and unusually honest: it distinguishes a network failure from a genuinely full day rather than nudging the customer onto a waitlist under false pretences (E7), it withholds the calendar legend when availability could not be fully checked (E6), and its post-commit screens refuse to say "All booked in!" when a deposit is still outstanding or its status is unknown (E3, E18).

The most important design implication is that **truthfulness is already this surface's governing principle**, enforced by tests — so the review's job is to find where the interface falls short of its own standard rather than to import an external one. The most important unresolved issue is exactly such a gap: the commitment screen tells every customer the price is "paid at pick-up", while the wizard already holds the `depositRequired` flag one step earlier and only reveals the deposit *after* the booking is committed (E8, E16).

**Confidence:** Confirmed fact for the implemented structure, logic and server authority, corroborated by a passing 38-test suite. Rendered behaviour is confirmed only for the narrow slice E23 exercised. Usage frequency, device priority and real-world context are **strong to tentative inference** — there is no analytics, research or observation available.

**Evidence:** E1–E3, E6–E8, E16, E18, E23.

## 4. Review target and boundaries

- **Exact review unit:** `BookingWizard` and its five step components, the desktop summary sidebar, and every terminal screen the wizard can reach.
- **Included:** entry from the dashboard; steps 1–5 and their loading, empty, error and disabled states; the date-paging and availability-degradation behaviour; the same-day "last minute" branch; the client re-check and commit; the booked, deposit-held, waitlisted, request-sent and invalid-reschedule terminal screens; draft persistence and the navigate-away warning; the responsive transformation across the 640px and 1024px breakpoints.
- **Neighbouring surfaces required for context:** the customer dashboard (the wizard's only entry point and its "Back to dashboard" destination), the portal's authentication and approval gates (entry prerequisites, not the target), the `create_customer_booking_group` RPC and the three DB gates (server authority), and the staff Daily Brief as the operational consequence of a booking.
- **Excluded:** the login, onboarding, profile and approval gates as UX surfaces in their own right; the customer dashboard's own layout; dog and trusted-human management; every staff surface; the WhatsApp booking flow, which is a separate booking route with its own interface.
- **Alternative scope interpretations:** the reschedule branch (`?reschedule=<uuid>`, with an optional `?approval=request` mode) is arguably a distinct workflow rather than a mode of this one — it has a different trigger, a different commitment meaning and its own terminal screen. This review treats it as a **documented branch** of the target (§14) because it shares all five steps and the same commit path, but a reviewer could legitimately scope it separately.
- **Confidence:** Confirmed fact for what the wizard contains; the scope choice is a reasoned default, flagged rather than hidden.
- **Evidence:** E2, E3, E6–E9, E15.

## 5. Product

### Concise review value

A self-service booking channel that lets an approved customer secure a real grooming appointment on their own phone, at any hour, without a conversation — while the salon's capacity rules stay authoritative.

### Expanded description

The salon's default booking channel is conversational: customers message on WhatsApp and staff place the booking. The customer portal exists so that owners who would rather not wait for a reply can book themselves. The wizard is the portal's core transaction — everything else in the portal (dogs, details, trusted humans, appointment list) either feeds it or reports on it.

The real-world outcome is a committed appointment: a slot reserved, a groomer's day filled, and an owner who knows when to turn up. Without it, every booking returns to the salon's message queue, which converts customer demand into staff labour and delays confirmation to salon hours.

Critically, the wizard is *not* the authority on whether a booking may exist. Capacity, calendar and welfare rules live in Postgres triggers and a `SECURITY DEFINER` RPC (E1, E15). The wizard's job is to predict those rules accurately enough that a customer is rarely refused, and to fail gracefully when it is.

### Confidence and evidence

**Classification:** Confirmed fact for the mechanism; strong inference for the "customers would rather not wait" motivation, which the code supports (an always-available alternative to messaging) but no research confirms.

**Evidence:** E1, E2, E3, E15.

## 6. Users and affected people

### Concise review value

An approved dog owner booking their own dog's groom a few times a year, on a phone, with no accumulated familiarity with the interface.

### Primary users

**Approved portal customers.** Every wizard user has passed the portal's gates (E2): they have an authenticated session, a linked `humans` record, a password, and — if they self-signed-up — staff approval. They own at least one dog with a confirmed size.

- **Responsibility:** their own dog's appointment. No duty to anyone else.
- **Goal:** a specific date and drop-off time that suits them, secured.
- **Frequency:** low. Grooming is typically a several-week cycle, so a handful of bookings a year. **Strong inference** from the domain, not measured.
- **Expertise:** none assumed in the interface. They know their dog; they do not know the salon's capacity rules, the 2-2-1 constraint, or why a Thursday is closed.
- **Operational pressure:** low and self-imposed. Nobody is waiting on them. They can abandon and return — and the draft persistence (E3) is built for exactly that.
- **Optional use:** **yes, entirely.** Messaging the salon on WhatsApp always remains available, and the wizard itself signposts it (E4). This is the single most important user fact on this surface: a customer who finds the wizard confusing does not push through, they leave and message instead. Friction here does not slow a task down; it silently converts a self-service booking into staff work.
- **Cost of mistakes:** moderate and asymmetric. Booking the wrong day is recoverable (reschedule, or cancel until the day before, per E8) but embarrassing and requires a second interaction. Failing to book is invisible to the customer and invisible to the salon except as a denial-log entry.

### Secondary or affected users

- **Salon staff**, who inherit every booking on the Daily Brief and absorb the work when self-service fails. Not present during the flow.
- **Deposit-required customers**, a policy-flagged subset (E16) whose commitment means something materially different — an appointment *held* pending payment, not confirmed. The interface currently treats them identically until after they commit (§18).
- **The dog**, affected but not a user. Welfare rules — the pregnancy gate especially (E4) — are enforced on its behalf.

### Confidence and evidence

**Classification:** Confirmed fact for the gates, permissions and available alternatives; **strong inference** for frequency and optionality; **unknown** for demographics, which are not inferred.

**Evidence:** E2, E4, E8, E16.

## 7. Devices, platforms and input methods

### Concise review value

Built mobile-first and verified to work down to 390px, with a deliberate desktop enhancement above 1024px. Which device customers actually use is **unknown** — no analytics, research or owner decision is available.

| Device or platform | Priority | Viewport or orientation | Primary input | Expected usage | Limitations | Optimisation level | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phone browser | **Unknown** (implementation-primary) | 390×844 portrait verified; single column below 1024px | Touch | Assumed dominant for a consumer self-service flow | Calendar day targets are 34×34px at this width (§17) | Fully supported and the default layout | E10, E23 |
| Tablet | Unknown | 640–1023px band: content max-width 640px, still single column | Touch | Plausible, unevidenced | Sidebar hidden; identical to phone layout with more margin | Supported by the same rules | E10 |
| Desktop browser | Unknown | ≥1024px: two-column grid, 644px main + 320px sticky sidebar | Pointer + keyboard | Plausible, unevidenced | — | Deliberately enhanced — the sidebar exists only here, and the inline running total is suppressed to avoid showing the figure twice | E9, E10, E23 |

**Implementation optimisation** is confirmed: the CSS declares exactly two breakpoints (640px, 1024px), the sidebar is `display:none` by default and only appears at ≥1024px, and E23 verified single-column-no-sidebar-no-overflow at 390px and a `644px 320px` grid at 1280px.

**Real-world device priority is unknown.** No analytics, session data, research or explicit owner decision was available. The mobile-first CSS proves intent, not usage. This is flagged as an owner question (§19).

### Confidence and evidence

**Classification:** Confirmed fact for implementation optimisation; **unknown** for actual priority.

**Evidence:** E9, E10, E23.

## 8. Environment of use

### Concise review value

A personal device, in private, unhurried, with an always-available alternative one tap away.

### Confirmed environmental factors

- **Authenticated and personal.** The portal requires a per-customer session with its own storage key (E2, E11). This is not a shared or kiosk device.
- **Interruptible by design.** The wizard persists a draft to `localStorage` keyed per human and warns on `beforeunload` from step 2 onwards (E3). Someone built this expecting the flow to be abandoned and resumed.
- **Network-fragile.** Every step except confirmation performs its own reads, and each has an explicit failure branch (E6, E7). The code anticipates flaky connectivity.
- **An escape hatch is always present.** WhatsApp links appear inside the flow (E4) and the salon's conversational channel is the established norm (E1).

### Inferred environmental factors

- **Likely at home, in the evening, on a sofa** — **tentative inference** only, from the consumer-self-service pattern. No evidence supports a specific place or time, and none is claimed.
- **Low urgency, except in the same-day branch.** The "Today — last minute" path (E6) carries a genuine 30-minute cutoff and a fail-closed filter, so that one branch is time-pressured. **Strong inference** from the implemented cutoff.
- **No environmental impairment is claimed.** Unlike the salon floor (wet hands, noise), nothing in the evidence establishes the customer's physical conditions.

### Confidence and evidence

**Classification:** Confirmed fact for the interruption, network and escape-hatch design; tentative inference for place and time.

**Evidence:** E1–E4, E6, E7, E11.

## 9. Primary outcome and success criteria

### Concise review value

A real appointment exists in the salon's diary, at a time the customer chose, and the customer knows exactly what happens next.

### Task anatomy

- **Trigger:** the dog is due a groom, and the owner would rather book now than message and wait.
- **Entry prerequisites:** authenticated session, linked `humans` record, password set, signup approved, profile complete, at least one dog with a confirmed size and not flagged pregnant (E2, E4). These gates are *outside* the review target.
- **First meaningful decision:** which dog or dogs this visit is for (step 1) — it determines service options, seat cost and therefore every subsequent availability calculation.
- **Required information:** dog(s), a service per dog, a date, a drop-off time. Nothing else is asked. Price is shown but not entered; payment is not taken.
- **Commitment point:** the "Confirm booking" button on step 5 (E8). Before it, nothing is written; after it, rows exist.
- **Completion signal:** a terminal screen naming the dog, the full date and the drop-off time, with a booking reference, an add-to-calendar control and a "Back to dashboard" action (E3).
- **Final system state:** one `bookings` row per dog, sharing a `group_id` for a multi-dog visit, having passed the calendar, capacity and pregnancy triggers; a deposit reference and due-by stamped if the owner is deposit-flagged (E3, E15).
- **Real-world result:** a groomer's slot is reserved and the owner knows when to arrive.
- **Consequence of failure:** silent. The customer abandons and either messages the salon or does nothing. A denial is logged best-effort for report 2F (E3), but a confused exit is not.

### Observable success criteria

1. A customer who knows their preferred date reaches commitment without needing information the interface has not given them.
2. What the customer is told at the commitment point matches what actually happens after it — including deposits.
3. A refusal by the server is explained in terms the customer can act on, never in engine language.
4. An interruption loses nothing.
5. The interface never asserts availability, or confirmation, that it has not established.

## 10. Primary user scenario

### Concise review value

An owner books a groom for one dog, on a phone, in a few minutes, having been interrupted once.

### Scenario narrative

An owner notices their small terrier is getting shaggy and decides to book. They open the portal on their phone, tap through to the wizard and pick the dog from a list of their own dogs — one entry is greyed out with "Size not confirmed — message us first". They choose Full Groom and see "from £42".

On the date step they get a 28-day grid. Most days are greyed: the salon opens Monday to Wednesday. They page forward, pick a Tuesday three weeks out, and the time step offers a handful of drop-off times grouped into morning and afternoon. They pick 10:00am.

The child needs something. They put the phone down for ten minutes. On return, the draft is intact — the wizard restores their step and selections.

They review the summary: Tuesday's date, the dog, Full Groom, "From £42 (paid at pick-up)", and a note that they can cancel from the dashboard until the day before. They tap "Confirm booking". The button reads "Booking…", then a success screen appears with a paw-print flourish, the date and time in bold, a booking reference and an add-to-calendar button.

**Where this scenario breaks:** if the owner happens to be deposit-flagged, that final screen instead reads "Deposit needed", with bank details and a deadline — the first mention of a deposit in the entire flow, arriving after the point of commitment.

### Confidence and evidence

**Classification:** Strong inference. Every element is grounded in implemented behaviour (E3–E8, E16) and the passing test suite (E18), but no such session was observed end to end.

## 11. Primary workflow

| Stage | User intention | System response | Required information | Likely friction | Error or recovery |
| --- | --- | --- | --- | --- | --- |
| 1. Trigger or first decision — **select dogs** | "This visit is for Alfie" | Lists the customer's own dogs; disables any with unconfirmed size or a pregnancy flag, each with an inline reason; caps selection at four | Which dog(s) | A disabled dog says "message us first" but, unlike the pregnancy case, offers **no link** to do so | Fetch failure shows an inline error with a **Retry** button (E3) |
| 2. Essential context — **choose services** | "A full groom" | Shows only services allowed for each dog's size; offers "apply to everyone" when all dogs share a size; prices framed as starting prices | A service per dog | Price is "from" — final cost depends on coat condition, stated plainly | No server call; nothing to fail |
| 3. Evaluation — **pick a date** | "Some Tuesday in the next few weeks" | 28-day pages with capacity-aware states: open, fully booked (coral + strikethrough), closed (receded); legend shown **only** when availability was fully checked; "Today — last minute" surfaced when staff have flagged slots | A date | Four of seven days are closed, so the grid is mostly greyed; closed date numerals are very low contrast (§17) | If any availability read fails, the legend is withheld and an honest hint replaces it: the preview is incomplete and the date will be re-checked (E6) |
| 4. Configuration — **choose a time** | "Morning if possible" | Groups available drop-offs into "Your usual time", morning and afternoon; multi-dog allocations shown as "Drop all pups together" | A drop-off time | Same-day times can lapse silently as the 30-minute cutoff passes | Distinguishes a **fetch failure** ("We couldn't check availability just now") from a genuinely **full day** (which offers the waitlist) — deliberately refusing to mislabel a network blip as fully booked (E7) |
| 5. Confirmation — **commit** | "Yes, book it" | Re-checks capacity client-side against fresh reads, then writes via the RPC behind three DB gates; button disables and reads "Booking…" | Confirmation only | **The screen promises "paid at pick-up" even for deposit-required owners** (§18) | A stale slot bounces the customer back to step 4 with a plain-language message; trigger refusals are translated by `friendlyDenialMessage`, never shown raw; each mapped error code has bespoke copy (E3) |
| — Completed state | "It's done" | Terminal screen: dog names, full date, drop-off time, booking reference, add-to-calendar, back to dashboard | — | — | If the deposit read-back fails, the screen says "Appointment saved" and directs the customer to the dashboard rather than claiming confirmation (E3, E18) |

## 12. Primary focal area and hierarchy

### Primary focal area

**The decision currently being made** — and it changes at every step. This surface has no persistent object of attention: step 3's focus is the date grid, step 4's is the list of times. The one element that spans the flow is the accumulating booking itself, which is why the desktop sidebar exists (E9) and why the mobile layout instead carries a compact inline running total from step 2 (E3).

### Intended hierarchy

1. **Primary focus:** the current step's choices — the dog list, service cards, date grid, or time list.
2. **Secondary focus:** what has been chosen so far, and what it will cost. The sticky sidebar on desktop; the inline "Estimated total" line on mobile. Deliberately never duplicated: the CSS suppresses the inline total once the sidebar is visible (E10).
3. **Supporting controls:** Back / Continue in a fixed action row; the step-of-5 kicker and paw-print progress bar; Cancel in the header.
4. **Tertiary information:** price caveats, the cancellation note, the "four pups max" note, the reduced-motion-aware decorative flourishes.

### Current conflicts and evidence

- **The commitment step's hierarchy is truthful about price but silent about deposits.** "From £X (paid at pick-up)" occupies the summary's most authoritative position while the deposit fact — which changes the meaning of the commitment — is absent (E8, E16). This is the target's central hierarchy conflict.
- **On mobile the accumulating booking has no persistent representation** beyond a single total line. Whether that matters is unresolved without device evidence (§19).

**Evidence:** E3, E8–E10, E16.

## 13. Constraints and decision status

| Area | Constraint or decision | Classification | Evidence | Confidence | Consequence of changing | Owner confirmation |
| --- | --- | --- | --- | --- | --- | --- |
| Write path | Customers may only book via `create_customer_booking_group`; no raw INSERT | **Explicitly approved** | E1, E15 | High | Would reopen a closed security hole | Not required — preserve |
| Booking rules | Capacity (2-2-1), calendar and pregnancy gates are enforced by DB triggers; the client is preflight only | **Explicitly approved** | E1, E22 | High | Overbooking or welfare breach | Not required — preserve |
| Flow shape | Five steps, in this order, dogs → services → date → time → confirm | **Strongly established** | E3, E18 | High | Rewrites the whole surface and its tests | Required before any change |
| Truthfulness | The interface must not assert availability or confirmation it has not established | **Explicitly approved** — enforced by tests | E6, E7, E18 | High | Would breach an explicit, test-pinned standard | Not required — preserve and extend |
| Capacity ceiling | Max four dogs per customer booking | **Technically entrenched** | E3, E4 | High | Engine and DB implications | Required |
| Horizon | 28 days by default, RPC-overridable to 1–730 | **Implemented, configurable** | E17 | High | Config change only, no code | Not required |
| Responsive | Sidebar is desktop-only above 1024px | **Implemented but open to challenge** | E9, E10 | High | Layout only | Open to refinement |
| Secondary text colour | `--color-sd-ink-light: #6B7891` used across 14 files | **Technically entrenched** (design token) | E10, E23 | High | Token change affects the whole app | Recommended change — see review |
| Offline isolation | The customer client ignores `VITE_FORCE_OFFLINE` | **Implemented, apparently unintended** | E11–E13, E21, E23 | High | Fixing it aligns the portal with the staff app and the repo's stated guarantee | Required — see §18 |
| Deposit disclosure | Deposit revealed only after commitment | **Implemented but open to challenge** | E8, E16 | High | Copy and one conditional at step 5 | Required — see §19 |

## 14. Workflow branches

Three genuine branches exist.

**Branch A — ordinary new booking (the default).** Trigger: dashboard "Book" with no query parameters. All five steps; commit via `createMany`; terminal screen "All booked in!". This is the path §10 describes.

**Branch B — reschedule (`?reschedule=<uuid>`).** Trigger: "Reschedule" on a `BookingCard`. The same five steps, but draft persistence is **deliberately disabled** so an abandoned ordinary draft cannot bleed into the visit being moved (E3). A status banner states that the original booking stays held until a new time is confirmed. The booking UUID lives in the query string precisely so a refresh cannot silently convert a reschedule into a second booking; if only the display state survives, the wizard **refuses** and shows an invalid-link recovery screen rather than guessing. Commit goes to `rescheduleCustomerBooking`. Distinct failure codes: `SDC02` (within 24 hours — must message), `SDC04` (dog set must match).

**Branch C — reschedule requiring approval (`?reschedule=<uuid>&approval=request`).** Same as B, but the commitment means something different: it *requests* a time rather than taking it. Copy changes throughout ("Send request", "One last check before we send your preferred time to the team"), the original appointment explicitly stays booked, and the terminal screen is "Request sent". Codes `SDR01`/`SDR02` cover approval-required and duplicate-request cases.

**A fourth path is not a branch but an exception:** a genuinely full day offers the **waitlist**, terminating the flow with "You're on the waitlist!" and no booking. Notably, the waitlist is offered *only* when the day is genuinely full — never after a fetch error (E7).

**Evidence:** E3, E7, E8.

## 15. Contextual explanation vocabulary

| Situation | Explanation pattern | Evidence or rationale |
| --- | --- | --- |
| A dog cannot be selected | State the reason on the dog itself, then give the way forward | "Pregnant — message us below" plus a WhatsApp link (E4). The unconfirmed-size case states the reason but omits the link — an inconsistency |
| Availability could not be fully checked | Admit the limit, then say what will happen | "We couldn't check every date completely… we'll check your chosen date again at the next step" (E6) |
| A day is fully booked | Distinguish "was bookable, now taken" from "we're not open" — visually and in the accessible name | Coral + strikethrough vs receded grey; `"…, fully booked"` vs `"…, closed"` (E6, E10) |
| Availability could not be fetched | Name the failure as a failure, never as absence | "We couldn't check availability just now. Please try again." — explicitly *not* the waitlist offer (E7) |
| The server refuses a booking | Translate engine language into an action | `friendlyDenialMessage` converts "Capped at 1 (2-2-1 rule)" into customer copy; the raw text is logged, never displayed (E3) |
| A deposit is outstanding | Refuse the celebratory frame; state what is held and by when | "Deposit needed" / "We're holding Alfie's appointment… until the deadline below" — test-pinned (E3, E18) |
| Deposit status is unknown | Claim less, not more | "Appointment saved… check your dashboard for any deposit step before treating it as confirmed" (E3, E18) |
| Price | Always a floor, never a promise | "From £X", "final price confirmed at your appointment" (E5, E8) |
| Cancellation window | Currently stated as a fixed sentence, though the rule is server-configurable | "up until the day before" (E8) versus a default of 24 hours before the appointment's start time, and cancellations that staff can disable entirely (E24) |

## 16. Pressure, failure and recovery conditions

| Condition | Likelihood | Impact | Affected workflow | Required design response | Evidence |
| --- | --- | --- | --- | --- | --- |
| Interruption mid-flow | **High** — personal phone, low urgency | Loss of all selections | All branches (A only for drafts) | Draft persisted per human; `beforeunload` warning from step 2; drafts cleared on terminal states | E3 |
| Availability read fails | Medium | Customer misled about what is bookable | Steps 3 and 4 | Legend withheld + honest hint (step 3); failure distinguished from full (step 4) | E6, E7 |
| Slot taken while deciding | Medium | Refusal at the commitment point | Step 5 | Client re-check before write; bounce to step 4 with plain-language message; denial logged | E3 |
| Same-day cutoff lapses mid-flow | Low but real | A time is offered that the server will refuse | Same-day branch | Filter fails **closed** — if the RPC errored, today shows nothing rather than something unbookable | E3, E7 |
| Server trigger refuses the insert | Medium | Hard stop at commitment | Step 5 | Error codes mapped to bespoke copy; engine text never surfaced | E3 |
| Deposit read-back fails after commit | Low | Customer may believe an unconfirmed appointment is confirmed | Terminal | "Appointment saved" wording; explicitly test-pinned not to claim confirmation | E3, E18 |
| Refresh during a reschedule | Low | A reschedule silently becoming a second booking | Branches B, C | UUID kept in the URL; refuses and shows a recovery screen if only display state survives | E3 |
| Double submission | Medium | Duplicate bookings | Step 5 | Submit button disabled while submitting, label changes to "Booking…" | E8 |
| Deposit-flagged customer commits | **Unknown frequency** | Commits under a false expectation of "paid at pick-up" | Step 5 → terminal | **Currently unhandled before commitment** | E8, E16 |
| Screen-reader or keyboard use | Unknown | Exclusion | All | Full accessible day names, `aria-pressed`, `role="alert"` errors, `role="status"` hints, `aria-busy` skeletons, focus moved to the step heading on change | E3, E6, E23 |

## 17. Accessibility and inclusion context

Product-specific needs, with what is already handled separated from what is not.

**Already addressed (confirmed):**
- **Non-colour state cues.** Fully-booked days carry a strikethrough alongside the coral tint, with a source comment stating this is deliberately a non-colour cue (E10).
- **Accessible naming.** Day buttons expose full names — `"Friday 21 August, closed"`, `"…, fully booked"` — verified rendered (E23).
- **Live regions used correctly.** Errors are `role="alert"`, degradation hints and the paging range are `role="status"` / `aria-live="polite"`, loading skeletons are `aria-busy` with an `sr-only` label (E3, E6, E7).
- **Focus management.** The step heading is `tabIndex={-1}` and focused on every step change (E3).
- **Progress semantics.** The paw-print stepper is a `role="progressbar"` with min/max/now and a text label (E3).
- **Reduced motion.** Two `@media (prefers-reduced-motion: reduce)` blocks disable transitions and hover transforms; decorative confetti is `aria-hidden` (E3, E10).

**Needs attention (measured in E23):**
- **Touch target size.** Calendar day buttons render **34×34 CSS px with a 4px gap** at 390px. That clears WCAG 2.2 AA (2.5.8, 24×24) but sits below the 44×44 used by the same component's own month-navigation buttons, and below platform guidance — on the flow's single most-tapped control.
- **Secondary text contrast.** `--color-sd-ink-light` (`#6B7891`) measures **4.45:1 on white and 4.23:1 on the wizard's tinted backdrop** — marginally **below** the 4.5:1 AA threshold for normal-size text, across the step helper, the incomplete-availability hint, the weekday headers and the sidebar empty state.
- **Closed-day legibility.** Closed date numerals measure **1.89:1** at 13px. Disabled controls are exempt from WCAG 1.4.3, so this is not an AA failure — but the numeral is genuine information, and closed days are four of every seven.

**Requires implementation testing (cannot be judged from this evidence):** actual screen-reader output, keyboard traversal order through a 28-day grid, whether disabling closed days makes them unreachable in focus mode, 200% zoom reflow, and text-scaling behaviour.

## 18. Contradictions and unresolved questions

| Topic | Evidence A | Evidence B | Why it matters | Current interpretation | Decision required |
| --- | --- | --- | --- | --- | --- |
| Offline isolation | `CLAUDE.md` states offline/sample mode means you "never touch real customer data" (E1); the harness comments state offline nulls the customer client (E21) | The customer client never reads `VITE_FORCE_OFFLINE` (E11); the offline guard test asserts only the staff client (E13); the harness fired six live production requests (E23) | The repo's stated safety guarantee does not hold for the customer portal. Requests were all rejected (E14), so nothing leaked — but the isolation is nominal, not real | The staff client's guard (E12) was never mirrored onto the customer client; the harness comments encode a belief that was never true | **Yes** — align the customer client and extend the guard test |
| Deposit disclosure | Step 5 states "From £X (paid at pick-up)" (E8) | `depositRequired` is already fetched at step 4 and discarded (E16); the deposit is revealed only after commitment (E3) | A deposit-flagged customer commits believing one thing and is told another immediately afterwards — against the surface's own test-pinned honesty standard | An omission, not a deliberate policy: the post-commit handling is scrupulously honest, suggesting the pre-commit gap was simply not noticed | **Yes** — see §19 Q1 |
| Dead-end instruction | Pregnant dogs get "message us" **with** a WhatsApp link (E4) | Unconfirmed-size dogs get "message us first" with **no** link (E4) | The blocked customer is told to act but not given the means, in the same component that provides it two lines below | Inconsistency, not intent | No — a clear defect to correct |
| Cancellation promise | Step 5 states cancellation is possible "from your dashboard up until the day before" (E8) | The server allows it only until `minCancellationHours` (default 24) before the appointment's **start time**, and only while `allowCancellations` is on — both staff-configurable (E24) | At the default, a Tuesday 08:30 appointment cannot be cancelled on Monday evening, though the copy promises it can. Staff can also switch cancellation off without the copy changing | Hardcoded copy asserting a fact the server actually governs — the same root cause as the deposit gap | **Yes** — correct the copy, or derive it |
| E2E coverage | The staff app has five Playwright specs (E19) | The customer portal, including the only customer write path, has none (E19) | The revenue-bearing self-service flow is the least end-to-end-verified surface in the product | A consequence of the offline gap: without a sample-data mode for the portal, an offline E2E cannot be written | Related to decision 1 |
| Device priority | Mobile-first CSS with a deliberate desktop enhancement (E9, E10) | No analytics, research or owner decision exists | Determines whether the desktop sidebar or the mobile compact total deserves refinement effort | Implementation optimisation is confirmed; real priority is genuinely **unknown** and is not inferred | **Yes** — see §19 Q2 |

## 19. Questions for the product owner

### Question 1: Should the wizard warn a deposit-required customer *before* they commit?

**Current interpretation:** It should. The surface already enforces a strict honesty standard after commitment — refusing "All booked in!" when a deposit is outstanding, and claiming less when status is unknown, both pinned by tests (E3, E18). The pre-commit screen simply has not been brought up to that standard.

**Evidence:** E8 (step 5 says "paid at pick-up", with no deposit awareness); E16 (`getBookingRules` already returns `depositRequired` and is already called at step 4); E3, E18 (the post-commit honesty standard and its tests).

**Uncertainty:** whether showing the deposit earlier is thought to deter bookings, and how the deposit amount should be stated pre-commit given that the authoritative figure is stamped by the DB trigger at insert. Note also that `getBookingRules` fails open — a `null` result must never be rendered as "no deposit required".

**Why it matters:** it decides whether the most consequential moment in the flow tells a subset of customers something the system already knows to be wrong.

**Possible answers:**

A. Warn at step 5 using the flag already fetched at step 4, phrased conditionally, with silence never implying "no deposit". *(Recommended — no extra network cost, no structural change.)*

B. Warn earlier still, at step 4 alongside the times.

C. Leave as is — the post-commit screen is deemed sufficient.

D. Something else.

### Question 2: Which device should this surface be optimised for?

**Current interpretation:** unknown. The implementation is mobile-first with a deliberate desktop enhancement, but that proves intent, not usage.

**Evidence:** E9, E10, E23 (implementation optimisation confirmed at 390px and 1280px); no analytics, research or decision record exists.

**Uncertainty:** total. Nothing in the repository records how customers actually reach the portal. The funnel telemetry the wizard already emits (`logFunnelEvent`, E3) could answer this, but its results were not available.

**Why it matters:** it decides whether the 34×34 calendar targets are the most important accessibility finding on this surface or a marginal one, and whether the desktop sidebar deserves further investment.

**Possible answers:**

A. Phone-primary — treat touch ergonomics as the priority. *(Most likely given a consumer self-service flow, but unevidenced.)*

B. Desktop-primary.

C. Genuinely mixed — hold both to the same standard.

D. Let me pull the funnel data first.

### Question 3: Should the customer client honour `VITE_FORCE_OFFLINE`?

**Current interpretation:** yes. The asymmetry appears accidental rather than designed, and it costs the project both a stated safety guarantee and the ability to write an offline E2E for its only customer write path.

**Evidence:** E11–E13, E19, E21, E23.

**Uncertainty:** whether anything intentionally depends on the customer client being live in offline mode. Nothing found suggests so.

**Why it matters:** it is the precondition for E2E-testing this surface and for reviewing it against real rendered states in future.

**Possible answers:**

A. Mirror the staff client's guard and extend `offlineTestGuard.test.ts` to cover both clients. *(Recommended.)*

B. Mirror the guard and additionally add a customer sample-data path so the wizard renders offline.

C. Leave as is.

D. Something else.

## 20. UX review handoff

### UX Review Handoff

**Context version:** 2026-08-20, `main@c1da6852b1a2bcd1edba7f45f0bb4a8569cd6e58`

**Review target:** The customer self-service booking wizard (`/customer`, `BookingWizard`) — five steps plus terminal screens.

**Product:** A self-service booking channel letting an approved customer secure a real grooming appointment on their own phone, without a conversation, while the salon's capacity rules stay authoritative in Postgres.

**Primary users:** Approved portal customers — dog owners booking their own dog's groom a few times a year, on a phone, with no accumulated familiarity, for whom use is entirely optional because messaging the salon always remains available.

**Secondary or affected users:** Salon staff (inherit the booking and absorb the work when self-service fails); deposit-required customers (a policy-flagged subset whose commitment means something materially different); the dog.

**Primary device and input:** Implementation is mobile-first (verified 390px) with a deliberate desktop enhancement above 1024px. **Real-world device priority is unknown** — do not treat any viewport as primary without an owner decision.

**Environment of use:** Personal authenticated device, private, unhurried, interruptible by design, network-fragile, with a WhatsApp escape hatch always one tap away.

**Primary outcome:** A real appointment exists in the salon's diary at a time the customer chose, and the customer knows exactly what happens next.

**Success criteria:** Reach commitment without missing information; what is said at commitment matches what happens after it; refusals are actionable and never in engine language; interruption loses nothing; the interface never asserts availability or confirmation it has not established.

**Primary scenario:** An owner books one small dog for a Full Groom three weeks out, on a phone, is interrupted once and returns to an intact draft, and commits — with the deposit-flagged variant diverging only *after* commitment.

**Primary workflow:**

1. Select up to four dogs; blocked dogs state their reason inline
2. Choose a service per dog, size-filtered, at starting prices
3. Pick a date from 28-day pages with capacity-aware day states
4. Choose a drop-off time, grouped, distinguishing failure from full
5. Confirm — client re-check, then the RPC behind three DB gates; terminal screen with reference and add-to-calendar

**Primary focal area:** The decision currently being made — it changes at every step. The accumulating booking is the only cross-step object, carried by the desktop sidebar and the mobile inline total.

**Intended hierarchy:**

1. The current step's choices
2. What has been chosen so far, and its cost — never duplicated
3. Back / Continue, step progress, Cancel
4. Price caveats, cancellation note, decorative flourishes

**Must preserve:**

- The RPC-only write path and the three DB gates as the authority
- The truthfulness standard and its tests: never assert availability or confirmation not established; never mislabel a fetch failure as "fully booked"; never say "All booked in!" with a deposit outstanding
- The distinction between "closed" and "fully booked", visually *and* in the accessible name
- The five-step order and the four-dog cap
- Draft persistence, and its deliberate disabling during a reschedule
- The reschedule UUID living in the URL, and the refusal to guess when it is lost

**Challenge only with strong evidence:**

- The five-step structure
- The four-dog cap
- The `--color-sd-ink-light` token (app-wide blast radius, 14 files)

**Open to refinement:**

- Step 5's pre-commitment disclosure — deposits and the cancellation window especially
- Calendar day target size and closed-day legibility
- The unconfirmed-size dead end
- The desktop/mobile treatment of the accumulating booking

**Workflow branches:**

- **A — new booking:** the default; drafts on; "All booked in!"
- **B — reschedule (`?reschedule=`):** drafts off; original held; `SDC02`/`SDC04`
- **C — approval request (`&approval=request`):** requests rather than takes; original stays booked; "Request sent"; `SDR01`/`SDR02`
- **Exception — waitlist:** offered only on a genuinely full day, never after a fetch error

**Contextual explanations:**

- Blocked dog: state the reason *and* give the way forward (pregnancy does; unconfirmed size does not)
- Partial availability: admit the limit and say what happens next
- Refusal: translate engine language into an action; log the raw text, never show it
- Deposit: refuse the celebratory frame; state what is held and by when
- Price: always a floor, never a promise
- Cancellation window: server-configurable (default 24 hours before start, and switchable off), not the fixed "day before" the copy states

**Accessibility priorities:**

- Calendar day targets are 34×34px at 390px while the same component's nav buttons are 44×44
- `--color-sd-ink-light` measures 4.45:1 on white and 4.23:1 on the wizard backdrop — marginally below AA for normal text
- Closed-day numerals measure 1.89:1 (exempt as disabled, but still information)
- Preserve the existing non-colour cues, live regions, focus management and reduced-motion handling
- Screen-reader output, keyboard order through the 28-day grid, and 200% reflow **require implementation testing**

**Pressure test:** A deposit-required customer, on a phone, on a poor connection, interrupted mid-flow, choosing a same-day last-minute slot whose 30-minute cutoff lapses while they decide.

**Known unresolved decisions:**

- Pre-commitment deposit disclosure (Q1)
- Real-world device priority (Q2)
- Whether the customer client should honour `VITE_FORCE_OFFLINE` (Q3)

**Evidence available to the reviewer:**

- E1–E24 as mapped in §2
- Code: `BookingWizard.tsx`, `DogSelection.tsx`, `ServiceSelection.tsx`, `DateSelection.tsx`, `SlotSelection.tsx`, `BookingConfirmation.tsx`, `BookingSummarySidebar.tsx`, `booking-wizard.css`
- Server authority: migrations `20260603130000`, `20260622110000`, `20260627120000`, `20260712115759` (both the booking-group grant and `cancel_customer_booking`)
- Tests: 11 wizard component test files (38 tests, passing); `offlineTestGuard.test.ts`; `e2e/` (no customer coverage)
- Harness: `/dev/booking-wizard-shell-preview` at `localhost:5174` — shell, real sidebar, real `DateSelection` only
