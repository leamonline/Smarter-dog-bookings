# Legal-Risk Remediation Design

**Status:** Approved on 12 July 2026  
**Source audit:** `/Users/leamonline/Documents/Smarter Dog Legal-Risk Audit 2026-07-12.md`  
**Audited base:** `3df4b3a5a0bf5bc7373f3f64f40aea413062d9f6`  
**Implementation branch:** `fix/legal-risk-remediation`

## Goal

Remove the code-addressable legal and safety risks identified by the 12 July 2026 audit through staged, test-first changes. Database and server code remain authoritative for permissions, booking rules, prices, cancellation rules, communication preferences and privacy-sensitive processing.

## Delivery boundary

This programme may change repository code, tests, migrations, local documentation and CI configuration. It must stop before:

- applying any migration to production;
- writing or publishing substantive legal wording;
- changing supplier or processor consoles;
- inspecting identifiable customer records;
- making a factual claim about contracts, retention, transfers, lawful basis, statutory cancellation or fees that has not been approved by the relevant business owner or adviser.

Where a safe implementation depends on one of those actions, the product must disable the affected capability or expose a neutral unavailable state. It must not silently fall back to an insecure or misleading default.

## Chosen approach

Use staged, compatibility-first hardening rather than a feature freeze or a large compliance rewrite.

The sequence is:

1. close active authorisation and integrity bypasses;
2. make persisted settings authoritative across runtime paths;
3. centralise communications and privacy-sensitive processing;
4. make customer commitments reproducible and accessible;
5. add lifecycle and accountability controls;
6. complete or record external operational and professional actions.

This approach preserves the existing React, repository/RPC and Supabase Edge Function boundaries. It replaces broad permissions and duplicated policy decisions with narrow server-owned interfaces.

## Global constraints

- Use UK English for customer and staff copy.
- Follow test-driven development: every behaviour change begins with a failing regression test.
- Treat Postgres/RLS/RPCs as the final authorisation and business-rule boundary.
- Derive customer identity and ownership from the authenticated session, never from a caller-selected subject ID.
- Keep migrations idempotent and include explicit function `REVOKE`/least-privilege `GRANT` statements.
- Apply database migrations before code that depends upon them; production application is outside this implementation scope.
- Never restore a broad customer permission as a rollback technique. Disable the affected feature instead.
- Do not expose service-role credentials, raw security tokens or personal data in browser code, telemetry or tests.
- Use synthetic fixtures and offline browser journeys only.
- Preserve existing customer opt-outs; no remediation may infer re-consent or re-enable a suppressed channel.
- Existing service behaviour may continue only where it can be represented accurately and enforced server-side.

## Architecture

### 1. Narrow customer command surface

Authenticated customers must not directly mutate security-, safety- or contract-relevant columns.

- Remove broad customer `UPDATE` permission on `humans` and replace it with field-specific RPCs for permitted profile changes.
- Approval, approval actor, source, signup submission, archive, audit and ownership-link fields remain immutable to customers.
- Remove raw customer `INSERT` permission on `dogs`. The customer dog RPC accepts only declared customer fields.
- Store customer-reported size separately from staff/server-authoritative capacity size. A dog without an authoritative capacity size cannot be booked through a customer path.
- Remove broad customer cancellation updates. A single cancellation RPC accepts only a booking or group identifier and a reason, derives ownership, rereads policy, updates cancellation fields atomically and returns a durable receipt.

### 2. Verified trusted-contact invitations

Direct phone lookup and relationship creation are replaced by a pending invitation lifecycle.

- The inviter receives a generic result that does not reveal whether the phone belongs to an existing customer.
- Invitations contain a random single-use secret whose stored representation is a hash, an expiry, attempt counters and an auditable status.
- Acceptance requires an authenticated account whose verified phone matches the invitation target.
- Only acceptance creates `human_trusted_contacts`; rejection, expiry and revocation create no live relationship.
- Per-inviter and per-target rate limits prevent probing and abuse.
- Until this lifecycle is complete and tested, the customer trusted-contact creation UI and callable RPC remain disabled.

### 3. Authoritative customer runtime configuration

Introduce one versioned customer-safe configuration RPC. It returns only fields needed by the portal:

- booking window and bookable portal state;
- cancellation availability and minimum notice;
- auto-confirmation behaviour;
- safe notification event/channel choices;
- server-owned guide prices in pence and their version;
- approved legal-document references and hashes;
- a configuration version suitable for booking snapshots.

Customer booking and cancellation RPCs reread the same source inside the transaction. They never trust settings, prices, deadlines, policy versions or permissions supplied by React.

If the RPC or required configuration is unavailable, the portal presents a plain unavailable state and does not permit a write.

### 4. Reproducible booking commitments

Booking creation computes and stores:

- the server-resolved displayed guide price and price basis;
- price/configuration version;
- approved terms version and content hash when available;
- a random, durable group reference distinct from date and time;
- confirmation state derived from authoritative auto-confirm settings.

The portal, WhatsApp and staff paths consume the same price resolver. Unknown or unapproved fee wording is not added by engineering. Where no approved price method exists, the UI describes the value only with already-approved neutral terminology or disables commitment.

