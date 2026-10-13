# Customer portal audit (`/book`) — end to end

Repository: `/home/user/Smarter-dog-bookings` at `850cad77609fc19a77da3c81577dde6d4a5eded0` (2026-10-12). Read-only review; every claim below was traced in code unless marked HYPOTHESIS. Two representative component test files were run (`BookingCard.component.test.jsx`, `BookingWizard.denialReasonCode.component.test.tsx`: 18/18 pass) to confirm the suite reflects the code read.

## How the portal actually works (traced)

**Mount.** `src/index.jsx` → `resolveMount` (`src/routing/entrypoints.ts`) mounts `CustomerApp.jsx` under basename `/book`; old `/customer/*` URLs redirect (also in `vercel.json`). Missing Supabase creds in prod → `CustomerUnavailablePage.jsx`. `/reset-password` is the **staff** email-recovery page (`ResetPasswordPage.jsx` uses `useStaffAuthActions`); customers never use it — their "forgot password" is an SMS OTP.

**Auth (phone-first).** `CustomerLoginPage.jsx` → `useCustomerAuth.checkPhone` → Edge Function `customer-phone-on-file` (rate-limited per IP 5/min + global 200/min, CORS allow-list, service-role-only RPC `customer_phone_login_state`) → `{on_file, has_password}`. Branches: password → `signInWithPassword` (Turnstile token, HIBP check on success); on file without password → `signInWithOtp`; unknown → "New here? Join the Pack" → OTP creates the auth user. Every sign-in runs `link_customer_to_human()` (SECURITY DEFINER, phone derived from `auth.users`, never caller input).

**Gate chain** (`CustomerApp.jsx` 117–205): no human → `JoinThePackWelcome` → `create_pending_customer` (shell row, `approved_at NULL`) → `SetPasswordGate` (`hasPassword === false`) → `useCustomerSignupGate` → `JoinThePackOnboarding` (2 steps, draft in localStorage) → `submit_customer_signup` (atomic owner+dogs+staff to-do, name-collision → `claims_human_id`) → `PendingApprovalGate` → staff approve (`approve_customer_signup`, then `notify-customer-welcome` WhatsApp template → SMS → email) → `useCustomerProfileGate` (`ProfileGate` for legacy customers missing name/address/policies) → dashboard.

**Dashboard** (`CustomerDashboard.jsx`): `useCustomerDashboardData` chains dogs → bookings (180-day window via RLS `customer_select_own_bookings`) → `list_customer_trusted_humans`. Cards: `BookingCard` (upcoming grouped by `group_id+date`, cancel via `cancel_customer_booking`, reschedule → `/new?reschedule=<id>`), `MyDetailsCard` (→ `update_customer_contact_details`), `DogsSection` (→ `update_customer_dog` / `create_customer_dog`), `TrustedHumansSection` (read-only), `AppointmentsSection` (past, paged), calendar `.ics`/webcal feed.

**Wizard** (`BookingWizard.tsx`, 5 steps): dogs (greys out unsized and pregnant dogs; auto-raises a staff "Confirm size" to-do via `request_dog_size_check`) → services (`getAllowedServicesForSize`) → date (`get_open_days`, `get_occupancy_range`, `get_blocked_seats` chunked 14 days; "Today — last minute" from `get_immediate_slots`) → slot (`findGroupedSlots` on `get_slot_occupancy` + blocked seats + per-human rules) → confirm (`customer_change_deadline_preview`, deposit rule) → `create_customer_booking_group` (SECURITY DEFINER: approval, profile, ownership, authoritative `dogs.size`, 1–4 dogs, advisory locks per slot) → three table-level BEFORE INSERT gates (calendar / capacity / pregnancy, P0001 + DETAIL reason code) → `notify-booking-confirmed` webhook (WhatsApp template `booking_confirmed_v1` → SMS → email, idempotent via `notification_log`). Reschedule → `reschedule_customer_booking` (SDR01 if staff override → `request_customer_override_reschedule`), which cancels via `cancel_booking_impl(..., enforce_notice=true)` and re-inserts with fingerprint idempotency. Failure telemetry: `booking_denials` + `booking_funnel_events.confirm_failed`.

