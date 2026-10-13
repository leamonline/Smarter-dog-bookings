# Smarter Dog Bookings — end-to-end audit

**Status:** Research (dated findings; not a plan or a decision record)
**Authority:** Evidence and recommendations only. Nothing here changes product policy, authorises a production action or overrides PROJECT.md, ROADMAP.md or an ADR.
**Date:** 12 October 2026

**Repository:** `leamonline/Smarter-dog-bookings` at `850cad7` (main, 12 October 2026)
**Scope:** booking app (staff dashboard + customer portal), marketing website, Supabase schema and Edge Functions, CI/CD, documentation, operations.
**Method:** eight specialist agents each owned one area and wrote a full report; a ninth agent then cross-checked every Critical/High claim against the code, resolved contradictions between reports, and pushed back on recommendations that cost more than they save. I independently re-verified the headline findings myself. The specialist reports (01–09) sit in [`2026-10-12-end-to-end-audit/`](2026-10-12-end-to-end-audit/) for anyone who wants the line-level detail.

**What was run:** `npm run lint` (0 errors, 66 warnings), `npm run typecheck` (pass), the full Vitest suite (408 files, 4,382 tests, all pass), `npm run build` (pass), `deno test` across Edge Functions (276 pass), a full replay of all 239 migrations into a local Postgres with 1,391 pgTAP assertions passing, and a Playwright walkthrough of the production build on sample data at phone, tablet and desktop sizes (628 screenshots).

**Nothing in the repository was changed.**

---

## 1. Summary first

This is a well-engineered product with an unusually strong write boundary, and a handful of problems that undermine the trust that boundary earns.

**Where it is genuinely strong.** Every customer booking goes through one SECURITY DEFINER RPC and three table-level gates with machine-readable reason codes. All 233 SECURITY DEFINER functions pin `search_path`. RLS is on every table. Webhook signatures, duplicate-delivery handling, the AI kill switches and the migration gate are textbook. The test suite is green and the codebase has four TODOs in roughly 100k lines. The Today day stack is the right design for a groomer on a tablet.

**Where it falls down.** Five themes account for most of what follows:

1. **Controls that promise and do nothing.** The Settings → Customer Portal switches write one table while the cancellation gate reads a legacy JSON blob that no screen writes any more. The Notifications tab's twelve chips reach nothing. The weekly Hours grid shows Mon–Sat 08:00–17:00 for a Mon–Wed salon and only feeds the website. An owner who turns off "Allow cancellations" has changed nothing for customers.
2. **Success reported before the answer arrives.** Calendar drag, the Reschedule modal and the calendar status picker all toast green even when Postgres refused the write. Cancellation notices go out as Twilio free text and are logged "sent" the moment Twilio accepts them, with no reconciliation and no SMS fallback. The repo's own rule ("never infer delivery from an attempted provider call") is honoured for Meta and nowhere else.
3. **Prevention is exemplary, recovery is nearly absent.** There is no documented rollback for any layer, no confirmed database backup (the repo describes a Free-tier project), no Sentry release tag or source maps, an unpinned deploy CLI that aborts mid-loop, and a service-worker strategy that can reload a staff tab and lose a half-made booking.
4. **A dormant architecture taxing the live one.** The inactive "visit" substrate is 28 tables, 11 of the 31 triggers on `bookings`, roughly 2,300 lines of browser code with no production caller, and the only home for several settings that look live. It has no horizon decision. Two status-split regressions have already landed inside it.
5. **Governance weight out of proportion to a two-person salon.** 226k words of live documentation (62% programme governance), 42 tests that regex-match the text of workflow files, a required CI check that does nothing on pull requests, three closure mechanisms, two settings stores, two plan homes. The pre-write controls are worth every line; the rest needs a budget.

**Eight decisions only the owner can make** block a surprising number of the findings beneath them. They are listed in §12 and should be answered before most of the "Next" work starts.

---

## 2. CRITICAL PROBLEMS

### C1. Database backup posture is unknown and may be nil
- **Found:** No backup, PITR or restore statement anywhere in the repository. `README.md` and the advisors notes describe the Supabase project as on the Free plan, which has no automated backups. The challenger could not confirm the live plan from the repo; this is a question that must be answered this week, not a confirmed defect.
- **Why it matters:** Every other control in the system protects against a bad write. None protects against losing the only copy of the customer database.
- **Recommend:** Confirm the plan in the Supabase dashboard today. If Free, either upgrade or add a weekly `pg_dump` job on the existing approval-gated `production` GitHub environment pattern, store the dump encrypted, and perform one restore drill into a scratch project. Document it in a new `docs/operations.md`.
- **Difficulty:** Small. **Risk:** Low. **Priority:** Critical (as a question). **Status:** UNVERIFIABLE FROM REPO.

### C2. The customer-portal switches do not reach the server; two settings stores, and the gate reads the one nothing writes
- **Found:** Settings → Customer Portal toggles call `save({ customerPortal: … })` → `update_booking_rules` RPC → the typed `booking_policy_settings` table (`CustomerPortalSettings.jsx:34-40`, `rpc.ts:838`). The live cancellation gate `cancel_booking_impl` reads `salon_config.settings #> '{customerPortal,allowCancellations}'` and `minCancellationHours` from the legacy JSON (`20261001160000_late_cancellation_history.sql:266-322`). Nothing in `src/` writes `salon_config.settings.customerPortal` any more; `20260726144001` copied it one way, once. `allow_customer_rescheduling` is read only by a dormant visit-policy function; `customer_intake_enabled` is read only by its own setter and projections. Verified independently.
- **Why it matters:** Staff believe they can switch cancellations, rescheduling or intake off during a holiday or incident. Nothing changes for customers. The enforced cancellation values are frozen at whatever the JSON holds, and `mergeSalonSettings` re-asserts legacy defaults on every unrelated Business/Hours/Account save. The wizard separately hard-codes "within 24 hours" in its SDC02 copy.
- **Recommend:** Decide that the typed table is authoritative for the live portal (the UI already writes it). Swap the gate's `select` to read it (pgTAP fixtures 110/221 move with it). Add the two missing checks (`allow_customer_rescheduling` in `reschedule_customer_booking`, `customer_intake_enabled` in `create_customer_booking_group`) with their own reason codes. Delete `customerPortal` from the legacy JSON defaults. Add a ratchet test asserting every settings key has at least one non-settings consumer; it would have caught this.
- **Difficulty:** Small–Medium. **Risk:** Medium (booking write path; explain before changing per CLAUDE.md). **Priority:** Critical. **Status:** CONFIRMED.

### C3. Cancellation notices use Twilio free text and are recorded "sent" on acceptance
- **Found:** `notify-booking-cancelled/index.ts:171` calls `sendWhatsAppBoolean` from `_shared/twilio.ts`; confirmed, reminder, welcome and broadcast use the Meta template path through `whatsapp-send`. Twilio returns 201 "queued" and fails asynchronously (outside 24-hour window, number not on WhatsApp); the function writes `status='sent'` with no reconcilable provider id. `reminder-sms-fallback` chases only `reminder` and `confirmed`. The 12 October reconciliation migration's own header lists cancellation notices as out of reach. No Twilio status callback exists anywhere.
- **Why it matters:** A customer whose appointment the salon cancelled may never be told, while the Delivery issues card says they were. Staff cancellations are at least staff-initiated so a human is in the loop; customer-requested cancellations via the Inbox are the narrow silent case.
- **Recommend:** Two steps. Now, with no external prerequisite: stop writing `sent` on Twilio accept (write `pending`, let the reaper flip it), and add `cancelled` to the SMS fallback's trigger list. Then: get a `booking_cancelled_v1` Meta template approved, route the function through `whatsapp-send` template mode exactly as `notify-booking-confirmed` does, and delete the Twilio WhatsApp sender.
- **Difficulty:** Small then Medium. **Risk:** Low. **Priority:** Critical → High after step one. **Status:** CONFIRMED (code); live failure rate HYPOTHESIS.

