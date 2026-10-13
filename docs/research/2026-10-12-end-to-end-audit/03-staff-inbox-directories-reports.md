# Audit 03 — Staff side beyond the diary: Inbox, directories, reports, settings, reminders, admin

Repository: `/home/user/Smarter-dog-bookings` at `850cad7` (12 Oct 2026). Read-only review: code, migrations, Edge Functions and docs (`CLAUDE.md`, `docs/whatsapp-agent.md`, `docs/whatsapp-flows.md`, `docs/staff-web-push.md`, `docs/slack-alerts.md`, `docs/interface-capability-truth.md`, `ROADMAP.md`). No servers started, nothing edited.

Journeys traced UI → hook → repository/RPC → Edge Function → Postgres: inbound WhatsApp from a known and an unknown number, AI draft approve/edit/reject, booking proposal apply, cancel request, failed delivery + resend, broadcast, directory search, merge, dog notes → `/today`, trusted/blocked/deceased, cash-up and insights, every Settings tab, roles, device push, calendar feed.

Legend: **CONFIRMED** = read in code/SQL; **HYPOTHESIS** = inferred, not executed against data.

---

## Findings

### 1. Settings that save but drive nothing: Notifications tab, weekly Hours, "Auto-confirm", legacy portal keys
**What I found.** Four groups of controls persist into `salon_config.settings` but no runtime path reads them.
- **Notifications tab** (`src/components/views/settings/NotificationSettings.jsx:12-17`): four rows × three channel chips. No Edge Function or migration reads `settings->'notifications'` (grep over `supabase/functions` and `supabase/migrations`: zero hits). `notify-booking-confirmed/reminder/ready` decide channels from `humans.whatsapp/sms/email` + opt-outs (`_shared/recipients.ts:24-30`). The row "Follow-up / review request — sent 24 hours after the appointment" describes a function that does not exist (no `notify-follow-up`).
- **Hours & Closures weekly grid** (`HoursSettings.jsx`): defaults to `DEFAULT_BUSINESS_HOURS` Mon–Sat 08:00–17:00 (`src/constants/salonSettings.ts:15-23`) for a Mon–Wed salon. Its only consumer is the public `get_public_salon_facts()` RPC → marketing site (`website/src/hooks/useSalonFacts.js:17-20`). The booking constraint is `day_settings` + `validate_booking_calendar()`. The tab's "closures" list is a *fourth* closure mechanism beside Holidays (`holiday_closures`), per-date `day_settings.is_open`, and partial-day `day_settings.closures`, and it is not enforced anywhere.
- **"Auto-confirm bookings — when off, new bookings need manual approval"** (`BookingRulesSettings.jsx:~484`): `autoConfirm` has no consumer outside settings/types/transforms. There is no manual-approval state for bookings.
- **Legacy `customerPortal` keys** `showUpcoming`/`allowRebooking` in `salonSettings.ts:25-30` duplicate the server-owned `booking_policy_settings.customerPortal` (`allowCancellations/allowRescheduling/allowRepeatBooking/showHistory`) that *is* enforced.

**Why it matters.** A2's exit criterion was "interface truth". An owner who turns off "Day-before reminder" will believe reminders stopped; they did not. CLAUDE.md already warns about `DEFAULT_BUSINESS_HOURS`, which means the trap is known and still live in the UI.
**What happens today.** Toggle saves, "Saved" indicator shows, behaviour unchanged.
**Recommendation.** Either wire them or remove them. Cheapest truthful fix: make Notifications a read-only "what is sent and when" card (the real rules), delete the Follow-up row, delete the weekly-hours grid (keep closures only if the website needs them, and say "website only"), remove Auto-confirm and the legacy portal keys from `createDefaultSalonSettings`. A ratchet test asserting every settings key has a non-settings consumer would stop regrowth.
**Benefit.** Removes the most misleading surface an owner touches. **Difficulty** Small–Medium. **Risk** Low. **Priority** High. **CONFIRMED.**

