# ADR 008: What a customer is told when a booking is refused

**Status:** Accepted — wording rule decided and enforced
**Date:** 23 August 2026
**Related issues/PRs:** Issue #665 (split from #623); the product decision it
was waiting on
**Applies to:** Every customer-facing booking-refusal message, on the portal
booking wizard and the WhatsApp Flow

## Context

Issue #665 recorded that the browser capacity engine and the PostgreSQL trigger
reach the same eligibility decision and describe it in different words — a
12-hour clock against a 24-hour one, and one pair phrased differently
altogether. It proposed a structured reason-code contract, and blocked on three
product questions it would not answer itself:

- 12-hour or 24-hour clock in customer-facing refusals?
- how much of the reason should a customer see at all?
- do staff and customers see the same wording?

Measuring where those strings actually surface, before answering, changed the
shape of the question. The divergence is real but almost entirely **internal**:

| surface | what it shows | audience |
|---|---|---|
| Staff modals, via `isCapacityRejection` | the engine's own reason text | staff, who need the rule name |
| `booking_denials.reason_detail` | the raw gate message, verbatim | report 2F, diagnostics |
| Portal booking wizard | `friendlyDenialMessage(raw)` | customer |
| **WhatsApp Flow** | **the raw gate message** | **customer** |

The portal has always translated. The Flow did not — it passed the raw message
to its `BOOKING_FAILED` and `SELECT_TIME_RETRY` screens, so a customer could
read `Capped at 1 (2-2-1 rule)`, `Back-to-back large dogs only allowed at
12:30 + 13:00`, or `Day is fully booked: 2026-08-25 already has 14 dog(s)
(maximum 14 per day)` — engineer text, a 24-hour clock the portal never shows,
and the salon's daily cap and current load. Both Flow screens carry warm
example copy in `whatsapp-flows/appointment-booking.json`, so they were
designed to receive friendly sentences: the raw text was a leak, not a
decision.

## Decision

**A customer is told what to do next, never why the rule exists.**

1. **No customer-facing refusal contains a clock time, a rule name, or a
   capacity number.** This answers question 1 by making it unreachable: since
   no customer-facing string prints a time at all, 12-hour versus 24-hour is
   not a customer question. It also stops the daily-cap message disclosing the
   salon's cap and current load.
2. **Customers see the reason category, not the rule.** "That time's just been
   taken" rather than "Capped at 1 (2-2-1 rule)". That answers question 2.
3. **Staff and customers do not see the same wording**, answering question 3.
   Staff surfaces and the denial log keep the precise engineer text, because
   its precision is the point for them; only customer surfaces are translated.
4. **One copy table per channel, keyed by reason code**, owned in the front end
   (`src/engine/denials.ts`) and mirrored for Deno
   (`supabase/functions/_shared/denialCopy.ts`). The same categoriser drives
   both the on-screen sentence and the logged reason code, so what a customer
   reads and what is recorded can never drift.
5. **The two channels' copy is identical except where the channel changes what
   "contact us" means.** Inside WhatsApp, "message us on WhatsApp" is
   nonsense, so the Flow says "just reply here". That is the only licensed
   divergence.

The internal 12-hour/24-hour split between engine and trigger is left as it
is. It is now provably internal, so it is cosmetic rather than a customer
concern, and settling it belongs with the reason-code work in #665 rather than
here.

## Consequences

- The Flow no longer renders any raw database message. Gate refusals go through
  the shared copy table; a non-P0001 database error gets a generic apology
  rather than its own text.
- Failure results carry the customer sentence as `message` and the raw gate
  text as `detail`. `booking_denials.reason_detail` and the reason mapper read
  `detail`, so report 2F keeps exactly the diagnostic precision it had.
- `src/lib/whatsapp/denialCopyParity.test.ts` asserts the rule rather than the
  sentences: no digit and no rule vocabulary in any customer copy on either
  channel, both mappers agreeing on every message the engines and trigger can
  emit, and every reason code carrying its own copy with a next step. Copy is
  free to improve; the rule is not free to erode.

### Two defects found while deciding

- **The Flow leaked raw gate text to customers** (above). Fixed here.
- **The same refusal mapped to two different reason codes.** The engine's
  `9:00am conditional: 8:30am must be empty` matched none of the mapper's
  large-dog patterns and fell through to `unknown`, while the trigger's
  `09:00 large dog conditional: 08:30 must be empty` mapped to
  `large_dog_ineligible`. That is issue #665's third divergence with a real
  consequence — report 2F's breakdown — rather than a cosmetic one. Both
  mirrored mappers now recognise the `conditional:` phrasing.

## What this does not do

Issue #665's other two proposals are untouched and still open:

- a stable machine-readable reason code emitted by **both runtimes alongside
  the human text** (today the code is derived by pattern-matching prose, which
  the issue rightly calls fragile — this ADR reduces the blast radius of that
  fragility but does not remove it);
- a parity assertion on codes inside the capacity harness.

Both need the trigger to emit codes, which is a migration and a change to what
`validate_booking_capacity()` *says* — deliberately outside this decision, and
outside #665's own boundary on changing what it *decides*.

## Revisit when

- The trigger starts emitting structured reason codes, at which point the
  prose-matching mapper should be retired in favour of them.
- A customer-facing message genuinely needs a number (a price, a notice
  period). The parity test will fail and force the exception to be considered
  rather than absorbed.

## Evidence and implementation state

- **Surfaced-text audit** against the deployed trigger on production
  (`nlzhllhkigmsvrzduefz`), 23 August 2026, and against every `reason:` string
  in both capacity engines.
- **Both defects fixed and covered**, not merely recorded.
- **Enforced by** `src/lib/whatsapp/denialCopyParity.test.ts`.

Related: [capacity engine reference](../../capacity-engine.md),
[parity measurement](../../research/2026-08-19-capacity-parity-measurement.md)
§ Refusal wording, issue #665.
