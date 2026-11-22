# iPhone app API contract

**Status:** Active
**Authority:** What the native iPhone app may call. The website and the staff
dashboard keep their current behaviour. This page describes the live backend
the app should use, plus the push groundwork added for it.
**Last verified:** 22 November 2026 against the booking app and
`supabase/functions/`.

The iPhone app in [`ios/`](../ios/README.md) signs customers and staff in.
Booking, dogs, contacts and push registration are the screens that come next.
This contract is that list. Do not invent a second booking API.

Two roles, one app:

- **Customer** — phone number, then a password or a texted code. A new person
  goes through Join the Pack and waits for staff to approve them.
- **Staff** — email and password. A row in `staff_profiles` with role `owner`
  or `staff`. The database function `is_staff()` is the check that matters.

Use the publishable Supabase key only. Never put the service-role key in the app.

## Auth

The website uses two Supabase clients so a staff session and a customer session
do not overwrite each other. The iPhone app should keep one signed-in role at
a time (sign out before switching). Both roles are ordinary Supabase Auth users.
Being signed in is not enough to be staff: `is_staff()` is true only when
`staff_profiles` has a row for that user.

### Customer

1. `POST /functions/v1/customer-phone-on-file` with `{ phone }`. The reply is
   only `{ on_file, has_password }`. It is rate-limited. It does not send a text.
2. Password, when `has_password` is true: `auth.signInWithPassword({ phone, password })`,
   with the same Turnstile captcha token the website sends. The app shows the
   check before the password is sent. A build without the public site key
   refuses to sign in rather than skipping the check.
3. First login or forgotten password: `auth.signInWithOtp({ phone })`, then
   `auth.verifyOtp({ phone, token, type: "sms" })`. Supabase sends the code
   (Twilio). The app does not call Twilio itself.
4. After a successful sign-in, call `link_customer_to_human`. It looks the person
   up from the phone on the Auth user, sets `humans.customer_user_id`, and
   returns the customer-safe record. It does not trust a phone number in the
   request.
5. No human record yet: `create_pending_customer`, then Join the Pack via
   `submit_customer_signup`. Staff approve with `approve_customer_signup` or
   reject with `reject_customer_signup`. Until `approved_at` is set, the app
   shows the waiting screen and does not open booking.
6. Setting or replacing a password is `auth.updateUser({ password })` on the
   signed-in session.

### Staff

1. `auth.signInWithPassword({ email, password })` on the staff Auth flow.
2. Read `staff_profiles` for that user. No row means they are not staff, even
   if the password was correct.
3. `role` is `owner` or `staff`. Owner-only actions (inviting staff) check the
   role again on the server.

## Customer screens

Reads of the customer's own dogs and bookings are normal table reads. Row Level
Security hides everyone else's rows. Writes that create or change a booking go
through the RPCs below. Do not insert into `bookings` from the app.

