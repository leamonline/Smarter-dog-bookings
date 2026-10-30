# booking_cancelled_v1

Status: Active. This template is already approved in WhatsApp Manager.
Do not submit it again, and do not edit the body. A wording change needs a
new template name.

Checked live via the WhatsApp Business API on 30 October 2026.

| Field | Value |
|---|---|
| Name | `booking_cancelled_v1` |
| Language | English (UK) — `en_GB` |
| Category | Utility (`UTILITY`) |
| Status | Approved |
| Parameter format | Positional |
| Header, footer, buttons | None. Body only. |

Approved body:

```
Hi {{1}}, we're sorry to let you know that {{2}}'s appointment on {{3}} has been cancelled. If you'd like to rearrange, just reply here and we'll find a new time — Smarter Dog Grooming Salon.
```

Approved example: `["Sarah", "Cooper", "Monday 16 June at 10:00am"]`.

| Variable | Meaning | Example |
|---|---|---|
| `{{1}}` | Customer's first name | Sarah |
| `{{2}}` | Dog's name | Cooper |
| `{{3}}` | Appointment date, and the time when the booking has one | Monday 16 June at 10:00am |

`{{3}}` is one field, the same way `booking_confirmed_v1` sends a single
"when". The time uses the same `formatTime` as that confirmation (`10:00`
becomes `10:00am`, `09:00` becomes `9:00am`). The date is the long form in
the approved sample (`Monday 16 June`), not the short SMS date. A booking
with no slot sends the date on its own (`Tuesday 20 October`).

The staff picker lists this template because it is approved, like the other
approved templates. The preview in
[`src/constants/whatsappTemplates.js`](../../src/constants/whatsappTemplates.js)
is the approved body. Sending it by hand from the inbox uses the same words
Meta already has.

## Text and email stay as they are

SMS and email still send the shorter sentence, with the short date and no
time:

> Hi Sarah, your appointment for Bella on Tue 20 Oct has been cancelled. Rebook anytime.

That sentence is what a fallback texts if WhatsApp is not available or Meta
rejects the send. It is not the template body.

## Who receives the WhatsApp

This wording apologises ("we're sorry to let you know"). It is only for a
cancellation the **salon** made.

The automatic send uses it only when all of these are true:

- `CANCELLATION_WHATSAPP_ENABLED` is the string `true`
- `bookings.cancellation_cause` is exactly `salon`
- WhatsApp is switched on, a phone is on file, and the customer has not opted out

`whatsapp-send` checks the opt-out again. The send is always this template,
never free text, so it is allowed inside and outside the 24-hour chat window.

A customer-requested cancellation (`cancellation_cause` `customer`, including
the portal and a WhatsApp cancel) stays on the short text, then email. It
does not get this apology. A reschedule is still skipped when its reason is
one of the two reschedule reasons; any other non-salon cause, including
`reschedule`, `system`, or a blank cause, also stays on text then email.
A blank cause is not treated as the salon. The dormant staff-visit commands
that cancel without writing `cancellation_cause` therefore stay on text.

Staff choose Customer or Salon in the cancel dialog. That choice is written
on the same update as the status, and the notification reads it from the new
row. A staff resend of a failed notice has only the current row; that row's
`cancellation_cause` is used the same way.

A separate template for "you asked us to cancel" (for example
`booking_cancellation_confirmed_v1`) could be added later. Do not create it
in Meta as part of this change.

The flag defaults to off. Merging deploys the function without changing
today's text-then-email notices. It can be turned on as soon as that deploy
is live. There is nothing left to wait for in Meta.

```bash
supabase secrets set CANCELLATION_WHATSAPP_ENABLED=true
```

Unset, empty, `false`, or any other value leaves WhatsApp off. To turn it
off again:

```bash
supabase secrets set CANCELLATION_WHATSAPP_ENABLED=false
```

The name is listed in [`.env.example`](../../.env.example). It is an Edge
Function secret, not a `VITE_` value.

If Meta rejects a send after the flag is on (the template is paused, or the
name or language does not match), the function does not log that as sent. It
moves the same `notification_log` row onto SMS, or email if a text is not
possible, and the customer gets that one notice. The hourly
`reminder-sms-fallback` job does not text a cancellation Meta has already
accepted.