### C4. Whole-row booking updates with no conflict detection; a stale device can silently undo a colleague's payment
- **Found:** `useBookings.updateBooking` (`useBookings.ts:452-520`) always writes date, slot, service, payment, `paid_amount`, `payment_method`, status and more from the in-memory booking with `.eq("id")` only. Device B pressing "Mark ready" from a stale row after device A took payment rewrites `payment='Due at Pick-up'`, `paid_amount=null`; the payment-history trigger records it as a legitimate staff change. Realtime normally refreshes rows, which narrows the window. `bookings.updated_at` exists, and `useSalonConfig.ts:166-227` already contains a conflict-check pattern to copy.
- **Why it matters:** This is the only silent data-loss path in daily use. Two staff on two tills is the normal Monday.
- **Recommend:** Proportionate fix in two parts. (a) Status-only actions send status-only patches built from the `changes` object, so a status tap can no longer carry stale money. (b) One BEFORE UPDATE trigger that refuses a `Paid in Full` → unpaid regression unless an explicit marker is set (the existing undo path sets it). The full `updated_at` predicate can follow.
- **Difficulty:** Medium. **Risk:** Medium. **Priority:** High (downgraded from Critical after challenge: realtime mitigates; payment regression is the only destructive case). **Status:** CONFIRMED mechanism; frequency HYPOTHESIS.

---

## 3. HIGH-VALUE IMPROVEMENTS

### H1. Three staff controls toast success when the database refused the write
- **Found:** `SlotGrid.handleMoveBooking` (`SlotGrid.jsx:80-93`) awaits `onMoveBooking` then unconditionally toasts "Moved X to HH:MM"; `updateBooking` returns `null` on failure and never throws (`useBookings.ts:622`), so the `catch` is unreachable. `RescheduleModal.onConfirm` (`BookingDetailOverlays.jsx:150-172`) toasts "Booking rescheduled" and closes without checking the result. `BookingCardNew.applyStatusChange` (`:168-186`) does not even await. Drag preflight uses `staffOverride: true` but the drop does not stamp `staff_capacity_override`, so a 2-2-1 rejection is realistic. The Today stack does this correctly (`patch` awaits, rolls back, offers Retry).
- **Recommend:** Treat `null` as failure at all three sites, surface the gate's `DETAIL` reason through `mapDenialReason`, keep the modal open. Better: route them through the stack's `patch` contract. Consider removing the inline status `<select>` from calendar cards entirely; status work lives on Today.
- **Difficulty:** Small. **Risk:** Low. **Priority:** High. **Status:** CONFIRMED (verified independently).

### H2. Customers discover they cannot reschedule or cancel only after the action
- **Found:** `BookingCard.jsx:229,238` always renders Reschedule and Cancel. It never calls `customer_change_deadline_preview` (which exists at `rpc.ts:823` and is the enforcing source) nor the portal policy. A customer inside the notice window walks all five wizard steps before `cancel_booking_impl` refuses with SDC02 at confirm. The SDC02 copy hard-codes "24 hours".
- **Recommend:** On card mount call the preview RPC with the booking's date and earliest slot; render Reschedule disabled with "Changes closed at {time}. Message us" when passed; hide Cancel when the policy forbids it; derive the hours from the preview. Do not touch `previous_day_1500_v1`.
- **Difficulty:** Small–Medium. **Risk:** Low. **Priority:** High. **Status:** CONFIRMED.

### H3. Non-capacity refusals are shown as "that slot has just been taken" and counted as capacity denials
- **Found:** `BookingWizard.tsx:756` treats every P0001 as a capacity gate. The RPC raises P0001 for "awaiting approval" and "complete your profile" (`20260712115759:766,774`) and 22023 for `dog_size_unconfirmed` / not-owned (`:855-860`). `mapDenialReason` maps the first two to `unknown` → "Sorry, that slot isn't available anymore" and a row in `booking_denials`, which report 2F counts as turned-away demand. Both client gates fail open on a read error, so this path is reachable.
- **Recommend:** Emit DETAIL codes (`awaiting_approval`, `profile_incomplete`, `dog_size_unconfirmed`, `dog_not_owned`), add them to `DENIAL_REASON_LABELS` under a `policy` group with honest copy, and exclude them from report 2F. Keep `denialCodeContract.test.ts` green.
- **Difficulty:** Small. **Risk:** Low. **Priority:** High. **Status:** CONFIRMED.

### H4. `whatsapp-send` does not enforce opt-out; no STOP keyword handling
- **Found:** No reference to `opted_out` in `whatsapp-send/index.ts` (verified). Opt-out is enforced only by callers that use `pickChannel`; staff template sends, agent `manual`/`book_entry`/`flow`/`list` modes and `apply-customer-confirm` acks bypass it. `_shared/agentRisk.ts` has no stop/unsubscribe keyword.
- **Recommend:** Resolve the human inside `whatsapp-send`, refuse with 409 `opted_out` unless staff pass an explicit override; detect stop/unsubscribe in the agent and set the flag plus a handoff draft.
- **Difficulty:** Small. **Risk:** Low. **Priority:** High (PECR). **Status:** CONFIRMED.

### H5. Delete, archive, erase and retention have no shared policy
- **Found:** Human "Delete permanently" dialog promises "dogs, bookings, photos all go too" (`HumanCardConfirmDialogs.jsx:37`), but `booking_lineages.human_id` and `booking_visits.human_id` are `NO ACTION`, so the delete fails with an FK error for anyone who ever booked (reproduced on the migration replay). Dog delete, by contrast, cascades `bookings→dogs` and silently erases that dog's booking history. Hard-delete of bookings remains a staff power. The public privacy page promises 3-year/6-year retention and deletion on request; no job enforces any of it; `whatsapp_messages`, `notification_log.message_text`, `booking_events` and `whatsapp_events` (which stores every retried and invalid-signature payload, with phone numbers) have no retention. There is no anonymise RPC or SAR/erasure procedure.
- **Recommend:** Make UI "Delete" an archive (both tables have `archived_at`); one owner-only `erase_customer()` RPC that anonymises rather than deletes; change `bookings→dogs` to `RESTRICT`; restrict booking hard-delete to owner or remove it; write `docs/data-protection.md` with the retention periods the owner chooses, and one pg_cron that nulls message content past them. Owner decision on periods first.
- **Difficulty:** Medium. **Risk:** Low. **Priority:** High. **Status:** CONFIRMED.

### H6. Public facts drift between the website, the app and `llms.txt`
- **Found:** `website/src/constants/servicesData.js` and `website/public/llms.txt` say Maintenance Groom £32, De-shedding £35, Puppy Intro £35; `src/constants/salon.ts` says Bath & Brush £38, Bath & De-shed £38, Puppy Groom £38; `index.html` og text uses a third name ("bath & tidy"). `llms.txt` (advertised to AI crawlers via robots.txt) and `BUSINESS_LISTINGS_SHEET.txt` give a different phone number and email from the app and describe an "AI receptionist takes calls" that does not exist. Hours appear as 08:30–15:00, 08:30–13:00 and Mon–Sat 08:00–17:00 in three places. `ReportsInsightsView.jsx:185` hard-codes "14/day". The public RPC `get_public_salon_facts` deliberately excludes pricing.
- **Recommend:** Owner picks the canonical names and prices. Then generate `llms.txt`, the sitemap and a public price list at build from one source (extend `get_public_salon_facts` or a shared constants package). Delete the listings sheet. Interpolate `salonConfig.dailyDogCap` in Insights.
- **Difficulty:** Small–Medium. **Risk:** Low. **Priority:** High. **Status:** CONFIRMED.

### H7. No rollback story for any layer; edge deploy CLI unpinned and aborts mid-loop
- **Found:** No Vercel instant-rollback or function redeploy-from-SHA runbook; migrations are forward-fix only. `deploy-edge-functions.yml` uses `supabase/setup-cli@v3` with `version: latest` while four other workflows pin 2.109.1; the sequential loop under `set -euo pipefail` stops at the first failure and leaves later functions stale, and a `_shared/` change redeploys all 29.
- **Recommend:** One `docs/rollback.md` covering frontend (Vercel), Edge (redeploy from SHA), database (forward-fix with the named procedure). Pin the CLI; collect per-function failures and fail at the end naming what is stale.
- **Difficulty:** Small. **Risk:** Low. **Priority:** High. **Status:** CONFIRMED.

