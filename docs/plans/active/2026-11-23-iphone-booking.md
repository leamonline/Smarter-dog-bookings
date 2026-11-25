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
   - **3b-5, built:** the summary screen, laid out as the website's confirm step is:
     "When" (for example "Tuesday 1 December 2026 at 9:30am"), the dog with its service and
     starting price ("From £46+") and breed and size, then the total ("From £46", no plus).
     No confirm button: the screen says booking is not switched on in this version.
     **Left out on purpose until the deposit decision and one more read:** any claim about
     when payment is due (the website says "paid at pick-up" only when no deposit applies,
     which the app cannot know yet), the "Need to change your appointment?" note (it needs
     `customer_change_deadline_preview` so it is not shown for a booking made inside the
     change window) and the essential-messages notice (it belongs beside the confirm button
     and needs a drift guard like the prices).
   - **Confirm, step 1 of 3 (built): the logic, with no screen and no real send.**
     `BookingConfirm.swift` and `BookingFlowModel.confirm()`. One tap is one request: a second
     tap while one is out does nothing, Back does nothing while one is out or once a booking
     exists, and with booking switched off (`canBook`, false by default) nothing can be sent. Just
     before sending it reads the day again and stops with "that time's just been taken" if the
     time has gone (an unreadable day does not stop it; the database decides). A refusal shows
     the website's copy for its code, never the raw text. A reply that never arrives is an
     **unknown outcome**: the app looks the booking up on the server and reports what is there,
     never sends again by itself, and says "we couldn't tell, check your appointments" if it
     finds nothing. A deposit is reported from the booking read back after it was made, never
     from a pre-check. The three client calls have defaults that send nothing; the Supabase
     versions, the Debug switch and test login, and the confirm and booked screens are the next
     two steps.
   - **Confirm, step 2 of 3 (built): the real send, the read-back and the Debug-only switch.**
     `SupabaseBookingClient` sends `create_customer_booking_group` and reads the booking back.
     The send is a plain web request, read by `BookingWire`, which is tested against the real
     answers recorded from staging: 2xx with ids is created; a 4xx with a readable body is a
     refusal carrying the database's own `details` code; anything else (a 5xx, an unreadable
     body) is an unknown outcome; a connection that was never made is "not sent", safe to retry.
     This is the one reviewed exception to the repo's "no `URLSession` in the app" guard, one
     file and one call site, enforced by `src/security/iosProjectIsolation.test.ts`.
     `-liveBooking` (Debug builds only) runs the real flow against staging as the throwaway test
     customer, refuses any project but staging, and takes the email and password from local
     scheme environment variables. See [ios/README.md](../../../ios/README.md). There is still
     no confirm button.
   - **Confirm, step 3 of 3 (built): the confirm button and the booked screen.** On the summary,
     only when booking is switched on, a **Confirm booking** button (it reads "Booking…" while a
     request is out and the model ignores a second tap). Every way it can end is shown: a refusal in
     the website's wording, "that time's just been taken", "we couldn't reach the salon, so nothing
     was booked" (safe to try again), and the unknown outcome ("we couldn't tell whether your booking
     went through", with Check again and WhatsApp, and no way to send again). Back is shut while a
     request is out and once a booking exists or might. A made booking shows `BookedView`: "You're
     booked." with the yellow swash drawn in under "booked." (0.42s), a taped polaroid settling
     (0.52s), "See you soon!" in Caveat and the mascot bouncing once (0.6s, from 0.26s), all off
     under Reduce Motion; the details and any deposit line are plain text. The polaroid shows a paw
     until dogs' photos are brought into the flow. **Done** starts a fresh booking (`startAnother`,
     the only way out of a finished booking). `-sampleBooked` (Debug only) shows the booked screen
     with made-up data. Still switched on nowhere except `-liveBooking` on staging.
   - **Next:** try it end to end on staging in Xcode, then decide how and when to widen it
     (a TestFlight build behind a flag, then the salon's own settings switch). Several dogs,
     cancel and reschedule, the waitlist and the change-your-appointment note come after.
4. **Confirm.** The one write, behind a debug flag, tried by the owner on the
   staging project (question 1).
5. **Booked screen** and its motion.
6. **Release.** Turn the confirm on for the internal TestFlight build, then
   widen.
7. **Later slices.** Several dogs, cancel and reschedule, waitlist. Order decided by the owner on
   25 November 2026: **cancel first**, then several dogs, then reschedule (a reschedule of a
   two-dog visit needs the grouped allocation, so it waits for several dogs).
   - **Cancel, step 1 of 2 (models): built.** `ios/SmarterDog/BookingCancel.swift`, pure Swift,
     tested on Linux. The reasons are the website's four (`BookingCard.jsx`), cleaned the same way
     (markup removed, at most 500 characters). The receipt from `cancel_customer_booking` is checked
     as the website checks it (`isValidCancellationRow`): it must name the booking asked about, and
     its ids and count must agree; anything else is an unknown outcome, never "cancelled". Refusals
     use the website's words by code (`SDC01`, `SDC02`, otherwise the general line). An unknown reply
     is settled only by a fresh read: a row now reading Cancelled or No-show went through. Retrying
     is safe because the server replays the original receipt, but only for the same reason, so a
     retry must reuse it. Cancel is offered only when the server would accept it: online
     cancellation not switched off, every booking in the visit exactly "Booked" (the server refuses
     Reconfirmed and a row with no status, though the website still shows the button for them), and
     before the earliest drop-off in London time. A visit is every booking sharing the target's
     group on the same date, because the server cancels them together. The guard is
     `src/security/iosBookingCancel.test.ts` (reasons, words, the 500 limit, the "Booked" rule and
     the parameters, read from the website and the newest migration).
   - **No-shows (ADR 015):** a cancel on the appointment's own London date is saved as a No-show by a
     database trigger. The app adds no rule and shows no warning step (owner decision, 24 November).
   - **Cancel, step 2 of 2 (screen and send): built, not yet seen on a screen.** `CancelFlowModel`
     (Linux-tested: no send without a reason, one request per tap, a reason fixed after an unknown
     outcome so a retry matches the server's replay, "Check again" reads and never sends) and
     `CancelSheet` (the website's question and reasons, the visit's time, a note when several dogs
     go together, the outcome in the website's words, "Keep my booking"). Home works out each
     visit's `CancelTarget` from `group_id` and status. The Cancel button appears only where a cancel
     client is given, which today is only "My bookings" inside the Debug-only `-liveBooking` mode, so
     customer Home is unchanged. The send shares the booking send's one plain web request in
     `SupabaseBookingClient`; `iosProjectIsolation.test.ts` now allows exactly these two RPC paths.
     Whether the salon has switched online cancellation off is not read in the app: the server
     refuses with `SDC01` and the sheet shows the website's words for it.
   - **Next:** the owner books and cancels Test Pup on staging, once for a later day and once on the
     day itself (which should show as No-show for staff), and checks the sheet in Xcode with large
     text and VoiceOver.

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
   only, never a service-role key). Staging is `btjnxvgkpdbfrrqxvkfj`. Its URL and
   publishable key are read from the Supabase project, not typed from memory. A test
   customer and dogs are seeded on it (see "Staging check, 24 November" below).
2. **One dog first.** A customer with several dogs books them on the website
   until a later slice adds grouped allocation.
3. **Deposits (decided 24 November): hold it and say so.** The database stamps a
   deposit on any booking for a customer staff tagged as deposit-required (flat £10 per
   dog, a reference and a due date), whatever route made the booking, and the booking is
   held until paid. The app books exactly as the website does and then tells the
   customer, on the booked screen, that a £10 deposit per dog is due and that the salon
   will be in touch about paying. The app takes no payment and shows no bank details.
   This replaces the earlier recommendation to send tagged customers to the website.
   Because the database stamps it, the app does not need the per-customer flag before
   booking: **after the insert it reads the booking back and reports the deposit from the
   row (`deposit_required`), never from a pre-check**, so a flag that could not be read
   cannot hide a deposit. The summary screen therefore still says nothing about payment
   before the booking is made.

4. **How the confirm button is switched on (decided 24 November): Debug builds only.**
   A launch argument (`-liveBooking`) that exists only in Debug builds and is compiled out
   of TestFlight and the App Store. Only the owner, running from Xcode against staging, can
   reach it. Widening it later (a build setting, or a switch in the salon's settings) is a
   separate change.
5. **How the Debug build signs in on staging (decided 24 November): a Debug-only test
   login** using the throwaway email-and-password customer seeded on staging, because
   staging cannot send text-message codes. The email and password are read from Xcode
   scheme environment variables set locally, never written to the repository, and the code
   is compiled out of Release builds. A phone test number on staging can replace it later.

Still open:

6. **Funnel telemetry.** Send the website's funnel events from the app, or only
   denials via `log_booking_denial`?
7. **Waitlist.** Link to the website when a day is full, or build it later?

## Staging check, 24 November 2026

Run against staging only (`btjnxvgkpdbfrrqxvkfj`), with a throwaway customer, using the
app's own request encoder and decoders. Nothing was run against production.

- **Staging was empty**: no customers, dogs, bookings, calendar settings or logins, and no
  `salon_config` row, so settings such as the daily cap run on database defaults. All the
  booking functions and the calendar, capacity, pregnancy and deposit gates exist.
- **Seeded**: one approved test customer with a throwaway email-and-password login (a
  phone login cannot be set up from here), a complete profile, and four dogs: a medium
  one, a large one, a pregnant one and one with no confirmed size.
- **Reads, all HTTP 200 and decoded by the app's own types**: `dogs` (a customer can read
  `is_pregnant`, which settles that open question), `current_customer_booking_rules`
  (booking horizon is **180 days** on staging, not 28), `get_open_days`,
  `get_occupancy_range` (rows are `booking_date`, `slot` as "09:30", `size`),
  `get_blocked_seats` and `get_immediate_slots`.
- **A real booking** through `create_customer_booking_group` with the JSON the app builds
  succeeded and returned the new id. Reading it back showed status "Booked", the size
  stamped from the dog (never sent), `deposit_required` false and payment "Due at Pick-up".
- **Refusals, each mapped by the app to the right reason and wording**: a pregnant dog
  (`pregnant`), an unsized dog (SQLSTATE 22023, `dog_size_unconfirmed`), a closed day
  (`calendar_closed`), a large dog in a middle slot (`large_dog_ineligible`), and a
  customer whose profile lacks a surname, address or policy agreement
  (`profile_incomplete`).
- **One refusal has no stable code**: booking the same dog and slot twice comes back as a raw
  duplicate-key error (SQLSTATE 23505, constraint `bookings_one_active_per_dog_slot`). The
  app maps it from the message text to `double_booked`. That works today, but it is a
  message match, and the database could give it a stable code like the others.
- **Not covered**: signing in to the real app on staging (needs a test phone number with a
  fixed code in the staging project's sign-in settings), the deposit path (the test
  customer is not tagged), several dogs, and any production behaviour.
- **Clean-up**: the test customer, dogs, login and one booking can be deleted from staging
  whenever wanted. The throwaway password is kept only in the session scratchpad.
