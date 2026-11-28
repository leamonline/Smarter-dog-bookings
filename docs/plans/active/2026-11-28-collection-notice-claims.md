# Durable staff collection notices

**Status:** Active
**Issues:** [#1327](https://github.com/leamonline/Smarter-dog-bookings/issues/1327), [#1328](https://github.com/leamonline/Smarter-dog-bookings/pull/1328)
**Owner:** Codex on the S2 review branch, following the Antigravity hand-off.
**Authority:** Owner approval, 28 November 2026.

## Goal and scope

Prevent duplicate opt-in collection notices from Staff Today across browsers,
phones and process restarts. Preserve the existing template, opt-outs,
recipient choice, and sibling readiness. The booking write and the notice stay
independent. The active booking policy and provider fallback remain unchanged.

## Contract and architecture

Use the web collection unit (owner and London booking date) plus the intended
recipient. Resolve all three from the booking and saved contact on the server.
A service-role-only RPC atomically grants one attempt across channels and
devices. Clients use a distinct Edge mode so an older deployment cannot
interpret the request as an ordinary template send. A terminal accepted
receipt replays across channels. A definite refusal permits another explicit
attempt. A missing response, crash, or unknown send stays blocked without a
time-based release. The claim stores the provider ID when acceptance is known.
Inbox recording remains separate. A privileged reconciliation requires
provider evidence and the exact attempt token.

## Rollout, security and verification

Apply the reviewed additive migration through the named staging workflow.
Exercise synthetic identities with mocked providers and two PostgreSQL
sessions. Check staff authorisation, recipient linkage and current number,
same-day grouping, simultaneous claims, stale settlement, recorded and
unrecorded acceptance, definite refusal and unknown recovery. Check the
existing website and iOS journeys. Gate any production migration or deploy
on separate owner approval and exact-head release evidence. Roll back clients
before removing the guarded Edge mode and retain claims during rollback.

## Checkpoint

Original S2 head and the native review are recorded in [#1332](https://github.com/leamonline/Smarter-dog-bookings/pull/1332).
The approved server work adds a collection-only claim and preserves the
generic manual messaging paths. S3 remains serial behind S2 and the
[#1194](https://github.com/leamonline/Smarter-dog-bookings/issues/1194) write dependency.
