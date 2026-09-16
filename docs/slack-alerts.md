# #salon-today Slack alerts

**Status:** Built, dark-launched (off by default)
**Authority:** Behaviour reference for the `slack-alerts` Edge Function
**Channel:** `#salon-today` (`C0C1UHHNWS1`)

Operational alerts into one Slack channel: **anything that changes today, or
needs a human to act today.** Nothing else goes in that channel — that
restraint is the feature. A channel that also carries deploy notices, error
reports and marketing chatter is one staff stop reading, and then the no-show
alert that mattered scrolls past unread.

## Turning it on and off

Three secrets, all set with `supabase secrets set` (never `VITE_`, never
committed). See [`.env.example`](../.env.example) for the annotated list.

| Variable | Effect |
|---|---|
| `SLACK_ALERTS_ENABLED` | Master switch. **Defaults to off.** |
| `SLACK_ALERTS_DRY_RUN` | Compute and log, post nothing. |
| `SLACK_SALON_TODAY_WEBHOOK` | The incoming-webhook URL. Secret. |

**To switch everything off:**

```bash
supabase secrets set SLACK_ALERTS_ENABLED=false
```

That takes effect on the next invocation. No deploy, no migration, no revert,
nothing to undo in the database. The trigger and cron jobs keep firing into a
function that does nothing — which is deliberate, because it means switching it
back on is equally cheap.

**To watch a day before going live:**

```bash
supabase secrets set SLACK_ALERTS_ENABLED=true SLACK_ALERTS_DRY_RUN=true
```

Every alert is computed, the deduplication claim is recorded, and the message
is written to the function logs instead of the channel. Worth doing for at
least one full open day. The thing most likely to be wrong is repetition, and
dry run shows it: query `slack_alerts` afterwards and check each no-show
appears **once**, not twelve times.

## What posts

| Event | How it is found | Message | |
|---|---|---|---|
| Cancelled for today | Trigger | `Cancellation — 09:30 slot now free` | 🔴 |
| Moved off today | Trigger | `Moved off today — was 09:30, slot now free` | 🔴 |
| Booked into today | Trigger | `New booking — 10:00 · Alfie (small, Yorkshire Terrier)` | 🟡 |
| Moved into today | Trigger | `Moved into today — 10:00 · Alfie (small, Yorkshire Terrier)` | 🟡 |
| Time changed today | Trigger | `Time changed — now 11:00 · Alfie (small, Yorkshire Terrier)` | 🟡 |
| Not checked in | Sweep | `No-show? — 09:00 booking not checked in` | 🔴 |
| Ready too long | Sweep | `Dog in Ready for 52 min — Alfie` | 🟡 |
| Message unanswered | Sweep | `Unanswered message — 34 min` | 🟡 |
| Morning summary | 08:15 | `Today: 9 bookings · first 08:30 · last 13:00 · 5 dogs free` | 🟢 |
| Quiet / full | 08:15 | appended: `· Quiet day — 36% of capacity` or `· Full — no space left` | 🟢 |

Every booking alert ends with an `Open booking` link; unanswered messages end
with `Open conversation`.

Two details that differ from a naive reading of the brief, both deliberate:

- **A cancellation also alerts when it frees tomorrow's *first* slot**, not
  just today's. That is the one thing worth knowing out of hours, and the
  quiet-hours rule below only makes sense if such a cancellation is alertable
  at all.
- **A same-day time change posts once, as "Time changed"** — not twice, and
  not as "Moved into today", which would be untrue. It is an update whose new
  date is today (so it alerts) but not a date change (so it is not a move off).

## The privacy rule

**No customer name, phone number, address or note ever reaches Slack.** Booking
time, dog name, size, breed and a link are the maximum.

This is enforced by the type system rather than by review. The message builder
accepts a `BookingSubject` — exactly five fields: id, slot, dog name, size,
breed — and is never handed a `bookings` or `humans` row, so there is no field
a name could arrive in. The database trigger likewise forwards dog facts only;
`booking_events` also carries `customer_name`, and it is deliberately not put
on the wire. Tests in
[`slackMessage.test.ts`](../supabase/functions/_shared/slackMessage.test.ts)
assert the rendered output directly, so a regression fails the build.

Worth being clear-eyed about the trade-off the salon has chosen: **a dog's name
and breed alongside an appointment time identifies the household** to anyone
who already knows the client list. Whoever is in `#salon-today` can effectively
reconstruct the day's clients. Owner names and phone numbers stay out
unconditionally, so this is well short of a leak — but it is a decision, not an
accident. Note also that the cancellation message carries no dog details at
all, which keeps the one alert allowed to post overnight the least identifying
of the set.

## Thresholds

All in one file:
[`_shared/slackAlertThresholds.ts`](../supabase/functions/_shared/slackAlertThresholds.ts).

| Threshold | Value |
|---|---|
| No-show, after slot start | 15 minutes |
| Ready for too long | 45 minutes |
| Message unanswered | 30 minutes |
| "Quiet day", share of cap | under 40% |
| Posting window | Mon–Wed 08:00–15:30 |
| Ledger retention | 90 days |

`DAILY_DOG_CAP` is deliberately **not** repeated there. The salon's 14-dog cap
already lives in three places that must stay in sync
([`src/constants/salon.ts`](../src/constants/salon.ts),
[`_shared/salonConstants.ts`](../supabase/functions/_shared/salonConstants.ts)
and `salon_config.daily_dog_cap`); a fourth copy is how drift starts.