### 5. Shared communications policy

Every SMS, WhatsApp and email sender must call one dispatch-policy module before reaching a provider helper.

The policy receives the recipient, event and declared purpose and checks:

- whether that event is enabled;
- which channels are enabled for it;
- whether the recipient is suppressed for the channel and purpose;
- whether an idempotency reservation already exists;
- whether the message is service communication or marketing.

No direct provider import may bypass this boundary. Signed inbound STOP messages update channel suppression with source, time and reason before any subsequent send. Re-opt-in is a separate, explicit, auditable action; unrelated inbound contact cannot infer it.

Provider failure does not reverse a completed booking or cancellation. It creates a durable failed-delivery record and a staff-visible recovery path.

### 6. Indistinguishable phone authentication start

Pre-authentication phone handling must not reveal membership or password state.

- Turnstile is verified by the Edge Function, not only by React.
- Rate limits use atomic fixed-window counters and pseudonymised phone/IP bucket identifiers with short scheduled retention.
- The unauthenticated response has the same status and public shape for known and unknown numbers.
- Password-state information is available only after verified authentication.
- Password and OTP failures use equivalent public error treatment without disabling legitimate self-signup.

### 7. Device-storage minimisation

- Onboarding, profile, contact, address, welfare, vet and note fields remain in memory and are not persisted automatically.
- Minimal booking progress may use user-namespaced `sessionStorage`, never cross-account `localStorage`.
- Sign-out, account change, successful completion, explicit cancellation and expiry clear all Smarter Dog draft namespaces.
- Draft fixtures contain no full address, contact details, microchip, vet, medical/welfare notes or alerts.

### 8. AI minimisation and note approval

All Anthropic requests pass through task-specific payload builders.

- Apply explicit allowlists, transcript limits and deterministic redaction.
- Exclude raw contact details, addresses, database identifiers and unrelated CRM notes/alerts.
- Use pseudonymous conversation roles where identity is unnecessary.
- Sensitive free text is redacted before dispatch while preserving the minimum task intent.
- AI note updates return a proposed diff and write nothing automatically.
- Staff approval stores accepted content with source message references, timestamp, model/version and correcting actor; rejected proposals are not merged into customer or dog notes.

Dashboard summaries that can be computed deterministically in the application do not call an AI provider.

### 9. Failure-aware photo and media handling

Photo deletion uses a tracked server-side job or saga:

1. mark metadata pending deletion;
2. attempt private Storage object deletion;
3. verify object absence;
4. delete or tombstone metadata only after success;
5. retain retryable failure state and reconcile orphan objects.

The actual `groom-photos` and `whatsapp-media` buckets receive file-size and content-type restrictions. Server handlers validate magic bytes, dimensions where applicable, safe disposition and provider download limits before buffering. Active content such as HTML and SVG is rejected.

### 10. Webhook, telemetry and monitoring boundaries

- Reject oversized webhook bodies before buffering beyond the configured cap.
- Verify signatures before parsing or persisting business content.
- Invalid requests produce aggregate security telemetry only; raw invalid payloads are not stored.
- Booking denial and funnel RPCs derive the human from `auth.uid()`, constrain enums/lengths, rate-limit and deduplicate.
- Sentry accepts only an allowlisted context schema. Identifiers are omitted or one-way pseudonymised, and names, notes and contact details are excluded.

### 11. Legal-document, preference and accountability model

A legal-document registry stores only approved artefacts: document type, version, stable URL, content hash, effective date and approval status.

- Recording that a privacy notice was presented is not labelled consent.
- Contract/policy acceptance is distinct from operational channel preferences.
- Marketing permission is optional, purpose-specific, channel-specific, wording/versioned and off unless explicitly chosen.
- Operational preferences remain reversible and do not imply marketing permission.
- Essential in-app receipts remain available regardless of external-channel preference.

Rights-request cases, legal holds, retention rules and immutable access/audit events receive technical schemas and server-owned writers. No retention period, deletion rule or legal basis becomes active until the relevant approved schedule exists.

### 12. Accessibility remediation

Measured defects are corrected using native semantics:

- every field has a programmatic label and unique identity;
- day/hour toggles use keyboard-operable buttons or inputs;
- accessible names contain the visible label;
- targets meet the selected WCAG 2.2 AA size/spacing rule;
- colour tokens meet AA contrast for their actual text size;
- errors are included in field descriptions and focus moves to the invalid field or summary;
- reduced-motion rules cover all pulse, spin, drift and transition effects;
- settings remain usable by keyboard at narrow widths and increased zoom.

## Failure policy

Security, authorisation, authoritative configuration, price resolution and policy-version failures are fail-closed. Customer writes do not proceed.

Delivery and other post-transaction side effects are fail-visible. The completed business transaction remains committed while a durable retry/failure record is shown to staff.

Background jobs are idempotent. Repeated execution cannot duplicate a relationship, communication, cancellation, deletion or accepted AI note.

Rollback paths preserve the tightened permission boundary. A feature flag or unavailable state is preferable to recreating a vulnerable policy.