**Not in the portal:** "confirm attendance" is a WhatsApp-only path (reminder template Quick Reply / typed "yes" → `reminder_confirmed_at`, `_shared/reminderConfirmation.ts`); `apply-customer-confirm` is the **AI-agent** "[Yes] / [No, change]" button handler for agent-proposed bookings, not a portal feature. Walk-ins are never booked.

---

## Findings

### F1. Non-capacity refusals from `create_customer_booking_group` are shown as "that time's just been taken" and logged as capacity denials — CONFIRMED
- **What:** The wizard treats *every* `P0001` as a capacity/calendar gate (`BookingWizard.tsx:756`), then routes it through `friendlyDenialMessage` (`:820`) and `fireDenialLog` (`:761`). But the RPC itself raises P0001 for "Your account is awaiting approval" (`20260712115759_legal_risk_tranche1.sql:766`) and "Please complete your profile…" (`:774`), and `22023` for `dog_size_unconfirmed` (`:860`) / "that dog is not on your account" (`:855`). `mapDenialReason` maps the first two to `unknown` (`denials.ts:115`) → customer reads *"Sorry, that slot isn't available anymore"* (`denials.ts:164`) and a row lands in `booking_denials` (report 2F counts it as turned-away demand). The `22023` cases fall to *"Sorry, we couldn't save that booking change"* — wrong on both counts for a first booking.
- **When it happens:** both client gates fail **open** on a read error (`useCustomerSignupGate.ts:86`, `useCustomerProfileGate.ts:72`), so a pending or incomplete customer can reach step 5 exactly when the DB will refuse; a dog whose size staff cleared after the wizard loaded hits `dog_size_unconfirmed`.
- **Why it matters:** the customer is told the wrong thing (and nudged to try another slot that will also fail); report 2F is polluted with non-capacity rows — the same class of defect #665/#681 fixed for other codes.
- **Recommendation:** emit a DETAIL code from these raises (`detail = 'awaiting_approval'`, `'profile_incomplete'`, `'dog_size_unconfirmed'`, `'dog_not_owned'`) and add them to `DENIAL_REASON_LABELS` with group `policy` (or exclude from `booking_denials` entirely) plus specific copy ("Your account is still being approved…"). Keep `denialCodeContract.test.ts` green.
- **Benefit:** honest copy; clean 2F metric. **Difficulty:** Small. **Risk:** Low (message shape preserved). **Priority:** High.

### F2. Reschedule/cancel eligibility is only discovered *after* the action — no deadline/policy read on the dashboard — CONFIRMED
- **What:** `BookingCard.jsx` always renders **Reschedule** (`:229`) and **Cancel** (`:238`). It never calls `current_customer_booking_rules` (`customerPortal.allowCancellations/allowRescheduling`) nor `customer_change_deadline_preview` (`rpc.ts:823`) for the *existing* booking. Cancel inside the notice window → `SDC02` only after picking a reason; a reschedule inside the window makes the customer walk all five wizard steps before `cancel_booking_impl(…, true)` (`20261001160000:318`) refuses with SDC02 at confirm (`BookingWizard.tsx:812`).
- **Also:** the wizard's SDC02 copy hard-codes "within 24 hours" while the enforced value is `salon_config.settings.minCancellationHours` (configurable; `20261001160000:300–322`) and the sentence staff author uses `cancellation_notice_hours()`.
- **Recommendation:** on card mount call `customer_change_deadline_preview(bookingDate, earliestSlot)` (it already exists and is the enforcing source) and the portal policy; render Reschedule disabled with "Changes closed at {deadline} — message us" when `passed`, hide Cancel when `allowCancellations=false`; derive the hours in the SDC02 message from the preview. Do **not** touch `previous_day_1500_v1`.
- **Benefit:** removes the single most frustrating dead end (five steps then refusal), matches the September 2026 incident the preview RPC was built for. **Difficulty:** Small–Medium. **Risk:** Low. **Priority:** High.

