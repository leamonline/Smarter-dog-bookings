# User flows and current gaps

**Status:** Active
**Authority:** Current and target journey boundaries for issue #603
**Baseline:** `main@8eb8800fb345aeeba4887b266a4ff95a85fb7802`
**Last verified:** 9 August 2026

These flows describe observable product behaviour. They do not authorise policy
activation, production writes or customer contact.

## `FLOW-01` — staff reschedules an appointment

### Current

1. Staff uses a reschedule surface such as the modal, diary drag-and-drop or
   approval path.
2. Live code updates one or more `bookings` rows; the ordinary hook performs a
   direct row update.
3. The diary can show the new date/time.
4. No booking insert or cancellation notification trigger necessarily fires, so
   there is no durable visit-level reschedule message or complete delivery
   status.

**Gap:** appointment movement and customer contact are not one observable
operation. Multi-dog fan-in, idempotent replay and recovery are not governed at
one live boundary.

### Target B4

1. The client checks the named runtime capability.
2. A server command resolves the visit, membership and expected revision.
3. Ambiguous membership returns `visit_review_required`; nothing moves, no
   notification intent is created, and staff receive a manual-contact action.
4. A valid single- or multi-dog appointment moves atomically and returns the
   existing typed visit receipt plus notification linkage.
5. The same transaction creates one B2 intent with snapshotted recipients and
   channel policy.
6. The UI shows **appointment moved** separately from **message pending, sent,
   failed, retryable or unknown**.
7. A safe delivery retry claims the existing intent; it never repeats the move.

**Requirements:** `REQ-OPS-001`, `REQ-OPS-002`, `REQ-NOT-001`, `REQ-NOT-002`,
`REQ-NOT-003`, `REQ-REL-001`, `REQ-A11Y-001`, `REQ-PERF-001`.

## `FLOW-02` — customer changes an appointment

### Current

