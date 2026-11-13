# Customer messaging policy

**Status:** Active
**Authority:** Product policy, as stated by the salon on 3 November 2026. The
code in [`channelPolicy.ts`](../supabase/functions/_shared/channelPolicy.ts)
implements it; if they disagree, the code is what customers experience and this
page is wrong.

## The policy

1. **SMS is a required operational channel.** A customer gives a valid mobile
   number and agrees to essential service messages as a condition of booking:
   confirmations, reminders, changes, cancellations and collection notices. The
   optional `humans.sms` tickbox is **not** consulted for these. (It defaults to
   false, so consulting it silently suppressed reminders and fallbacks.)
2. **WhatsApp preferred, SMS as the fallback.** WhatsApp is used where the
   customer is set up for it. SMS is used whenever WhatsApp is unavailable or
   its delivery fails. "Set up for it" is the customer's
   **preferred method of contact**: two pills on their profile, WhatsApp or SMS,
   stored as `humans.whatsapp` (true = WhatsApp, false = SMS). Everyone can be
   texted; the WhatsApp pill says they have WhatsApp and may be contacted there
   first. It is the single switch, also set by sign-up and the customer portal,
   and every essential message follows it, the collection notice included. The
   old "Reminder preferences" pills (`humans.reminder_channels`) were never read
   and are gone; migration `20261113120000` carried explicit "SMS, not WhatsApp"
   choices over. Email is not a contact preference: it is the automatic last
   resort when no phone channel works.
3. **No separate consent for essential messages.** The requirement is explained
   at sign-up, on profile completion and on the booking confirm step
   (`ESSENTIAL_MESSAGES_NOTICE` in `src/constants/salonPolicies.ts`).