## Test strategy

### Database tests

Extend pgTAP coverage using anonymous, pending-customer, approved-customer and staff roles.

- Direct writes to protected human fields fail.
- Pending customers remain unable to book until the staff approval path runs.
- Direct dog inserts fail and the RPC cannot set internal or authoritative fields.
- Trusted-contact requests reveal no identity and cannot create a live link before acceptance.
- Direct multi-column cancellation updates fail; the cancellation RPC enforces ownership, configuration and atomicity.
- Non-default configuration changes booking window, cancellation and confirmation behaviour server-side.
- Telemetry subject identity is derived and foreign IDs are rejected.
- Legal, price and unique-reference snapshots survive concurrent bookings and reload.

### Edge Function tests

- Suppressed/disabled sends make zero provider calls across manual, template and automatic modes.
- Signed STOP changes only the intended channel and leaves an audit record.
- Known and unknown phone starts produce equivalent public responses.
- Concurrency tests prove rate-limit excess is rejected deterministically.
- Captured Anthropic and Sentry envelopes contain none of the banned fixture values.
- AI note proposals create no durable note before explicit approval.
- Storage deletion failure preserves a trackable record; retry completes deletion.
- Oversized, wrong-magic and active-content media are rejected.
- Invalid/oversized webhooks create no raw payload row; a valid signed event is processed once.

### Application tests

- Customer UI consumes the safe runtime configuration and reflects non-default values.
- Cancellation failure leaves the form open, keeps the booking visible and announces the error.
- Waitlist copy describes only the implemented manual or automated process.
- Signup separates contract acceptance, notice presentation and optional communication choices.
- Sign-out/account change removes every draft namespace.
- Settings and portal components expose correct labels, names, focus, status and reduced-motion behaviour.

### Browser and architecture tests

- Playwright covers booking and cancellation, open/closed days, keyboard-only settings, narrow reflow, reduced motion and error focus using offline/synthetic data.
- Targeted Axe checks run against affected routes.
- A static auth matrix requires every deployed Edge Function to declare its guard.
- A static import rule prevents provider helpers from bypassing dispatch policy.
- CI runs lint, type-checking, migration validation, database tests, Edge Function tests, Vitest, build and relevant Playwright checks.

## Tranches and exit evidence

### Tranche 1: release security lock

**Findings:** B-01, H-01, H-02, H-06.

Exit requires customer-role tests proving protected writes fail, pending booking remains blocked, raw dog insert is unavailable, cancellation is narrow and failure-visible, and trusted-contact creation cannot disclose or link before acceptance.

### Tranche 2: runtime truth and communications

**Findings:** B-02, H-05, H-07, H-08.

Exit requires a non-default settings matrix across UI and direct APIs, zero provider calls for suppressed/disabled channels, truthful waitlist behaviour and one versioned price source across channels.

### Tranche 3: privacy perimeter

**Findings:** H-03, H-04, H-10, H-11, H-12, M-02, M-03, M-07, M-12.

Exit requires indistinguishable phone starts, isolated drafts, captured AI/Sentry envelopes without banned fields, traceable deletion failure, constrained media and no raw persistence of invalid webhooks.

Publishing the substantive privacy notice remains outside the code boundary, but the app must support stable versioning, presentation records and approved links.

### Tranche 4: customer journey and accessibility

**Findings:** H-09, H-13, M-05, M-10, L-03, L-04.

Exit requires reproducible technical snapshots, unique references, separated preference evidence and passing targeted automated/manual accessibility tasks. Legal wording and disputed consumer-law conclusions remain externally blocked until approved.

### Tranche 5: lifecycle and accountability

**Findings:** M-01, M-04, M-06, M-08, L-01, L-02.

Exit requires synthetic rights coverage, derived telemetry ownership, human-approved AI notes, immutable server-written audit events, tested authentication for every function and expiry/rotation tests for calendar tokens.

Retention enforcement activates only for categories whose periods and hold rules have been approved.

### Tranche 6: external controls

**Findings:** M-09, M-11 and the audit's professional/operational actions.

Exit evidence includes approved policy content, supplier/transfer/DPIA records, a count-only production incident review, protected GitHub releases, backup/MFA evidence, solicitor decisions and assistive-technology testing. Any item unavailable to this repository is recorded as an explicit external dependency rather than claimed complete.

## Delivery sequence for each tranche

1. Reproduce the finding with the smallest failing automated test.
2. Implement the narrowest server-authoritative correction.
3. Run the focused test and related regression suite.
4. Review the task for specification compliance and code quality.
5. Run the full repository verification gate before declaring the tranche complete.
6. Prepare migration application and smoke-test instructions without applying them to production.
7. Record remaining business, legal, provider or production dependencies.

## Definition of complete

A code-addressable finding is complete only when its required behaviour is enforced at the authoritative boundary, the regression test was observed failing before implementation and passing afterwards, related tests pass, and the resulting user-facing statement matches actual behaviour.

The overall audit is not described as remediated while professional, production or operational evidence remains outstanding. Those items are reported separately with owner/action/evidence requirements.
