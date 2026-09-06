# ADR 010: Holiday notices assert operational closures

Status: Accepted
Date: 2026-09-05
Issue: [#786](https://github.com/leamonline/Smarter-dog-bookings/issues/786)

## Context

The user chose a prominent homepage holiday card and customer-calendar notice with automatic scheduling, explicitly requiring notices to reflect actual booking closures. Reference salon_config closures do not govern bookings.

## Decision

Store bounded holiday date ranges in salon_holidays, with no direct application table access. A staff-authorised database command saves the announcement and invokes existing atomic day-closure commands inside one transaction. It preserves existing appointment and rearrangement-task semantics. An explicit open reopening day is a prerequisite. Direct diary writes cannot contradict enabled holiday ranges or their reopening day, including deletes and NULL values.

Notice start and holiday state are evaluated by London calendar date, without a scheduled job. A minimal anonymous projection revalidates operational settings before returning dates. Frontends refresh on focus and every minute; failures remove unverified notice claims. Final booking writes retain existing database validation.

Staff edit with an expected revision. Identical retries of the immediately preceding save are idempotent; stale divergent requests fail. Removing a notice or changing its range never automatically reopens old dates. Staff may reopen them explicitly after retiring the old assertion. Ranges sharing a reopening day with another holiday are rejected to avoid contradictory promises. A closure can span at most 90 days; this does not widen customer booking windows.

## Consequences

There is one transactional consistency boundary, and existing bookings remain actionable through existing tasks. No cancellation or message is sent automatically. Customers see reopening separately from actual slot availability. A notice may remain visible for up to one refresh interval after a remote change, but it cannot authorise a booking. Direct diary changes may require staff to retire/update a holiday first. Conflicting database transactions may fail and must be retried; no partial save is exposed.

The website remains separately deployed for this feature. Repository consolidation imports the website commits later; it is not a runtime prerequisite.

## Verification

See the [implementation plan](../../plans/active/2026-09-05-scheduled-holiday-notices.md), migration, pgTAP tests and the local holiday concurrency gate. Release evidence belongs in the issue and plan before completion.