**"X dogs free" counts against the 14-dog daily cap, not seats.** That is the
same denominator the staff calendar's Quiet/Steady/Full badge uses, so Slack
and the dashboard can never disagree. With a cap of 14, "quiet" means 5 dogs or
fewer — 6 is 42.9%, over the line.

## Quiet hours

Nothing posts outside **Monday–Wednesday, 08:00–15:30 Europe/London**, with one
exception and one safety net.

**The exception:** a cancellation freeing **tomorrow's first appointment** posts
immediately, at any hour. That is the salon's opening slot, and hearing at
19:00 rather than 08:00 is the difference between refilling it and eating it.
There is no upper cut-off.

The check order matters: the exception is tested **before** the weekday test.
Tomorrow being Monday means today is Sunday, which fails a Mon–Wed test — so
checking the weekday first would silently kill the most useful out-of-hours
alert there is.

**The safety net:** anything else raised out of hours is **queued, not
dropped**, and flushed when the window next opens. Otherwise a cancellation
made at 07:30 for that same afternoon would vanish. A queued alert whose date
has already passed is discarded rather than flushed — posting yesterday's news
is worse than posting nothing.

Sweep-driven alerts are the exception to the exception: they are **not** queued,
because they re-evaluate every five minutes and heal themselves at 08:00.
Queueing one would flush a stale "no-show?" about yesterday.

**A closed day still posts its morning summary** (`Today: salon closed`), so the
channel positively confirms the day rather than going quiet in a way that could
equally mean the alerts have broken.

### Timezone

Europe/London throughout, read from the wall clock via `Intl`. Never a fixed
UTC offset — that is correct for half the year and silently wrong for the
other half. Tests assert each window boundary twice, once in BST and once in
GMT.

pg_cron stays in UTC and is treated as a **coarse wake-up only**; it never
decides anything. The sweep is scheduled `*/5 7-15 * * 1-3`, which
over-covers the London window from both sides all year, and the function makes
the precise judgement. The 08:15 summary uses two UTC jobs an hour apart, both
passing `at_hour_uk: 8`; whichever lands on 08:xx London does the work and the
other returns skipped. This is the same trick the existing reminder jobs use
(migration `20260906120000_late_reminder_pass.sql`).

## Deduplication

Each alert derives a stable key, recorded in the `slack_alerts` table under a
unique index. The sender **claims the key by INSERT before posting** — a
`23505` unique violation means somebody already handled it.

Claim-before-post, never post-then-record. If the function dies between the
two, the alert is lost rather than sent twice; for a channel staff are meant to
trust, under-posting is the right failure direction. A failed send demotes the
row back to `queued` so the next sweep retries it.

Two keys carry more than an id, for reasons that are easy to get wrong:

- **new/moved includes the slot**, so a second time change on the same day is
  a fresh alert rather than a suppressed one.
- **unanswered includes `last_inbound_at`**, so a *new* customer message breaks
  through while the same unanswered one stays quiet.

The table is deliberately separate from `notification_log`, whose mechanism it
copies. That table is the **customer** communications log, and the staff
dashboard derives each booking's reminder Sent/Unsent state from it; internal
ops alerts would mean widening two load-bearing CHECK constraints and adding
rows every other reader must learn to ignore.

## Deployment order

Migrations in this project are **applied to production by hand** — merging to
`main` deploys the frontend and Edge Functions but not the database (see
[`migrations.md`](migrations.md)).

1. Apply `20260915120000_slack_alerts_ledger.sql` (inert on its own).
2. Merge, so the `slack-alerts` function deploys.
3. Apply `20260916090000_slack_alerts_triggers_and_cron.sql`.
4. Set the secrets, starting with `SLACK_ALERTS_DRY_RUN=true`.

Step 3 before step 2 is harmless — every call is fire-and-forget with errors
swallowed — but the triggers would POST into a 404 and fill the pg_net log for
no reason.

## What this does not do

- **No Twilio delivery alerts yet.** A failed reminder SMS is not detectable
  today: nothing sets `StatusCallback`, and there is no inbound Twilio route or
  signature verification anywhere in the repo. It is a separate piece of work
  and covers **SMS only** — WhatsApp reminders go via Meta, so their failures
  arrive as `whatsapp_events` status events instead.
- **No Sentry handler.** Sentry → Slack is configured in the Sentry UI. Point
  it at a **different** channel: a stack trace is not "something a human must
  do today", and mixing the two dilutes both.

## Where the code lives

| Piece | File |
|---|---|
| Thresholds | [`_shared/slackAlertThresholds.ts`](../supabase/functions/_shared/slackAlertThresholds.ts) |
| Posting window, queue rules | [`_shared/slackAlertWindow.ts`](../supabase/functions/_shared/slackAlertWindow.ts) |
| Messages, dedupe keys | [`_shared/slackMessage.ts`](../supabase/functions/_shared/slackMessage.ts) |
| The function | [`slack-alerts/index.ts`](../supabase/functions/slack-alerts/index.ts) |
| Ledger table | [`20260915120000_slack_alerts_ledger.sql`](../supabase/migrations/20260915120000_slack_alerts_ledger.sql) |
| Trigger, cron, retention | [`20260916090000_slack_alerts_triggers_and_cron.sql`](../supabase/migrations/20260916090000_slack_alerts_triggers_and_cron.sql) |
| Booking deep link | [`useBookingDeepLink.ts`](../src/hooks/useBookingDeepLink.ts) |
| Database tests | [`223_slack_alerts.test.sql`](../supabase/tests/223_slack_alerts.test.sql) |