### F3. "Allow rescheduling" and "Customer intake enabled" staff switches are not enforced on the live portal — CONFIRMED
- **What:** `CustomerPortalSettings.jsx:116` promises "Customers can reschedule when the server says the visit is eligible", but `reschedule_customer_booking` (`20260728133020:72–170`) never reads `allow_customer_rescheduling`; the only reader is the dormant v1 capability function (`20260726144001:824`). `customer_intake_enabled` is likewise not checked in `create_customer_booking_group`. Only `allowCancellations` is enforced (SDC01, `20261001160000:278–297`).
- **Why it matters:** staff believe they can switch rescheduling/intake off (e.g. during a holiday or incident) and nothing changes for customers. This is an interface-capability-truth gap of the kind `docs/interface-capability-truth.md` exists for.
- **Recommendation:** either enforce both in the live RPCs (one `if not s.allow_customer_rescheduling then raise … 'SDR05'` and an intake check in `create_customer_booking_group`, with matching UI handling) or relabel the switches as "takes effect when the visit policy is activated". Prefer enforcing: it is a ten-line change and the UI already handles unknown codes generically.
- **Difficulty:** Small (SQL + copy). **Risk:** Medium (booking write path — explain before changing, per CLAUDE.md). **Priority:** High.

### F4. Booking horizon is UI-only; the write path accepts any future date — CONFIRMED
- **What:** `DateSelection.tsx` limits pages to `bookingHorizonDays` (from `current_customer_booking_rules`; `booking_policy_settings.booking_horizon_days` defaults to **180**, `20260726144001:187`). `validate_booking_calendar` (`20260826120000:438–572`) checks past dates, closures, slots and the 30-min cutoff — no horizon. The only server horizon check sits inside `if booking_policy_runtime() = 'active'` (dormant) on read RPCs; `20260823080000` lines 1–20 document exactly this.
- **Also a doc gap:** CLAUDE.md says "portal: tomorrow+28" and `LEGACY_BOOKING_HORIZON_DAYS = 28` is only the fallback; the live value is whatever staff set (likely 180 — the wizard even has copy for it, `DateSelection.tsx:368`).
- **Why it matters:** low abuse risk (needs an authenticated customer calling the RPC), but a booking 2 years out would silently pass; and the documentation contradicts the product.
- **Recommendation:** add `p_booking_date > current_date + booking_horizon_days → P0001 detail 'horizon_exceeded'` to `create_customer_booking_group` (non-staff only) and fix CLAUDE.md/docs to say the horizon is staff-configured (default 180).
- **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

### F5. Trusted humans: read-only card with a permanent "temporarily unavailable" placeholder — CONFIRMED
- **What:** `TrustedHumansSection.jsx:57` says "Adding a trusted human online is temporarily unavailable." The customer RPC `add_customer_trusted_human` was created on 13 May (`20260513170000`) and **deliberately dropped** in the legal-risk tranche (`20260712115759:904` `drop function if exists public.add_customer_trusted_human`) because it created `humans` rows for third parties. There is no remove/edit either, and no path for a customer to *request* one. Portal bookings also never set `bookings.notify_human_ids`, so trusted humans receive no confirmations/reminders for portal bookings (only staff-created ones can).
- **Recommendation:** decide the product position. Either (a) remove the card's false "temporarily" and say "Ask us to add someone who can drop off or collect — message the salon" with the WhatsApp link, or (b) implement a consent-safe request: customer submits name + relationship (no phone) → `salon_todos` row for staff to action, mirroring `request_dog_size_check`. Also consider letting the wizard tick "also notify {trusted human}" to populate `notify_human_ids` (the notify functions already fan out).
- **Difficulty:** Small (a) / Medium (b). **Risk:** Low. **Priority:** Medium.

