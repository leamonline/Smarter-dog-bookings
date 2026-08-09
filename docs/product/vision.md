# Product vision

**Status:** Active
**Authority:** User and product outcome for the architecture convergence
programme
**Parent:** [PROJECT.md](../../PROJECT.md)
**Last verified:** 9 August 2026

## Vision

Smarter Dog should make an appointment feel like one coherent promise, even
when it contains several dogs, several staff actions and more than one delivery
channel.

For customers, that means the appointment shown, changed and messaged is the
same appointment. For staff, it means the diary can say exactly what succeeded,
what is still pending and what needs attention. For release operators, it means
a feature cannot turn itself on against an incompatible database or an
unverified target.

## The experience we want

### Customers and trusted humans

- receive one clear communication for one appointment operation, including all
  affected dogs and their correct times;
- are never told a change succeeded when it did not;
- are not exposed to internal errors, duplicated messages or inconsistent
  capacity promises; and
- keep existing portal and WhatsApp journeys while the architecture changes
  underneath them.

### Staff

- move a whole appointment once, rather than coordinate unrelated row edits;
- see appointment success separately from message pending, sent, failed,
  retryable or unknown;
- can recover a delivery problem without repeating the appointment mutation;
- receive a clear manual-review path when legacy appointment membership is
  ambiguous; and
- see controls and documentation that state capability before interaction, not
  after an enabled-looking action fails.

### Product and release operators

- can identify the database, Edge and frontend capabilities deployed together;
- have a real pull-request browser gate and a complete Edge caller/authentication
  contract;
- can prove a hosted Supabase command targets the intended project before it can
  write; and
- make STOP/GO decisions from governed measures whose limits are visible.

## Product promises

1. **One appointment, one operation.** The visit is the appointment-level
   identity; booking lines remain the dog-specific operational detail.
2. **Truth over optimism.** A database success is not proof of customer contact,
   and an unavailable capability is labelled before use.
3. **Server-owned safety.** Business decisions, idempotency and final capacity
   enforcement sit at the server boundary.
4. **Human control.** Ambiguous data, unknown delivery and risky AI output route
   to staff rather than being guessed through.
5. **Reversible progress.** Evidence and safety work can finish with STOP; live
   convergence proceeds as the smallest serial slice.
6. **Privacy by restraint.** Operational measurement uses stable identifiers and
   aggregates, not customer message content, notes or contact details.

## Current-to-target horizon

| Horizon | Product state |
|---|---|
| Current | Booking rows remain live authority; visit contracts exist but v1 mutations are dark; staff reschedule messaging is incomplete. |
| Now | Make measurement, capacity evidence, interface truth, Edge authentication and release targeting trustworthy. |
| Next, only after GO | Add the minimum capability seam, reschedule-only intent/attempt model, canonical capacity contract and one legacy-compatible staff reschedule command. |
| Later | Expand notification and visit authority deliberately; consider policy activation only as a separate approved decision. |

## Guardrails

- `previous_day_1500_v1` is not activated by this work.
- PostgreSQL remains the final capacity authority.
- AI remains human-reviewed by default; this programme does not authorise wider
  autonomous booking.
- No customer-facing behaviour changes incidentally because a supporting schema
  or command exists.
- No success claim relies on a fake date, unverified production assumption or
  invented baseline.

The testable form of this vision is in [requirements.md](requirements.md), and
the journeys are in [user-flows.md](user-flows.md).
