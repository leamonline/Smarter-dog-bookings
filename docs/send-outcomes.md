# Send outcomes: what `whatsapp-send` and `sms-send` promise

Status: **Stage 1, PR A** (server, additive). PR B changes the staff clients to
use this; PR C turns the observed checks into refusals. Neither is built yet.
Code: [`_shared/sendOutcome.ts`](../supabase/functions/_shared/sendOutcome.ts),
[`_shared/sendIdentity.ts`](../supabase/functions/_shared/sendIdentity.ts).

## Why

A send has three honest answers, and the code used to collapse them:

| Outcome | Meaning | Safe to retry? |
|---|---|---|
| `accepted` | The provider returned a message id. | n/a |
| `rejected` | The provider answered and refused (4xx with a JSON error, or 429). Nothing was created. | Yes, after the cause is fixed. |
| `unknown` | We cannot tell: a network failure or timeout, a 5xx, an unreadable answer, a 2xx with no message id. **It may have been sent.** | **No. Never automatically, and never from a plain Retry button.** |

Before this, a dropped connection after Twilio took a text was reported as
`500 "Twilio not configured"`, and a Meta failure of any kind put an approved
draft back to `pending`. Both invite a second send. The cancellation notice also
fell from WhatsApp to SMS to email on any failure: up to three copies.

429 is treated as `rejected` (refused before a message was created). That is an
assumption about both providers, pinned by a test.

Neither provider's send endpoint is known to accept an idempotency key (not
verified), so nothing here depends on one: **one request, one provider call,
no internal retry.**

## Response contract

Success:

```json
{ "ok": true, "recorded": true, "warnings": [] }
```

`recorded: false` means the message **went** but is not in the inbox. A warning
is never a reason to resend. Clients should clear the composer and close the
dialogue on `ok: true` (keeping the text invites a duplicate) and add a visible,
non-blocking notice for any warning.

Failure:

```json
{ "ok": false, "outcome": "not_sent" | "unknown", "code": "…", "error": "…" }
```

`error` is always a complete sentence, because older clients print it as is.
Machine-readable codes are in `code`, not `reason`: `parseSupabaseFunctionError`
joins `error`, `reason` and `detail` into the toast.

| `code` | Status | Outcome |
|---|---|---|
| `provider_not_configured` | 500 | `not_sent` |
| `provider_rejected` | 502 | `not_sent` |
| `delivery_outcome_unknown` | 502 | `unknown` |

The opt-out gates keep their own statuses and `reason`s (409, 503
`opt_out_check_failed`); the 503 now also says `outcome: "not_sent"`.

### Warnings on a success

| Warning | Meaning |
|---|---|
| `message_not_recorded` | The message row could not be written. |
| `conversation_not_updated` | The row was written; the conversation's `last_outbound_at` did not move. |
| `conversation_unavailable` | No conversation to record on (the send had none and one could not be created). |
| `draft_supersede_failed` | A staff reply went, but older AI drafts could not be superseded. |
| `conversation_not_completed` | A booking confirmation went, but the conversation could not be closed. |
| identity codes | See below. |

`confirm_buttons` keeps its own singular `warning` and its own rollback; it is
not changed in PR A (see "Known remaining exposure").

## Identity checks (observe-only in PR A)

`checkSendIdentity` compares what a request names: the endpoint's channel, the
destination number, the customer, and the conversation. Disagreements come back
as warnings and are logged (ids and codes only, never a number or a name).
**Nothing is refused**, so this adds no new way for a message to fail.

| Code | A send where… |
|---|---|
| `human_not_found` | `human_id` names no customer. |
| `human_phone_invalid` | The customer has no usable number. |
| `invalid_phone` | The destination is not a phone number. |
| `human_phone_mismatch` | The destination is not the customer's number. |
| `conversation_not_found` | `conversation_id` names no conversation. |
| `conversation_channel_mismatch` | The conversation is on the other channel (an SMS thread replied to over WhatsApp, or the reverse). |
| `conversation_phone_mismatch` | The destination is not the conversation's number. |
| `conversation_human_conflict` | The conversation is linked to a different customer. |

Numbers are compared with `phoneMatchKey`, so formatting never matters. A
conversation row with no `channel` is a WhatsApp one.

Modes covered by `whatsapp-send`: `draft`, `manual`, `template`, `flow`,
`book_entry`, `list`. `flow`, `book_entry` and `list` are called only by the
WhatsApp agent and stay observe-only for all of Stage 1: a wrong refusal would
silently stop booking-entry messages, and a mismatch needs a bug, not a user.
`confirm_buttons` derives its destination from the conversation and checks its
action belongs to it, so it is skipped.

## Unknown outcomes elsewhere

- **Draft approval.** After an unknown outcome the draft stays claimed
  (`approved` / `sent_after_edit`) so it cannot be approved twice. Only a
  definite rejection returns it to `pending`. Flow sessions likewise stay
  `active`.
- **Cancellation notices.** `notify-booking-cancelled` falls to SMS and email
  only after a *definite* refusal. After anything that may have gone out it
  stops and logs the row.
- **`notification_log`.** `status` only allows `sent | failed | pending`, and
  migrations are applied by hand, so an unknown outcome is stored as `failed`
  with an `error_message` starting `outcome unknown:`
  (`UNKNOWN_OUTCOME_PREFIX`). Writers: the cancellation, reminder, confirmation,
  broadcast and `reminder-send` paths and the SMS chase itself.
- **The hourly SMS chase** (`reminder-sms-fallback`) skips those rows: an unknown
  send has no message id, so no delivery receipt can ever clear it, and it would
  otherwise text a customer whose WhatsApp may have arrived. It also refuses to
  re-claim a booking after an *unconfirmed* chase of its own, because a failed
  claim row normally lets the next run try again. Trade-off: a reminder that
  genuinely did not arrive stays unsent until staff look at the failed row.
- Which rows count as "may have gone" is one function,
  `failedSendMayHaveGone`: a 5xx with no outcome, a call that got no answer
  (status 0), or an `ok: true` that named no message. A 4xx or an explicit
  `outcome: "not_sent"` proves nothing was sent.

## Free-text marker

Free-text WhatsApp sends write `raw.sent_kind: "text"` (beside the existing
`sent_by`). Meta's response alone does not say what was sent, so without it a
failed message cannot be told apart from a template or an interactive one. PR B
offers "Retry" only on rows carrying it; every older row goes to review.

## Known remaining exposure (not changed in PR A)

- `confirm_buttons` rolls its booking action back to `pending` after any Meta
  failure, including an unknown outcome, so a second confirmation could be sent.
- `notify-customer-welcome` falls from WhatsApp to SMS to email in the same way
  as the cancellation path did, and has no test harness (it calls `serve()` at
  import).
- The `notify-*`, `broadcast-message` and `reminder-send` entrypoints call
  `serve()` at import and have no harness; their outcome wiring shares the tested
  `failedSendMayHaveGone` but is itself checked only by `deno check` and review.
- SMS-thread replies still go out over WhatsApp until PR B routes them by the
  thread's channel. In PR A that mismatch is visible as a
  `conversation_channel_mismatch` warning.

## Rollout order

Merging deploys the changed Edge Functions together but not atomically. For a
moment a new caller can see an old `whatsapp-send` answer (`502 {"error":"Meta
send failed"}` with no `outcome`). Callers read that as "may have gone", which
is the safe direction: no fallback is tried and the row is marked for staff.
There is no database migration in PR A.