### 2. Owner vs staff: the distinction exists in RLS, but there is no administrator experience
**What I found.** Roles are `owner`/`staff` (`src/supabase/hooks/useAuth.ts:17,270`). Owner-only: editing Settings (`StaffRoutes.jsx:244` `canEdit={isOwner || !isOnline}`), `salon_config` writes (RLS `owner_*_salon_config`), promoting/demoting (`20260330095239_restrict_role_escalation.sql`), the Booking Desk flag. Everything else — bookings, customers, Inbox, AI toggles per conversation, broadcast, resend, merge, delete-permanently — is open to any staff member. There is **no UI** to list staff, invite/create a staff account, change a role, or deactivate someone: `INSERT` on `staff_profiles` is revoked from `authenticated` (`20260330095135_auth_staff_profiles.sql:29`, re-asserted `20260506220411`), and the only promotion tool is `scripts/seed-first-owner.mjs` (service-role key). Account Settings doesn't even show the signed-in user's role.
**Why it matters.** Onboarding a new groomer or removing a leaver requires Supabase dashboard access and the service-role key — the exact thing CLAUDE.md says to use "transiently, then delete". The one real risk difference between roles (permanent deletes, merges, per-conversation "AI auto" with autonomous booking) is not gated.
**Recommendation.** (a) Show role in Account Settings. (b) Owner-only "Team" card: list `staff_profiles`, change role via the existing RLS path, deactivate (needs an `is_active` column honoured by `is_staff()`), invite via a SECURITY DEFINER RPC that calls `auth.admin` from an Edge Function. (c) Gate "Delete permanently" and `merge_humans` to owner, or add a confirm-with-reason.
**Benefit.** Removes a service-role dependency from routine operations. **Difficulty** Medium. **Risk** Medium (auth surface). **Priority** High. **CONFIRMED.**

### 3. Dog grooming notes never reach the `/today` card
**What I found.** `dogs.groom_notes` is edited on the dog card, appended by Inbox "Update notes" (`whatsapp-update-notes/index.ts`), shown in the Inbox `DogSummaryCard.jsx:26,67`, and fed into the AI prompt. But the `/today` stack card's welfare resolver is `{ alerts, pregnant, notes: booking.notes }` (`src/components/views/TodayView.jsx:171-174`) and `StackCard.jsx:98-101,353` renders only alerts, pregnancy and the *booking's* note. The dog's durable grooming instructions ("shorter on the ears, hates dryer") are one modal away at the exact moment the groomer needs them.
**Recommendation.** Add `groomNotes: dog?.groomNotes` to `getWelfare` and render it in the expanded card body under the booking note, labelled "Usual groom". Pure UI; no engine or status change.
**Benefit.** The Update-notes AI feature finally pays off at the table. **Difficulty** Small. **Risk** Low. **Priority** High. **CONFIRMED.**

### 4. Unmatched number: the Inbox tells staff to "add a quick profile" but offers no way to link the thread
**What I found.** `CustomerContextPanel.jsx` `UnmatchedEmptyState` says "Adding a quick profile means the AI can personalise replies", but there is no "Create customer" or "Link to existing customer" action, and no hook writes `whatsapp_conversations.human_id` (grep: only `useOutboundSender` passes `human_id` on a *new outbound* template send). Linking happens server-side only when the next inbound arrives and `findHumanIdByPhone` (`whatsapp-agent/handler.ts:475-486`) matches `humans.phone` in one of three string formats.
**What happens today.** Staff open Humans, create the record with the number, come back — the thread still says "Unmatched contact" until the customer messages again. If the stored phone format differs from the three candidates, it never links. HYPOTHESIS on the format edge; the missing action is CONFIRMED.
**Recommendation.** Add to the unmatched state: "Link to customer" (search → `update whatsapp_conversations set human_id`), and "Create customer" prefilled with the E.164 number via the existing `AddHumanModal`. Staff already have UPDATE rights on the row (the AI-mode toggles use them).
**Difficulty** Small–Medium. **Risk** Low. **Priority** High.

### 5. Inbox booking: correctly disabled per A2, but the dead rail is still in the tree
**What I found.** `BookingActionsPane.jsx:54-62` renders a disabled "Book from Inbox (not available)"; `CustomerContextPanel.jsx:~190` repeats "Booking from Inbox is not available yet" as a second notice in the same column; `docs/interface-capability-truth.md:22` records the decision. Meanwhile `BookAppointmentModal.jsx`, `useStaffBooking.ts` and the `create_staff_booking_from_conversation` RPC (`20260614140000`) have **no callers** (grep). `apply_whatsapp_booking_action` supports only `action = 'create'` (`20260427151411:38`).
**Why it matters.** Two separate "not available" messages read as an apology twice; the dead modal/hook is the most likely thing a future contributor re-wires by accident — exactly the A2 risk "turning a copy change into feature activation".
**Recommendation.** Delete `BookAppointmentModal.jsx` + `useStaffBooking.ts` (keep the RPC, it is the audited server path), and keep one disabled control with one sentence. Leave the AI-proposal "Add to diary" path as the only Inbox→diary write.
**Difficulty** Small. **Risk** Low. **Priority** Medium. **CONFIRMED.**