### F6. Duplicate same-day booking for one dog is possible after a network drop at confirm — HYPOTHESIS (mechanism traced, race not reproduced)
- **What:** `create_customer_booking_group` has **no idempotency key** (unlike `reschedule_customer_booking_direct_unchecked`, which fingerprints requests). If the request commits but the response is lost (`confirmFailure.ts` "network_failed" case), the customer sees "couldn't save" and retries. The client re-check (`BookingWizard.tsx:589–636`) now sees their own booking occupying the slot, bounces them to step 4 with "no longer available", and they pick a neighbouring slot — the unique index is `(dog_id, booking_date, slot)` (`20260615160000:175`), so a second booking for the same dog on the same day at a different slot is accepted. The `double_booked` gate only fires for the identical slot.
- **Recommendation:** (1) before insert, re-read the customer's own upcoming bookings for the selected dogs on that date and surface "Alfie already has a groom on {date} at {time} — view it / move it instead"; (2) add a client-generated `p_request_id` to `create_customer_booking_group` with a receipt table, as the reschedule RPC already does; (3) optionally a partial unique index `(dog_id, booking_date) WHERE status <> 'Cancelled'` if staff never legitimately book one dog twice a day (check first).
- **Difficulty:** Medium. **Risk:** Medium (write path). **Priority:** High.

### F7. Generic confirm failure copy says "booking change" for a brand-new booking — CONFIRMED
- `BookingWizard.tsx:821`: "Sorry, we couldn't save that booking change." is the fallback for *every* unrecognised error on both new bookings and reschedules; a network drop on a first booking reads like a reschedule failed. The repository's `friendlySaveError` (offline-specific line) is not used here either.
- **Recommendation:** branch on `rescheduleFrom` and route network errors through `friendlySaveError`. **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

### F8. Success screen tells customers to WhatsApp for changes, while the dashboard offers self-service — CONFIRMED
- `BookingWizard.tsx:1013`: "Need to change something? Message us on WhatsApp." The dashboard then offers Reschedule/Cancel. Also the "Booking ref · 20261015-0900" (`:879`) is just date+time, not an identifier staff can look up, and it breaks for multi-dog split allocations (shows only drop-off time).
- **Recommendation:** "You can reschedule or cancel from your dashboard up to {hours} hours before" (sourced from the policy already in state) and drop the pseudo-reference or replace it with the deposit reference when present. **Difficulty:** Small. **Risk:** Low. **Priority:** Low.

### F9. "My details" edits address as free text and can leave a stale postcode; cancel after save reverts to stale values — CONFIRMED
- **What:** `MyDetailsCard.jsx:68–80` is a single `<input>` for address while onboarding uses `AddressPicker` (Geoapify + manual + postcode). `CustomerDashboard.handleSave` sends `postcode: humanRecord?.postcode` (`:111`) — so changing the address keeps the old postcode (the RPC `coalesce`s it, `20260712115759:53`). `humanRecord` is never refreshed after a save, so `handleCancel` (`:135`) resets the form to pre-save values and the card then *displays* the old name/address until reload. There is also no email format validation here (onboarding requires a valid email; the RPC stores anything non-empty).
- **Recommendation:** reuse `AddressPicker` in edit mode (it already supports `existingAddress`/`existingPostcode`), call `refreshHumanRecord` after a successful save (CustomerApp already exposes it), validate email client-side.
- **Difficulty:** Small–Medium. **Risk:** Low. **Priority:** Medium.

### F10. Editing a dog's breed silently removes its online-booking eligibility — CONFIRMED
- `update_customer_dog` (`20260727120000`) sets `size = derive_canonical_dog_size(v_breed)` whenever the breed string changes; for any breed not in the canonical list that is `NULL`, and the dog becomes unbookable (`dog_size_unconfirmed`). The DogsSection form (`DogsSection.jsx:91–95`) gives no warning; the "Size" select is only a *reported* size. A staff to-do is raised by the `dogs_size_check_todo` trigger, so staff do learn — but the customer only finds out in the wizard ("Size not confirmed — message us first").
- **Recommendation:** when the breed field changes and `getSizeForBreed` returns null, show "Changing the breed means we'll need to confirm {name}'s size before you can book online — we'll do that shortly." Consider ignoring case/whitespace-only edits (the SQL already does; the client should too).
- **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

