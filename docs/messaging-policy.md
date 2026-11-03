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

`whatsapp_opted_out` records that a number replied STOP on WhatsApp (and can be
set by staff). An opt-out belongs to the **number**, so we cannot know a customer
only meant WhatsApp. The policy therefore:

- **pauses automatic texts** as well as automatic WhatsApp, rather than guessing;
- **flags staff** with a "Messaging paused:" to-do (one per customer, deduplicated
  for a week) saying to ring them and check which channels they are happy with;
- is lifted only by an **audited WhatsApp re-enable**
  (`staff_reenable_whatsapp_number`), or by staff using **"Confirm texts are
  fine…"** on the customer card. That records `preferred_channel = 'sms'` as the
  proof, together with who confirmed it, when and why, in
  `sms_permission_confirmations`. Ticking the optional SMS box does **not** lift
  it: Join the Pack onboarding ticks it by default, so it proves nothing.

### Confirming texts after a STOP

On a customer whose WhatsApp is stopped, the card shows "Texts are paused — they
said STOP on WhatsApp" with **Confirm texts are fine…**. Staff must write how the
customer told them (at least 10 characters, kept with their name and the time, so
no health or payment details). Then:

- WhatsApp **stays off**: SMS and WhatsApp permission are separate decisions.
- The proof can only be written by the audited action
  (`staff_confirm_sms_permission`); an ordinary edit, the portal or an import
  cannot set it while WhatsApp is stopped (a trigger refuses).
- It is per customer record, not per number: another record on the same number
  stays paused until someone has asked about it too.
- A customer who opted out of **SMS** cannot be confirmed here.
- **A new STOP clears it.** If they stop again, the confirmation is removed, the
  pause returns and the history records "Cleared by a new STOP".
- **Pause texts again…** takes it back, with a reason, and is recorded the same way.

`sms_opted_out` always blocks SMS. When Twilio refuses a text with error 21610
(the number has texted STOP to us) `sms-send` records `sms_opted_out`, with
reason `asked_on_sms`, on every record on that number and raises the same staff
to-do. It does not try another channel.

## Scenarios

| Customer | WhatsApp | SMS | Email |
|---|---|---|---|
| Ordinary, WhatsApp set up | yes | fallback | last resort |
| WhatsApp not set up, optional SMS box off (the default) | no | **yes** | last resort |
| No mobile number | no | no | if an address is held |
| Opted out of SMS | unaffected | **never** | last resort |
| Replied STOP on WhatsApp | no | **paused** until staff clarify | yes, if held |
| Replied STOP on WhatsApp, staff used **Confirm texts are fine…** | no | yes (audited) | yes |
| Confirmed, then replied STOP again | no | **paused again** (confirmation cleared and recorded) | yes, if held |
| Opted out of both | no | no | yes, if held |
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

And the reverse: a customer who replied STOP on WhatsApp **and** had the box ticked
(every Join the Pack sign-up) was texted anyway. Under the policy that is now
paused until staff clarify. **This reduces reminders to those customers**, which
is why each STOP now raises a to-do. Customers who stopped *before* this change
get no retroactive to-do; the audit below finds them.

## Audit of existing customers

The queries below are **read-only and return counts only**: no names, numbers or
messages. They have not been run against production. Running them is a read of
customer data and needs the salon's go-ahead for that session.

```sql
-- 1. How each current customer record is reachable under the OLD rule and the NEW one.
--    "old SMS" = the optional box ticked AND a number AND not opted out of SMS (a
--    WhatsApp STOP did not stop a text under the old rule).
--    "new SMS" = a number AND not opted out AND not paused after a WhatsApp STOP.
with c as (
  select
    id,
    coalesce(phone, '') <> '' as has_phone,
    coalesce(whatsapp, false) as wa_set_up,
    coalesce(sms, false) as sms_box,
    whatsapp_opted_out as wa_out,
    sms_opted_out as sms_out,
    coalesce(preferred_channel, '') = 'sms' as sms_confirmed
  from public.humans
  where archived_at is null
)
select
  count(*)                                                                              as customer_records,
  count(*) filter (where not has_phone)                                                 as no_phone,
  count(*) filter (where has_phone and not sms_out and sms_box)                         as old_sms_ok,
  count(*) filter (where has_phone and not sms_out and not (wa_out and not sms_confirmed)) as new_sms_ok,
  count(*) filter (where has_phone and not sms_out and not sms_box and not wa_out)      as newly_textable_box_was_off,
  count(*) filter (where has_phone and not sms_out and not sms_box and not wa_set_up and not wa_out) as had_no_sms_and_no_whatsapp,
  count(*) filter (where wa_out and sms_box and not sms_out)                            as were_texted_after_stop_now_paused,
  count(*) filter (where wa_out and not sms_confirmed and not sms_out)                  as paused_awaiting_staff,
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
  and not coalesce(h.sms, false)
  and not h.whatsapp_opted_out;

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

**What to do with the results.** Query 4 is the number of people whose reminders
are being suppressed today. Query 2 and the `paused_awaiting_staff` figure from
query 1 are the customers who stopped before this change and now need a
phone call to clarify which channels they allow; nothing has raised a to-do for
them. Raise those by hand (or with an approved one-off script) rather than letting
the first sign be a missed appointment.

## What is not done yet

These need something outside a normal code change, so they are staged rather than
shipped:

- **Marketing consent column.** `canSendMarketing` exists and fails closed, but no
  consent flag exists to set. Adding `humans.marketing_sms_consent` (with a
  timestamp and source) is a migration, applied by hand
  ([`migrations.md`](migrations.md)) before any code that depends on it. All
  promotional SMS stays disabled until a separate, properly designed
  marketing-permission system exists.
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