### 6. A cancel/reschedule request in the Inbox cannot see the booking it is about
**What I found.** `useCustomerContext.js` fetches "the single most-recent **past** booking" (`LastBookingChip`); upcoming bookings are not in the context panel. `BookingCreatedCard` appears only for bookings the agent created. `booking_cancel`/`booking_change` intents produce a medium-risk draft only; the apply RPC rejects non-create actions. So for "Can I move Bella from Tuesday?", staff must open the diary and find Tuesday themselves. The Booking pane does show the diary by date, but staff have to know the date.
**Recommendation.** Add "Upcoming" chips (next 1–3 bookings per dog, deep-linking via `useBookingDeepLink`) to the context panel. Reuse the agent's own context query (`agentContext.ts` already lists upcoming appointments with `booking_horizon_days`).
**Benefit.** Removes the most common context switch in the Inbox. **Difficulty** Small. **Risk** Low. **Priority** High. **CONFIRMED** (data gap), HYPOTHESIS on frequency.

### 7. Two sources of truth for WhatsApp template approval
**What I found.** The picker reads hand-maintained `status: "approved"` strings in `src/constants/whatsappTemplates.js` (header comment dated 2026-05-20, with "PENDING" notes later hand-edited to "verified 2026-06-15"). The broadcast gate reads live Meta status from `whatsapp_templates`, kept current by the webhook (`whatsapp-webhook/index.ts` `applyTemplateStatusUpdates`) and by `whatsapp-admin` `sync_templates`, which **nothing in `src/` calls**. A template Meta pauses or rejects stays "approved" in the picker and sends fail with a 132xxx gateway error at the worst moment (outside the 24h window).
**Recommendation.** Keep the param/preview metadata in the constants file (it is wording that must match Meta) but read `status` from `whatsapp_templates` and hide/flag non-approved entries in `TemplatePicker`. Surface `sync_templates` as an owner button in the AI Messaging tab.
**Difficulty** Small–Medium. **Risk** Low. **Priority** Medium. **CONFIRMED.**

### 8. Failed broadcast rows cannot be resent and show a raw code
**What I found.** `broadcast-message` logs `trigger_type: 'day_closure'`. `useDeliveryFailures.ts` `TRIGGER_LABEL` has `confirmed|reminder|ready|cancelled` only, so a failed broadcast appears in the Delivery issues card as "day_closure failed". `resend-booking-notification/index.ts:25-30` `TARGET` has no `day_closure`, so Resend returns 400 "valid trigger_type required". The correct retry is re-running the broadcast (the idempotency index `idx_notification_log_idempotent … where status in ('pending','sent')` excludes failed rows, so a rerun does retry them) — but nothing tells staff that.
**Recommendation.** Add `day_closure: "Day message"` to `TRIGGER_LABEL`, and in `DeliveryFailureCard` route `day_closure` to "Re-run the day message" (open `BroadcastMessageModal` with the date) instead of the resend button.
**Difficulty** Small. **Risk** Low. **Priority** Medium. **CONFIRMED.**

### 9. Resend success copy over-claims
**What I found.** `DeliveryFailureCard.jsx:104`: "Resent. It'll clear here once it's confirmed delivered." It actually clears when a newer `'sent'` row supersedes the failure (`liveFailuresByBooking`), i.e. on provider *acceptance*; if Meta later fails it again, the new reconciliation triggers (`20261012120000`) re-red it. AGENTS.md's rule is that sent ≠ delivered. Also, if the fix was the phone number, a resend to a number that is simply not on WhatsApp will fail again in ~a minute and the `unreachableHumanIds` logic (3 strikes) only changes the Today card copy, not this card.
**Recommendation.** "Resent — the warning clears once the provider accepts it; if it fails again, try SMS." Offer the SMS channel directly here (reminder-send supports `channel: 'sms'`).
**Difficulty** Small. **Risk** Low. **Priority** Low. **CONFIRMED.**

