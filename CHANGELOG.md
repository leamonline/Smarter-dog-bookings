# Changelog

This changelog records meaningful completed product, architecture and operational changes from 9 August 2026 onwards. Earlier history remains available in Git and the repository's dated plans and runbooks; it has not been reconstructed as release history.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) where useful. The project does not currently publish numbered releases, so entries are grouped under `Unreleased` until a release convention is adopted.

## Unreleased

### Security

- Pin `search_path` on `public.slots_are_hhmm(text[])` and
  `public.deposit_reference_for(uuid, date)`, closing the last two Supabase
  security-advisor findings that were not deliberate. Both are SECURITY
  INVOKER, so this is defence in depth rather than a privilege-escalation
  fix, and behaviour is unchanged — neither body references a table, view or
  user-defined function, only `pg_catalog` built-ins. Applied to production
  before merge, per the repository's database workflow; the advisor now
  reports 111 findings rather than 113, with the `function_search_path_mutable`
  category gone entirely and nothing new appearing.
- Classify every `bookings` column that travels in a notification payload, and
  close out the data-exposure audit's only finding by rejecting its obvious
  fix. The audit flagged `resend-booking-notification`'s `select("*")`;
  acting on it surfaced that the Postgres triggers forward the identical row
  (`row_to_json(NEW)`, all 46 columns) on every status change, so narrowing the
  one manual path would have reduced exposure by almost nothing while making
  the two payload shapes diverge. What the enumeration did earn is a guard: all
  46 columns are classified, the 14 consumed ones are recomputed from the
  consuming sources so the classification cannot drift, and adding a column to
  `bookings` — or narrowing one path alone — now fails the build. No runtime
  behaviour changes; the silent forwarding of new columns is what got fixed.
