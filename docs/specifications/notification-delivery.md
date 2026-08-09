# Visit notification intent and delivery contract

**Status:** Accepted target intent; implementation proposed
**Applies first to:** Customer notification after a staff reschedule
**Current implementation:** Booking-oriented `notification_log`; this target is not yet shipped
**Last verified:** 9 August 2026 against `main@8eb8800f`

## Purpose

A successful appointment operation and a successful customer message are two
different facts. This specification defines the target boundary between the
domain transaction, a durable logical notification intent and append-only
provider attempts.

It implements [ADR 003](../architecture/decisions/003-separate-operation-success-from-notification-delivery.md)
and is deliberately narrower than a complete notification-platform rewrite.
The first proposed adoption is the staff-reschedule slice in issues #604/#610.

## Current versus target

| Concern | Current baseline | Target contract |
|---|---|---|
| Identity | Booking/trigger/recipient-oriented rows | One logical visit outcome per recipient and payload version |
| Multi-dog fan-in | Depends on individual producer behaviour | One appointment message listing all affected dogs/times |
| Operation result | UI can treat a move as complete without a delivery result | Operation and notification states are returned/displayed separately |
| Attempts | Current row is updated in place | Every provider attempt is append-only |
| Ambiguous send | Stale `pending` can become `failed` | `delivery_unknown`, requiring reconciliation and no blind retry |
| Retry | Producer/function-specific | A new delivery attempt; never reapply the appointment mutation |
| Fallback | Channel-specific and partly implicit | Versioned, deterministic policy; unresolved means no automatic fallback |

## Terms

- **Operation:** one idempotent visit-level business command, such as moving an
  appointment.
- **Outcome key:** stable logical identity of the committed visit outcome.
- **Intent:** the durable obligation or decision to communicate one logical
  outcome to one recipient using a snapshotted payload/policy version.
- **Attempt:** one append-only claim and provider interaction for an intent.
- **Requested channel:** the channel selected by recipient preference and the
  operation's approved channel policy when the intent is created.
- **Fallback policy:** the explicitly approved rule for trying another channel.
- **Provider accepted:** the provider conclusively accepted the request. It is
  not proof that the customer read it and may not be proof of final handset
  delivery.
- **Delivery unknown:** the system crossed or may have crossed the provider-send
  boundary but cannot determine whether the provider accepted the request.

## Core invariants

1. The visit mutation and required logical intent are persisted in one
   PostgreSQL transaction.
2. A provider call never occurs inside that transaction.
3. Replaying the same domain command returns the same operation result and does
   not create another logical intent.
4. One multi-dog visit produces one appointment-level message per logical
   recipient/outcome, not one per booking line.
5. A provider failure does not roll back an already committed appointment.
6. Retrying delivery never repeats the appointment mutation.
7. The current intent projection may change; attempt history is append-only.
8. A stale or superseded message is suppressed before provider send.
9. `delivery_unknown` blocks automatic retry unless a provider's documented,
   tested idempotency contract proves the retry safe.
10. UI copy never equates `appointment changed` with `customer informed`.

## Logical identity and idempotency

The implementation must distinguish three keys:

| Key | Purpose |
|---|---|
| Command idempotency key | Makes replay of the visit operation return the same committed result |
| Logical intent key | Prevents duplicate intent for the same visit outcome, recipient and payload version |
| Attempt/correlation key | Identifies one provider interaction and supports reconciliation |

The intent's requested channel and recipient/preference snapshot are immutable
evidence. If an approved fallback uses another channel, it is a new attempt
under the same logical communication intent unless the future fallback policy
explicitly defines a separate customer communication.

Database uniqueness prevents duplicate local rows; it does not guarantee that
an external provider performs exactly once. A provider idempotency token is
used only when the exact provider endpoint documents and demonstrates the
semantics needed by the retry path.

## Target intent states

| State | Meaning | Automatic work allowed? |
|---|---|---|
| `pending` | Intent is durable and eligible for its first claim | Yes |
| `held_for_staff` | Policy or operational review must complete before sending | No |
| `sending` | One current attempt owns the send lease | Only that claimed attempt |
| `retry_scheduled` | The previous attempt conclusively did not send and bounded retry is due later | Yes, when due |
| `sent` | A provider conclusively accepted the message under the channel contract | No further send |
| `failed_permanent` | The provider conclusively rejected it and automatic retry/fallback is unavailable | No; staff action required |
| `delivery_unknown` | Provider acceptance cannot be determined | No; reconciliation required |
| `suppressed` | The outcome is stale, superseded, expired or deliberately handled manually before send | No |

`sent` should be refined by later provider callbacks when available, but a
missing callback must not rewrite a conclusive acceptance into failure. Read
and handset-delivery states are separate optional evidence, not aliases for
intent success.

## Target attempt states

| State | Meaning | Permitted next state |
|---|---|---|
| `prepared` | Worker claimed the next eligible intent, rendered current truthful content and has not crossed the send boundary | `sending`, `failed_retryable`, `failed_permanent`, `suppressed` |
| `sending` | The durable record says the worker is about to call or has called the provider | `accepted`, `failed_retryable`, `failed_permanent`, `delivery_unknown` |
| `accepted` | Provider conclusively accepted the request and returned usable evidence | Terminal |
| `failed_retryable` | Provider conclusively did not accept; retry may be safe under bounded policy | Terminal for this attempt; intent may schedule another |
| `failed_permanent` | Provider conclusively rejected or configuration/template policy forbids retry | Terminal |
| `delivery_unknown` | Timeout, process death or indeterminate connection makes acceptance unknowable | Terminal until human reconciliation; never auto-rewritten to retryable |
| `suppressed` | The intent became ineligible before the external request | Terminal; no provider call |