### F11. Adding a dog mid-wizard asks for less than signup does, and the "we'll confirm this" promise is only sometimes true — CONFIRMED
- `AddDogInline.tsx` collects name + breed only (no sex/DOB, both mandatory at signup; `JoinThePackOnboarding.dogReady`). Copy at `:83` says "Estimated size: {x} — we'll confirm this before online booking", but if the breed is canonical the server sets `dogs.size` immediately and the dog is bookable now; if it isn't, the dog is blocked and a to-do is raised. Either way the sentence is misleading.
- **Recommendation:** make the copy conditional on the returned `size` ("Great — {breed} counts as {size}, you can book now" vs "We'll confirm {name}'s size — usually same day"), and add the optional DOB/sex fields or explicitly defer them ("you can add more later"). **Difficulty:** Small. **Risk:** Low. **Priority:** Low.

### F12. Waitlist is write-only for customers: no dog/slot context, no visibility, no removal, no duplicate guard — CONFIRMED
- `joinWaitlist` (`bookingsRepo.ts:624`) inserts `{human_id, target_date}` only; `waitlist_entries` has no `dog_id`, size, slot preference or unique constraint (`20260408013725`). The dashboard never shows waitlist entries although a `Customer select own waitlist`/`delete own` RLS policy exists. Pressing "Join the waitlist" twice (or on two visits) creates duplicates; staff cannot tell which dogs/sizes the request is for, which is what decides whether a freed seat fits.
- **Recommendation:** add `dog_ids uuid[]`/`size` + `slot_preference` columns and a unique `(human_id, target_date)`; show "You're on the waitlist for {date}" with a Leave button on the BookingCard empty state; pass `selectedDogs` from the wizard. **Difficulty:** Medium (migration + UI). **Risk:** Low. **Priority:** Medium.

### F13. Cancel-reason controls have no accessible name; a few other a11y gaps — CONFIRMED
- `BookingCard.jsx:256` `<select>` and `:272` "Other" `<input>` have no `<label>`/`aria-label` (the surrounding region is labelled, the controls are not). `AppointmentsSection` header button is `disabled` when empty, which also removes it from the tab order with no explanation for SR users. The wizard stepper puts `role="progressbar"` on an `<ol>` (`BookingWizard.tsx:1045`) — a list of steps should stay a list (`aria-current="step"`), progressbar semantics confuse SRs. `AddToCalendarButton` pill shows "…" while loading with no `aria-busy`.
- Good already: labelled inputs everywhere else, `role=alert` regions, focus-to-heading on step change, `aria-pressed` tiles, skip link, 48–52px tap targets on login.
- **Recommendation:** add `aria-label="Reason for cancelling"`/"Tell us why", swap progressbar for `aria-current`, `aria-busy` on the calendar pill. **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

### F14. Dashboard load is a sequential 4-request chain behind a single spinner — CONFIRMED
- `useCustomerDashboardData.ts:68–123`: dogs → bookings → `hasCustomerBookingsBefore` count → trusted humans, each awaited before the next; the whole dashboard shows "Just a sec…" until all complete. On a phone in the salon this is the slowest screen in the portal.
- **Recommendation:** run bookings/trusted/count in `Promise.all` after dogs (they are independent), or add a `get_customer_dashboard()` SECURITY DEFINER RPC returning dogs+upcoming+trusted in one round trip; render cards progressively (the per-resource `loaded` flags already exist for this).
- **Difficulty:** Small (parallelise) / Medium (RPC). **Risk:** Low. **Priority:** Medium.

### F15. Join the Pack asks for information the system already has, and keeps PII drafts in localStorage — CONFIRMED
- Step 1 re-asks name/surname even when `link_customer_to_human` found no record (fine) but also requires **email** (`JoinThePackOnboarding.jsx:345`), while existing customers are never required to have one and `notify-*` falls back to SMS. The signup draft (name, address, email, dogs) is persisted unencrypted in localStorage for 7 days keyed by humanId (`useDraftPersistence`), including on shared/public devices. `JoinThePackWelcome` + `SetPasswordGate` + two onboarding steps + approval wait = five screens before a new customer can do anything.
- **Recommendation:** make email optional (or explain why it is required); clear the signup draft on sign-out; consider merging the Welcome screen into the password step ("Join the Pack — first choose a password"). **Difficulty:** Small. **Risk:** Low. **Priority:** Low.

