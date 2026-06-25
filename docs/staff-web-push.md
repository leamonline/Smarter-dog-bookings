# Staff Web Push

An **additive, staff-only** notification channel. A staff member who installs
the staff app to their iPhone/iPad Home Screen and taps **Enable notifications**
(Settings → Your Account → Device notifications) receives a push to that device
when any of these happen:

1. A new inbound customer message (WhatsApp/SMS) lands in the inbox
2. A new booking is made
3. A booking is cancelled
4. A booking is rescheduled
5. A new client submits a signup (Join the Pack — needs review)
6. Someone joins the waitlist

It changes **nothing** for customers and nothing for a staff member who never
enables it. The whole sender is dark-launched behind `STAFF_PUSH_ENABLED`
(default off).

## How it fits together

```
event (DB write)
  └─ AFTER INSERT trigger (booking_events / whatsapp_messages /
       salon_todos / waitlist_entries)
       └─ pg_net POST  → notify-staff edge function   (Bearer get_webhook_secret)
            ├─ gate on STAFF_PUSH_ENABLED
            ├─ build copy via _shared/staffPush.ts (event_type + context → title/body/url)
            ├─ coalesce/idempotency via notification_log.dedupe_key
            ├─ pick recipients: staff_push_subscriptions ∩ staff_alert_prefs,
            │    minus the actor's own devices
            └─ encrypt + send via _shared/webpush.ts (VAPID + RFC 8291)
                 └─ browser SW (public/push-sw.js): showNotification / focus
```

- **Service worker:** `public/push-sw.js` is pulled into the generated Workbox
  SW via `workbox.importScripts` in `vite.config.js`. It only *adds* `push` /
  `notificationclick` handlers — precache is untouched.
- **Crypto:** `supabase/functions/_shared/webpush.ts` implements VAPID (ES256
  JWT) + RFC 8291 `aes128gcm` on **pure Web Crypto** (no `node:`/npm deps), so
  it runs unchanged in the Supabase Edge (Deno) runtime. Proven by
  `webpush.proof.ts` (`deno run`) and the Vitest round-trip test.
- **Message copy + recipients:** `supabase/functions/_shared/staffPush.ts` —
  pure and unit-tested. Triggers forward `event_type` + structured context; all
  wording lives here, not in SQL.
- **Client:** `src/hooks/useStaffPush.ts` + `src/supabase/repositories/staffPushRepo.ts`
  + `src/components/views/settings/DeviceNotifications.jsx`.

## Data model

- `staff_push_subscriptions` — one row per installed device (endpoint unique).
  RLS: a staff member manages only their own rows.
- `staff_alert_prefs` — per-staff opt-in for the six categories (all default
  true). A missing row = all enabled.
- `notification_log` — extended: `channel` now allows `'webpush'`,
  `trigger_type` adds the six `staff_*` values, and a nullable `dedupe_key`
  (+ its own partial unique index) drives coalescing **without** touching the
  customer idempotency index.

### Coalescing / suppression

- **Coalescing:** inbound messages use `dedupe_key = staffmsg:<conversation>:<minute>`,
  so a burst of messages in one conversation collapses to one push per ~minute.
  Other events use a unique per-row key (pure idempotency, no collapsing).
- **Actor suppression:** `booking_events.actor_id` is forwarded; notify-staff
  skips **only that user's own devices**. A staff-made booking still notifies
  *other* staff; customer/AI bookings notify everyone.

## iOS facts (important)

- Works **only** when the app is installed to the Home Screen
  (`display: standalone`), iOS **16.4+**. Not in a normal Safari tab.
- `Notification.requestPermission()` + `pushManager.subscribe()` must be called
  from a real user gesture (the Enable tap) — never on load.
- Standard W3C Web Push / VAPID; Apple's gateway is transparent (no
  Apple-specific code).

## Configuration

Generate a VAPID key pair:

```bash
npm run vapid:generate
```

Then:

- **Client (Vercel + local `.env.local`):** `VITE_VAPID_PUBLIC_KEY=<public>`
- **Edge secrets** (`supabase secrets set …`, never `VITE_`, never committed):
  - `VAPID_PUBLIC_KEY=<public>` (same value as the VITE one)
  - `VAPID_PRIVATE_KEY=<private>`
  - `VAPID_SUBJECT=mailto:leam@leamonline.uk`
  - `STAFF_PUSH_ENABLED=true` (flip on when ready — default off)

notify-staff reuses the existing `WEBHOOK_SECRET` (Vault `webhook_secret`) for
trigger auth and the auto-injected `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
No new values needed for those.

## Deploy order (migrations are applied to prod BY HAND)

1. Apply `20260625130000_staff_web_push.sql` (tables + log changes) to prod.
2. Apply `20260625140000_staff_web_push_triggers.sql` to prod.
3. Merge the branch → Vercel ships the client and the GH Action deploys
   `notify-staff`.
4. Set the edge secrets above, including `STAFF_PUSH_ENABLED=true`, and set
   `VITE_VAPID_PUBLIC_KEY` in Vercel (redeploy the frontend so it's bundled).

Until steps 1–2 are applied and the secrets set, everything is inert: triggers
swallow any POST error and notify-staff returns a no-op.

## Manual iOS test checklist (cannot be verified in CI)

1. Deploy; ensure `VITE_VAPID_PUBLIC_KEY` is in the build and the edge secrets
   (incl. `STAFF_PUSH_ENABLED=true`) are set.
2. On an iPhone (iOS 16.4+): open the staff app in Safari → Share → **Add to
   Home Screen**. Open it from the Home Screen icon and log in as staff.
3. Settings → Your Account → **Device notifications** → **Enable notifications**
   → allow the iOS prompt. Expect the toast and the six category toggles.
4. Trigger each event and confirm a push arrives, tapping focuses the app:
   - send the salon an inbound WhatsApp/SMS → "New message"
   - make a booking (as a customer) → "New booking"
   - cancel it → "Booking cancelled"
   - reschedule one → "Booking moved"
   - submit a Join the Pack signup → "New client to review"
   - join the waitlist → "Waitlist request"
5. Verify a booking *you* make as that staff member does **not** push to your
   own device, but does to a second staff device.
6. Toggle a category off → confirm that event no longer pushes.
7. Disable → confirm the row is removed and pushes stop.
8. Check `notification_log` rows with `channel = 'webpush'`.