### 10. Capacity KPI in Insights hardcodes "14/day" and the constant, not `salon_config.daily_dog_cap`
**What I found.** `ReportsInsightsView.jsx:185` literal "of the 14/day limit"; `computeFillRate` uses `DAY_CAPACITY = DAILY_DOG_CAP` (`utilisation.ts:15`). The Inbox and Slack read the authoritative `salon_config.daily_dog_cap` (`InboxWorkspaceController.jsx:84`). CLAUDE.md says "don't add a fourth copy"; this is a fourth copy in prose.
**Recommendation.** Pass `salonConfig.dailyDogCap` into `useReportsData` and interpolate it.
**Difficulty** Small. **Risk** Low. **Priority** Low. **CONFIRMED.**

### 11. Insights page: fourteen panels, few decisions
**What I found.** `ReportsInsightsView.jsx` mounts Revenue trend, Service mix, Demand pattern, Customer ranking, Booking health, Slot fill, Service value, Outcomes, Source mix, Retention, Capacity prevented, Funnel, Collected by method, plus KPIs and Key insights. Cash-up is honest and decision-shaped (expected vs still-to-collect, £0 "check price" badge). The six decision reports (2A–2F) in `docs/today-command-centre.md` are the ones with a named action; the rest are descriptive. Low-N gating (`LOW_N_THRESHOLD = 5`) is good.
**Recommendation.** Promote the six decision reports to the top with their "so what" line, collapse the descriptive set under "More detail" by default on all widths (today only below `md`). Consider deleting Customer ranking (PII-dense, no action) and Source mix if nobody has acted on them.
**Difficulty** Small. **Risk** Low. **Priority** Medium. **HYPOTHESIS** (value judgement; structure CONFIRMED).

### 12. Four AI kill switches, one documented
**What I found.** (1) env `AI_ASSISTANT_ENABLED` (stops Claude calls); (2) env `AI_AUTO_SEND_LOW_RISK`; (3) DB `ai_whatsapp_settings.enabled` via Settings → AI Messaging, enforced in `whatsapp-send` by `decideAiMessagingSend` (`_shared/aiMessagingGate.ts`); (4) per-conversation `state`/`auto_send_enabled`/`autonomous_booking_enabled`. `docs/whatsapp-agent.md` documents (1), (2), (4) and never mentions `ai_whatsapp_settings` (grep: 0 hits in docs). The Settings copy calls (3) "the master safety switch", which is true for sends but not for drafting cost.
**Recommendation.** One table in `whatsapp-agent.md` listing all four, what each stops, and who can flip it; make the Settings card state "stops AI *sends*; the AI still drafts for staff review".
**Difficulty** Small. **Risk** Low. **Priority** Medium. **CONFIRMED.**

### 13. No global "do not book" for a customer; no "deceased" for a dog
**What I found.** Customer controls on the human card: `historyFlag` (warning text), `blockedSlots` (per-slot, DB-enforced for non-staff), `depositRequired`, archive. There is no account-level block; a customer the salon has parted with can still book via portal/WhatsApp unless staff tick all ten slots. Dogs have Archive (reversible, hides from directory) and Delete permanently; no reason. The AI context and reminders use `dogs` rows — HYPOTHESIS: an archived-but-not-deleted dog may still be listed to the customer in the WhatsApp flow's `SELECT_PET` if the query does not filter `archived_at`.
**Recommendation.** `humans.booking_blocked boolean` + a gate reason code `account_blocked` (the `DENIAL_REASON_GROUP` "account restriction" bucket already exists in `denials.ts`), surfaced on the human card beside Deposit required. For dogs, an `archive_reason` enum (`deceased|rehomed|moved|other`) so the AI prompt and reminder copy can avoid "how is Bella?". Verify the flow's pet query excludes archived dogs.
**Difficulty** Medium (gate change = high-risk area; explain before changing). **Risk** Medium. **Priority** Medium.

### 14. Phone search does not normalise the query
**What I found.** All phone search paths are `ilike '%term%'` on the stored string: `search_humans_directory` (`20260721134152:41`), `search_dogs_directory` (`20260608150000:73`), `useHumanLookups.searchHumansByTerm` (`useHumanLookups.ts:156-158`). Stored numbers are normalised on write (`normaliseUkMobile`) but a staff member typing "07700 900" or "0770090" against a stored `+447700900123` gets nothing.
**Recommendation.** In the RPCs, also compare `regexp_replace(h.phone,'\D','','g') ilike '%' || regexp_replace(term,'\D','','g') || '%'` when the term contains ≥4 digits; mirror in the client fallback.
**Difficulty** Small. **Risk** Low. **Priority** Medium. **HYPOTHESIS** (depends on stored format; code path CONFIRMED).