### F16. Pending-approval wait has no expectation setting and no staff SLA signal — CONFIRMED / partly HYPOTHESIS
- `PendingApprovalGate.jsx` says "we'll send you a message" with a manual "Check again" button; nothing tells the customer how long (hours? days?) or when the salon is open. Staff see the queue in Humans → Awaiting approval and get a `signup_review` to-do; there is no reminder if a signup sits for days (HYPOTHESIS: no cron/alert found; `slack-alerts` thresholds do not include pending signups).
- **Recommendation:** add "We usually approve within one working day (Mon–Wed)" copy and, server-side, include "N signups waiting > 24h" in the 08:15 Slack summary (`slackAlertThresholds.ts`) — it already exists for other operational signals. **Difficulty:** Small. **Risk:** Low. **Priority:** Low.

### F17. Past-appointment prices are recomputed from today's price list and the dog's *current* size — CONFIRMED
- `AppointmentsSection.jsx:priceLabelFor` uses `resolveServicePricePence(service, size)` with `b.dog?.size || b.size`. Historic rows show current prices (and change retroactively if the dog is resized), not what was charged. `SERVICE_LABELS` also carries a dead `"nail-trim"` entry (`dashboardConstants.js:6`) although walk-ins are never booked.
- **Recommendation:** either drop the price column for past visits or show it only when a stored price exists (`payment`/visit money fields). Delete `nail-trim`. **Difficulty:** Small. **Risk:** Low. **Priority:** Low.

### F18. Login page: no way back to "use a different number" during the first-login OTP cooldown; OTP stage offers no resend — CONFIRMED
- `CustomerLoginPage.jsx`: the code stage has "Use a different number" but no "Resend code" (comment at ~line 598 acknowledges there is no resend). A customer whose SMS never arrives must go back to the phone stage, wait out the 60-second cooldown (`otpCooldown`), and resubmit — and the Turnstile widget must re-mint a token. Error copy for a wrong code never says how many attempts remain or that codes expire ("expire after a few minutes" is only in the instruction).
- **Recommendation:** add a "Resend code" button on the code stage gated by the same cooldown (it already exists as state), reusing `onSendOtp`. **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

### F19. Breached-password flow can trap a customer who reloads mid-reset — CONFIRMED (benign) 
- `mustSetPassword`/`passwordCompromised` are in-memory only (`useCustomerAuth.ts:98–106`). A customer who signs in with a pwned password sees the forced gate; if they close the tab the old password keeps working and the gate reappears next sign-in — by design, fail-open. Noted as **working as intended**; no change recommended beyond documenting it.

### F20. Client-side availability can lie in a specific case: device-local "today" vs London "today" — CONFIRMED (mitigated)
- `SlotSelection.tsx:103` and `handleConfirm` compare `selectedDate === toDateStr(new Date())` (device clock) with `immediate.date` (London, server). A customer abroad or with a wrong device date sees the wrong grid; the DB re-validates so nothing wrong is booked, but the error copy will be the capacity fallback. Low priority; `londonDate()` from `engine/holidayNotice` is already imported in `DateSelection` and could replace `toDateStr(new Date())` here.
- **Difficulty:** Small. **Risk:** Low. **Priority:** Low.