The customer dashboard lists every upcoming appointment in date/time order,
including every dog, service, drop-off time and outstanding per-dog deposit.
Cards follow the existing customer command boundary: booking group plus date;
ungrouped bookings remain separate even when their times or visit IDs match.
Reschedule and cancellation confirmations name the dogs on the selected card.
This display correction is tracked in [issue #854](https://github.com/leamonline/Smarter-dog-bookings/issues/854)
and does not switch customer reads or writes to the dormant visit commands.

The customer portal and WhatsApp Flow have existing change paths. The repository
also contains visit projections and v1 customer commands, but the v1 mutation
commands are dark while `previous_day_1500_v1` is inactive.

**Gap:** the architecture is mixed, but that is not permission to switch a live
customer caller during the staff-reschedule slice.

### Target for this roadmap

1. Existing customer behaviour does not regress during A0–B4.
2. B4 changes only staff rescheduling and its message outcome.
3. A later #609 package reconciles data, proves shadow reads and migrates
   customer callers deliberately.
4. Policy activation, if ever approved, follows its own Terms, effective-instant,
   monitoring and rollback protocol.

**Requirements:** `REQ-AUTH-001`, `REQ-POL-001`, `REQ-RETIRE-001`.

## `FLOW-03` — a channel checks capacity and commits

### Current

1. Browser or Deno code preflights availability for responsiveness.
2. Different consumers can carry mirrored constants or simplified semantics.
3. PostgreSQL rechecks at write time and is the final authority.
4. A stale race can therefore reject an apparently available slot, and reason
   wording can differ by channel.

**Gap:** not every runtime shares one versioned eligibility and reason contract;
the AI preflight is simplified.

### Target

1. A1 proves approved PostgreSQL behaviour and real two-session races.
2. B3 exposes the canonical eligibility/reason contract without changing the
   approved business rules.
3. Browser, Flow and AI render or preflight from that contract or an automatically
   generated mirror.
4. PostgreSQL still rechecks under concurrency and can reject a stale quote.
5. Customer-safe availability contains no customer names, notes or internal
   overrides beyond the permitted projection.

**Requirements:** `REQ-CAP-001`, `REQ-CAP-002`.

## `FLOW-04` — notification delivery fails or becomes uncertain

### Current

`notification_log` records useful booking-trigger delivery states and provider
identifiers for several messages. It is not one governed visit-operation intent
with append-only attempts, and staff reschedule does not create that intent.

### Target B2/B4

1. A committed reschedule creates one intent.
2. A worker claims it once and appends each provider attempt.
3. A confirmed provider acceptance records the provider ID and advances state.
4. A retryable rejection uses bounded backoff; a permanent rejection becomes
   visible staff work.
5. A worker crash or uncertain provider response becomes `delivery_unknown`.
6. Unknown delivery is reconciled by staff or provider evidence before retry;
   the system does not risk a duplicate message automatically.

**Gap closed:** database success and message success are independently truthful.

**Requirements:** `REQ-NOT-001`, `REQ-NOT-002`, `REQ-NOT-003`, `REQ-PERF-001`.

## `FLOW-05` — release a migration-dependent capability

### Current

1. Frontend and Edge code can deploy automatically.
2. PostgreSQL migrations are applied separately.
3. A migration-applied check exists, but runtime code has no generic named
   capability response.
4. Pull-request Playwright is skipped, all configured projects use Chromium,
   and local versus CI Edge gateway behaviour can differ.

### Target

1. A4 browser tests run critical production-build journeys in Chromium and
   WebKit and prove the gate can fail.
2. A4b proves the exact hosted Supabase project before any write-capable command.
3. B1 reads a small server-owned capability projection.
4. Missing capability produces an actionable unavailable state before privileged
   work; it does not silently fall back when semantics differ.
5. Release evidence records exact app, Edge, schema and relevant external
   prerequisite generations.

**Requirements:** `REQ-REL-001`, `REQ-REL-002`, `REQ-SEC-001`, `REQ-CI-001`.

## `FLOW-06` — AI assists with an Inbox reply or booking proposal

### Current

1. A known customer receives AI generation only from an explicit staff action.
2. Draft risk and hand-off rules decide whether human review is required.
3. Auto-send requires the global flag, per-conversation opt-in and low-risk
   allowlist eligibility; relevant flags default off.
4. Autonomous booking additionally requires its global and conversation flags,
   a known customer, supported intent, high confidence and recognised dog size.

### Target for this roadmap

- Preserve human-review defaults and fail-closed flags.
- A2 describes capability truthfully.
- B3 replaces simplified capacity preflight with the canonical contract.
- Do not broaden auto-send or autonomous booking as part of architecture
  convergence.

**Requirements:** `REQ-AI-001`, `REQ-CAP-002`, `REQ-UX-001`.

### Mobile reply visibility

Opening a conversation on a phone replaces the Inbox page heading with the
thread's own Back control. The composer stays below the message and draft
scrollers; its text area scrolls internally when the visible viewport is short.
On very short viewports, the conversation header can also scroll to expose its
actions. Resizing or opening/dismissing a keyboard preserves the selected
conversation, reply text and navigation history. While a text field has focus and
the on-screen keyboard has shrunk the visible viewport, the phone toolbar and
nav strip step aside so the conversation keeps most of its height; the thread's
own Back control remains, and the chrome returns the moment focus leaves.
Pinch-zoom never hides the chrome, because nothing is being typed into.
Because iOS reports the visual viewport as the keyboard starts to move and not
when it lands, every keyboard measurement is re-read a few times over the
following second, and the message log re-pins to the newest message as it
shrinks. Keyboard regression tests simulate visual-viewport resize and pan,
including a late-landing keyboard; a physical iPhone check remains part of
release verification. For that check, opening `/staff/inbox?vvdebug=1` shows a
geometry-only readout (build, visual viewport, scroll offsets, composer
position) pinned to the visible area, and sends the same figures to Sentry a
second after a text field gains or loses focus; `?vvdebug=0` turns it off.

## `FLOW-07` — a new or changed Edge Function is released

### Current

Functions rely on distributed in-function session, HMAC, shared-secret or
webhook-signature checks while CI deploys with gateway JWT verification disabled.
There is no complete manifest that fails discovery when a function is omitted.

### Target A3

1. Discovery identifies every deployable entry point.
2. Its manifest states caller, gateway mode, in-function authentication, role,
   replay/signature protection, service-role use, origins and expected denial.
3. Table-driven tests reject missing, wrong, replayed or under-privileged calls
   as applicable.
4. Local config and CI deployment are checked against the same contract.

**Requirements:** `REQ-SEC-001`, `REQ-REL-002`.


## Staff reviews a new customer signup

Implemented for issue #782, verified against synthetic data and merged on
5 September 2026; no production customer data was used for verification. See the
[completed implementation plan](../plans/completed/2026-09-05-customer-approval-queue.md).

1. Open Humans. Awaiting approval shows an exact count and oldest-first queue,
   independent of directory search, filters and loaded directory pages.
2. Review a customer in the side panel (full screen on mobile). All active dogs
   load before approval becomes available. Existing authoritative sizes are
   selected; customer-reported sizes are informational.
3. Choose Small, Medium or Large for each dog. Save for later persists the
   choices made so far and leaves the signup pending. Closing with unsaved
   choices offers explicit discard or continued review.
4. Save sizes and approve persists changed sizes, then invokes the existing
   staff approval RPC. Conditional writes reject changed breed/size/owner
   records. A failure can leave earlier dog sizes saved; reload shows the
   canonical state before another attempt. The database remains the final
   authority and can still reject a newly unconfirmed dog.
5. The receipt distinguishes customer approval from the welcome-message
   outcome. Provider acceptance is not delivery confirmation. Unknown outcomes
   require checking messaging before retrying; the panel does not resend.

Existing profile approval, rejection and duplicate-linking paths remain
available. No booking policy, database schema or notification delivery semantics
change in this flow.
