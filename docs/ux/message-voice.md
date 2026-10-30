# Writing customer messages (WhatsApp and SMS)

Status: Draft, proposed 25 October 2026. Describes what the code already does; it
adds no new rule.

The design system's voice section covers screens: buttons, empty states, errors.
Customers meet the salon through its messages as well as its screens, and messages
follow different rules. This page writes down the ones the code already enforces, so a
new message, template or fallback does not have to rediscover them.

There are two registers, and they pull in opposite directions.

## 1. Conversational replies (a person, or the assistant, answering)

Used for: the assistant's drafts and fallbacks, and staff replies in the inbox.
The source of truth for the wording is the fallback set in
`supabase/functions/_shared/agentRisk.ts`; its comment says the phrasing is the
salon's own tone of voice, kept close on purpose.

| Rule | In practice |
|---|---|
| Warm, short, local | Under three sentences. "Hey, thanks for sniffing us out!" |
| Ends with ` X` | Every fallback ends with a space and a capital X, the salon's sign-off. |
| A small set of emoji | Only 🐶 ❤️ 🎓 🐾 😊. No others. |
| Talk about the dog | "just tell me which pup and roughly when suits". |
| Ask for what you need, in a list when it helps | Name, breed, ideal day and time. |
| Reassure first when something went wrong | An apology comes first, a person second, and no booking prompt: "I'm so sorry, that's not how a visit to us should go". |
| No link when the link has failed | If the customer says the booking page did not work, do not send the page again. |
| Say what happens next | "I'll get one of the team to pick this up properly". |
| Walk-ins are not booked | "just pop in anytime between 08:30 and 13:00 (Mon, Tue or Wed)". |
| Prices are guides | State that the final price is confirmed after the groom. Do not hard-code figures in new copy: they live in Settings. |
| Acknowledge a STOP once | One short acknowledgement, no promise to message again. Nothing re-enables messages automatically. |

Most replies follow the same three beats: reassure, inform, close warmly.

## 2. Automated notifications (confirmations and reminders)

Used for: `booking_confirmed_v1`, the reminder messages, and the cancellation
sentence, sent from `supabase/functions/notify-booking-confirmed`,
`notify-booking-reminder` and `notify-booking-cancelled`.

The text and the email stay one short line, with no time: "Hi Sarah, your
appointment for Bella on Tue 20 Oct has been cancelled. Rebook anytime."
WhatsApp uses the already-approved `booking_cancelled_v1` body only when the
salon cancelled. That body apologises and includes the date and time. It is
recorded in [the template note](../whatsapp-templates/booking_cancelled_v1.md).
Do not resubmit it. A cancellation the customer asked for keeps the short
sentence by text or email. The automatic WhatsApp send stays off until the
flag in that note is on.

| Rule | Why |
|---|---|
| **No emoji, no em-dash.** | The code says so in its own comments. A character outside the basic SMS alphabet turns one 160-character text into several 70-character ones, and the same wording is the SMS fallback if WhatsApp is not delivered. |
| **One SMS segment.** | Keep it tight enough to fit; a short date form such as "Mon 29 Mar" exists for this reason. |
| **First name only.** | "Hi Sarah". |
| **Name the dog or dogs, and get "is" or "are" right.** | "Biscuit is booked in" and "Biscuit and Bella are booked in". |
| **Say what, when, and a warm close.** | Service, date, time, then "See you then!". The confirmation text in `notify-booking-confirmed` is the model. |

## 3. Approved templates (Meta)

A template is approved wording with fields. Staff cannot change the words, only the
fields.

- Fields are filled in a fixed order. `customer_enquiry_response_v1` has three:
  first name (auto-filled), enquiry topic, reply. All are required.
- The preview must match the approved body exactly, including the line break and
  the sign-off.
- A template does not open the 24-hour free-reply window. The customer has to reply
  first.
- UK English throughout: colour, kerbside, £.

## A short checklist before sending new copy

1. Which register is this? A conversation gets the sign-off and a little warmth; an
   automatic message gets neither emoji nor dashes.
2. Would it fit one text message? If it is automatic, it must.
3. Is the customer's first name and the dog's name in it, and nothing more private?
4. Does it say what happens next?
5. If something has gone wrong: apology first, a person second, no sales prompt.

## Not covered here

- **Email.** I found no email templates in the repository, so there is nothing to
  describe. Add a section when there are.
- **Exact approved wording of each Meta template.** It lives with Meta, not in this
  repository; only the fields and the rules around them are recorded above.

When this page is accepted, copy section 1 and 2 into the design system's voice
section on the next `/design-sync`, so the two stay in step.