4. **A STOP is never overridden automatically.** See [STOP](#stop) below.
5. **Marketing is separate.** Promotional SMS needs its own consent and is never
   implied by anything above. Nothing sends promotional SMS today.
6. **Existing customers are audited** ([below](#audit-of-existing-customers)).
7. **Failures reach staff.** See [what is not done yet](#what-is-not-done-yet).

## Where the rules live

| Piece | File |
|---|---|
| The policy (pure, shared by edge functions, staff UI and tests) | [`supabase/functions/_shared/channelPolicy.ts`](../supabase/functions/_shared/channelPolicy.ts) |
| Channel choice for confirmations, reminders, cancellations, SMS fallback | [`_shared/recipients.ts`](../supabase/functions/_shared/recipients.ts) (`channelAvailableFor`, `pickChannel`) |
| Day-closure broadcast, staff-composed reminders, welcome message | `_shared/broadcast.ts`, `reminder-send`, `notify-customer-welcome` |
| Collection notice (by preferred method of contact; SMS too where WhatsApp can't reach them) | [`src/engine/collectionNotice.ts`](../src/engine/collectionNotice.ts) |
| Automatic SMS when a WhatsApp collection notice fails | [`_shared/collectionFallback.ts`](../supabase/functions/_shared/collectionFallback.ts), called from `whatsapp-agent`'s delivery-status handler |
| Staff reminder modal's channel pills | `src/components/modals/send-reminder/channelAvailability.js` |
| STOP on texts: record it and flag staff | [`_shared/smsStop.ts`](../supabase/functions/_shared/smsStop.ts), called by `sms-send` |
| STOP on WhatsApp: record it | `whatsapp-agent` (`recordOptOut`) and [`whatsapp-agent.md`](whatsapp-agent.md#customer-opt-out) |
| The staff to-do raised by either STOP | [`_shared/staffFollowUp.ts`](../supabase/functions/_shared/staffFollowUp.ts) |

## STOP

A STOP is **honoured for the channel it was sent on**, and never overridden
automatically. The salon chose this on 3 November 2026 (the alternative, pausing
texts until staff clarified, was rejected).

- **A STOP on WhatsApp** (`whatsapp_opted_out`) switches **WhatsApp off**. Essential
  messages then go by **SMS instead**: reminders, confirmations, changes,
  cancellations and collection notices all keep working.
- **A STOP on texts** is recorded when Twilio refuses a send with error 21610
  (the number has texted STOP to us): `sms-send` sets `sms_opted_out`, with reason
  `asked_on_sms`, on every record on that number. That **always blocks SMS**, and
  nothing is retried another way.
- **Either STOP raises a staff to-do**, "STOP received: …", one per customer,
  deduplicated for a week. It says what is off and what carries on, and asks
  someone to ring them and check which channels they are happy with. A customer
  who meant "no messages at all" can then be recorded as opted out of texts too.
- Someone who has stopped **both** channels is reachable only by email, if an
  address is held.

Ticking the optional SMS box has no effect either way: it is not consulted.

**`sms-send` enforces SMS opt-outs itself, for every caller.** Before it calls
Twilio it checks the stored `sms_opted_out` on any record with that number, so a
stale screen, a notifier or the fallback job can never text someone who has opted
out. If the check cannot be made it refuses to send (503) rather than guess. The
two notifiers that call Twilio directly (cancellation notices and the welcome
text) record a text STOP and flag staff the same way `sms-send` does.

**A text must be able to reach the number.** Records hold landlines as contact
numbers on purpose, so "has a phone" is not enough: only UK mobiles and
well-formed international numbers count as textable
(`isSmsCapableNumber` in `channelPolicy.ts`). A landline-only customer with an
email stays on email instead of being sent to a channel that cannot deliver.

## A collection notice that fails on WhatsApp

Meta accepts a template first and reports a failure afterwards, so the collection
modal can say "sent" for a notice that never arrives (error 131026, the number is
not reachable on WhatsApp). The hourly SMS fallback is too slow for "ready in 15
mins", so this one is chased at once: when the failed status reaches
`whatsapp-agent`, the same words go by SMS through `sms-send`, and the text shows
in the customer's inbox thread.

- Only `ready_for_collection_v2`, and only within 30 minutes of sending. After
  that a "ready in 15 mins" text would mislead, and staff see the failure in the
  inbox instead.
- One automatic text per number per 30 minutes. Meta reporting the same failure
  twice texts once. A second collection notice that also fails in that window
  (staff pressed Retry) is not texted again, because the first text may have
  arrived without leaving a record. Nor is one sent if a collection text is
  already in that number's SMS thread (staff sent it by hand).
  This holds whatever order the failures arrive in. If two failures are handled
  at the very same moment, both can stand down and no text goes: never two.
- `sms-send` still refuses an opted-out or untextable number.
- If the text cannot be sent it is not retried; the failed WhatsApp message stays
  visible in the inbox.

## Scenarios

| Customer | WhatsApp | SMS | Email |
|---|---|---|---|
| Preferred method WhatsApp | yes | fallback | last resort |
| Preferred method SMS (optional SMS box irrelevant) | no | **yes** | last resort |
| No number | no | no | if an address is held |
| Landline-only number (UK landlines can't receive texts) | only if set up | **no** (stays on email) | yes |
| Opted out of SMS | unaffected | **never** | last resort |
| Replied STOP on WhatsApp | no | **yes, instead** (+ staff to-do) | yes, if held |
| Replied STOP to our texts | unaffected | **never** (+ staff to-do) | yes, if held |
| Stopped both channels | no | no | yes, if held |
| Any customer, **marketing** SMS | n/a | **no** (no consent flag exists; fails closed) | n/a |

The same scenarios are tests: `channelPolicy.test.ts`, `recipients.test.ts`,
`smsStop.test.ts`, the cancellation and SMS-fallback delivery tests,
`optOut.test.ts` in `whatsapp-agent`, and the Vitest suites for the collection
notice, the reminder modal and the sign-up and booking notices.

## What changed from the old behaviour

Before 3 November 2026 an SMS needed `humans.sms` ticked, which defaults to
**off**. So, for a customer who never ticked it:

- the hourly **SMS fallback skipped them**, and a failed WhatsApp reminder or
  confirmation was never chased;
- a customer with WhatsApp **also** off got no reminder at all (email, or nothing);
- the **cancellation notice** went to email, not SMS;
- the staff reminder modal showed SMS as unavailable.

A customer who replied STOP on WhatsApp was texted only if they had also ticked the
box. Now they are texted regardless (WhatsApp is off, SMS carries on), and a to-do
asks staff to check which channels they want.

## Audit of existing customers

The queries below are **read-only and return counts only**: no names, numbers or
messages. Running them is a read of customer data and needs the salon's go-ahead
for that session; the salon gave it on 3 November 2026 and the results are below.

### Results: production, 3 November 2026 (read-only, counts only)

| Measure | Count |
|---|---|
| Current customer records | 961 |
| With no phone number | 3 |
| Textable under the **old** rule (SMS box ticked) | 914 |
| Textable under the **new** rule | **958** (every record with a phone) |
| Newly textable (box was off, not opted out) | 44 |
| Had neither SMS nor WhatsApp, so reminders went by email or nowhere | 38 |
| Opted out of WhatsApp (any reason) | **0** |
| Opted out of SMS (any reason) | **0** |
| Failed WhatsApp notices in the last 60 days that the safety net never chased | 0 |
| Customers with an upcoming booking being suppressed at the time | 1 |

(These were produced by an earlier wording of the queries that also counted "paused"
customers; with no opt-outs on production the two wordings give the same numbers.)

What this means:

- **The old rule was a smaller problem than it first looked.** 95% of customers
  already had the box ticked, mostly from Join the Pack sign-up. It suppressed 44.
  It is still the right fix, and it also closes the 38 who had no SMS and no
  WhatsApp.
- **No existing customer is affected by the STOP rules**, because nobody has opted
  out on either channel.
- **Zero opt-outs is worth a second look.** It may simply be that nobody has
  stopped, or that STOPs before October 2026 were never recorded. These queries
  cannot tell the two apart; the number-level record
  (`whatsapp_conversations.whatsapp_opted_out_at`) could, and was outside what was
  authorised.

```sql
-- 1. How each current customer record is reachable under the OLD rule and the NEW one.
--    "old SMS" = the optional box ticked AND a number AND not opted out of SMS (a
--    WhatsApp STOP did not stop a text under the old rule).
--    "new SMS" = a number AND not opted out of SMS (a WhatsApp STOP is WhatsApp only).
with c as (
  select
    id,
    coalesce(phone, '') <> '' as has_phone,
    coalesce(whatsapp, false) as wa_set_up,
    coalesce(sms, false) as sms_box,
    whatsapp_opted_out as wa_out,
    sms_opted_out as sms_out
  from public.humans
  where archived_at is null
)
select
  count(*)                                                                              as customer_records,
  count(*) filter (where not has_phone)                                                 as no_phone,
  count(*) filter (where has_phone and not sms_out and sms_box)                         as old_sms_ok,
  count(*) filter (where has_phone and not sms_out)                                     as new_sms_ok,
  count(*) filter (where has_phone and not sms_out and not sms_box)                     as newly_textable_box_was_off,
  count(*) filter (where has_phone and not sms_out and not sms_box and not wa_set_up)   as had_no_sms_and_no_whatsapp,
  count(*) filter (where wa_out)                                                        as whatsapp_stopped,
  count(*) filter (where wa_out and not sms_out)                                        as stopped_whatsapp_now_texted,
  count(*) filter (where sms_out)                                                       as sms_opted_out
from c;

-- 2. WhatsApp opt-outs by recorded reason (is it a STOP, or unknown?). Reasons are
--    free text, which is why the policy treats every WhatsApp opt-out as a possible STOP.
select coalesce(nullif(btrim(whatsapp_opted_out_reason), ''), '(none recorded)') as reason, count(*) as records
from public.humans
where archived_at is null and whatsapp_opted_out
group by 1 order by 2 desc;

-- 3. SMS opt-outs by recorded reason.
select coalesce(nullif(btrim(sms_opted_out_reason), ''), '(none recorded)') as reason, count(*) as records
from public.humans
where archived_at is null and sms_opted_out
group by 1 order by 2 desc;

-- 4. Customers incorrectly suppressed RIGHT NOW: an upcoming booking, a mobile, not
--    opted out of SMS, but the optional box off, so the SMS fallback skips them.
select count(distinct h.id) as customers_with_upcoming_bookings_affected
from public.bookings b
join public.dogs d on d.id = b.dog_id
join public.humans h on h.id = d.human_id
where b.booking_date >= current_date
  and coalesce(b.status, 'Booked') not in ('Cancelled', 'No-show', 'Completed') -- NULL means Booked
  and h.archived_at is null
  and coalesce(h.phone, '') <> ''
  and not h.sms_opted_out
  and not coalesce(h.sms, false);

-- 5. Failed WhatsApp notices in the last 60 days that the SMS safety net never chased,
--    for customers with the box off (the old rule skipped them).
select l.trigger_type, count(*) as failed_whatsapp_notices
from public.notification_log l
join public.humans h on h.id = l.human_id
where l.channel = 'whatsapp'
  and l.status = 'failed'
  and l.trigger_type in ('reminder', 'confirmed', 'cancelled')
  and l.created_at > now() - interval '60 days'
  and not coalesce(h.sms, false)
  and not h.sms_opted_out
  and not exists (
    select 1 from public.notification_log s
    where s.booking_id = l.booking_id
      and s.trigger_type = l.trigger_type || '_sms_fallback'
  )
group by 1 order by 2 desc;
```

**Reading the results.** Query 4 is the number of people whose reminders were being
suppressed at the time (before this change). `whatsapp_stopped` is how many
customers have replied STOP on WhatsApp; they are all still reachable by text.

## SMS delivery tracking

Twilio accepts a text before it is delivered, so until now every text was logged
"sent" on that alone. The `twilio-status` function receives Twilio's delivery
callbacks and records four distinct outcomes:

| Outcome | Meaning | What we record |
|---|---|---|
| accepted | Twilio has it (queued, sending, sent) | nothing: it stays "sent" |
| delivered | the carrier confirmed it reached the handset | the message shows delivered |
| undelivered | the carrier took it and could not deliver it | the inbox message turns **failed**: "Text not delivered: … (reason)"; the reason is also written on the log row |
| failed | Twilio could not send it at all | the inbox message turns **failed**: "Text failed to send: … (reason)"; the reason is also written on the log row |

Twilio's error code is turned into a reason staff can act on ("their phone was off
or out of signal", "that number can't receive texts (it may be a landline)").

**Essential texts that do not arrive raise a staff to-do**: "Text not delivered:
Wendy's reminder text (their phone was off or out of signal) didn't arrive. Ring
them, or check the number on their record." It names the kind of text, never its
content or the number, and appears with the other to-dos (and as a push where staff
push is switched on); each text gets its own to-do, marked "(Ref SM…)", and is never
re-raised for the same text. A free-text message typed by staff only turns red in the inbox (they are
already looking at it). A text STOP (error 21610) is recorded as an SMS opt-out
and flagged as described under [STOP](#stop).

**The log row stays "sent" on purpose.** Every sender (reminders, confirmations,
cancellations, the SMS fallback) claims its (booking, message, customer) slot with a
"pending"/"sent" row before it texts, and that row is the only thing that stops the
next run from texting the same customer again. Marking an accepted text "failed"
would free the slot, and a phone that is switched off would be texted over and over.
So a delivery failure leaves the log row "sent" and only writes the reason on it; the
inbox message and the staff to-do are where staff see it. (A text that fails at send
time is still logged "failed", exactly as before, because nothing was sent.)

Statuses can arrive out of order, so one never moves backwards. The rule is
enforced in the database itself (a failure only updates a message that is not yet
delivered, and staff are only alerted if that update really changed a row), so two
callbacks arriving together cannot overwrite a delivery. A delivery that arrives
after a failure corrects both the inbox message and the reason on the log row.
A repeated callback changes nothing that is already done, and if an earlier attempt
died half way (answered 500) Twilio's retry finishes the missing steps.

**Security.** The endpoint is public (Twilio has no JWT), so the whole boundary is
the `X-Twilio-Signature` check against the configured callback URL, which fails
closed: no token or URL configured answers 500 and reads nothing, and a missing or
wrong signature answers 403 and writes nothing
([`edge-function-auth.md`](edge-function-auth.md)).

### Production verification recorded 5 November 2026

The owner confirmed that an SMS arrived and supplied an inbox screenshot showing
**delivered** for the message labelled **4 November 2026, 00:50**. This demonstrates
successful delivery tracking for that message. The evidence is owner confirmation
and the displayed inbox status; the callback request, message SID and production
secret configuration were not independently inspected.

Live failure alerts, STOP handling and retry behaviour remain unverified by this
test. The earlier PR #1184 statement that real Twilio traffic had not been tested
describes the evidence available when that PR was merged; this is the subsequent
verification record. No recipient number, customer message content or screenshot
is included in this record.

### Configuration and rollback

**Configuration-gated launch.** An unconfigured deployment is inert: POST requests
answer 500 before database access when either required setting is absent.
`sendSms` requests callbacks only when `TWILIO_STATUS_CALLBACK_URL` is set.
The production evidence above supersedes any assumption that the feature is still
unconfigured; it does not independently verify the exact current secret values.
Enabling it in an unconfigured environment is a Twilio and secrets change that
needs its own approval:


1. Set `TWILIO_AUTH_TOKEN` (the account **Auth Token**; an API key secret cannot
   verify signatures) and `TWILIO_STATUS_CALLBACK_URL`
   (`https://<project-ref>.supabase.co/functions/v1/twilio-status#rc=3&rp=5xx,ct`)
   with `supabase secrets set`. Set the token first. The part after `#` is a Twilio
   connection override: by default Twilio only retries when it cannot connect, so
   without `rp=5xx` a temporary database error (we answer 500 so the callback is
   retried) would never be retried. Twilio leaves that part out when it signs the
   request, and the function does the same.
2. No change in the Twilio console is needed: the URL is sent with each text.
3. Check: send one text; the function's log shows `delivered`, and that message
   shows delivered in the inbox.
4. **Roll back** by unsetting `TWILIO_STATUS_CALLBACK_URL`: new texts stop asking for
   callbacks and the function goes back to inert. Callbacks still in flight are
   also refused while the URL is unset; existing statuses, to-dos and opt-outs
   are not reverted.

Known limit: a failure that arrives before the sending function has finished
writing its own log row (milliseconds) would find nothing to update. Failures
normally arrive seconds later.

## What is not done yet

These need something outside a normal code change, so they are staged rather than
shipped:

- **Marketing consent column.** `canSendMarketing` exists and fails closed, but no
  consent flag exists to set. Adding `humans.marketing_sms_consent` (with a
  timestamp and source) is a migration, applied by hand
  ([`migrations.md`](migrations.md)) before any code that depends on it. All
  promotional SMS stays disabled until a separate, properly designed
  marketing-permission system exists.
- **The customer-facing Terms and Privacy text** on smarterdog.co.uk should say what
  the sign-up notice says, and `POLICIES_VERSION` should be bumped when it does.
  That text is not in this repository.