### F21. Documentation vs behaviour gaps — CONFIRMED
- CLAUDE.md "portal: tomorrow+28" vs configurable horizon (F4).
- `docs/product/user-flows.md` FLOW-02 describes the customer change path only as "existing change paths"; nothing documents the SDC/SDR code set, the override-approval flow or the deadline preview. `docs/README.md` has no customer-portal route at all (grep: only the dog-size note).
- `JoinThePackWelcome` says "We'll check everything over and **text** you" — the welcome goes WhatsApp first.
- `notify-customer-welcome` comments (lines ~230–255) still say the `'welcome'` trigger type is missing from the CHECK constraint; `20260609140000:461–468` added it. Dead defensive comment.
- **Recommendation:** add `docs/customer-portal.md` (journey map above + code table SDC01–04/SDR01–04) and fix the three stale statements. **Difficulty:** Small. **Priority:** Low.

### F22. Security review of customer paths — CONFIRMED good, two observations
- **Good:** no customer INSERT/UPDATE/DELETE policies remain on `humans`, `dogs`, `bookings` (all dropped in `20260712115759`); every write is a SECURITY DEFINER RPC that derives identity from `auth.uid()` and re-checks ownership under row locks; occupancy reads are PII-free projections; phone-on-file is rate-limited and CORS-restricted; cancellation/reschedule receipts are verified client-side (`isValidCancellationRow`); reschedule is fingerprint-idempotent; `request_customer_override_reschedule` validates dog-set equality (SDC04).
- **Observation 1:** `get_occupancy_range`/`get_blocked_seats` are capped at 92 days only because the policy horizon check is dormant (`20260823080000`); fine today, but the cap should not depend on a feature flag's *absence*.
- **Observation 2:** `log_booking_denial` / `log_funnel_event` are callable by any authenticated customer with free-text `reason_detail`; `booking_denials.reason_code` is deliberately un-CHECKed (`20260702181000:16`). A customer could spam the 2F report. Rate-limit per `auth.uid()` or cap rows/day inside the RPC.
- **Priority:** Low.

---

## What is already done well
- The write boundary is exemplary: single RPC per customer write, table-level gates with machine-readable DETAIL codes, advisory locks, verified receipts and idempotent reschedule. Two devices racing for one slot is handled correctly (second gets `capacity_2_2_1`/`slot_full` → "just been taken").
- Customer-safe availability projections (`get_slot_occupancy`, `get_occupancy_range`, `get_blocked_seats`, `get_immediate_slots`) keep other customers' PII off the wire while letting the browser engine mirror the DB.
- The confirm step asks the *server* whether the chosen slot is already past the change deadline — exactly the right architecture (no client re-derivation).
- Honest loading/empty/error separation on the dashboard (per-resource `loaded` flags; "Ready to book?" never shown after a failed fetch; sticky CTA hidden until bookings are known).
- Draft persistence for signup, My details and the wizard; `beforeunload` guard; reschedule mode anchored on a UUID in the URL so a refresh cannot turn it into a second booking.
- Funnel/denial telemetry is best-effort and swallowed, so analytics can never break a booking; `confirm_failed` codes make #708-style investigations possible.
- Login page: phone-first, no SMS until the number is known, Turnstile fails closed when misconfigured, HIBP check on sign-in and on set-password, password-manager-friendly hidden username fields, generic credential errors.
- Dog-size truth: staff-only `dogs.size`, customer `reported_size`, automatic "Confirm size" to-do so the customer no longer has to chase.
- Error copy never leaks raw Postgres/RLS text (`friendlySaveError`, `friendlyDenialMessage`).

## Top 5 for this area
1. **F2** — Read `customer_change_deadline_preview` + portal policy on the BookingCard so Reschedule/Cancel are disabled/explained *before* the five-step dead end; derive the hours in the SDC02 copy.
2. **F1** — Give approval/profile/size refusals their own DETAIL codes and copy so customers stop being told "that slot's just been taken" and report 2F stays clean.
3. **F6** — Add an idempotency key to `create_customer_booking_group` and a "this dog already has a groom that day" pre-check to stop duplicate same-day bookings after a dropped connection.
4. **F3** — Enforce (or honestly relabel) the "Allow rescheduling" and "Customer intake enabled" switches; they currently do nothing for the live portal.
5. **F5 + F12** — Replace the permanent "temporarily unavailable" trusted-humans placeholder with a real request path, and make the waitlist visible/removable with dog context.