### H8. Sentry has no release and the build ships no source maps
- **Found:** `src/lib/sentry.js` init sets dsn/environment/`beforeSend` but no `release`; `vite.config.js` has no `build.sourcemap`; 0 `.map` files in dist. An incident reads "TypeError in index-COs7iGCs.js:1:48213", unattributable to a deploy.
- **Recommend:** `release` from `VERCEL_GIT_COMMIT_SHA` (public, map to a `VITE_` var), hidden source maps via `@sentry/vite-plugin` (auth token as a build secret, never `VITE_`), `Sentry.setTag("mount", …)` in `index.jsx`.
- **Difficulty:** Small. **Risk:** Low. **Priority:** High. **Status:** CONFIRMED.

### H9. README is wrong about routing, lifecycle, deployment and the function inventory
- **Found:** README says `src/index.jsx` routes `/customer/*` (actual `/book`, `/staff`); describes the lifecycle as "Not Arrived → Checked In → In Bath" (actual Booked → Reconfirmed → Arrived → Ready for collection → Completed); says the PR job skips Playwright (WebKit smoke runs); lists 23 of 28 Edge Functions. Ten docs carry "Last verified 9 Aug". `docs/private/` is referenced four times and does not exist. Three "active" plans are complete.
- **Recommend:** Rewrite the four README sections from code (30 minutes). Add a 40-line staleness check to `check:docs` (every governed doc has a `Status` and a `Last verified` within N days or is under `archive/`).
- **Difficulty:** Small. **Risk:** Low. **Priority:** High. **Status:** CONFIRMED.

### H10. Grooming notes never reach the Today card
- **Found:** `dogs.groom_notes` is edited on the dog card, appended by the Inbox "Update notes" AI feature and fed into the agent prompt, but `TodayView.getWelfare` (`TodayView.jsx:171-174`) returns only alerts, pregnancy and the booking's own note (verified). The groomer's durable instructions are one modal away at the exact moment they are needed.
- **Recommend:** Add `groomNotes: dog?.groomNotes` to `getWelfare` and render it in the expanded card under "Usual groom". Pure UI.
- **Difficulty:** Small. **Risk:** Low. **Priority:** High. **Status:** CONFIRMED.

---

## 4. INCOMPLETE FEATURES

| # | Feature | State | Evidence | Recommend | Diff / Risk / Priority |
|---|---|---|---|---|---|
| I1 | **Booking Desk** (`/booking-workspace`) | Flagged, owner-only, every action handler is a no-op; renders an empty `<main>` in the walkthrough build | `BookingWorkspaceView.jsx:52-57,174-224`, `features.ts:8-9`, `App.jsx:240` | Move the slot-proposal pane into the Inbox context rail; delete route, flag, nav item (1,614 lines) | Medium / Low / Medium |
| I2 | **Legacy salon board** | Build-time flag that `features.ts` itself says should be removed "after a few trading days"; stack shipped September | `views/today/board/` 2,325 lines; `TodayView.jsx:565-604` | Delete the directory, the branch and only the drag/zone half of `engine/salonBoard.ts` (`groupTokensBySlot`, `moveForDrag`, `canDragToken`, `dropZoneFor`, `ACTIVE_BOARD_ZONES`); keep the zone constants and `buildBoardTokens` the stack still imports | Small–Medium / Low / Medium |
| I3 | **Trusted humans (customer)** | Read-only card with a permanent "temporarily unavailable" placeholder since the RPC was deliberately dropped in July; portal bookings never set `notify_human_ids` | `TrustedHumansSection.jsx:57`, `20260712115759:904` | Either honest copy ("Ask us to add someone — message the salon") or a consent-safe request → `salon_todos`, mirroring `request_dog_size_check` | Small / Low / Medium |
| I4 | **Waitlist** | Write-only for customers: no dog/size/slot context, no visibility, no removal, no unique constraint; two outbound calls per insert | `bookingsRepo.ts:624`, `waitlist_entries` schema | Add `dog_ids`, size, unique `(human_id, target_date)`; show "You're on the waitlist" with Leave | Medium / Low / Medium |
| I5 | **Inbox booking** | Correctly disabled per the A2 decision, but `BookAppointmentModal.jsx`, `useStaffBooking.ts` and `create_staff_booking_from_conversation` have no callers, and two "not available" notices sit in one column | `BookingActionsPane.jsx:54-62`, `CustomerContextPanel.jsx:~190` | Delete the dead modal and hook (keep the audited RPC); one disabled control, one sentence | Small / Low / Medium |
| I6 | **Walk-ins** | No service, no booking type, no till entry; cash-up reads bookings only, so walk-in cash is invisible | `salon.ts:28-33`, `engine/today.ts` | Owner decides whether walk-in money belongs in the day's takings; if yes, a non-seat "Walk-in" quick entry on Today | Medium / Low / Low |
| I7 | **Recurring series from the drawer** | Silent skips of closed/full dates, 52 parallel inserts, "Couldn't save" when 3 of 52 fail, no `group_id` so "View series" never appears | `NewBookingModal.jsx` (`buildBookingsForOverride`), `useStaffAppData.ts:196-225` | Preview kept/skipped dates, per-date results, assign a `group_id`; merge with `ChainBookingModal`'s builder | Medium / Low / Medium |
| I8 | **Team / roles** | `owner`/`staff` exist in RLS; no UI shows the role, lists staff, promotes or deactivates; only `scripts/seed-first-owner.mjs` with the service-role key | `useAuth.ts:17,270`, `20260330095135:29` | Show the role in Account; owner-gate "Delete permanently" and `merge_humans`. Skip an invite Edge Function (rare event, new auth surface) | Small / Medium / Medium |
| I9 | **Notifications settings tab** | Twelve channel chips and a "Follow-up / review request" row describing a function that does not exist; no runtime reader | `NotificationSettings.jsx:12-17`, grep of `supabase/` for `settings->'notifications'` = 0 | Replace with a read-only "what we send and when" card from the real rules | Small / Low / High |
| I10 | **Staff reschedule → customer message** | A move is a plain UPDATE; nothing tells the owner; `booking_changed_v1` is defined in `whatsappTemplates.js:90` and referenced nowhere | `20260706120000`, grep | Owner decision. The 15 Aug STOP covers *automated* notification; an opt-in staff prompt modelled on `CollectionNoticeModal` is "manual contact" by the repo's own terminology. Needs the live template status checked first | Medium / Low / Medium |
| I11 | **`notify-booking-ready`** | Trigger dropped 20260526; function still deployed and reachable via `resend-booking-notification`'s `'ready'` mapping, which would send a Twilio text the product replaced | `20260526120000`, `resend-booking-notification/index.ts:25-30` | Delete the function and its trigger function; drop `'ready'` from the resend map | Small / Low / Medium |
| I12 | **Dormant visit substrate** | 28 tables, ~10.3k lines SQL, 11 of 31 `bookings` triggers, `bookingPolicyRepo.ts` + a 1,365-line guard file with no production caller; two status-split stragglers already broken (`recompute_legacy_booking_visit` keeps a `No-show` visit `active`; `suggest_conversation_closures` matches retired status names) | `20260726144000…144013`, `src/supabase/repositories/bookingPolicyProjectionGuards.ts` | Fix the two stragglers now via `booking_occupies_seat()`; add a "no retired status literal in `pg_proc`" test; quarantine the browser repo under `dormant/` out of the coverage ratchet; one ADR setting a horizon (date, or a contract plan keeping only `booking_visits` + `booking_lineages`) | Small (stragglers) → Large (ADR) / Low → Medium / Medium |

---

## 5. UX / WORKFLOW IMPROVEMENTS

Grouped by user. Walkthrough screenshot paths below refer to the audit session's working folder (`walkthrough/shots/<viewport>/…`); they are not committed.

