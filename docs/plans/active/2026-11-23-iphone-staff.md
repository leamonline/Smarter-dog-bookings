# iPhone staff app

Status: Active (approved by the owner and merged in #1287; S0 and S1 in review)
Issue: Not yet assigned; raise a dedicated issue when the owner approves this plan
Base: `main` at `526e83e` (after #1277)
Last verified: 2026-11-24
Owners: `ios/**` staff files (new `Staff*.swift` and their tests), the staff placeholder in `ios/SmarterDog/RootView.swift`; later phases also `supabase/functions/notify-staff/**`
Dependencies: A staging project with a test staff account (open question 2). Phase S4 depends on the APNs work in [the API contract](../../ios-api-contract.md#push). Coordination with the [iPhone booking flow](2026-11-23-iphone-booking.md) (shared files, see Architecture)
Related requirements: REQ-A11Y-001, REQ-UX-001, REQ-CAP-001, REQ-AUTH-001 (no new write path), REQ-NOT-001, REQ-SEC-001
Related ADRs: [ADR 001](../../architecture/decisions/001-postgresql-capacity-authority.md) (the database decides capacity), [ADR 002](../../architecture/decisions/002-separate-visit-authority-from-policy-activation.md) (visit commands stay off), [ADR 009](../../architecture/decisions/009-independent-applications-in-one-repository.md)

## Goal

A staff member opens the Smarter Dog iPhone app on the salon floor, sees today's
dogs in appointment order with each dog's status, timing and safety notes, moves a
dog through the day (check in, mark ready, check out) with the same rules and the
same database writes as the website, and gets a native notification when
something needs them. Everything else stays on the website, one tap away.

## Why

- **The staff side of the iPhone app is a placeholder.** Signing in as staff opens
  `HomeRoot` in [`RootView.swift`](../../../ios/SmarterDog/RootView.swift): the
  name, the role and "Booking from the phone comes later."
- **Staff already run the salon from an iPhone, through the website.** The
  [iPhone interface plan](2026-10-27-iphone-interface-consistency.md) calls the
  iPhone "the staff's main device", and [staff web push](../../staff-web-push.md)
  only works once the website is added to the Home Screen (iOS 16.4+).
- **So a native staff app has to beat a website staff already use.** It earns its
  place where native is better on a phone held in one hand between dogs: speed and
  one-tap moves on Today, notifications that arrive reliably, and staying signed
  in. It does not earn it by re-typing the calendar, reports and settings in
  Swift.
- **Every rule copied into Swift is a copy to keep in step.** The capacity engine
  already exists three times and the booking flow adds a Swift fourth
  ([iPhone booking](2026-11-23-iphone-booking.md)). This plan copies only what a
  phase needs, each copy checked against the website by shared fixtures.

**Recommendation: native for the salon floor, the website for the desk.** Build
Today, the status moves, check-out and staff notifications natively, in phases
that each reach TestFlight. Link to the website for the calendar, new bookings,
customers and dogs, reports, settings and the signup queue. Decide after each of
the first two phases whether to continue, based on whether staff actually reach
for the app instead of the website (Open question 1).

## Current behaviour and evidence

Read from the repository at the base above. Nothing here was run against a live project.

**The iPhone app**

- Sign-in already handles staff: email and password, then `staff_profiles`
  ([API contract, Staff](../../ios-api-contract.md#staff)); `AuthService` resolves
  `.staff(AccountCard)` or `.staffDenied`.
- Logic and screens are split deliberately. Decision code (models, selectors, the
  capacity engine) is listed in [`ios/Package.swift`](../../../ios/Package.swift)
  so Linux CI runs it with `swift test --package-path ios`
  ([`.github/workflows/ios-auth.yml`](../../../.github/workflows/ios-auth.yml),
  Swift 6.0.3). SwiftUI views and the Supabase clients are excluded and compile
  only on a Mac (Xcode Cloud).
- The customer side shows the pattern to copy: `Decodable` rows
  (`HomeModels.swift`), a pure selector (`HomeSelector`), a client protocol
  (`SessionClient`) with a Supabase implementation (`SupabaseHomeClient.swift`),
  and a view (`HomeView.swift`).
- The Xcode project lists every Swift file by hand
  (`SmarterDog.xcodeproj/project.pbxproj`, explicit `PBXFileReference` entries,
  no synchronised folders). A new file must be added there, as well as to
  `Package.swift` if it holds logic.
- The app is light only since `934bf76`. Colours are named asset-catalogue sets
  (`AppColor.swift`). There are no status colours yet.

**The website's staff Today** ([Today command centre](../../today-command-centre.md))

- The default staff landing is `/staff/today`: a time-ordered stack, one card per
  dog. A 72px strip carries time, dog name, the balance from Ready onwards and
  the status pill on line 1; the safety note in words, breed · service · owner
  surname and the timing ("waiting 25 min", "1 hr 50 min late") on line 2. Tapping
  a strip lifts the card for details and actions.
- Pure engines drive it: `src/engine/dayStack.ts` (ordering, timing line,
  check-out chain), `src/engine/today.ts` (London "now", lateness, waits),
  `src/engine/salonBoard.ts` (`tokenActions`, the single source of legal moves),
  `src/engine/safetyOrder.ts` (`orderSafetyFacts`) and
  `src/constants/statusPalette.ts` (one hue per status).
- Statuses: Booked, Reconfirmed, Arrived, Ready for collection, Completed,
  Cancelled, No-show (`BOOKING_STATUS` in `src/constants/salon.ts`).
- Legal moves (`tokenActions`): Reconfirmed (only from Booked), Check in, Mark
  ready, Take payment / Mark collected, They turned up (undo a no-show, not for a
  grouped visit), Didn't show, Confirm or Unconfirm, plus WhatsApp, Call and the
  dog's and owner's files.
- **Mark ready sends nothing by itself.** It opens a prompt where staff choose
  whether to message the owner (`useBookingActions.ts`, `onSendCollection`).
- **Collected is never recorded unpaid.** The card's check-out chain takes payment
  and collection in one write (#1019). Undo reverts exactly what was written and
  never un-takes a payment made another way.
- Writes go to `bookings` directly under staff RLS (`useBookings.updateBooking`).
  Database triggers stamp `checked_in_at`, `ready_at` and `completed_at`; a
  realtime subscription shows a colleague's moves on another till.

**Server facts this plan relies on**

- `whatsapp-send`, `sms-send` and `reminder-send` accept a staff JWT
  (`supabase/functions/_shared/authManifest.json`, `staff-jwt-or-internal-secret`),
  so the app can send the "ready" message the way the website does.
- `register-device-token` stores the role as `staff` when `is_staff()` is true.
  Staff notifications today are web push only (`notify-staff`,
  `STAFF_PUSH_ENABLED`); nothing sends APNs to staff yet.
- In-app messages (`app_conversations`, `app_messages`, [app inbox](../../app-inbox.md))
  sit beside WhatsApp; the staff inbox's channel rules are detailed and
  safety-relevant.
- A staging project exists, with a hard-coded ref guarded against production
  ([hosted target guard](../../hosted-supabase-target-guard.md)).

## Desired behaviour

Requirements for the whole app. Each phase below names the ones it delivers.

| ID | Requirement | Scenario that proves it |
|---|---|---|
| ST-1 | Staff see today's dogs in strict appointment order, two dogs in one slot as two rows | A day with 08:30 ×2 and 09:00 shows three rows in that order, whatever their statuses |
| ST-2 | Each row says its status in words, with the website's status colours, and never relies on colour alone | VoiceOver reads "Bella, 08:30, Ready for collection, £42 due" |
| ST-3 | Safety notes appear on the row in the website's order (handling restrictions first), never reworded or dropped | A dog marked Pregnant and Nervous shows "Pregnant +1"; the lifted card lists both |
| ST-4 | The timing line matches the website for the same booking and the same London time | Shared fixtures: Swift output equals `buildDayStack` output |
| ST-5 | London time, not the phone's clock or timezone | A phone set to New York shows the same rows and timings as one in London |
| ST-6 | Only the website's legal moves are offered, with the website's labels | Booked offers Reconfirmed and Check in; a grouped no-show does not offer They turned up |
| ST-7 | A move writes what the website writes, through the same table and RLS; the database stays the authority | A refused write shows a plain error and the row stays as it was |
| ST-8 | Mark ready never sends a message by itself; staff choose | Mark ready, then "Message the owner?" with Send and Not now |
| ST-9 | A dog is never recorded collected while money is owed | The check-out chain asks for payment first; there is no "collected anyway" |
| ST-10 | A colleague's change on another till appears without a manual refresh | Check in on the website; the phone row updates within seconds |
| ST-11 | Staff get a native notification for the events the owner chooses (Open question 4), behind a switch that defaults off | With the switch off, nothing is sent; with it on, a new message notifies the staff phone |
| ST-12 | Everything not built natively opens the right website page | "Calendar" opens `/staff` in the browser, signed in as normal |
| ST-13 | Loading, empty, closed-day and failed states are distinct and truthful | A failed load says so and offers Try again; it never shows "Nothing booked" |

## Scope

- Native: Today (read-only first, then moves), check-out with payment, staff
  notifications, a quick "message the owner" from a card, and a More tab of
  links to the website.
- The flyer look, as on the customer side: stripe, paper, status colours, hero
  type only on true empty and done states.
- New Swift files under `ios/SmarterDog/Staff*.swift` and tests under
  `ios/AuthCoreTests/Staff*Tests.swift`; a fixture generator under `scripts/`.

## Non-goals

- The calendar, new bookings (`create_staff_booking_group`), seat blocks,
  closures and extra slots. They carry the capacity rules and stay on the
  website.
- Customers and dogs editing, merging, reports, settings, inviting colleagues,
  the signup queue. Linked, not rebuilt.
- The full inbox in this plan's first four phases (see S5).
- Any new booking status, transition, write path or RPC. No change to the
  capacity engine or its trigger. Visit commands stay off (ADR 002).
- iPad layouts, Apple Watch, widgets, offline operation.

## Relevant code

- `ios/SmarterDog/RootView.swift` (`HomeRoot`): the staff placeholder this replaces.
- `ios/SmarterDog/HomeModels.swift`, `SupabaseHomeClient.swift`, `HomeView.swift`:
  the pattern for rows, selector, client and view.
- `ios/Package.swift`: logic files must be listed here to be tested on Linux.
- `SmarterDog.xcodeproj/project.pbxproj`: every new file must be registered.
- `src/engine/dayStack.ts`, `today.ts`, `salonBoard.ts` (`tokenActions`),
  `safetyOrder.ts`, `src/constants/statusPalette.ts`: the rules to mirror.
- `src/components/views/today/useBookingActions.ts`: what each move writes,
  the collection prompt, undo and the unpaid safeguard.
- `ios/AuthCoreTests/CapacityParityTests.swift` with `capacity-parity.json`: the
  shared-fixture pattern to copy for the day stack.
- `supabase/functions/notify-staff/`, `_shared/staffPush.ts`, `_shared/apns.ts`:
  where S4 adds APNs for staff.

## Architecture

- **Authority.** PostgreSQL decides every write (RLS, the three booking gates,
  the lifecycle triggers). The app mirrors rules only to decide what to *show*;
  a refusal from the database is final and shown plainly (ADR 001, ST-7).
- **One write path.** Status moves update `bookings` exactly as
  `useBookings.updateBooking` does, field for field. No new RPC and no third
  write path (REQ-AUTH-001 stays a known gap, not made worse).
- **Layers**, as on the customer side: `StaffDayRow` and friends (`Decodable`),
  `StaffDaySelector` (pure: ordering, timing line, safety words, legal moves),
  `StaffDayClient` protocol with `SupabaseStaffDayClient`, and SwiftUI views.
  Only the pure layer is in `Package.swift`.
- **Parity, not trust.** A Node script (`scripts/generate-staff-day-fixtures.mjs`) runs the website's engines on a governed
  fixture list and writes `ios/AuthCoreTests/staff-day-parity.json`; a Swift test
  checks the Swift output equals it. A website change that breaks parity fails
  the iPhone tests (ST-4, ST-6).
- **Shared files with the parallel booking work:** `RootView.swift` (only
  `HomeRoot` changes, swapped for `StaffRootView`), `Package.swift` (source
  lists), `project.pbxproj` (file registrations) and the asset catalogue (new
  status colour sets). Rule: one writer at a time for `project.pbxproj`; merge
  `main` before each push; never reorder existing entries.

## Data/database changes

None in phases S0 to S3, S5 and S6. Phase S4 adds no table (`device_tokens`
already stores `role = 'staff'`), only server code and one new secret (a switch,
default off).

## API changes

None for S0 to S3: the app calls the tables and functions the website already
calls, with the staff JWT. S4 changes `notify-staff` to also send APNs to staff
device tokens when its new switch is on; web push is unchanged.

## UI changes

- **Tabs:** Today, Messages (from S5; until then hidden), More (links to the
  website and Sign out).
- **Today:** a date header with previous/next day and Back to today; day totals
  in words ("7 dogs · £284 taken", "Salon closed"); the stack of rows; tap a row
  for its details and, from S2, its moves. Pull to refresh and refresh on
  returning to the app.
- **States:** loading (neutral, still), empty open day, closed day, failed load
  with Try again (ST-13). No branded loading effects.
- **Accessibility:** every row is one button whose accessible name carries time,
  dog, status, balance and warnings; 44pt targets; Dynamic Type grows rows
  rather than truncating warnings; Reduce Motion removes any animation.
- **Look:** the stripe at the top, paper background, white cards, one hue per
  status from `statusPalette.ts` as new colour sets, yellow only for the lead
  move.

## Security/privacy considerations

- Staff only: every staff screen sits behind `.staff`; RLS (`is_staff()`) is the
  real check, not the app.
- No service-role key, no new secret in the app. Customer data stays in memory;
  nothing is cached to disk beyond what the Supabase client already keeps for the
  session.
- Notifications (S4): staff web push today names the customer and dog
  ("Sam booked Full Groom for Bella", `buildStaffPushMessage` in
  `_shared/staffPush.ts`). A phone's lock screen is seen by more people than a
  browser tab, so how much detail an iPhone notification shows is the owner's
  call (Open question 4). Phone numbers and notes never appear either way.
- Logging: no customer data in logs; errors report the operation, not the row.

## Dependencies

- Staging project with a test staff account and seeded bookings, for S2 onwards
  (Open question 2).
- Apple: APNs key and the push capability on the App ID for S4 (shared with the
  customer push work).
- The parallel booking session's merge order for shared files.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Staff keep using the website and the app goes unused | Wasted effort | Gate after S1 and S2 on real use (Open question 1) |
| Swift rules drift from the website | Wrong moves or timings shown | Shared parity fixtures fail the iPhone tests on drift |
| A move writes something the website would not | Bad data in live bookings | Field-for-field copy of `updateBooking`, tested against staging before TestFlight |
| Unpaid collection or a lost payment on undo | Money missing from takings | S3 ports the check-out chain and its undo rules with tests; no bare Collected |
| Merge conflicts in `project.pbxproj` with the booking work | Broken Xcode build | One writer at a time; merge `main` first; Xcode Cloud build on every PR |
| Views cannot be compiled or seen from Linux | Bugs found late | Keep views thin; owner checks each TestFlight build against a written checklist |
| Lock-screen notifications show customer details to anyone near the phone | Privacy | The owner chooses the detail level (Open question 4); a payload test enforces it and bans phone numbers and notes |

## Migration/rollout

Each phase: merge to `main`, Xcode Cloud builds an internal TestFlight build, the
owner checks it against that phase's checklist, then the next phase starts.
Nothing reaches customers: staff screens only show for staff accounts. S4's
switch stays off until the owner turns it on after a TestFlight check. Rollback is
the previous TestFlight build; S4 also has its switch.

## Implementation sequence

**S0. Shell and look (no data).** Swap `HomeRoot` for `StaffRootView` with Today,
More; More links to the website pages (ST-12). Add the status colour sets. Files:
`StaffRootView.swift`, `StaffLinks.swift`, asset catalogue, `RootView.swift`,
`project.pbxproj`. Test: link targets in a pure `StaffLinks` test.

**S1. Today, read-only.** Rows, selector, client and view; London date; day
totals; states. The parity script and fixtures. Delivers ST-1 to ST-5, ST-12,
ST-13. Tests first: `StaffDaySelectorTests` (ordering, two dogs one slot, safety
order, timing line, closed day, London date across BST), `StaffDayParityTests`.
Hand-off: TestFlight checklist; owner's go/no-go on S2.

**S2. Status moves.** Legal moves from a Swift `tokenActions` (parity-tested),
the writes, the ready prompt (Send via `whatsapp-send` / `sms-send`, or Not now),
undo, Didn't show and They turned up, realtime updates. Delivers ST-6 to ST-8,
ST-10. Tests: action lists per status (parity), write payloads equal the
website's, a refused write leaves the row unchanged. Staging check before
TestFlight.

**S3. Check-out with payment.** The check-out chain (amount due, method, one
write), its undo rules. Delivers ST-9. Tests mirror `checkoutChain` and
`nextCheckoutStep`; staging check of takings after undo.

**S4. Staff notifications.** Register the staff device token; `notify-staff`
sends APNs to staff tokens behind a new switch (default off); tapping opens the
booking or conversation. Delivers ST-11. Tests: Deno tests for the payload (the
owner's chosen detail level, never a phone number or note) and the switch; Swift test for deep-link routing.

**S5. Messages (decide after S4).** Read the inbox; reply only where the rules
are unambiguous, or hand off to the website. Its own design check first, because
the channel rules ([app inbox](../../app-inbox.md)) are where a wrong send does
harm.

S0 and S1 are serial. S2 needs S1; S3 needs S2. S4 can run beside S2 or S3 (it
touches server code and one Swift file). S5 waits for the owner.

## Testing

- `swift test --package-path ios` on Linux (CI `ios-auth`), and locally with the
  `swift:6.0.3-noble` image, for every selector and parity test.
- `node scripts/generate-staff-day-fixtures.mjs --check` in root CI so a website engine
  change cannot land without regenerating the iPhone fixtures.
- Xcode Cloud build on every PR that touches `ios/`; the owner's TestFlight
  checklist per phase (what to tap, what should happen).
- S2 and S3: a scripted check on staging with the test staff account (write,
  read back, undo) before TestFlight. Never against production.
- S4: `deno test` for `notify-staff` and the payload builder.

## Observability

- Sentry is not in the iPhone app yet; failures show to staff and are logged
  without customer data. Adding crash reporting is a separate decision.
- Writes are visible in the existing `booking_events` and the staff calendar;
  notifications in `notification_log` (`channel = 'apns'`).

## Documentation updates

- [API contract](../../ios-api-contract.md): mark which staff screens are native
  and which link out; add the staff push section in S4.
- [`ios/README.md`](../../../ios/README.md): what staff see, and each phase's
  TestFlight checklist.
- [Today command centre](../../today-command-centre.md): note the iPhone mirror
  and its parity fixtures.
- [Flyer visual language](2026-11-22-flyer-visual-language.md): close "staff
  screens" in step 4 when S1 ships.
- `CHANGELOG.md` per phase.

## Definition of done

- Each phase merged with CI green (including `swift test` and the parity check),
  an Xcode Cloud build, and the owner's TestFlight checklist ticked.
- ST-1 to ST-13 each shown by its scenario, on staging for writes.
- No new write path, RPC or status; the database refuses what it refused before.
- Docs above updated; the plan moved to `completed/` with the PRs linked.

## As built

**S0 and S1 (24 November 2026).** The staff placeholder is replaced by
`StaffRootView` (Today, More). Today reads one London date
(`SupabaseStaffDayClient`), turns the rows into bookings the way the website's
row transform does (`StaffDaySelector`), and draws the stack
(`StaffDayStack`, `StaffTodayView`): order, status word and colour, safety
order, the timing line, day totals, previous/next day, pull to refresh,
refresh on return to the app, timings that move on each 30 seconds, a details
sheet, and truthful loading, failed, closed and empty states. More opens the
staff website pages and has Sign out. Delivers ST-1 to ST-5, ST-12 and ST-13.

Changes from the sequence above, and why:

- **Parity guard:** a Vitest test (`src/engine/staffDayParity.ios.test.ts`)
  instead of a separate script, following the capacity engine's existing
  pattern. It writes `ios/AuthCoreTests/staff-day-parity.json` from the real
  website engines (nine governed days, safety order, durations, surnames, the
  status palette) and fails when stale. Two deliberate breaks of the Swift copy
  (the late grace, the Pregnant rank) were each caught by `StaffDayParityTests`.
- **Status colours as data**, in `StaffStatusPalette.swift`, not 36 asset
  colour sets: they mirror the website's palette and the parity test checks
  every value. `iosColourType.test.ts` now covers the two staff screens, which
  carry no hex themselves.
- **No money in S1.** The strip's balance and the day's takings fall back to the
  full pricing engine when no amount is recorded. That port belongs with
  check-out, so it moves to S3; the row's VoiceOver label omits the balance
  until then.
- **Two confirmation differences, documented, not mirrored yet:** the website
  turns a failed reminder delivery into Unconfirmed (`applyReminderFailures`,
  fed by the delivery-failure store) and a typed WhatsApp "yes" into Confirmed
  (`applyChatConfirmations`, fed by the inbox). S1 reads neither, so those two
  cases differ; the details sheet tells staff to check the inbox before chasing.
  Folding them in needs the inbox and failure reads S2 or S5 bring.

Review follow-up (Codex on #1294): the More tab's Calendar link adds
`?calendar`, which the website's once-per-tab landing on Today now respects
(`src/routing/todayLanding.ts`, used by `src/App.jsx`), so a fresh browser tab
opens the calendar; and a row's safety warning wraps at accessibility text
sizes instead of being cut off.

Verification: `swift test --package-path ios` in the `swift:6.0.3-noble` image
(186 tests, 0 failures, 28 of them new); the parity and iPhone project tests in
Vitest. The SwiftUI views cannot be compiled on Linux: the Xcode Cloud build and
the TestFlight checklist in `ios/README.md` are the evidence still to come.

## Open questions

1. **Is a native staff app worth it, given staff already use the website on
   their iPhones?** This plan bets yes for the salon floor only. The owner
   decides after S1 and again after S2.
2. **Staging:** may we seed the staging project with a test staff account and
   sample bookings for S2 and S3 checks? (Shared with the booking plan's
   question 1.)
3. **Payments in S3:** which methods do staff take (cash, card on a separate
   reader, bank transfer)? The app records the method; it does not take card
   payments itself.
4. **Notifications (S4):** which events should buzz a staff phone (every new
   message and booking change, as web push, or a smaller set), and should the
   lock screen show the customer's and dog's names, as web push does, or only
   "New message" / "Booking changed" until the phone is unlocked?
