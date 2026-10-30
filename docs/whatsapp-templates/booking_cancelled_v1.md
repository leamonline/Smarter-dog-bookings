# booking_cancelled_v1

Status: Active. The template is not in Meta yet. Cancellation WhatsApp stays
off until Meta approves this exact body and `CANCELLATION_WHATSAPP_ENABLED`
is set to `true`.

This is the sheet to submit in WhatsApp Manager. The words are the
cancellation sentence the salon already sends by SMS and email
(`cancellationNotice` in
[`notify-booking-cancelled/handler.ts`](../../supabase/functions/notify-booking-cancelled/handler.ts)).
A customer who is moved from WhatsApp onto a text or an email is told the
same thing.

## Submit this

In Meta Business Suite, open WhatsApp Manager → Message templates → Create.

| Field | Value |
|---|---|
| Name | `booking_cancelled_v1` |
| Category | Utility (`UTILITY`) |
| Language | English (UK) — code `en_GB` |
| Header | None |
| Footer | None |
| Buttons | None |

Body, exactly, including the full stop:

```
Hi {{1}}, your appointment for {{2}} on {{3}} has been cancelled. Rebook anytime.
```

Samples for Meta's review form (not a real customer):

| Variable | Meaning | Sample |
|---|---|---|
| `{{1}}` | Customer's first name | Sarah |
| `{{2}}` | Dog's name | Bella |
| `{{3}}` | Appointment date, short form, same as the SMS | Tue 20 Oct |

Do not add emoji, an em dash, a header, or a button. The sentence is one SMS
segment, and the same characters are what a text fallback sends. Utility is
the right category: this tells someone about an appointment they already
have. It is not a promotion. If Meta recategorises it as Marketing, do not
turn the flag on. Marketing opt-in rules are different, and the code does
not ask for marketing consent.

The name follows `booking_confirmed_v1` and `booking_changed_v1`. The
language is `en_GB`, the same code those confirmation and reminder templates
use. A wrong name or language fails at send time with Meta error 132001
("Template name does not exist in the translation").

## What the code sends

`notify-booking-cancelled` calls `whatsapp-send` in template mode:

- `template_name`: `booking_cancelled_v1`
- `language`: `en_GB`
- `params`: `[first name, dog name, short date]`

The staff picker does not offer this template. It is registered in
[`src/constants/whatsappTemplates.js`](../../src/constants/whatsappTemplates.js)
with status `pending`, and the picker only lists `approved`. Leave it pending
unless staff should also send it by hand. The automatic notice does not read
that status.

## Who receives it

Only when the flag is on, and only when WhatsApp is available in the same
way a confirmation or reminder chooses it (`pickChannel`):

- `humans.whatsapp` is on
- a phone number is on file
- `humans.whatsapp_opted_out` is not set

`whatsapp-send` checks the opt-out again and refuses the send if the customer
has stopped WhatsApp. The function then uses SMS, then email, instead of
recording the WhatsApp as sent.

Anyone else keeps today's path: SMS if they have it and have not opted out,
otherwise email. A reschedule cancellation is still skipped and nothing is
sent. The wording does not change with the reason for the cancellation.

## The 24-hour window

Meta only allows free text inside 24 hours of the customer's last message.
A cancellation is often outside that window, so free text would not arrive.
This send is always the template, which Meta allows both inside and outside
the window. The function does not look at the session and does not send free
text.

## How to turn it on

Do this only after WhatsApp Manager shows the template as Approved, for
`booking_cancelled_v1` in English (UK).

```bash
supabase secrets set CANCELLATION_WHATSAPP_ENABLED=true
```

The function reads that variable on each request. Unset, empty, `false`, or
any other value leaves WhatsApp off and SMS-then-email unchanged. Merging
the code does not set the secret. The default is off, so the deploy is safe
before Meta has approved the template.

To turn it off again, without a deploy:

```bash
supabase secrets set CANCELLATION_WHATSAPP_ENABLED=false
```

The name is listed in [`.env.example`](../../.env.example). It is an Edge
Function secret, not a `VITE_` value.

## If it is turned on before approval

Meta rejects the send, usually with 132001 because the name does not exist
in that language. The function does not log that as sent. It records
WhatsApp's error, moves the same `notification_log` row onto SMS (or email
if a text is not possible), and sends the sentence once. `sent` is written
only when that provider accepts. If every provider rejects it, the row is
`failed`, the error names each rejection, and the channel is the last one
tried.

The customer is not notified twice. The hourly `reminder-sms-fallback` job
does not text a cancellation Meta has already accepted, and it does not see
a row that has been moved onto SMS or email. It still chases an older
WhatsApp cancellation that failed and never got that immediate fallback.

A handful of `failed` WhatsApp rows in that window, while the template is
still in review, means the flag was on too early. Turn it off, or leave it
on only if SMS and email are an acceptable stand-in until approval. The
customer still gets one notice.