- Add runtime gate tests for `calendar-ics`, completing runtime coverage of
  the feed-token family. Same serve()-shim split, handler unchanged; five Deno
  tests (no database, no network) prove the method and missing-parameter gates
  reject before any lookup — including when a token is supplied, so guessing a
  booking id reaches nothing — and that an unvalidatable token never yields an
  .ics, nor a `text/calendar` content type. Its 403 ownership gate (a customer
  token may read only that customer's booking) is documented as deliberately
  out of scope: reaching it needs a real token row and booking, the same class
  of gap as the one criterion left open on the Edge Function auth audit.
- Add runtime gate tests for `customer-phone-on-file` — the third and final
  shortlist entry, and the odd one out: a deliberately public pre-auth login
  helper whose only defences are an origin allowlist and a two-tier rate
  limit, answering at most two booleans. Same serve()-shim split, handler
  unchanged; five Deno tests (no database, no network) prove the method,
  JSON and phone-shape gates reject before anything is counted or queried,
  and pin the property that makes a public enumeration oracle safe to
  operate: the rate limiter fails CLOSED — an unreachable rate-limit store
  yields 429, never an `on_file`/`has_password` answer.
- Add runtime auth-gate tests for `calendar-feed` — a URL-borne token guards
  every customer's bookings (staff feeds include owner names), so its gate is
  the second shortlist entry. Same serve()-shim split, handler unchanged; four
  Deno tests prove the method and missing/empty-token refusals precede any
  lookup, and that an unvalidatable token — including when the token store is
  unreachable — never yields calendar data: a database outage must degrade to
  refusal, not to an open feed.
- Add runtime auth-gate tests for `apply-customer-confirm` — the
  highest-blast-radius internal-secret endpoint, whose check is the only gate
  on the autonomous booking path. `index.ts` becomes a `serve()` shim with the
  unchanged handler exported from `handler.ts` (the whatsapp-agent pattern);
  six Deno tests prove missing, wrong, near-miss and empty credentials are
  refused, and the correct one advances to body validation, all before any
  Supabase client exists — no database, no network. New functions must now be
  born in this shape (`docs/edge-function-auth.md` § Adding a function).
- Strengthen the Edge Function auth-contract guard (`check:edge-auth`) from
  substring matching to verdict-flow analysis: each required auth primitive is
  now parsed and its result must reach an if-guard that returns or throws —
  directly, through a captured variable, or through a named helper returned to
  a guarded call site. A check whose result is discarded, a guard that no
  longer exits, or a mention that survives only in a comment now fails the
  build; shapes the analysis cannot follow fail closed. `buildAllowedOrigins`
  is the declared `flowOnlyPrimitives` exception — its verdict becomes CORS
  headers, not an early exit. All 27 deployable functions pass; the audit that
  accompanied the change found no decorative check in production.

### Removed

- Remove the human merge-control attestation entirely: the publisher workflow,
  the evaluator script, its three test suites, the pull-request template block
  and every instruction to use it. **No merge gate replaces it** — `main` is
  unprotected and auto-deploys to production, so merge authority is now CI
  evidence plus the judgement of whoever merges. The runbook and design are kept,
  marked retired, because dated evidence packs link to them.

### Changed

- Route the staff calendar-feed settings through a data hook (Debt #12
  burn-down, fourth slice): `views/settings/CalendarSettings.jsx` no longer
  imports the Supabase client. The calendar-feed implementation is now one
  client-agnostic core (`calendarFeedActions`) shared by
  `useCustomerCalendarFeed` and a new `useStaffCalendarFeed`, with each hook
  binding its own client so the two auth sessions stay separate. Same
  truthful-state improvement as the customer modal: with no client the staff
  tab shows its "Unable to generate feed URL" state instead of loading
  forever. ESLint burn-down allowlist 22 → 21.
- Route the customer calendar-feed actions through a data hook (Debt #12
  burn-down, third slice): `AddToCalendarButton.tsx` and
  `CalendarSubscribeModal.tsx` no longer import the Supabase client — token
  fetch, Edge-Function URL construction and token revocation live in a new
  `useCustomerCalendarFeed` hook. One truthful-state improvement: with no
  Supabase client the subscribe modal now shows its "Unable to generate
  calendar link" state instead of spinning forever. ESLint burn-down
  allowlist 24 → 22; the whole customer dashboard folder is now client-free.
- Route customer dog create/edit through the repository layer (Debt #12
  burn-down, second slice): `DogsSection.jsx` and `booking/AddDogInline.tsx`
  no longer import the Supabase client — both write through a new
  `useCustomerDogActions` hook over `dogsRepo`, where the snake_case↔camelCase
  mapping for `update_customer_dog` now lives (`updateForCustomer` returns a
  deliberate partial so fields the RPC doesn't return, like the pregnancy
  flag, survive an edit). `TrustedHumansSection.jsx`, which had no client
  usage left, also came off the ESLint burn-down allowlist (27 → 24). No
  behaviour change for customers.
- Route the customer dashboard's data access through the repository layer
  (Debt #12/#13 burn-down): `CustomerDashboard.jsx` and `BookingCard.jsx` no
  longer import the Supabase client or hand-build snake_case queries in JSX.
  A new `useCustomerDashboardData` hook owns dogs, the 180-day booking window,
  older pages, trusted contacts and contact-detail saves over
  `dogsRepo`/`bookingsRepo`; BookingCard cancels via
  `useCustomerBookingActions` and reads deposit bank details via
  `useCustomerDepositSettings`. Bookings now cross the boundary as app-shaped
  `CustomerBookingSummary` objects (camelCase, joined dog snapshot), so a
  Postgres column rename can no longer silently break the portal, and both
  files left the ESLint `no-restricted-imports` burn-down allowlist. No
  behaviour change for customers.
- Record every confirm click that produced no booking in the database, with a
  governed failure code (#708). The 21 unexplained confirm failures were
  reported only through `logger.error`, which reaches nothing in production
  until Sentry is enabled — while the funnel table demonstrably works there,
  being how #708 was measured in the first place. The wizard now logs a
  `confirm_failed` funnel event on every failure path, on the same session id
  as the `confirm` it explains, carrying one of six observable categories
  (`gate_rejected`, `reschedule_rule`, `slot_taken_recheck`, `network_failed`,
  `server_error`, `unknown`) plus a truncated structured diagnostic. The set is
  governed by a CHECK mirroring `CONFIRM_FAILURE_CODES`, with a test pinning
  the two; the RPC drops unrecognised values to null rather than raising. A
  confirm with neither `booked` nor `confirm_failed` remains possible and
  remains a finding — navigation away, or network loss too total to log — so
  #708's Sentry criterion stands; this narrows the residue rather than
  replacing it. Migration `20260830223000`; no booking write-path change.

- Record **why** a booking-wizard step could not be completed, on the two
  steps that lose the most people. Measured against the clean window (after
  the per-attempt session fix on 23 August), the largest two drops are both
  at the front of the wizard, before anyone sees a price or a slot:
  `started → select_dogs` and `select_dogs → select_date`. The funnel could
  say where people left but never why.

  The new `blocked_reason` is written **only** when the wizard had nothing to
  offer — no dogs on file, every dog ineligible, or a first calendar page with
  no open day. It is never written to explain someone who had a usable choice
  and left anyway, because that is not observable and inventing it would put
  guessed intent into a table people will trust. An abandoned attempt with no
  reason is itself the finding: the customer had options and still went away.

  The vocabulary is governed by a CHECK constraint mirroring
  `FUNNEL_BLOCKED_REASONS`, with a test pinning the two together, so a typo
  cannot quietly invent a fourth category. The RPC drops an unrecognised value
  to null rather than raising — this is fire-and-forget telemetry, and a stale
  client must never cost a customer their booking; the CHECK is the backstop.
  Reasons are claimed once per attempt, because the blockers are evaluated on
  render and would otherwise bury their own signal in repetition.

- Rescope B3 (#623) from *canonical capacity evaluator and reason contract* to
  **guard capacity parity across runtimes**, on the evidence of the 129-case
  measurement: the capacity semantics do not diverge, PostgreSQL was correct in
  every case including the one the engine got wrong, and the single real defect
  was a TypeScript preflight ordering bug fixed in one function. The
  authoritative evaluator, any booking-spine migration and any change to the
  database capacity architecture are now explicitly out of scope, and the parity
  harness becomes the deliverable rather than a stepping stone. Rejection-reason
  alignment moves out entirely to its own issue (#665), specified but not
  started, because it is presentation rather than correctness and the
  customer-facing wording wants a product decision. B3 is also decoupled from
  B1/B2 — that serialisation existed because the migration spine is serial, and
  the rescoped B3 carries no migration; verified against the deliverable's
  actual imports and the pre-existing tables its database half touches. B4
  remains stopped behind the `RA-001` STOP. ADR 001 is reaffirmed, not
  superseded: PostgreSQL stays the capacity authority.

- Add a default-`HOLD`, exact-SHA human merge-control attestation and operator
  runbook for pull requests while `main` lacks native GitHub protection,
  including explicit migration disposition and post-merge check monitoring.
  (Superseded — removed 18 August 2026, see above.)

### Fixed

- Repair mis-encoded characters in production's `validate_booking_capacity()`.
  Seven sequences were double-encoded — UTF-8 decoded as Latin-1 at some point
  in that function's hand-apply history — of which **three are `raise
  exception` messages that reach callers**, so any surface showing the raw
  database message showed `â` where an em dash belonged. No committed
  migration has ever contained the corruption: it entered through a manual
  production apply, and the repository has always held the correct text —
  `035_capacity_behaviour.test.sql` already asserts the clean string with
  `throws_ok`. Proven text-only rather than asserted: production's body,
  once both sequences are normalised, hashes identically to the definition
  local-from-migrations and staging both carry (`2aaa6590…`, 13086
  characters on all three). The migration derives the repair from the
  deployed definition by character substitution instead of retyping the
  348-line body, so "no logic change" is a property of the mechanism, not a
  promise, and it refuses rather than guesses on any unrecognised sequence or
  drifted body. Client behaviour is unchanged either way — `mapDenialReason()`
  matches on substrings that never span the corrupted character, and the
  wizard maps on `error.code`. No stored `booking_denials` row was affected,
  and this was the only affected function in the database.

- Stop the booking wizard offering a slot pair the database refuses
  ([#664](https://github.com/leamonline/Smarter-dog-bookings/issues/664)). Two
  large dogs booked together could be offered the 08:30 drop-off, and the
  capacity trigger then rejected the write — a journey that dead-ended after
  the interface said yes. The rule was not missing: `findGroupedSlots()`
  already checked every placement through `canBookSlot()`. It validated them
  **incrementally against a partial day**, while the large-dog conditional is
  **directional** — booking 09:00 inspects 08:30, but booking 08:30 does not
  inspect 09:00 — so placing the pair 09:00-first passed step by step and
  produced a finished allocation that was invalid. PostgreSQL never had the
  problem, because its trigger evaluates the whole day on every insert. The fix
  re-checks each completed allocation as a whole, reusing the existing rules, so
  it can only remove offers the database would have rejected; no rule, policy or
  schema changes. Applied to the browser engine and its Deno mirror, with the
  trigger untouched. Found and proven closed by the parity harness, and pinned
  by a regression test asserting the general property rather than the one slot
  pair.

### Testing

- Close the three coverage gaps the rescoped B3 named, taking the capacity
  parity harness from 129 cases to **162** — blocked seats against large dogs,
  and grouped allocation onto blocked-seat, extra-slot and mixed-size days.
  **All 162 agree.** A hypothesis went in and came out wrong, which is the
  useful part: the two runtimes reach the blocked-seat answer by different
  routes — PostgreSQL subtracts blocked seats generically *before* the
  large-dog branch, while the engine floors a slot at two seats and handles
  large-dog rules in a separate pass — and since #664 was an ordering defect,
  a 12:30 large dog against one blocked seat looked like a strong candidate for
  divergence. It is not; the arithmetic agrees throughout. One asymmetry did
  surface and belongs to #665 rather than here: with **both** seats blocked,
  PostgreSQL refuses from `validate_booking_calendar()` while the engine
  refuses on capacity — same verdict, different gate, so the reason space spans
  all three `BEFORE INSERT` gates.
- Add `scripts/generate-capacity-parity-cases.ts`, so the pgTAP half of the
  harness is generated rather than hand-written. It takes the engine's answer
  from `src/engine/capacity.ts` and **observes** PostgreSQL's by attempting the
  insert in a rolled-back transaction, so a `throws_ok` records what the
  database actually did instead of what anyone assumed; it reports a divergence
  rather than quietly encoding one. The file's own comments already said
  "regenerate the SQL" with nothing in the repository able to do it.

- Add a cross-runtime capacity parity harness and measure the divergence
  between the browser engine and PostgreSQL — the one leg of the three-way
  capacity duplication nothing had ever compared. 43 scenarios yield **129
  cases**: 26 single-booking verdicts that must match, and 15 grouped
  multi-dog scenarios yielding 103 cases where the question is stronger and
  directional — *every allocation `findGroupedSlots()` offers must be one the
  database accepts*. Coverage spans per-slot seats, the 2-2-1 window,
  large-dog seat cost and adjacency, early close, blocked seats, extra slots,
  the daily cap, and grouped allocation across all three dog sizes onto empty,
  partly-full, cap-constrained and block-constrained days.

  The deeper coverage earned its keep immediately: it found the ordering defect
  fixed above, which 17 scenarios had missed. **All 129 cases now agree** —
  26/26 singles and 101/101 grouped offers. It also produced a correction worth
  recording: an apparent second divergence (the engine offering nothing for five
  small dogs while the database would accept 2+2+1) was **not** a defect.
  Grouped booking is a documented 1–4 dog journey and the wizard enforces it, so
  a customer cannot select a fifth; the fixture was asking a question the
  product forbids, and the database has no concept of a booking group to compare
  against. It was replaced with the real four-dog boundary.

  An empty divergence register remains, so a future disagreement has to be
  recorded deliberately rather than absorbed silently. Immediate slots and staff
  overrides are excluded with reasons stated. Measurement, limits and what it
  means for #623 are in
  `docs/research/2026-08-19-capacity-parity-measurement.md`.
- Refactor the local PostgreSQL concurrency gates around one guarded,
  reusable real-session driver with tracked client PIDs and portable bounded
  TERM-to-KILL cleanup, while preserving the accepted WhatsApp and capacity
  race scenarios.
- Add focused PostgreSQL capacity behaviour coverage and genuine local
  same-slot and daily-cap race gates, preserving PostgreSQL as the final
  booking authority.

### Documentation

- Add a `SessionStart` hook that provisions the local database-test stack for
  Claude Code on the web: Node 24 on `PATH` (the container defaults to 22, so
  `npm ci` fails on `engines.node` before doing anything useful), npm
  dependencies, the Docker daemon, the Supabase CLI, and a pre-pull of the
  Postgres and `pg_prove` images. Without it a fresh web container cannot run
  `supabase/tests/*.test.sql` at all — pgTAP ships inside the Supabase Postgres
  image rather than as a host package — so an agent had to fall back to a hosted
  project, which is slower, less reproducible and touches a shared environment.
  The CLI is installed from npm because the agent proxy returns 403 for
  `api.github.com`, making the usual release-tarball route unavailable.
  The daemon step also clears a stale `containerd` left by an earlier session —
  `dockerd` finds the orphan, cannot use it and times out — and retries once.
  It deliberately does **not** start `containerd` itself: this sandbox drops
  `cap_sys_resource`, so a shell-started `containerd` makes every container fail
  with `error setting rlimit type 7: operation not permitted`. Verified both
  ways; the comment in the hook says so, because the tidier-looking version is
  the broken one.

- Establish a repository project-memory system with a North Star, dependency-aware roadmap, product requirements, current architecture, decision records, planning standard, agent guidance, reusable prompt library and GitHub contribution templates.
