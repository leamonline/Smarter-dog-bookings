# ADR 013: Allow late cancellations with customer history

Status: Proposed — owner authorised the cancellation policy; threshold details and implementation pending
Date: 2026-10-01
Issue: [#930](https://github.com/leamonline/Smarter-dog-bookings/issues/930)
Plan: [Late cancellation history](../../plans/active/2026-10-01-late-cancellation-history.md)

## Context

The current online cancellation command refuses requests inside its notice window. The owner wants those slots released promptly so staff have a chance to rebook them, and wants repeated late cancellation to inform future deposit requirements. Refusal is not evidence the customer will attend. The same mutation currently enforces the rescheduling cutoff, so cancellation permission cannot change safely by removing that check alone.

## Decision

Separate cancellation permission from lateness classification. Accept an owned active future appointment's cancellation inside the notice window; record lateness using the existing configured notice cutoff. Keep other cancellation safeguards and keep rescheduling's notice restriction. Do not activate the dormant visit policy.

Record one attributable late customer cancellation per appointment in the same transaction as the committed cancellation. Use stable appointment and receipt identity; group plus date counts once across dog rows and retries, while recurring dates remain distinct. Preserve reason, time and applicable cutoff. Staff acting on a customer's request must attribute its cause explicitly. Salon cancellations, no-shows, rescheduling and unpaid-deposit releases are not customer late-cancellation incidents.

Expose dated records and the threshold on the customer file using staff-only reads and the existing deposit control. The third incident triggers the owner-selected deposit response; automatic versus staff-reviewed action and counting period remain pending. No retrospective backfill, existing-booking payment alteration or new refund/retention rule is implied.

## Verification

Test actual written cancellation and incident rows, ownership, switch refusal, start-time boundary, on-time/exact-cutoff/late classification, London DST, multi-dog/recurring grouping, retries and races, staff attribution, salon/system exclusion, unchanged rescheduling, staff-only history reads and the agreed third-strike response. A failed mutation must leave no incident; a notification failure must not reverse a committed cancellation.

## Consequences

Customers can release capacity late; history informs deposits without blocking cancellation. Runtime behaviour and copy depend on an append-only migration applied before dependent client code merges. Source review is not production approval. Database history, attribution and correction require tested provenance; row-level event counts or AI judgement cannot substitute for them.
