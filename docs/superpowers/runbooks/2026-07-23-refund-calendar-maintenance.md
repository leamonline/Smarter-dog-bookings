# Refund calendar maintenance

The salon promises a deposit refund "within five working days". The database
computes the exact date, skipping weekends and England-and-Wales bank
holidays. This is the small, occasional job that keeps that promise honest.

**Expected effort: one SQL call every couple of years, plus a rare one when an
exceptional bank holiday is announced.** Settings warns you months ahead. You
should never discover this while a customer is waiting for a refund receipt.

## Why coverage is tracked separately from the holidays

It would be tempting to treat "the latest holiday we have recorded" as the end
of what we know. That is wrong, and the reason is worth stating plainly:

**A maximum date proves nothing about completeness.** If someone recorded
Christmas 2028 but forgot the Spring bank holiday that year, the maximum date
still says "2028 is covered" and refunds quietly land a day early — in the
customer's disfavour, with no record of how.

**Exceptional holidays land inside ranges you already believed complete.** A
coronation, a state funeral or a jubilee is announced at short notice, often
for a date inside a year that was recorded long ago. A maximum-date check
cannot possibly detect it.

So `booking_refund_calendar_coverage` stores an explicit assertion: *every
England-and-Wales bank holiday between these two dates has been recorded, from
this published version of the calendar, by this person, at this time.* A refund
obligation records which coverage row justified its date, so a disputed refund
can always be traced back to the calendar in force at the time.

## The warning you will see

Settings reads `booking_refund_calendar_status()`. Severity escalates as the
verified range approaches the furthest date a refund could need — today plus
the booking horizon (180 days) plus a fortnight for weekends and holidays:

| Headroom | Severity | What it means |
|---|---|---|
| More than 180 days | `ok` | Nothing to do. |
| 180 days | `notice` | Extend when convenient. |
| 90 days | `warning` | Extend soon, or refunds stop quoting a date. |
| 30 days | `urgent` | Extend now. Refunds will start failing. |
| None | `critical` | Refund dates cannot be calculated. |

At `critical`, refund creation raises `refund_calendar_coverage_missing`. That
is deliberate: a wrong refund date is worse than a blocked one, and the block
is loud, specific and tells you exactly what to do.

## Routine extension

Get the published dates from <https://www.gov.uk/bank-holidays> — the
**england-and-wales** division. Record substitute days on the day actually
taken, not the original date.

```sql
select public.extend_refund_calendar(
  p_holidays => jsonb_build_array(
    jsonb_build_object('date','2030-01-01','label','New Year''s Day'),
    jsonb_build_object('date','2030-04-19','label','Good Friday'),
    jsonb_build_object('date','2030-04-22','label','Easter Monday'),
    jsonb_build_object('date','2030-05-06','label','Early May bank holiday'),
    jsonb_build_object('date','2030-05-27','label','Spring bank holiday'),
    jsonb_build_object('date','2030-08-26','label','Summer bank holiday'),
    jsonb_build_object('date','2030-12-25','label','Christmas Day'),
    jsonb_build_object('date','2030-12-26','label','Boxing Day')
  ),
  p_calendar_version => '2030-01-15',   -- the date you read gov.uk
  p_covers_to        => date '2030-12-31'
);
```

Owner-only. It records the holidays, asserts the new verified range from the
existing start date (so no gap can be created), and returns the new status.

Then confirm:

```sql
select public.booking_refund_calendar_status();
```

Severity should be back to `ok`.

## Exceptional bank holidays

An extra bank holiday announced for a date **inside** an already-covered range
is the case a maximum-date check would miss entirely. Add it exactly the same
way, but with a **new `p_calendar_version`** and the same or a later
`p_covers_to`:

```sql
select public.extend_refund_calendar(
  p_holidays => jsonb_build_array(
    jsonb_build_object('date','2029-05-14','label','Exceptional bank holiday')
  ),
  p_calendar_version => '2028-11-02-exceptional',
  p_covers_to        => date '2031-12-31'
);
```

The new version re-makes the assertion rather than leaving the old one to be
assumed still true. Refund obligations created before it keep pointing at the
coverage row that was actually in force when they were made — which is the
honest record, and what you would want if a customer ever queried a date.

`p_covers_to` must extend beyond the current maximum, so if the range already
runs far enough, push it out by a year at the same time.

## If a refund is blocked right now

You will see `refund_calendar_coverage_missing` with a detail line naming the
date range needed. Extend the calendar as above; the refund can then be
created normally. Nothing is lost and no customer record is damaged — the
obligation simply was not written yet.

Do not work around it by inserting into `booking_refund_non_working_days`
directly without a coverage row. The holiday would be honoured but the refund
would still be blocked, because the assertion is what the calculation checks.

## Deliberately not built

There is no calendar-management screen. This is a couple of SQL calls every
few years behind a Settings warning. If the job ever turns out to need doing
often enough that the SQL is a nuisance, that is the evidence for building a
screen — not before.