| Screen | Call | Notes |
|---|---|---|
| Sign in | `customer-phone-on-file`, Auth password or SMS OTP, `link_customer_to_human` | See Auth above |
| Join the Pack | `create_pending_customer`, `submit_customer_signup` | New customers wait for approval |
| Finish profile | `complete_customer_profile` | Name, address and the rest of the record |
| My details | `update_customer_contact_details` | Includes the WhatsApp / SMS preference (`humans.whatsapp`) |
| My dogs | read `dogs`; `create_customer_dog`, `update_customer_dog` | Size is staff-confirmed. The app does not set the size the capacity engine trusts |
| Dog photo | `set_customer_dog_photo` and the private `dog-photos` bucket | One folder per dog |
| People who can drop off or collect | `list_customer_trusted_contacts`, `save_customer_trusted_contact`, `remove_customer_trusted_contact`, `list_customer_trusted_humans` | Customer-added people are not customer records and are not messaged |
| Home / upcoming grooms | read `bookings` (and `dogs`) for this human | RLS. About 180 days back, then older pages, matching the website |
| Pick a day and time | `get_open_days`, `get_slot_occupancy`, `get_occupancy_range`, `get_blocked_seats`, `get_immediate_slots`, `current_customer_booking_rules` | Same-day slots only when staff have flagged them, and only until 30 minutes before |
| Confirm a booking | `create_customer_booking_group` | The only customer insert. 1–4 dogs. The database takes the dog's size and runs the calendar, capacity and pregnancy gates |
| Cancel | `cancel_customer_booking` | The customer sends the booking id and a reason. The database decides the group and the policy |
| Reschedule | `reschedule_customer_booking` | Inside the normal window |
| Ask to move a booking the rules would block | `request_customer_override_reschedule` | Staff decide with `decide_customer_override_reschedule_request` |
| Why a slot was refused | `log_booking_denial` | Optional telemetry. The gate's `DETAIL` code is the reason |
| Push registration | `POST /functions/v1/register-device-token` | See [Push](#push) |

The visit-policy RPCs (`cancel_customer_booking_visit`, `list_customer_booking_visits`, and the other `*_booking_visit` commands) exist in the database and are **not switched on**. The app must not call them.

## Staff screens

Staff read and, today, write the salon tables directly under RLS (`is_staff()`).
Wrapping those writes in RPCs is a later change. The app should call the same
tables and RPCs the website uses, not a private shortcut.

| Screen | Call | Notes |
|---|---|---|
| Sign in | Auth email + password, then `staff_profiles` | `is_staff()` on anything sensitive |
| Today | read `bookings`, `dogs`, `humans`, `day_settings` for the London date | Status changes are updates to `bookings`. Legal moves are the same set the website uses |
| Bookings calendar | `bookings`, `day_settings`, `get_open_days`, `get_slot_occupancy`, `get_blocked_seats` | Extra slots live on `day_settings.extra_slots`. Closures are written with the seat blocks in one update |
| New booking | `create_staff_booking_group` where the website uses it; some staff saves still insert `bookings` directly | Do not add a third write path |
| Customers and dogs | `humans`, `dogs`; directory search `search_humans_directory`, `search_dogs_directory` | Merge is `merge_humans` |
| Inbox | `whatsapp_conversations`, `whatsapp_messages`; send with `whatsapp-send` and `sms-send` | Staff JWT. Opt-out is per phone number |
| Reminders | `notify-booking-reminder` (one booking, or the cron), `reminder-send` (the modal) | See [Push](#push). The modal's WhatsApp / SMS / email buttons are unchanged while push is off |
| Reports | read bookings and payments already loaded for staff | The report maths stays in the app, as on the website |
| Settings | `salon_config`, `day_settings`, holidays RPCs (`get_staff_holidays`, `save_salon_holiday`) | Owner-only where the website is owner-only |
| Invite a colleague | `staff-invite` | Owners only |
| Signup queue | `approve_customer_signup`, `reject_customer_signup` | Join the Pack |
| Push registration | `register-device-token` | Same function as customers. The stored role will be `staff` |

## Row Level Security

- A customer sees their own `humans` row (`customer_user_id = auth.uid()`), their dogs, and bookings for those dogs. Another customer's rows do not come back. They are not an error; they are invisible.
- A customer cannot insert a booking. `create_customer_booking_group` is `SECURITY DEFINER` and is the write. The three `BEFORE INSERT` gates (calendar, capacity, pregnancy) still run, and each bypasses only for `is_staff()`.
- Staff (`is_staff()`) can read the salon tables the dashboard reads.
- `device_tokens`: the signed-in user can select, insert, update and delete **only their own** rows. The `role` column has to match `is_staff()` (`customer` or `staff`). Anonymous users have no grant. The service role, used by the two new edge functions, bypasses RLS.
- `notification_log`: staff can read it. Customers do not. A reminder that went by push is `channel = 'apns'`.
- Anon still has no access to customer data. `customer-phone-on-file` is the deliberate public exception, and it returns two booleans.

## Push

This is dark-launched. `IOS_PUSH_ENABLED` defaults **off**. Until that secret is
the word `true` (or `1`, `yes`, or `on`), reminders stay on WhatsApp, then SMS,
then email. Registering a token is allowed before the switch is on, so a
TestFlight build can save a token without any customer being pushed.

### Register

`POST /functions/v1/register-device-token`

Header: `Authorization: Bearer <the signed-in user's access token>`

```json
{
  "apns_token": "64 or more hex characters",
  "environment": "sandbox",
  "bundle_id": "uk.co.smarterdog.app",
  "notifications_enabled": true
}
```

- `environment` is `sandbox` for a development build and `production` for TestFlight and the App Store.
- `bundle_id` must match the app. Today that is `uk.co.smarterdog.app`. If `APNS_BUNDLE_ID` is set on the server, a different bundle is refused.
- The body cannot choose the user or the role. The user is the JWT. The role is `staff` when `is_staff()` is true, otherwise `customer`.
- The same token registered again refreshes `last_seen_at`. If someone else signs in on that phone, the token moves to them.
- `notifications_enabled: false` keeps the row but stops reminders using it.

The table is `device_tokens`: user id, role, APNs token, environment, bundle id, `last_seen_at`, `notifications_enabled`, `created_at`, `updated_at`.

### When a reminder uses push

Only reminders (`notify-booking-reminder` and a staff WhatsApp send through
`reminder-send`). Confirmations, cancellations and collection notices are not
pushed by this change.

An app user gets a push **instead of WhatsApp** when all of these are true:

1. `IOS_PUSH_ENABLED` is on.
2. Their human record's `customer_user_id` has a `device_tokens` row.
3. `notifications_enabled` is true.
4. `last_seen_at` is not older than 14 days. Exactly 14 days still counts.

Otherwise the reminder uses the existing order: WhatsApp, then SMS, then email.

If Apple says the token is dead (`Unregistered`, `BadDeviceToken`, or
`DeviceTokenNotForTopic`), that row is deleted. The nightly reminder then uses
WhatsApp, then SMS, then email. A definite refusal that is not the phone's
fault (a rejected key, a wrong topic) keeps the token and the nightly reminder
uses WhatsApp as well. A staff reminder that was asked for on WhatsApp falls
back to that WhatsApp send when WhatsApp is still allowed. An explicit `apns`
request that cannot be delivered is recorded as failed and is not also sent as
a text, because that request did not include one. If Apple accepted the push,
or the reply was lost after the request was sent, the same request does **not**
also send WhatsApp or a text.

The log row uses `channel = 'apns'`. A staff Web Push (`webpush`) is a different
thing and is unchanged.

`reminder-send` accepts `channel: "apns"` for a later staff or app caller. While
the switch is off, that request is refused and nothing is sent. A staff WhatsApp
reminder is unchanged while the switch is off. When the switch is on, a WhatsApp
reminder for someone with a fresh token is sent as a push first.

### Secrets

Set with `supabase secrets set`, on the **staging** project first. Never commit
them. Never prefix them with `VITE_`.

| Secret | What it is |
|---|---|
| `APNS_KEY_ID` | The 10-character Key ID from the Apple key |
| `APNS_TEAM_ID` | The 10-character Team ID |
| `APNS_PRIVATE_KEY` | The contents of the downloaded `.p8` file. If the secret is stored on one line, write the line breaks as `\n` |
| `APNS_BUNDLE_ID` | `uk.co.smarterdog.app`, unless the Xcode bundle id was changed. It must match the app exactly |
| `IOS_PUSH_ENABLED` | Leave unset until a TestFlight build can register a token and you want a reminder to try push. `true` turns it on |

`register-device-token` and `apns-send` also use `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SEND_INTERNAL_SECRET`,
which the project already has.

Apple's key is created at [developer.apple.com](https://developer.apple.com/account/resources/authkeys/list):
Keys → create a key → enable **Apple Push Notifications service (APNs)** →
download the `.p8` once. Apple will not show the file again. The Key ID is on
that page. The Team ID is on the membership page.

Sending uses token auth (the `.p8`), not a certificate. Development builds talk
to `api.sandbox.push.apple.com`. TestFlight and App Store builds talk to
`api.push.apple.com`. The app sends `environment` so the server picks the host.

## Gaps (not this change)

- Sign-in is in the app: `customer-phone-on-file`, password and SMS code, `link_customer_to_human`, and `staff_profiles`. Booking, dogs, contacts and `register-device-token` are not called yet.
- No messenger tables and no unified inbox beyond the website's WhatsApp / SMS / email thread.
- No Square deposit charging.
- Staff booking edits are still direct table writes under RLS.
- A no-show does not automatically set `deposit_required`.
- Confirmations, cancellations and collection notices are not APNs.
- Staff operational alerts stay on Web Push (`notify-staff`), not APNs.
- The visit-policy commands stay off.

## Database

Migration `20261122120000_ios_device_tokens.sql` adds `device_tokens` and allows
`notification_log.channel = 'apns'`. Apply it to **staging** first. Do not apply
it to production until you mean to. The website does not need the table while
`IOS_PUSH_ENABLED` is off, but a production deploy of the new edge functions is
safe either way: with the switch off they do not read the table on the reminder
path, and registering a token before the migration exists will fail that one
call without affecting sign-in or booking.
