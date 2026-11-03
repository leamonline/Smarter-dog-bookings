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
   its delivery fails.
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
| Collection notice (WhatsApp, or SMS where WhatsApp can't reach them) | [`src/engine/collectionNotice.ts`](../src/engine/collectionNotice.ts) |
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

## Scenarios

| Customer | WhatsApp | SMS | Email |
|---|---|---|---|
| Ordinary, WhatsApp set up | yes | fallback | last resort |
| WhatsApp not set up, optional SMS box off (the default) | no | **yes** | last resort |
| No mobile number | no | no | if an address is held |
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
messages. They have not been run against production. Running them is a read of
customer data and needs the salon's go-ahead for that session.

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

## What is not done yet

These need something outside a normal code change, so they are staged rather than
shipped:

- **Marketing consent column.** `canSendMarketing` exists and fails closed, but no
  consent flag exists to set. Adding `humans.marketing_sms_consent` (with a
  timestamp and source) is a migration, applied by hand
  ([`migrations.md`](migrations.md)) before any code that depends on it.
- **SMS delivery status.** Twilio accepts a text before it is delivered, and
  nothing receives the delivery callback (no `StatusCallback`, no inbound Twilio
  route or signature check), so a text that later fails is logged "sent". Today's
  alerting therefore covers texts Twilio **rejects** at send time (those show on the
  dashboard's delivery-failure card, and a STOP now raises a to-do), not texts that
  fail afterwards. Closing that needs a new signature-verified inbound endpoint,
  the Twilio Auth Token as a function secret and a Twilio-side setting; see
  [`slack-alerts.md`](slack-alerts.md#what-this-does-not-do).
- **The customer-facing Terms and Privacy text** on smarterdog.co.uk should say what
  the sign-up notice says, and `POLICIES_VERSION` should be bumped when it does.
  That text is not in this repository.