### Customers
- **U1. Five screens before a new customer can do anything** (Welcome → set password → two onboarding steps → approval wait). Email is mandatory at signup though existing customers need none and every notification falls back to SMS. The signup draft (name, address, email, dogs) persists unencrypted in localStorage for 7 days, including on shared devices. Merge Welcome into the password step; make email optional or explain it; clear the draft on sign-out. *Small / Low / Low.*
- **U2. Pending-approval wait sets no expectation.** "We'll message you" with a manual "Check again" button; nothing says "usually within one working day (Mon–Wed)". No staff SLA signal exists for signups waiting >24h. Add the copy; add a "N signups waiting >24h" line to the existing 08:15 Slack summary. *Small / Low / Low.*
- **U3. Dashboard loads as a sequential four-request chain** behind one spinner (`useCustomerDashboardData.ts:68-123`). Parallelise after dogs; render cards progressively (the per-resource `loaded` flags already exist). *Small / Low / Medium.*
- **U4. "My details" edits address as free text** while onboarding uses the Geoapify `AddressPicker`; changing the address keeps the stale postcode; Cancel after Save reverts the form to pre-save values because `humanRecord` is never refreshed. Reuse `AddressPicker` in edit mode; call `refreshHumanRecord` after save. *Small–Medium / Low / Medium.*
- **U5. Editing a dog's breed can silently remove its online-booking eligibility** (`update_customer_dog` re-derives size; non-canonical breed → `NULL`). Warn in the form when `getSizeForBreed` returns null. *Small / Low / Medium.*
- **U6. Success screen says "message us on WhatsApp to change anything"** while the dashboard offers self-service; the "Booking ref" is just date+time. Point to the dashboard and the real deadline. *Small / Low / Low.*
- **U7. Past appointment prices are recomputed from today's price list and the dog's current size** (`AppointmentsSection.priceLabelFor`). Show stored price only. *Small / Low / Low.*
- **U8. OTP stage has no "Resend code"**; a customer whose SMS never arrives must go back, wait out the 60s cooldown and re-mint a Turnstile token. Add Resend gated by the existing cooldown state. *Small / Low / Medium.*
- **U9. Accessibility:** cancel-reason `<select>` and "Other" input have no accessible name (`BookingCard.jsx:256,272`); wizard stepper uses `role="progressbar"` on an `<ol>`; login error has no `aria-invalid`/`aria-describedby`; customer pages have no `main`/`nav` landmarks or skip link; `/reset-password` has no H1. *Small / Low / Medium.*
- **U10. Every route is titled "SmarterDog — Salon Bookings"**, including the customer login and reset pages (walkthrough-confirmed). Route-specific titles. *Small / Low / Medium.*

### Staff (the day)
- **U11. Phone: toasts stack over the card's primary action.** Three Undo toasts cover "Check out" and "Call Dave" (`phone/today/08`, `/12`). Single-toast policy on the stack. *Small / Low / High.*
- **U12. New-booking Confirm is silently disabled until a time is picked, and the time grid is below the fold** (`desktop/calendar/12`, `phone/calendar/12`). Show "Choose a time" or pre-select the next free slot. From a "+ Book" ghost seat it is 4 taps; from the header 5 taps plus typing, which is good. *Small / Low / High.*
- **U13. Over-capacity booking is a one-tap chip in the drawer** ("8:30am — over capacity, click to override", then Confirm proceeds silently) while the slot popover makes the same act an explicit "Override & book". One explicit confirmation. *Small / Low / High.*
- **U14. "Confirmed" is represented three ways and offered twice on one card** (`reconfirm` → status only; `confirm` → stamp + status; legacy `bookings.confirmed` boolean still written). Only the second is counted by reports. Drop bare `reconfirm`; schedule the column's removal. *Small / Low / Medium.*
- **U15. Three ways to move a booking, three behaviours, none touch-capable on the calendar.** Drag (mouse only), Reschedule modal, edit-mode date/slot; the last appends "[Booking moved by Staff…]" to the dog's permanent `groom_notes` on every move. Make the Reschedule modal the one affordance; stop stamping `groom_notes` (`booking_events` is the audit). *Medium / Low / Medium.*
- **U16. Cancelling messages the customer automatically; the dialog does not say so; Undo re-books but cannot recall the message.** Say "The owner will be messaged" with a don't-message option, as the collection notice already does. *Small / Low / Medium.*
- **U17. "Needs attention" means three things** (Today header strip, closure hazard frame, 30-day backlog route hidden in a tools menu). One line on the Today header linking to the backlog; rename the frame "Inside closed hours". *Small / Low / Medium.*
- **U18. Four day-oriented views where two is right:** Week calendar ("Bookings"), Today (nav "Daily Brief", docs "Today"), Booking Desk, Needs Attention; immediate-slot toggle and new-booking entry duplicated between Today and the calendar; status changes in three places. Settle on **Today** (run the day) and **Diary** (book, move, block, close), one name each. *Medium, mostly deletion / Low / Medium.*
- **U19. Phone action row wraps to three lines** with "Didn't show" orphaned (`phone/today/03`); tablet fits five on one row. "Didn't show" is one quiet tap with no confirm and no Undo on the toast, contrary to the docs. *Small / Low / Low.*
- **U20. Calendar: no H1; 61 small targets on desktop; "Open booking for Bella" is 31×16 on phone; day navigation replaces history so Back never returns to the previous day; unknown `/staff/*` paths render the calendar under the wrong URL.** Make the whole card the button; add a 404 route. *Small–Medium / Low / Medium.*
- **U21. Detail modal: pick-up person shows "H1"** (a raw id falling through `PickupPersonField`'s `|| value` fallback, against the repo's "never show a raw id" rule); `bookings.notes` is shown on Today but neither shown nor editable in the detail modal; dead payment chooser on the calendar card (`payChooserOpen` never set true); two mark-paid paths still write the gross on deposit visits (`PaymentStateSection.jsx:169-186`). *Small / Low / Medium.*
- **U22. A deploy during trading hours can lose the half-made booking.** `registerType: "autoUpdate"` + `skipWaiting` + `clientsClaim`; the challenger established the real sequence: a same-device reload installs the new worker, the other open tab's next lazy chunk 404s, `chunkReload.js` reloads once, and the New Booking drawer draft is React state only (`useBookingSession.ts`; `useDraftPersistence` is customer-only). Let the SW wait (remove `skipWaiting`/`clientsClaim`) and persist the drawer draft to `sessionStorage`. *Small / Low / Medium.*

