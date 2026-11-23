# iPhone booking flow

Status: Draft (design check, no code yet)
Issue: Not yet assigned; link a dedicated iOS issue before implementation
Base: `main` at `a4b8efc` (after #1266)
Last verified: 2026-11-23
Owners: `ios/**`, shared booking rules (`src/engine/capacity.ts`, `supabase/functions/_shared/capacity.ts`, the capacity trigger)
Dependencies: The deposit decision (question 3) before the confirm step. A staging project with a test customer (question 1). Customer Home and My dogs already merged (#1265, #1266).
Related requirements: REQ-A11Y-001, REQ-UX-001
Related ADRs: ADR 001 (PostgreSQL is the capacity authority), ADR 002 (visit commands stay off), ADR 009

## Goal

A signed-in, approved customer can book a groom from the iPhone app: pick dogs,
services, a day and a time, confirm, and see a "You're booked" screen. The
database stays the only authority on whether a booking is allowed.

## Why

Booking is the reason a customer opens the app. Today the app shows grooms and
edits dogs, but "Nothing booked yet" sends them to the website
([`HomeView.swift`](../../../ios/SmarterDog/HomeView.swift)). The
[API contract](../../ios-api-contract.md) already lists every call this needs
and says not to invent a second booking API.

## Current behaviour and evidence

Read from the repository at the base above. Nothing here was run against a live project.

- **Write path.** `create_customer_booking_group(p_bookings jsonb, p_booking_date date)`,
  latest definition in
  [`20261019120000_customer_booking_refusal_codes.sql`](../../../supabase/migrations/20261019120000_customer_booking_refusal_codes.sql).
  It takes 1 to 4 dogs on one date, takes each dog's size from `dogs.size` (not
  from the payload), inserts `Booked`, `confirmed = false`, payment defaulting
  to `Due at Pick-up`, and returns the new ids. It runs under per-slot advisory
  locks, and the three `BEFORE INSERT` gates on `bookings` (calendar, capacity,
  pregnancy) still apply.
- **Refusals carry a stable code in `DETAIL`**, and a human message beside it.
  The web maps them in [`denials.ts`](../../../src/engine/denials.ts)
  (`mapDenialReason`, `friendlyDenialMessage`). Account refusals:
  `awaiting_approval`, `profile_incomplete`, `dog_size_unconfirmed`,
  `dog_not_owned`. Gate refusals: `pregnant`, `daily_cap`, `past_cutoff`,
  `past_date`, `calendar_closed`, `large_dog_ineligible`, `double_booked`,
  `customer_slot_blocked`, `capacity_2_2_1`, `slot_full`, `seat_blocked`,
  `unavailable`.
- **The web wizard has five steps**
  ([`BookingWizard.tsx`](../../../src/components/customer/booking/BookingWizard.tsx)):
  Select dogs, Choose services, Pick a date, Choose a time, Confirm booking.
- **Availability is computed on the client.** The RPCs `get_open_days`,
  `get_slot_occupancy`, `get_occupancy_range`, `get_blocked_seats` and
  `get_immediate_slots` return data. The browser engine
  ([`capacity.ts`](../../../src/engine/capacity.ts), 673 lines: `canBookSlot`,
  `findGroupedSlots`) decides which slots to offer. There is no server call
  that returns "the slots you may book".
- **The capacity rules are implemented three times** (browser, Deno, PostgreSQL
  trigger). One governed scenario list,
  [`capacityParityFixtures.ts`](../../../src/engine/capacityParityFixtures.ts),
  feeds every parity test. The repository rule is: change one, change all, and
  add the scenario to that list.
- **The iPhone app today** reads `dogs` and `bookings` under RLS and writes
  dogs through two RPCs. It has no booking write.

## Desired behaviour

Mirror the website, step for step, with the same rules and the same words.

1. **Select dogs.** Only dogs whose size the salon has confirmed can be chosen.
   My dogs already says "You said: medium. The salon will confirm." for the
   rest, and the RPC would refuse them with `dog_size_unconfirmed`. A pregnant
   dog is greyed as a preflight (the trigger is the authority). 1 to 4 dogs.
2. **Choose services.** Four bookable services only: Full Groom, Bath & Brush,
   Bath & De-shed, Puppy Groom (not for large dogs). Each service shows its
   mascot, the website's one-line description and its starting price.
   **Correction (23 November 2026):** an earlier version of this plan said the
   app would offer add-ons and use the full price precedence. Both were wrong.
   The customer wizard on the website has **no add-ons** (they are staff-only),
   and every price a customer sees there (service step, summary, confirmation)
   comes from one fixed table, `PRICING` in
   [`salon.ts`](../../../src/constants/salon.ts), with no settings override.
   The app mirrors that table and the website's wording ("From £46+"), guarded
   by `src/security/iosBookingServices.test.ts`.
3. **Pick a date.** Open days only, inside the horizon
   `current_customer_booking_rules` returns. Today appears only when staff have
   flagged a slot, and only until 30 minutes before it.
4. **Choose a time.** Slots the engine says are bookable, from 08:30 in 30
   minute steps. For several dogs, the offered allocations, as the website does.
5. **Confirm.** A summary, the server's change-deadline sentence
   (`customer_change_deadline_preview`), then one button. The app sends
   `create_customer_booking_group` and nothing else that writes.
6. **Booked.** The flyer's hero moment: "You're booked." with the yellow swash,
   the dog's photo as a taped polaroid, "See you soon!" in Caveat, and the
   mascot. The swash draws in (420ms), the polaroid settles (520ms), the mascot
   bounces once (600ms, starting at 260ms). All three are off under Reduce
   Motion. The details (dog, service, day, drop-off time) are plain text, never
   in the handwriting.

### Failure behaviour (the part that must not be wrong)

- A refusal shows the website's warm copy for that code, chosen by the
  `DETAIL` code first and by message only as a fallback, exactly as
  `mapDenialReason` does. Unknown codes show the generic line, never the raw
  string.
- A network error or timeout on confirm is an **unknown outcome**. The app does
  not say it worked and does not say it failed. It reloads the customer's
  bookings from the server and shows what is there. It never retries blindly.
- The button is disabled while a confirm is in flight, so a double tap cannot
  send twice.

## The decision that needs the owner: availability

The browser needs to know which slots to offer. Options:

| Option | What it is | For | Against |
|---|---|---|---|
| **A. Port the engine to Swift** (recommended) | A Swift `canBookSlot` and, later, `findGroupedSlots`, tested against the same governed scenario list | Pure logic, so it runs in Linux CI. No migration. The database still refuses anything the app wrongly offers | A fourth copy of the rules. Needs a parity test so it cannot drift |
| B. New server RPC that returns bookable slots | One engine in PL/pgSQL | One less client copy | Needs a migration applied to production by hand, and would itself re-implement the grouped allocation in SQL |
| C. Show every grid slot and let the database refuse | No engine | Least code | Customers hit "that time's just been taken" often. Poor experience |
| D. Hand multi-dog bookings to the website | Single-dog only in the app at first | Shrinks the first slice a lot | Customers with two dogs still leave the app |

**Recommendation: A, single dog first (D for several dogs), then add the
grouped allocation as its own slice.** To stop the fourth copy drifting, export
the governed scenario list to JSON with a small script and have the Swift tests
read it. A Node test then fails if the checked-in JSON is out of date with
`capacityParityFixtures.ts`. This follows the repository's own rule rather than
working around it. It does mean editing the "three copies" wording in
[`docs/capacity-engine.md`](../../capacity-engine.md) to say four.

## Scope

- Swift booking models, rules mirror, the five steps and the booked screen.
- Denial-code mapping in Swift, with a test that fails if a code in
  `DENIAL_REASON_LABELS` has no Swift copy.
- The fixtures export script and its freshness test.

## Non-goals

Cancel, reschedule and the override request (the contract lists them; a later
slice). Waitlist (the website joins a waitlist when a day is full; the app
links to the website). Deposits and payment (see open question 3). Repeat
booking. Staff booking. Push. A new booking policy. Any change to the capacity
rules, the gates or the RPC.

## Architecture

- Pure Swift in the Linux package, like `HomeModels` and `DogsModels`:
  `BookingDraft`, the payload builder, the date window, the slot engine, the
  denial mapping. No UI and no Supabase in those files.
- `SalonBookingClient` protocol (reads and the one write), a Supabase
  implementation, and a stand-in for tests and a debug sample mode.
- SwiftUI screens use the existing `PaperScreen`, `BrandStripe`, `HeroTitle`,
  `HandwrittenLine`, `MascotCircle` and the white card style.
- The payload sends `dog_id`, `slot`, `service`, `addons` and `payment`. It
  never treats a size sent from the phone as authority (the RPC ignores it).

## Data/database changes

None. No migration. Option B would add one, which is part of why it is not
recommended.

## API changes

None. Uses only calls already in the API contract. The visit-policy commands
stay off.

## UI changes

Described above. Hero titles are Poppins Black, one Caveat line per hero
screen, blue for "selected", yellow for the one lead button, light mode only.
Touch targets are at least 44pt, and every screen has VoiceOver labels and
works at large Dynamic Type. The size letter is always shown.

## Security/privacy considerations

- Writes only through the one RPC. No table insert, no service-role key.
- A refusal never shows the raw database message.
- The app never shows another customer's data: availability RPCs return no
  names (the existing contract), and bookings come back under RLS.
- Debug and sample modes are compiled into Debug builds only, as `-sampleHome`
  is today.

## Risks

| Risk | Mitigation |
|---|---|
| The Swift engine offers a slot the database refuses | Parity test against the governed scenario list. The database still decides, and the refusal copy is warm and specific |
| The Swift engine hides a slot that is fine | Same test, and the website remains the reference for any disagreement |
| A confirm that times out is read as a failure and retried | Unknown outcome rule above: reload, never retry blindly. A unique index also stops the same dog booking the same slot twice |
| A booking is created and the phone then claims it was not | The app never decides from its own memory. After any uncertainty it reads the server |
| First real writes hit production data | Decided: they go to a staging project (question 1) |
| Rules drift between four copies over time | Fixtures export plus freshness test, and the wording in the capacity docs |

## Implementation sequence

Each is its own pull request, merged only after the full CI bar.

1. **Models and mappings (pure).** Draft, payload builder, date window,
   denial-code mapping with its drift test. Linux tests. **Built** in
   `ios/SmarterDog/BookingModels.swift` (denial mapping and copy, rules parser,
   date window, services, request builder). The drift guard is
   `src/security/iosBookingDenials.test.ts`, and
   `ios/AuthCoreTests/denial-cases.json` is the one message table both runtimes
   read. Not yet used by any screen. The per-owner deposit flag is not in
   `current_customer_booking_rules()` (the website reads it elsewhere), so it is
   deliberately not modelled here; it belongs to the deposit decision.
2. **Slot engine (single dog) and fixtures export.** **Built** in
   `ios/SmarterDog/CapacityEngine.swift`: seats, the 2-2-1 rule, early close,
   staff-blocked seats, the customer's `canBookSlot`, and `offeredSlots` for one
   dog (the day's cap, then every slot `canBookSlot` allows). Guarded by
   `ios/AuthCoreTests/capacity-parity.json`, generated from the governed
   scenario list with the real website engine's answers by
   `src/engine/capacityParityFixtures.ios.test.ts`, which fails when the file is
   stale. Not ported: several dogs (a later slice), staff overrides, and the
   extra-slot grid builder (extra slots reach customers only as same-day
   openings). `docs/capacity-engine.md` now says four copies.
3. **Read-only wizard.** Dogs, services, date and time screens ending at a
   summary with **no confirm button**. Sample data mode for screenshots.
   - **3a, built:** the state and rules in `ios/SmarterDog/BookingWizard.swift`,
     no screens. The five steps and their headings match the website. A dog the
     salon has not sized, or a pregnant dog, is shown but cannot be chosen (the
     website's words). A change upstream drops what it makes wrong: a different
     dog clears the time and, for a large dog, a Puppy Groom; a different date
     clears the time. Tapping a step never jumps past the first unfinished one.
     The summary has no price yet; the summary screen (3b-5) will show the same
     "From £…" label as the website, from the same mirrored table.
     The website's "ask staff to confirm this dog's size" button writes a to-do,
     so the app does not have it yet and says only what is true.
   - **3b-1, built:** the dog picker. `BookingFlowModel` (in the Linux-tested package)
     holds the wizard and loads the customer's dogs through
     `SalonBookingDataClient` (`SupabaseBookingClient` reads `dogs` with
     `is_pregnant`, under Row Level Security). `BookingFlowView` has the step
     header and dots, the dog step (a blocked dog is shown with the website's
     reason and cannot be tapped; selected is a blue ring, tint and tick; the
     website's two explanations with a WhatsApp link) and Back and Continue.
     **Reachable only from Debug builds with the launch argument `-sampleBooking`**
     (made-up dogs covering every state), so no customer sees a half-built flow.
   - **3b-2, built:** the service step. `BookingServices.swift` holds the website's
     four descriptions, the `PRICING` table, the "from" marks and each service's
     mascot, and lists only the services a dog's size can have (Puppy Groom is not
     offered for a large dog). The tile shows the mascot, name, description and
     "From £46+", exactly as the website renders it, under the website's sentence
     about starting prices. `service-prices.json` is generated from the website's
     own functions; refresh it with `UPDATE_IOS_SERVICE_PRICES=1`.
   - **3b-3, planned (decisions made with the owner):** the date step and the
     app's first availability read. Time and summary screens follow.
     - **Layout:** a week-by-week list, not the website's grid. Each day is one large
       row ("Tuesday 1 December"). A closed or fully booked day stays in the list,
       greyed, with the word "Closed" or "Fully booked", so the customer can see why
       a day is missing. The salon is open Mon-Wed, so a seven-column grid would be
       mostly closed cells with small targets.
     - **Last minute is included.** A "Today — last minute" row sits above the list
       only when staff have flagged a slot today, the server still offers it, and the
       chosen dog can be placed in a flagged slot. The server's date is the date of
       truth (`get_immediate_slots` returns it), never the phone's clock.
     - **Reads, all existing customer-safe RPCs, no PII:** `get_open_days` (only dates
       with a row come back, so a date with no row falls back to the weekday default,
       Mon-Wed open), `get_occupancy_range` (date, slot, size), `get_blocked_seats` (in
       14-day chunks, as the website does), `get_immediate_slots`. Pages of 28 days
       with a "Show more weeks" row up to the customer's `bookingHorizonDays`; the
       range RPCs refuse anything outside the booking window.
     - **A day is "Fully booked" only if the engine says so.** It uses
       `CapacityEngine.offeredSlots` for this dog's size, so no new rule is written.
       If any read failed the page is marked incomplete and no day is called full: the
       app shows it as open and the database stays the authority, the same as the
       website. A failed read is shown as "couldn't load, try again", never as "no
       dates".
     - **Out of scope here:** the holiday-notice banner (`get_public_holiday_notices`;
       a holiday closure already shows as Closed through `get_open_days`), several
       dogs, and the time step.
     - **Split into three small PRs:** (a) pure `BookingAvailability.swift`: row types,
       lenient decoding, day states, the page and the last-minute row, with Linux
       tests; (b) the Supabase reads behind `SalonBookingDataClient`, plus the
       `-sampleBooking` stand-in; (c) the SwiftUI week list and its wiring.
     - **3b-3a, built:** `BookingAvailability.swift` (pure, no network). It parses the
       four RPC rows leniently, decides open, full or closed for a dog's size with
       `CapacityEngine.offeredSlots`, groups days by week, pages the window 28 days at
       a time and builds the "Today — last minute" offer. A read that failed is `nil`:
       the page is incomplete, no day is called full, and the last-minute row still
       shows for the database to judge. The wizard does not yet accept today's date
       for a last-minute choice; that comes with the wiring in (c).
     - **What cannot be proved from Linux:** the screens (Xcode) and the real RPC
       row shapes and refusals. The shapes are read from the migrations and decoded
       leniently, but a real call needs the staging project (question 1).
   - **3b-3b, built:** the booking model reads the date step: rules and today's
     flagged slots once, then one 28-day page at a time (page 0 reads from today for
     the last-minute row; a complete page is remembered, one with a failed read is
     read again; a slow answer for a page the customer has left is dropped). The four
     reads are in `SupabaseBookingClient` (two-week pieces for blocked seats; a failed
     read is `nil`, never empty). Changing dog drops a chosen date the new dog cannot
     have. `-sampleBooking` carries a calendar with a full day, a closed day and two
     last-minute slots. Still no screen.
   - **3b-3c, built:** the date screen. A week-by-week list under the website's
     sentence, with "Closed" and "Fully booked" days greyed and labelled, "Show earlier
     dates" and "Show later dates" for the 28-day pages, a "Check again" note when a read
     failed, and the "Today — last minute" row above the list. Choosing today lets the
     customer continue and limits the time step to the flagged times
     (`lastMinuteSlots`); choosing another day replaces it; a dog that no longer fits it
     drops it. The time screen is next. Needs a Mac to see.
   - **3b-4, built:** the time screen. On every visit it reads the chosen day alone
     and offers the times the capacity engine allows for this dog, as "Morning drop-offs"
     and "Afternoon drop-offs" in the website's "9:30am" style. A chosen time that has
     gone is dropped; a failed read is "We couldn't check availability just now", never
     "Fully booked"; for today it asks the server again which flagged times are still
     open (the 30-minute cut-off moves on) and shows the website's "Today's last-minute
     times have gone". Not ported: the owner's preferred and blocked times ("Your usual
     time") and the waitlist link; the database still refuses a blocked time. Needs a
     Mac to see.
     Review fixes (Codex, on #1289): today stays the customer's last-minute choice even after
     every flagged time has gone, so going back and forward never offers the ordinary grid;
     Continue is shut until the chosen time has been checked again on this visit (a failed
     read leaves it shut); a day staff closed after it was picked shows "We're closed on ..."
     with no times (not when the open-days read failed, which proves nothing); and leaving the
     time step for the date step drops the remembered pages so the list is read again.
   - **After the time step:** the summary screen (no confirm).
4. **Confirm.** The one write, behind a debug flag, tried by the owner on the
   staging project (question 1).
5. **Booked screen** and its motion.
6. **Release.** Turn the confirm on for the internal TestFlight build, then
   widen.
7. **Later slices.** Several dogs, cancel and reschedule, waitlist.

## Testing

Linux (CI, `swift test --package-path ios`): payload shape, date window and
open days, every denial code, the unknown-outcome rule, the slot engine against
the exported scenarios, the freshness check. Repository bar for any change:
`npm run lint`, `check:docs`, `typecheck`, `check:migrations`, `test`, `build`.

Needs a Mac and a simulator: every SwiftUI screen, Dynamic Type, VoiceOver,
Reduce Motion and the booked-moment animation. Needs a real project: the confirm
itself and row-level security, so a staging project and a test customer are
required (question 1). Nothing from the Linux side proves a screen works.

## Migration/rollout

No database change. Ship the code with the confirm button off, prove it on the
chosen test target, then enable it for the internal TestFlight build. A
mistaken build is replaced by a new build; an installed build cannot be rolled
back, so the confirm stays behind a flag until the owner has used it.

## Observability

Reuse `log_booking_denial` as optional telemetry for refused slots (the
contract lists it). Whether the app also sends the funnel events the website
records is open question 4.

## Documentation updates

`docs/ios-api-contract.md` Gaps and customer screens, `ios/README.md`,
`docs/capacity-engine.md` (four copies), this plan's status.

## Definition of done

- A test customer books one dog from the phone and the booking appears in the
  staff calendar with the right status.
- Every refusal code shows its own copy, and an unknown outcome is shown
  honestly.
- The slot engine passes every governed scenario.
- Sign-in, Home, My dogs and booking all work in the simulator in light mode at
  large text, with VoiceOver and Reduce Motion checked on the screens that move.
- The owner has seen it on a real phone.

## Decisions and open questions

Decided by the owner on 23 November 2026:

1. **First real writes go to a staging project**, not production. The app is
   pointed at it through `Config.local.xcconfig` (public URL and publishable key
   only, never a service-role key). Needs: the staging project's URL and
   publishable key from the owner, and a test customer and test dog on it.
2. **One dog first.** A customer with several dogs books them on the website
   until a later slice adds grouped allocation.
3. **Deposits: undecided.** The website reads a per-customer `depositRequired`
   flag from `current_customer_booking_rules`, the database stamps a reference,
   amount and due date at insert, and the website reads the rows back and shows
   bank instructions. The app cannot take payment. Options are to send
   deposit-required customers to the website (recommended, and to do the same
   when the flag cannot be read), or to show the instructions in the app. Until
   decided, **the confirm step stays switched off** and everything before it is
   built.

Still open:

4. **Funnel telemetry.** Send the website's funnel events from the app, or only
   denials via `log_booking_denial`?
5. **Waitlist.** Link to the website when a day is full, or build it later?
