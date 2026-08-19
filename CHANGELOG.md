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

- Add a default-`HOLD`, exact-SHA human merge-control attestation and operator
  runbook for pull requests while `main` lacks native GitHub protection,
  including explicit migration disposition and post-merge check monitoring.
  (Superseded — removed 18 August 2026, see above.)

### Testing

- Add a cross-runtime capacity parity harness and measure the divergence
  between the browser engine and PostgreSQL — the one leg of the three-way
  capacity duplication nothing had ever compared. 43 scenarios yield **130
  cases**: 26 single-booking verdicts that must match, and 15 grouped
  multi-dog scenarios yielding 104 cases where the question is stronger and
  directional — *every allocation `findGroupedSlots()` offers must be one the
  database accepts*. Coverage spans per-slot seats, the 2-2-1 window,
  large-dog seat cost and adjacency, early close, blocked seats, extra slots,
  the daily cap, and grouped allocation across all three dog sizes onto empty,
  partly-full, cap-constrained and block-constrained days.

  **Singles agree 26/26. Group offers are accepted 101/102 — and the one
  exception is a customer-facing defect.** `findGroupedSlots()` offers two
  large dogs at 08:30 + 09:00; the trigger refuses it, and so does
  `canBookSlot()` in the same file, so the grouped path disagrees with its own
  sibling as well as with the database. It is reachable from the customer
  wizard, the staff workspace and the WhatsApp Flow. A second, milder
  asymmetry: the engine offers nothing for five small dogs on an empty day
  while the database accepts 2+2+1, costing availability rather than risking a
  failed booking.

  Both are pinned by name in a divergence register that fails once the
  behaviour changes, so a fix cannot leave a stale claim behind. Immediate
  slots and staff overrides are excluded with reasons stated. Measurement,
  limits and what it means for #623 are recorded in
  `docs/research/2026-08-19-capacity-parity-measurement.md`; no runtime or
  schema change is made on the strength of it.
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

- Establish a repository project-memory system with a North Star, dependency-aware roadmap, product requirements, current architecture, decision records, planning standard, agent guidance, reusable prompt library and GitHub contribution templates.
