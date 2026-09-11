# First real booking — Monday readiness checklist

A short pass to run on the first open day after a release. Salon runs **Mon–Wed,
08:30–13:00**, so Monday is the first chance to see the live paths exercised by
real people.

Nothing here needs a test booking in production. Where a step would create real
data, it says so — do those on a quiet slot or skip and watch a genuine one.

---

## Before the doors open (5 min)

- [ ] `smarterdog.co.uk/stafflogin` loads, staff login works
- [ ] `/staff/today` shows the right dogs for today, in slot order
- [ ] Week calendar matches the diary you expect
- [ ] No red banner / offline indicator

## Customer journey — watch one real booking end to end

- [ ] Customer can reach `/customer` and log in (or sign up)
- [ ] Dog selection lists their dogs; a **pregnant** dog is greyed out and the
      note points to WhatsApp (there is no phone line — never a "call us")
- [ ] Service choice shows only the four bookable services
- [ ] Availability looks sane: Mon–Wed only, 08:30–13:00, no triple-double
      slots (the 2-2-1 rule), large dogs behaving at 12:30/13:00
- [ ] Booking saves and lands on the **right** success screen:
      - no deposit → "All booked in!"
      - deposit required → "Deposit needed", never "All booked in!"
      - read-back failed → "Appointment saved", telling them to check the
        dashboard rather than claiming it is confirmed
- [ ] The booking appears on the staff diary within a few seconds

## Deposit flow (only if a deposit-required customer books)

- [ ] Card states amount, reference, deadline **and** the release consequence
- [ ] Bank details shown match Settings
- [ ] The customer does **not** receive the ordinary "booked in / see you then"
      confirmation while the deposit is outstanding
- [ ] Staff view shows the booking as awaiting deposit, not confirmed

> Known state: deposit messaging to the customer is **not** automated yet. Once
> the deposit is matched, staff still tell them by hand. Don't expect a message.

## Staff operations

- [ ] Create a booking from the staff side — capacity rules bite as expected
- [ ] Reschedule one — old slot frees, new slot fills, customer notified once
- [ ] Cancel one — slot frees, cancellation message sends once
- [ ] Capacity override (if needed) requires approval and is recorded
- [ ] Close a date — every affected visit gets a linked rearrange task, and the
      day cannot be left half-closed

## Notifications — the thing most likely to be quietly wrong

- [ ] Confirmation went to the **right person** (owner, plus any trusted humans
      ticked at booking time — not the whole household by accident)
- [ ] Wording reads like the salon, not like a system
- [ ] **Exactly one** message per recipient per event — no duplicates
- [ ] Message appears in the staff inbox with a delivery status
- [ ] If WhatsApp failed, the SMS fallback covered it (see below)

## Quick health check (run once, end of day)

```sql
-- Anything failing to reach customers in the last 24h?
select trigger_type, channel, status, count(*)
from notification_log
where created_at >= now() - interval '24 hours'
group by 1,2,3 order by 4 desc;

-- Anything stuck half-sent?
select count(*) from notification_log
where status = 'pending' and created_at < now() - interval '1 hour';

-- Did today's bookings all record a lifecycle event with an actor?
select event_type, count(*), count(*) filter (where actor_id is not null) as with_actor
from booking_events
where occurred_at >= current_date
group by 1;
```

Expected: `pending` older than an hour = **0**. A handful of WhatsApp
`failed` rows is normal *if* matching `reminder_sms_fallback` rows exist —
that is the fallback working, not a fault. Sustained failures with no
fallback means the Meta template or number needs attention.

## If something looks wrong

- Customer-facing copy wrong → check the live bundle actually updated
  (iOS PWA caches hard: close and reopen the app twice)
- "Generate reply" or agent silence → look in `whatsapp_events.error_message`,
  not the edge function request logs; the agent swallows throws into a 200
- Booking rejected unexpectedly → the three insert gates all raise `P0001`;
  the wizard maps on the message, so read the actual error text
- Schema-looking error right after a deploy → check the migration was applied
  to prod by hand; merging never applies it
