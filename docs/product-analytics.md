# Product analytics (PostHog)

PostHog receives a **mirror** of the customer booking-wizard funnel. The database table
`booking_funnel_events` stays the source of truth for the staff Funnel report; PostHog adds funnel
charts, time-to-convert and breakdowns (device, browser, referring domain) without new SQL.

Code: [src/lib/analytics.ts](../src/lib/analytics.ts), called from the three telemetry callbacks in
[BookingWizard.tsx](../src/components/customer/booking/BookingWizard.tsx) (`fireFunnel`,
`fireBlocker`, `fireConfirmFailed`). A PostHog event is sent only when the database row is, so
the two stay aligned.

## What is sent

One event name, `booking_funnel_step`, with:

| Property | Meaning |
| --- | --- |
| `funnel_session_id` | Per-attempt id, identical to `booking_funnel_events.session_id` |
| `step` | `started`, `select_dogs`, `select_service`, `select_date`, `select_slot`, `confirm`, `booked`, `confirm_failed`, or the step a blocker fired on |
| `step_index` | Monotonic order within the attempt |
| `dog_count` | Dogs selected, or null |
| `blocked_reason` | Stable blocker code, when the wizard offered no way forward |
| `failure_code` | Stable confirm-failure code |

Never sent: `humans.id`, names, phone numbers, emails, dog details, `failureDetail` (free text),
query strings, URL hashes, UUIDs in paths, or the full referrer.

## Privacy design

- **No device storage.** `persistence: "memory"` — no cookies, localStorage or sessionStorage —
  so the PECR storage-consent rule is not engaged and no cookie banner is needed for this.
  PostHog's own distinct id lasts one page load, so aggregate funnels by `funnel_session_id`
  (funnel insight → "Aggregating by" → HogQL expression `properties.funnel_session_id`).
- **No people.** `person_profiles: "never"`; `identify()` is never called.
- **Nothing automatic.** Autocapture, pageviews, page-leave, session replay, surveys, feature
  flags, web experiments and external script loading are all off.
- **Scrubbed URLs.** `before_send` trims URLs to origin + path and replaces UUIDs with `:id`.
- **EU region** (`eu.i.posthog.com`), with "Discard client IP data" on in the project.

This is still processing of personal data under UK GDPR (device and browser metadata), on a
legitimate-interests basis. The public privacy policy should name PostHog as an analytics
processor before this is switched on in production.

## Switching it on

1. Vercel → Project → Settings → Environment Variables → add `VITE_POSTHOG_KEY` (the project's
   `phc_` key) for **Production** only. Optionally `VITE_POSTHOG_HOST`.
2. Redeploy production — `VITE_` values are baked in at build time.
3. Book a test appointment on smarterdog.co.uk/book and confirm `booking_funnel_step` events
   appear in PostHog → Activity.

It stays off when the key is missing, in non-production builds, and when `VITE_FORCE_OFFLINE=1`,
so tests, `npm run dev` and E2E never load the library. Ad blockers commonly block PostHog; the
database funnel is unaffected, which is one reason it remains the source of truth.

## Turning it off

Remove `VITE_POSTHOG_KEY` in Vercel and redeploy. No code change needed.