### Staff (inbox, directories, settings)
- **U23. Phone Inbox clips the AI-draft actions behind the sticky composer; filter chips overflow unseen; a 140px bar holds only "New message"; "Waiting time unavailable" in red on every row reads as an error** (`phone/inbox/01`, `/02`). *Small / Low / High.*
- **U24. Unmatched number: the panel tells staff to "add a quick profile" but offers no Link-to-customer or Create-customer action**; linking only happens on the next inbound if the stored phone format matches. Add both actions (staff already have UPDATE on the row). *Small–Medium / Low / Medium.*
- **U25. A cancel/move request in the Inbox cannot see the booking it is about**: the context panel shows the most recent *past* booking only. Add upcoming chips (the agent's own context query already lists them). *Small / Low / Medium.*
- **U26. Phone search does not normalise the query**: all paths are `ilike '%term%'` on the stored string; typing "07700 900" against `+447700900123` finds nothing. Compare digits-only when the term has ≥4 digits. *Small / Low / Medium.*
- **U27. Settings: eleven tabs, two save models, two read-only explainer tabs, tabs not in the URL (Back leaves Settings; refresh resets to tab 1), ~2.5 tabs visible on phone with no scroll cue, Hours end-time inputs clipped on phone, four unlabelled inputs on Your Business, "Current booking setup" legacy block and the new policy block both shown.** After C2 and I9, collapse to ~6 tabs, one save model, tabs in the URL. *Medium / Low / Medium.*
- **U28. Add-client step 1 uses placeholders that look like real values** ("Amanda", "Booth", "07985 630521"). *Small / Low / Low.*
- **U29. Insights: fourteen panels, few decisions.** Cash-up is honest and decision-shaped; the six decision reports (2A–2F) have a "so what"; the rest are descriptive. Promote the six, collapse the rest; consider deleting Customer ranking (PII-dense, no action). *Small / Low / Medium.*
- **U30. Inbox metadata at 10–11px and 32px targets** while the rest of the app is disciplined at 44px. *Small / Low / Low.*

**Correction to the walkthrough's top item.** The New Booking drawer is deliberately non-modal (`NewBookingModal.jsx:703 modal={false}`) so the calendar stays usable while booking; the detail modal and 17 others use `AccessibleModal` with a react-aria focus trap and `aria-modal`. The "no focus trap" observation is therefore mostly a design choice, not a defect. What remains real: no visible `:focus-visible` ring on header and calendar buttons, and `/staff/dev/*` preview routes plus the blank Booking Desk being reachable by URL in the production bundle.

---

## 6. AUTOMATION OPPORTUNITIES

| # | Opportunity | Today | Proposed | Diff / Risk / Priority |
|---|---|---|---|---|
| A1 | **Daily pipeline health line** | Deno errors live only in Edge logs; pg_net responses sit unread in `net._http_response` (~6h TTL); ~14 pg_cron jobs fail silently; Twilio outcomes unknown | One daily pg_cron query (pending >10 min, failed last 24h by trigger, `whatsapp_events` failed, `cron.job_run_details` failures, SMS sent) posted through the existing `slack-alerts` ledger to a separate ops channel. Covers four findings for the cost of one | Small / Low / High |
| A2 | **Settings consumer ratchet** | Twenty settings keys, eleven with no runtime reader (see C2, I9) | A test asserting every key in `createDefaultSalonSettings` and `booking_policy_settings` has at least one non-settings consumer | Small / Low / High |
| A3 | **Generate hand-maintained copies at build** | Prices/names/contact/hours in four places; `llms.txt` and sitemap hand-edited; template approval status hand-maintained in `whatsappTemplates.js` while `whatsapp_templates` holds Meta's live status and `sync_templates` is called by nothing; the Deno capacity mirror hand-synced (comment-stripped diff shows real divergence outside the governed fixtures); `database.types.ts` regenerated in CI and only uploaded, never diffed | A `scripts/sync-*.mjs` family wired into `npm run lint`: generate `llms.txt`/sitemap/price list from one source; read template status from the DB in `TemplatePicker` and expose `sync_templates` as an owner button; generate the Deno mirror from `src/`; diff `database.types.ts` and fail | Small each / Low / Medium |
| A4 | **Cross-slot capacity lock** | `validate_booking_capacity()` takes a per-slot lock; the per-date lock is inside the non-staff daily-cap branch (`20260919115000:181-184`). Two staff devices inserting into neighbouring slots at once can both commit and produce 2,2,2 (reproduced on replay). Harness tests same-slot and daily-cap only | Take the date lock unconditionally before any `get_seats_used`; add a `cross-slot` scenario to `verify-capacity-concurrency.sh`. Capacity trigger = explain first | Small / Low / Medium |
| A5 | **Pregnancy gate on UPDATE** | `trg_enforce_dog_not_pregnant` is `BEFORE INSERT` only (`20260623130000:78-79`, verified); `apply-customer-confirm` reschedules by UPDATE | `before insert or update of booking_date, slot, dog_id`; pgTAP case | Small / Low / Medium |
| A6 | **Fetch timeouts** | Only `postcode-lookup` and `recipients.ts` bound their provider calls; Meta, Anthropic, Twilio, SendGrid, Slack and sibling invokes are unbounded | `_shared/http.ts fetchWithTimeout`; treat timeout as *uncertain* (leave `pending` with `error_message='timeout'`), per AGENTS.md | Small / Low / Medium |
| A7 | **Welcome idempotency** | `notify-customer-welcome` is read-then-write; no unique index covers `(human_id, 'welcome')`; double approve → two welcomes | Partial unique index + claim-before-send like every other notify function | Small / Low / Low |
| A8 | **Retention jobs** | Pruning exists for funnel/denial telemetry (90d), abandoned signups (7d), Slack ledger | Extend to `whatsapp_events` (hash+length for invalid-signature rows; 90d), `whatsapp_messages` content, `notification_log.message_text`, per the owner's periods | Small / Low / Medium |
| A9 | **Per-phone AI caps** | Unknown number → one Claude call per inbound; only booking actions are capped | 20 model calls/hour and 3 record creations/day per conversation → handoff draft | Small / Low / Medium |
| A10 | **Deploy workflow** | Unpinned CLI, abort-on-first-failure, no post-deploy ping | Pin; collect failures; optional `GET /whatsapp-flow-endpoint` smoke | Small / Low / High |

---

## 7. NEW PRODUCT OPPORTUNITIES

Grounded in data the system already holds. None is a generic SaaS wishlist item.

- **P1. One "New customers" queue.** Unknown WhatsApp numbers onboarded by the agent (`lead_status`) and "Join the Pack" self-signups are the same decision (approve, size the dogs, welcome) in two screens. Feed both into the existing `SignupApprovalQueue` drawer. *Medium / Low / Medium.*
- **P2. Account-level "do not book" and dog archive reasons.** There is no customer-level block (staff must tick all ten slots) and no `deceased|rehomed|moved` reason on a dog, so the AI prompt and reminders cannot avoid "how is Bella?". `humans.booking_blocked` + reason code `account_blocked` (the denial group already exists); `dogs.archive_reason`. Gate change = explain first. *Medium / Medium / Medium.*
- **P3. Trusted-human notifications from the portal.** The notify functions already fan out over `notify_human_ids`; the wizard never sets it. A "also tell {trusted human}" tick on confirm. *Small / Low / Low.*
- **P4. Walk-in till entry** (if the owner wants walk-in cash in the day's takings; see I6).
- **P5. Signup SLA and waitlist visibility in the morning Slack summary.** Both are one line each in `slackAlertThresholds.ts`. *Small / Low / Low.*
- **P6. Customer-facing "last minute" proof.** Same-day slots already exist for customers when staff flag them; nothing tells the waitlist. When a seat frees on a flagged day, notify matching waitlist entries (needs I4's dog/size context first). *Medium / Low / Low.*
- **P7. Owner-visible calendar-feed tokens.** Staff feed tokens carry every customer name, live in a URL, have no default expiry and are revocable only by their owner. Owner list with revoke, default `expires_at`, drop surnames from staff summaries (the Slack rule shows the salon already accepts that trade-off). *Small / Low / Medium.*

---

## 8. TECHNICAL DEBT

- **T1. Edge Functions: six notify/send functions re-implement one loop over three provider stacks** (~1,800 lines; copy duplicated in `src/lib/reminders/templates.js`). One `_shared/notifyPipeline.ts` with a `trigger_type → template/params/sms/email` table; keep the DB triggers and repoint them. Structurally fixes C3 and gives every trigger the SMS fallback. *Large / Medium / Medium.*
- **T2. Sample-data mode re-implements the whole write path.** `useOfflineState.ts` (505 lines) hand-writes 17 handlers; `useBookingActions.ts` has 20 `isOnline ? … : offline.…` ternaries; the 79 Playwright tests exercise the copy, not the hooks, so the "assert the written row" rule cannot apply end-to-end. An in-memory fake of the Supabase surface seeded from `sample.js` would let the real hooks run in E2E. Highest-payback refactor; plan it, don't rush it. *Large / Medium / Medium.*
- **T3. `rpc.ts` wrappers take an untyped client** (1,210 lines, 81 exports, zero uses of `Database["public"]["Functions"]`); the debt register's claim that arguments are compile-checked is not true. `SupabaseClient<Database>` + derived Args/Returns. *Medium / Low / Medium.*
- **T4. Realtime: ~12–15 unfiltered channels per Today tab;** 25 `.channel(` sites, only 4 use a server-side `filter:`. Measure in the Supabase dashboard first, then filter where a column exists and consolidate dashboard counts onto one `booking_events` channel. *Medium / Low–Medium / Medium.*
- **T5. Customer portal has zero code-splitting**: `CustomerApp-*.js` is the largest app chunk (135 KB) because the wizard, onboarding and login are eagerly imported. Lazy the three. *Small / Low / Medium.*
- **T6. `src/hooks` vs `src/supabase/hooks` split unenforced** (11 of 33 `src/hooks` files import the client); 33 DB column names in 8 staff components. Extend the `no-restricted-imports` rule. *Small / Low / Low.*
- **T7. Free-text columns the engine treats as enumerations**: `bookings.service`, `bookings.payment`, `bookings.source`, `humans.source` have no CHECK; `'Haircut Deluxe'` is accepted. Learn the prod domain, add CHECKs `NOT VALID` then validate. Keep text+CHECK over enums (it is what made the September status rename possible). *Small–Medium / Low–Medium / Medium.*
- **T8. `humans.customer_user_id` not unique** (every customer RPC does `… limit 1`); phone uniqueness on the raw string; three redundant indexes; `salon_config.large_dog_slots` is a dead column; `dog-photos` bucket configured and unused; `groom-photos`/`whatsapp-media` have no size or MIME limits. *Small each / Low / Medium.*
- **T9. Legacy table grants.** On the migration replay, `anon` and `authenticated` hold full DML plus TRUNCATE/TRIGGER/REFERENCES on every pre-July table, and `anon` can execute seven SECURITY DEFINER functions including the dead, unauthenticated `increment_conversation_unread`. Committed migrations never grant TRUNCATE, so this may be the local image's defaults rather than prod; confirm with a read-only grant check on prod before narrowing `authenticated`. The `anon` revoke and dropping the dead function are safe now. *Small–Medium / Low–Medium / Medium.*
- **T10. Stored prompt injection surface.** Model output is persisted into `humans.notes`/`dogs.groom_notes`/`alerts` and fed back into later prompts as trusted context; values are uncapped free text. `[AI]` prefix, length caps, quote notes as untrusted in the prompt, one eval case. *Small / Low / Medium.*
- **T11. Tests: 42 of 50 `src/security` tests regex-match repository file text**; `productionApplyMigrationsWorkflow.test.ts` is the most-changed file in `src` since September (17 commits). Keep the invariant tests (`nodeRuntimeConsistency`, `offlineTestGuard`, `bookingPolicyInactiveIsolation`, `triggerFunctionGrants`); replace text-pinning workflow tests with `actionlint` plus one structural check each. Duplicate test files (`capacity.test.js` + `.ts`). Permanent 66-warning lint floor. 470 of 532 `<button>` lack `type=`. *Medium / Low / Low–Medium.*
- **T12. ADR 009's "independent applications" boundary collapsed six days after acceptance** (one Vercel build, one origin, shared RPCs). What remains independent is tooling: two lockfiles, two Playwright stacks, a 5-browser e2e on every website PR, `npm ci --prefix website` on every prod deploy. `website/` is already on Vite 8 / ESLint 10 / Vitest 5, a live canary for exactly the upgrades the root plan calls risky and does not mention. An ADR 014: keep the app boundary, converge tooling (workspaces, shared salon-facts package). *Medium–Large / Low / Low.*
- **T13. Vercel headers:** CSP `style-src 'unsafe-inline'`, no `report-to`, HSTS without `includeSubDomains`; `/_vercel/insights/script.js` requested unconditionally (404 off-Vercel). *Small / Low / Low.*
- **T14. Two London-time shortcuts** (`apply-customer-confirm` hard-codes `+01:00`; `notify-booking-reminder.tomorrowDateString()` is UTC; `request_customer_override_reschedule` compares against UTC `current_date`) despite `londonTime.ts` helpers existing. *Small / Low / Low.*

---

## 9. THINGS TO SIMPLIFY OR REMOVE

A removal is as valuable as a feature. Roughly 5,000 lines of production code and 150k words of documentation have no live purpose.

| # | Remove / merge | Lines or size | Evidence | Keep |
|---|---|---|---|---|
| R1 | Legacy salon board directory, flag, `TodayView` branch, drag/zone engine functions | ~2,300 + 543 test | I2 | zone constants, `buildBoardTokens`, `buildAttentionSummary`, `tokenActions` (the stack imports them) |
| R2 | Booking Desk route, flag, nav item, view | 1,614 | I1 | `BookingPane`'s slot-proposal logic → Inbox rail |
| R3 | Dormant `bookingPolicyRepo.ts` + `bookingPolicyProjectionGuards.ts` (1,365) + tests | ~2,300 + ~5,300 test | I12 | Move to `repositories/dormant/` excluded from the ratchet rather than delete; it is the decoder B1 would need if the STOP is reversed |
| R4 | `AddBookingForm.jsx` (369), `CountBadgeCard.jsx` (104), `SlideOverPanel.jsx` (33); ~60 exports unused even by tests | ~500 | 06-#12/#13 | Add `knip` to `npm run lint` with a baseline |
| R5 | `BookAppointmentModal.jsx`, `useStaffBooking.ts`; one of two "not available" Inbox notices | — | I5 | the RPC |
| R6 | `notify-booking-ready` function + `notify_on_booking_ready()`; `'ready'` from the resend map | 1 function | I11 | — |
| R7 | `whatsapp-register` → `scripts/`; give `whatsapp-admin` its own secret or reduce to a cron `sync_templates` | 2 functions | 05-F13 | — |
| R8 | `staging-tranche1-smoke.yml` (one-off July workflow) and the 124-line test that pins its text | — | 06-#16 | — |
| R9 | `e2e` required check that does nothing on PRs (every step skipped except an echo) | — | 06-#24 | rename `e2e-post-merge`, drop from required contexts |
| R10 | `e2e-bootprobe/` (nothing runs it; `useDirectoryWarmup.ts` cites it as if enforced) | — | 06-#17 | wire into the post-merge job, or delete |
| R11 | Notifications settings tab (12 dead chips), weekly Hours grid as a booking control, "Auto-confirm" switch, legacy `customerPortal.showUpcoming/allowRebooking`, `advanceBookingWeeks`, `services` settings key, `salon_config.large_dog_slots` column | — | C2, I9 | Hours as "website display only" if the website needs it |
| R12 | Calendar card inline status `<select>`, dead payment chooser, bare `reconfirm` action, `bookings.confirmed` boolean (schedule) | — | U14, U21, H1 | — |
| R13 | Bluehost publisher: `website.yml` deploy job, three FTP secrets, the variable, `htaccess_upload.txt`, `BUSINESS_LISTINGS_SHEET.txt`, `TESTING_COMPLETE.md`; three docs still call Bluehost the live publisher | — | 07-A7 | the runbook said "a few weeks"; it has been five; a rollback to it would strand `/book` on a 404 |
| R14 | Documentation: ~110k live words on the #603 programme (at STOP since 15 Aug) and UX reviews of since-redesigned UIs; four plan homes, two runbook dirs, two archive roots; 14 "Unreleased" CHANGELOG sections with zero tags; three "active" plans that are complete; `docs/private/` referenced but absent | ~150k words | 07-B1/B4 | Do **not** archive PROJECT.md/ROADMAP.md wholesale (AGENTS.md makes them the authority); cut each to one page of "what is true now" and move the narrative under it. Budget: ≤60k live words |
| R15 | Three closure mechanisms (`holiday_closures`, `day_settings.is_open`, `day_settings.closures`) plus the unenforced settings `closures` list | — | 03-1 | the two `day_settings` ones |
| R16 | Four `/staff/dev/*` preview routes reachable in the production bundle (render empty bodies) | — | walkthrough | gate on `import.meta.env.DEV` at the route level too, or move to Storybook-style pages |

---

## 10. LONGER-TERM IDEAS

- **L1. Decide the dormant substrate's horizon.** One ADR: either a dated activation plan for Tranche B, or a contract plan that keeps `booking_visits` + `booking_lineages` (the useful appointment identity) and drops the other 26 tables and their triggers. Five findings are blocked on this.
- **L2. One notification dispatcher** (T1) so every trigger type gets the same claim-before-send, template path, SMS fallback and reconciliation, and "delivery truth" stops being Meta-only.
- **L3. Fake Supabase surface for E2E** (T2), after which a real customer booking journey can be tested end to end (today the customer portal has one `/book` smoke navigation and a shell preview).
- **L4. Tooling convergence between the two apps** (T12) via workspaces and a shared salon-facts package, so prices, hours and contact details have one source for the website, the app and the public RPC.
- **L5. Today + Diary as the whole staff surface** (U18), with status, money and same-day availability on Today and everything calendar-shaped on Diary.
- **L6. Operations envelope:** secrets inventory and rotation (47 Edge env names, rotation documented for two), cost line per provider, uptime check, a second administrator (bus factor is one; Turnstile lives in a separate Cloudflare account), and a decision on whether the repository being public is intended given the operational detail and personal email it exposes.

---

## 11. FAILURE SCENARIOS — how the system holds up

| Scenario | Handles well | Does not |
|---|---|---|
| Two customers book the same slot | Advisory locks + unique index; second gets `capacity_2_2_1` → "just been taken" | — |
| Two staff book neighbouring slots simultaneously | Same-slot and daily-cap serialised | Cross-slot 2-2-1 can produce 2,2,2 (A4) |
| Two staff act on the same booking | Realtime row replace; `registerResume` refetch | Whole-row UPDATE can regress payment or move (C4) |
| Request fails halfway (customer confirm) | `confirmFailure` telemetry; re-check bounces to step 4 | No idempotency key on `create_customer_booking_group`; retry at a neighbouring slot creates a second same-day booking for the dog (01-F6; add a pre-insert "already booked that day" check) |
| Network drops mid-action | Today: awaited, rolled back, Retry offered | Calendar drag/reschedule/status: green toast, red reality (H1) |
| Refresh mid-operation | Human/dog profiles URL-backed; wizard reschedule anchored on a UUID; signup and customer drafts persisted | Calendar detail modal not URL-backed; staff drawer draft lost; Settings tab resets |
| Deploy during trading hours | `chunkReload` prevents a loop | Tab reload drops the drawer draft (U22) |
| Customer opens an old link | `/customer/*`, `/`, `/today` redirect; reset link shows "expired" | `/reset-password` has no H1/landmarks; unknown `/staff/*` renders the calendar under the wrong URL |
| Duplicate webhook | Unique `(direction, meta_message_id)`; second agent run → `ignored`; status updates idempotent | `whatsapp_events` keeps every retry and invalid-signature body forever |
| Provider down for an hour | Meta path: rows fail, SMS fallback chases after 1h | Twilio paths: "sent" on accept, no chase (C3); no fetch timeouts (A6) |
| Template rejected by Meta | Broadcast gates on live `whatsapp_templates.status` | Template picker reads hand-maintained status; `sync_templates` has no caller |
| Missing Edge secret | Const-time helpers refuse empty secrets | `APPLY_CONFIRM_INTERNAL_SECRET` unset → customer "Yes" tap discarded with a warn; several modules would send `Bearer undefined` |
| Incompatible migration deployed | Required `migrations-applied` check compares recorded SQL to committed file; drift and advisor jobs daily | Object-level prod schema never diffed against the replay (out-of-band hardening has diverged before); no rollback runbook |
| Duplicate humans | `merge_humans` SECURITY DEFINER exists with compare UI | Phone uniqueness is on the raw string; `customer_user_id` not unique |
| Deleting a customer | — | FK refusal vs. promised cascade; dog delete silently wipes history (H5) |

---

## 12. DECISIONS ONLY THE OWNER CAN MAKE

These block the findings beneath them. Answering them is the first roadmap item.

1. **Which settings store is authoritative for the live portal?** (Recommended: the typed table the UI writes.) Blocks C2, U14, U27, I9.
2. **Supabase plan and backups.** Blocks C1.
3. **Retention periods, and archive versus erase.** The privacy page says 3/6/3 years; nothing enforces it. Blocks H5, A8.
4. **Canonical service names and prices.** Blocks H6.
5. **Is a one-tap "tell the owner?" after a staff reschedule wanted?** It is manual contact by the repo's own definition, so it sits outside the 15 August STOP, but the STOP's spirit was "the owner finds manual contacting burdensome" and that has not been revisited. Blocks I10.
6. **A horizon for the dormant visit substrate.** Blocks I12, L1 and the cost of every booking write.
7. **Does walk-in cash belong in the till figure?** Blocks I6, P4.
8. **Is the repository meant to be public?** It is (confirmed via the GitHub API). Blocks L6.

---

## 13. PRIORITISED ROADMAP

### QUICK WINS (each under a day; low risk; mostly deletion or one-line fixes)
1. Confirm the Supabase plan; if Free, add the weekly `pg_dump` job (C1).
2. Treat `null` as failure in drag, Reschedule modal and calendar status picker (H1).
3. Show `dogs.groom_notes` on the Today card (H10).
4. Stop writing `sent` on Twilio accept; add `cancelled` to the SMS fallback (C3 step one).
5. Enforce opt-out inside `whatsapp-send` (H4).
6. Rewrite the four wrong README sections; move the three finished plans to `completed/` (H9).
7. Pin the Supabase CLI in the deploy workflow; collect failures instead of aborting (H7).
8. Sentry `release` from the Vercel SHA + hidden source maps (H8).
9. Delete: legacy board (R1), Booking Desk (R2), three unimported files (R4), dead Inbox modal/hook (R5), `notify-booking-ready` (R6), tranche-1 workflow + test (R8), Bluehost publisher (R13), Notifications tab + dead settings keys (R11).
10. Phone fixes from the walkthrough: single-toast policy, Inbox draft actions above the composer, scrollable filter chips, "Choose a time" hint, explicit over-capacity confirm, route-specific titles (U11, U12, U13, U23, U10).
11. Fix the two status-split stragglers via `booking_occupies_seat()` and add the "no retired status literal" test (I12 part one).
12. DETAIL codes and honest copy for approval/profile/size refusals (H3).
13. Daily pipeline health line through the existing Slack ledger (A1).
14. Drop `increment_conversation_unread`; revoke `anon` table privileges (T9 safe half).
15. Generate `llms.txt` at build; delete the listings sheet (H6 part one).

### NEXT (focused development; each a few days; some touch the write path and need the "explain first" discipline)
1. One settings authority: swap the cancellation gate's read, add the two missing checks, delete legacy keys, settings-consumer ratchet (C2, A2).
2. Eligibility on the customer BookingCard from `customer_change_deadline_preview`; derive the hours (H2).
3. Payment-regression trigger guard + status-only patches from `patch()` (C4).
4. Archive-first delete, `erase_customer()` RPC, `RESTRICT` on `bookings→dogs`, `docs/data-protection.md`, retention cron (H5, A8).
5. Cancellation notices on the Meta template path with fallback (C3 step two, after template approval).
6. Cross-slot date lock in the capacity trigger + harness scenario; pregnancy gate on UPDATE (A4, A5).
7. Pre-insert "this dog already has a groom that day" check in the wizard (01-F6 cheap half).
8. Service worker: let it wait; persist the staff drawer draft to `sessionStorage` (U22).
9. Inbox context: link/create customer for unmatched numbers; upcoming-booking chips; digits-only phone search (U24, U25, U26).
10. Template status from `whatsapp_templates` in the picker; owner `sync_templates` button; failed broadcasts labelled and re-runnable (A3, 03-#7/#8).
11. Code-split the customer portal; wrap the onboarding gates in an ErrorBoundary; parallelise the dashboard load (T5, U3).
12. Public facts generator across website, app and RPC after the owner picks names and prices (H6).
13. Settings consolidation to ~6 tabs, one save model, tabs in the URL (U27).
14. Role shown in Account; owner-gate Delete permanently and `merge_humans`; owner-visible calendar tokens with expiry (I8, P7).
15. Quarantine the dormant browser repo out of the coverage ratchet; type the RPC boundary; diff `database.types.ts` in CI (R3, T3, A3).
16. Documentation diet to ≤60k live words with a staleness check, respecting AGENTS.md precedence (R14).
17. Waitlist with dog/size context, uniqueness and visibility (I4).
18. Fetch timeouts helper; welcome idempotency index; per-phone AI caps (A6, A7, A9).

### LATER (architectural; after the fundamentals)
1. ADR on the dormant substrate's horizon, then act on it (L1).
2. One notification dispatcher (L2).
3. Fake Supabase surface for E2E and a real customer booking journey (L3).
4. Today + Diary as the whole staff surface (L5).
5. Tooling convergence between the two apps (L4).
6. Operations envelope: secrets rotation, costs, uptime, second admin, repo visibility (L6).
7. Account-level block and dog archive reasons (P2); one New-customers queue (P1).
8. Replace text-pinning workflow tests with `actionlint` + structural checks (T11).

---

## 14. THE TEN CHANGES THAT WOULD IMPROVE THE PRODUCT MOST

Ranked by the size of the improvement relative to effort and risk, for a two-person salon with roughly 600 bookings every six months. Impact is judged on three things: whether a customer or the salon is misled, whether money or data can be lost, and whether the change removes a recurring cost rather than adding a control.

1. **Confirm and establish database backups (C1).** Everything else is recoverable. This is the only failure mode that is not, and confirming it costs minutes.
2. **One settings authority (C2 + I9 + A2).** This is the root of the product's biggest honesty problem: controls that save and promise and change nothing. Fixing the gate's read, enforcing the two missing switches, deleting eleven dead keys and adding the consumer ratchet turns Settings from a liability into something staff can trust, and it unblocks four other findings.
3. **"Uncertain never shows success" (H1 + C3 step one + A7).** One contract applied at six sites: `null` from a hook or "accepted" from a provider means uncertain, and uncertain never toasts green or writes `sent`. It aligns the UI with the rule AGENTS.md already states for notifications and removes the only "green toast, red reality" paths in daily use.
4. **Tell customers before, not after (H2 + H3).** The enforcing RPC already exists; calling it on the card removes the single most frustrating dead end in the portal, and honest denial codes stop customers being nudged to retry a slot that will fail again while keeping report 2F truthful.
5. **Payment-regression guard (C4).** The one silent data-loss path two tills can hit on an ordinary Monday, fixed proportionately with a trigger and status-only patches rather than a full optimistic-concurrency scheme.
6. **Delete roughly 5,000 lines of no-op UI and settle on Today + Diary (R1, R2, R5, R6, R8, R13 + U18).** No new behaviour, lower cognitive load for staff, smaller bundles, honest coverage numbers, and far less for the next contributor to misread as live.
7. **Archive, erase and retention as one policy (H5 + A8).** Fixes a live bug (the FK refusal), a silent data-destruction path (dog delete), a legal gap (promised retention nothing enforces) and an operational one (no erasure procedure) in a single decision and one RPC.
8. **Customer messaging truth (H4 + C3 step two).** Opt-out enforced at the one send boundary, and cancellation notices moved onto the reconcilable Meta path with fallback, so the salon can stand behind every message it says it sent.
9. **One source for public facts (H6 + H9).** The website quotes one price and the app charges another; AI crawlers are handed the wrong phone number; the README misdescribes routing and lifecycle. A generator and a 30-minute README rewrite fix the first impression every customer and every contributor gets.
10. **The recovery kit (H7 + H8 + A1 + U22).** Rollback page, pinned CLI, Sentry release and maps, a daily health line, a service worker that waits and a persisted drawer draft. Each is under a day. Together they are the difference between a bad Monday and a bad week, in a system whose every celebrated control is about prevention.

**Why these ten outrank the rest.** Each either removes a way the product lies to someone (2, 3, 4, 8, 9), removes a way it loses something irreplaceable (1, 5, 7), or removes recurring cost rather than adding machinery (6, 10). Items that did not make the cut are either smaller in reach (groom notes on the card is the best single quick win but touches one line), gated on an owner decision whose answer could be "no" (reschedule message, walk-ins, substrate horizon), or add surface for a rare event (Team invite function, Twilio status callback, receipt table for the booking RPC).

---

## 15. WHAT IS ALREADY DONE WELL (and should not be touched)

- **The write boundary.** No customer INSERT on `bookings`; one SECURITY DEFINER RPC taking authoritative size from `dogs.size`; three table-level BEFORE INSERT gates with stable `DETAIL` reason codes that every new route inherits; advisory locks; verified receipts; fingerprint-idempotent reschedule. Two devices racing for one slot is handled correctly.
- **Security hygiene.** RLS on all 64 public tables, no anon row policies, 233 SECURITY DEFINER functions all with `search_path` pinned, `security_invoker` views, a private schema for receipts, Edge auth classified by a machine-checked manifest, const-time secret comparison that refuses empty secrets, raw-body HMAC on the webhook with 200-and-not-processed on bad signatures, Vault for secrets.
- **The AI cannot act unilaterally.** Seven gates on sends, button-tap-gated bookings validated by `caller_conversation_id`, booking intents never auto-sendable (test-locked), truncated output refused, kill switch still yields a staff-visible draft.
- **Notification idempotency for the Meta path.** Claim-before-send on a partial unique index, a pending reaper, SMS fallback, and the 12 October reconciliation closing the Meta "failed" race in both orders.
- **Slack privacy enforced by types.** A five-field `BookingSubject` makes a customer-name leak a compile error; a test asserts the rendered output.
- **The Today day stack.** One write path, awaited saves, rollback with Retry, Undo on reversible moves, collection + payment as one write, status as a word, 44px targets, `inert` drawers, reduced motion, guarded by `e2e/day-stack.spec.ts`.
- **Partial-day closures.** Closure record and seat blocks in one payload; enforcement reused; column-scoped writes so two devices commute.
- **Release discipline.** Approval-gated production migration workflow that verifies environment reviewers and records applied SQL; a required `migrations-applied` check that compares content; daily ledger and advisor drift jobs; a full-history migration replay that boots and passes 1,391 pgTAP assertions in 12 seconds; the combined build's self-checks; the PR e2e gate design.
- **Engineering ratchets that bite.** `appShell.test.ts`, the debt-size ratchet, coverage thresholds, `nodeRuntimeConsistency`, `offlineTestGuard` with `VITE_FORCE_OFFLINE` on every Vitest project, the capacity parity harness reading one governed fixture list across browser, Deno and pgTAP.
- **Code hygiene.** Four TODOs and 24 justified `eslint-disable`s in ~100k lines; 0 empty catch blocks; 135 `logger.error` sites forwarding to Sentry with pattern and schema-aware PII redaction; every `<img>` has `alt`; 18 modals on one accessible primitive.
- **Dog-size truth.** Staff-only `dogs.size`, customer `reported_size`, automatic "Confirm size" to-do so the customer no longer has to chase.
- **Text + CHECK instead of enums.** It is what made the September status rename possible in one pass. Keep it.

---

## 16. LIMITS OF THIS AUDIT

- No access to the hosted Supabase project, Vercel or Meta: live settings JSON, template statuses, plan tier, grants and backup state are unverified. Findings marked UNVERIFIABLE or HYPOTHESIS say so.
- The customer portal beyond the login page could not be walked live: offline sample mode has no customer sign-in, and the e2e suite has none either (which is itself a finding, L3). Customer findings come from code tracing.
- The database replay used the local Supabase image; its default grants may differ from production (T9).
- The walkthrough's harness is a lightweight accessibility check, not axe; counts of small targets and unnamed controls are indicative.
- Priorities assume the owner's stated context: one salon, two staff, Mon–Wed, roughly 600 bookings per six months. A second salon or a third groomer would move several Medium items up.

Supporting reports: [`01-customer-portal`](2026-10-12-end-to-end-audit/01-customer-portal.md), [`02-staff-operations`](2026-10-12-end-to-end-audit/02-staff-operations.md), [`03-staff-inbox-directories-reports`](2026-10-12-end-to-end-audit/03-staff-inbox-directories-reports.md), [`04-database-supabase`](2026-10-12-end-to-end-audit/04-database-supabase.md), [`05-edge-functions-integrations`](2026-10-12-end-to-end-audit/05-edge-functions-integrations.md), [`06-frontend-architecture-ci`](2026-10-12-end-to-end-audit/06-frontend-architecture-ci.md), [`07-website-docs-operations`](2026-10-12-end-to-end-audit/07-website-docs-operations.md), [`08-live-walkthrough`](2026-10-12-end-to-end-audit/08-live-walkthrough.md), [`09-challenge`](2026-10-12-end-to-end-audit/09-challenge.md). The 628 walkthrough screenshots were not committed.