### 15. Directory filtering exists twice
**What I found.** Humans and Dogs each have a server RPC (`search_*_directory`, with letters/filters/pagination) and a client fallback (`src/utils/directorySearch.ts`) used when `directoryHumans === null` (offline/sample mode). Both must agree on which fields match; they already differ (client checks owner phone through dogs; RPC checks email, client does not). Two directory views (`HumansView.jsx` 600+ lines, `DogsView.jsx` 664 lines) also duplicate `AlphabetRail`, `UnarchiveButton`, view-mode persistence.
**Recommendation.** Extract `AlphabetRail`/`UnarchiveButton`/view-mode into `views/directory/`; make the client filter explicitly "sample mode only" and test parity against the RPC fixtures.
**Difficulty** Small. **Risk** Low. **Priority** Low. **CONFIRMED.**

### 16. Staff calendar feed: a bearer URL with every customer name, revocable only by its owner
**What I found.** `calendar-feed/handler.ts` staff feed includes `humanName` in every event; auth is an opaque token in the URL (`_shared/calendar-auth.ts`), one per staff user (`get_or_create_calendar_feed_token`), 90-day lookahead. RLS lets a staff member manage only their own token. Nothing revokes it when a staff member stops being staff unless the `auth.users` row is deleted (cascade). An owner cannot see who has a live feed.
**Recommendation.** Owner-visible list of active staff tokens with revoke; auto-deactivate on role removal (ties to finding 2). Consider dropping owner names from the staff feed (dog + slot + service identify the appointment; CLAUDE.md's Slack rule shows the salon already accepts that trade-off).
**Difficulty** Small–Medium. **Risk** Low. **Priority** Medium. **CONFIRMED.**

### 17. Settings has eleven tabs with two save models and two read-only "documentation" tabs
**What I found.** `SettingsView.jsx` SECTIONS: Business, Hours, Holidays, Account, Pricing, Rules, Capacity, Portal, Notifications, AI Messaging, Calendar. Business/Hours/Account use a Save button + dirty guard; Rules/Portal/Notifications autosave on change; Holidays has its own draft model. Capacity Engine and Services & Pricing are read-only explainers ("ask the owner and allow half a working day"). Booking Rules shows a "Current booking setup" legacy block (`BookingRulesSettings.jsx:320-360`) *and* the new server policy block when the runtime is not yet active — two deposit bank forms on one screen.
**Recommendation.** After finding 1, merge into ~6 tabs: Business (incl. hours-for-website), Opening (Holidays + closures pointer), Booking policy (one block once the runtime is active), Messaging (AI + Notifications-as-facts + templates sync), Your account (incl. push, calendar feed, role), About the engine (Capacity + Pricing read-only). Pick one save model.
**Difficulty** Medium. **Risk** Low. **Priority** Low. **CONFIRMED.**

### 18. Inbox typography and target sizes on mobile
**What I found.** Inbox panels use `text-[10px]`/`text-[11px]` for labels, metadata and the "Why held" explainer (`DraftPanel.jsx`, `BookingActionPanel.jsx`, `CustomerContextPanel.jsx` action labels 10px). Thread header buttons are `h-8` (32px); `CalendarSettings.jsx` buttons are ~30px with no `type="button"` and a `document.execCommand('copy')` fallback. Elsewhere the app is disciplined (`min-h-11` in directories, 44px targets in Reports).
**Recommendation.** Raise metadata to 12px, chips/buttons to `min-h-11` on touch, add `type="button"`.
**Difficulty** Small. **Risk** Low. **Priority** Low. **CONFIRMED.**

### 19. Unknown-sender onboarding and signup approval are two queues in two places
**What I found.** Unknown WhatsApp numbers are onboarded by the agent into `lead_status/lead_payload` and surface as Inbox conversations; "Join the Pack" self-signups surface under Humans → "New customers" (`SignupApprovalQueue.tsx`) with size confirmation and welcome send. Both are "a new person wants in" and both need the same staff decision (approve, size the dogs), but a staff member has to check two screens. The dashboard `WorkflowStatusStrip` may count them separately (not verified).
**Recommendation.** One "New customers" queue fed by both sources, with the signup review drawer reused for AI-onboarded leads.
**Difficulty** Medium. **Risk** Low. **Priority** Low. **HYPOTHESIS** on operational pain; code split CONFIRMED.

### 20. `whatsapp_events` keeps every retry and invalid-signature payload forever
**What I found.** The webhook writes a row per POST, including duplicates Meta re-sends after a 5xx and invalid-signature attempts (`whatsapp-webhook/index.ts`); dedupe happens downstream at `whatsapp_messages` (`direction, meta_message_id` unique). No retention job exists for `whatsapp_events` (the Slack ledger has 90-day retention; `notification_log` has a reaper). Payloads contain phone numbers and message text.
**Recommendation.** pg_cron retention (e.g. 90 days for `processed`, 30 for `failed/ignored`), mirroring `slack_alerts`.
**Difficulty** Small. **Risk** Low. **Priority** Low. **CONFIRMED** (no retention), HYPOTHESIS (growth rate).

---

## What is already done well

- **Slack PII rule holds.** Trigger forwards dog facts only and withholds `customer_name` (`20260916090000:81-84`); the function's `BOOKING_SELECT` is `id, slot, size, status, booking_date, ready_at, dog_name_snapshot, breed_snapshot, dogs(name, breed)`; `slackMessage.ts` takes a five-field `BookingSubject` so a name is a type error; tests assert output. **CONFIRMED.**
- **Duplicate webhooks are harmless.** Events are stored raw; the inbound insert is unique on `(direction, meta_message_id)` and the agent treats 23505 as "Meta redelivered" (`handler.ts:623-629`); status updates are idempotent patches.
- **Delivery-failure handling is the right design.** `notification_log` is reconciled with Meta's verdict both in app code and, since #980, by DB triggers in either order with backfill; the dashboard applies supersession per `(booking, trigger, recipient)`, an unreachable-number heuristic (3 undeliverables), dismissals that re-surface on a new failure, and realtime refresh. Reminders have a nightly pass, a late pass, a staff manual path (`reminder-send`) and an hourly SMS safety net, all claiming idempotency via the same partial unique index.
- **Broadcast is cautious by construction.** Dry-run first, 1:1 templated sends, kill switch independent of the AI gates, approval-gated template, one claim per recipient per day, stuck-pending reaper, opted-out customers listed back rather than dropped.
- **Draft/booking separation.** The "Approve & Apply" combined action was removed; the Draft panel withholds send controls while a proposal is attached, so diary and message cannot disagree.
- **Merge duplicates exists** and is server-side (`merge_humans` SECURITY DEFINER, staff-only, reassigns dogs/bookings/trusted/waitlist), with a side-by-side compare and confirm.
- **Server-side directory search** with letters, filters and pagination, and dog-name search for humans; the Compose-new picker searches humans *and* dogs; the Inbox searches full message history via RPC with debounce.
- **Staff web push** is additive, dark-launched, pure Web Crypto, per-device, with actor suppression and per-minute coalescing; the Settings UI explains every unavailable state (not standalone, denied, VAPID missing).
- **AI mode controls** are optimistic with rollback, default off at the column level, and the agent's auto-send allowlist is unit-test-locked.
- **Capacity Engine and Pricing tabs are honest read-only** cards rather than toggles that wrote columns nothing read (AUDIT-1 fix).
- **Staff booking policy** is server-owned with a confirmed/active runtime state, and the UI refuses to show a policy it has not confirmed.

## Top 5 for this area

1. **Finding 1 — remove or wire the display-only settings** (Notifications, weekly Hours, Auto-confirm, legacy portal keys). Highest truth-to-effort ratio; directly in A2's spirit.
2. **Finding 3 — show `dogs.groom_notes` on the `/today` card.** One resolver line; makes "Update notes" worth pressing.
3. **Finding 2 — a minimal Team card (role shown, list, promote/demote, deactivate) and owner-gating of permanent deletes/merges.** Ends routine service-role use.
4. **Finding 4 + 6 — Inbox context: link/create customer for unmatched numbers, and show upcoming bookings** so cancel/move requests can be actioned without leaving the thread.
5. **Finding 7 + 8 — one source of truth for template approval (DB status in the picker, `sync_templates` button) and make failed broadcasts labelled and re-runnable.**