An expired `prepared` lease is recoverable because the provider boundary was
not crossed. An expired or abandoned `sending` lease becomes
`delivery_unknown`, not `failed_retryable`.

## Claim and dispatch flow

1. Lock/claim only the next eligible intent for a visit/recipient sequence.
2. Re-check that the underlying outcome is still truthful and actionable.
3. Resolve the approved template variant and fallback-policy version without
   exposing internal data.
4. Create a `prepared` attempt with a bounded lease.
5. Immediately before the provider call, durably move the attempt and intent
   to `sending` with a correlation key.
6. Record the conclusive provider result idempotently as `accepted`,
   `failed_retryable` or `failed_permanent`.
7. If the result cannot be known after step 5, record `delivery_unknown` and
   create visible staff work.

A later visit outcome must not overtake an unresolved `sending` or
`delivery_unknown` predecessor where doing so could produce contradictory
messages.

## `delivery_unknown` reconciliation

The staff surface must show channel, attempt time, provider/correlation
evidence and safe error category without exposing provider secrets or raw
customer content.

After checking provider evidence, the only delivery actions are:

- **Mark delivered:** close the logical intent without another send; or
- **Authorise retry:** create one new audited attempt.

Both actions require an authorised staff identity, reason, timestamp and link
to the prior attempt. The appointment mutation is never repeated. A scheduled
job must not convert unknown into retryable merely because time passed.

## Fail-closed conditions

- **Ambiguous visit grouping:** return typed `visit_review_required`; perform no
  visit/booking mutation, create no intent and do not fall back to a raw booking
  update.
- **Missing required intent capability/schema:** do not commit a mutation whose
  contract promises a durable customer notification.
- **Missing recipient or approved template:** do not invent a recipient or
  downgrade wording; surface an actionable operational state according to the
  approved command contract.
- **Stale/superseded/expired content:** suppress before the provider call and
  retain audit evidence.
- **Unresolved fallback:** do not select SMS, email, free-form WhatsApp or
  another provider implicitly.
- **Unknown provider outcome:** enter `delivery_unknown` and wait for audited
  reconciliation.

Failing closed before the command transaction differs from delivery failure
after commit. The former produces no appointment mutation; the latter leaves
the committed appointment intact and exposes delivery work.

## Channel selection and unresolved fallback

The intent snapshots recipient preferences, requested channel, template/payload
version and the fallback-policy version used for the decision. Channel
formatting stays outside the domain transaction.

For staff-reschedule notifications, the exact automatic fallback sequence is
**unresolved**. This specification does not assume SMS, email, free-form
WhatsApp or no fallback. A human decision must define:

- eligible primary and fallback channels;
- consent/preference and suppression precedence;
- when a provider failure is retryable versus fallback-eligible;
- wording/template parity between channels;
- whether provider acceptance on one channel suppresses all others; and
- staff/manual-contact behaviour when no channel is usable.

Until that decision is recorded and implemented, the worker may use only the
explicitly approved primary route and must expose failure/unknown state for
staff. It must not improvise a fallback.

## Receipt and UI contract

The existing typed visit receipt family should be extended only with the
concrete linkage required by the adopted slice. Regardless of final field
names, a successful response and staff UI must distinguish:

- operation committed or replayed;
- notification intent created/linked;
- current projected delivery state; and
- review/manual action required.

`sent` may be shown only from conclusive provider evidence. `pending`,
`retry_scheduled`, `failed_permanent` and `delivery_unknown` each need distinct
copy and next action. A transport error or malformed receipt fails closed and
must never be coerced into success.

## Security, privacy and audit

- Resolve recipients server-side and preserve `notify_human_ids` and
  confirmation-channel semantics during visit replacement.
- Snapshot only data needed to render the approved message; do not store
  secrets or unnecessary free text in the intent.
- Provider errors exposed to staff are safe categories/details, not raw secret
  payloads.
- Intent and attempt tables are not customer-writable.
- Claim/completion/reconciliation commands use least privilege, explicit
  grants and tested caller authentication.
- Every attempt, suppression, manual mark-delivered and authorised retry is
  auditable.
- Analytics failure cannot block the appointment command or dispatcher.

## Required verification

- single-dog and multi-dog fan-in;
- replayed command and duplicate event delivery;
- concurrent worker claims;
- stale visit revision and superseded/expired content;
- transient conclusive failure followed by bounded retry;
- permanent template/provider rejection;
- crash or timeout after `sending`, yielding `delivery_unknown`;
- mark-delivered and authorised-retry audit paths;
- recipient/preference changes after intent creation;
- unresolved fallback producing no implicit send;
- operation success with visible delivery failure;
- ambiguous grouping producing `visit_review_required`, zero mutation and zero
  intent; and
- provider failure/retry without repeating the appointment operation.

## Related records

- [Current architecture](../architecture/overview.md)
- [ADR 003](../architecture/decisions/003-separate-operation-success-from-notification-delivery.md)
- [ADR 005](../architecture/decisions/005-fail-closed-on-ambiguous-legacy-visit-grouping.md)
- [Reschedule automation go/no-go](../research/2026-08-09-reschedule-automation-go-no-go.md)
- [Booking-policy authority](booking-policy.md)
