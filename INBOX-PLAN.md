# Customer-Comms Cockpit — Audit & Plan

**Author:** Claude (planning pass — no code touched)
**Date:** 2026-05-12
**Status:** Awaiting human review before Phase 2 starts
**Branch suggestion:** `feat/inbox-cockpit` (don't create yet — confirm Q1 first)

> **Status note (June 2026):** Phase 2 has largely shipped — `/inbox` route live with `/whatsapp` redirecting to it, the view split under `src/components/views/inbox/` (thread/, conversation-list/, customer-context/, hooks/), and Bug F1 fixed by migration `20260513000000_whatsapp_booking_actions_realtime.sql`. One deviation: `LiveAnnouncer` was never mounted — it was deleted as dead code instead (`d3eaa48`). Phase 3 has also substantially shipped (CustomerContextPanel + DogSummaryCard + LastBookingChip + TrustedHumansChips, `useCustomerContext`, `useSlotCapacityPreview`, `thread/BookingCapacityPreview.jsx`). Phase 4 is partial (Mark complete/Reopen via `useConversationLifecycle` shipped; search, summary, suggested actions, quick replies, snooze and the global kill switch are not built). Phase 5 (analytics) has not started. Phases 4–5 remain open pending product sign-off.

---

## TL;DR

Six things up front, so you can decide quickly whether to keep reading.

1. **The existing `/whatsapp` page isn't an older iteration — it's a mature, ~1,500-line cockpit foundation.** The brief implied a from-scratch rebuild. That would be a regression. I want to *extend* it, not replace it. Flag if you disagree.
2. **Most of Groups A, B and C are already partially done.** Filter chips, draft approve/edit/reject with reason capture, inline-edit on booking proposals, per-conversation auto-send toggle, autonomous-booking toggle, lead-status badge, deep-linking, realtime, optimistic UI — all live. The real gaps are: customer context panel, conversation summary, capacity preview on bookings, suggested next actions, search, analytics, and `/inbox` route.
3. **The agent's draft contract doesn't include a narrative `reasoning` field or a structured `suggested_actions` list.** The brief assumed it does. I list options under Q2 / Q3 — most can be synthesised in the cockpit without changing the agent.
4. **The global kill switch (`AI_ASSISTANT_ENABLED`) is an Edge Function secret, not a DB row.** The browser can't read it. We either add a DB-backed kill switch the agent honours, or settle for write-only ("Pause AI" button that flips a DB flag). Flagged under Q4.
5. **Inbound SMS isn't in scope and shouldn't be.** Twilio is outbound-only (booking reminders). I'd not leave hooks for inbound SMS in the data model now — adding them later is cheap. Flagged under Q5.
6. **Recommendation:** Use the staging Supabase project (cheap, realistic, already implied by your migration history). Don't put time into expanding offline-mode for the inbox — it's a salon-floor tool and offline-mode is a different problem. Flagged under Q1.

If you nod to those six, I'll start on Phase 2 (the smallest end-to-end slice).

---

## 1. What I actually found in the codebase

### 1.1 Stack (confirmed)

- **Frontend:** React 19.2 + Vite 7 + Tailwind v4 (`@tailwindcss/vite`) + react-router-dom 7 + react-aria for modals
- **Backend:** Supabase (Postgres + Auth + RLS + Edge Functions on Deno + Realtime)
- **Tests:** Vitest (`npm run test`). Playwright is installed but mostly for the playwright-mcp tooling, not active suite tests.
- **Typecheck:** `npm run typecheck` (two passes: app and node tests)
- **Lint:** `npm run lint` (eslint flat config)
- **Brand tokens:** Tailwind theme in `src/index.css`. Dashboard surface uses the **slate** palette + `brand-purple`/`brand-yellow`/`brand-coral` accents — **not** the website's cyan/coral/teal sections. (`DESIGN.md` Appendix B is the source of truth for dashboard styling.)

### 1.2 WhatsApp data model (six tables, one RPC, six edge functions)

| Table | What's there | Realtime? |
|---|---|---|
| `whatsapp_conversations` | One row per phone. `state` (ai_handling / human_takeover / snoozed / closed), `auto_send_enabled`, `autonomous_booking_enabled`, `lead_status` (collecting / awaiting_summary_confirm / records_created), `lead_payload`, `agent_state` jsonb, `human_id`, `unread_count`, `last_inbound_at`, `last_outbound_at`, `last_customer_text`, `notes`, `snoozed_until` | ✅ in `supabase_realtime` publication |
| `whatsapp_messages` | Inbound + outbound, `direction`, `role`, `content`, `meta_message_id`, `status` (draft/queued/sent/delivered/read/failed), `sent_at`, `delivered_at`, `read_at` | ✅ |
| `whatsapp_drafts` | `proposed_text`, `intent`, `confidence`, `risk_level`, `handoff_required`, `auto_send_eligible`, `state` (pending/approved/rejected/auto_sent/sent_after_edit/superseded), `rejected_reason`, `decided_by`, `decided_at`, `model`, `tokens_input`, `tokens_output`, `tool_calls` jsonb, `edited_text` | ✅ |
| `whatsapp_booking_actions` | `action` (create/reschedule/cancel), `payload` jsonb, `state` (pending/approved/rejected/applied/failed/superseded **+ awaiting_customer_confirm/confirmed/auto_applied/rejected_by_customer** from migration `20260512140000`), `target_booking_id`, `applied_booking_id`, `customer_confirm_message_id`, `customer_confirm_expires_at` | ❌ Not in the realtime publication. The inbox hook subscribes anyway — works in dev but won't echo in prod. Flagged as **Bug F1** below. |
| `whatsapp_events` | Raw Meta webhook audit log, append-only | n/a |
| `whatsapp_templates` | Local mirror of Meta-approved templates | n/a |

**RPCs:**
- `apply_whatsapp_booking_action(p_action_id uuid) → uuid` — gated; staff only for `pending`, service-role only for `confirmed`. Inserts a `bookings` row, sets `bookings.source = 'whatsapp_ai'` (staff) or `'whatsapp_ai_auto'` (customer-confirmed). Capacity is enforced by the **existing** booking-insert trigger (migration `20260331083432_capacity_trigger`), so the RPC piggybacks on the 2-2-1 rule without re-implementing it.
- `mark_whatsapp_conversation_read(p_conversation_id uuid)` — clears unread counter; fire-and-forget.
- `link_customer_to_human(p_phone)` — already used for customer portal OTP; relevant when AI onboards a new customer.

**Edge functions (all `supabase/functions/`):**
- `whatsapp-webhook` — Meta verification + raw event ingestion (250 lines)
- `whatsapp-agent` — the brain (1,988 lines) — Claude call, draft + booking_action emission, risk classification via `_shared/agentRisk.ts`
- `whatsapp-send` — guarded outbound, three modes: `draft` (approve-and-send), `manual` (free-form reply), `template` (outside-window Meta template)
- `whatsapp-admin` — owner-only admin ops
- `whatsapp-register` — webhook verification handshake
- `apply-customer-confirm` — handles the `[Yes]/[No]` button reply from the customer in the autonomous flow

**Shared library (`_shared/agentRisk.ts`):** the single source of truth for intent → risk mapping, keyword-based escalation (medical, complaint, walk-in), the auto-send gate, the autonomous-booking gate, the agent-state shape, the brand-voiced fallback templates. **Heavily tested.** Don't fork this in the frontend — import it (it's pure TS, Deno + Node compatible).

### 1.3 Existing inbox UI — what it already does

`src/components/views/WhatsAppInboxView.jsx` (1,513 lines) + `src/supabase/hooks/useWhatsAppInbox.js` (741 lines).

Already implemented (don't rebuild):

- **Conversation list** with realtime, sorted by `last_inbound_at desc`, with unread badges, amber draft dot, emerald booking-action dot, rose "needs human review" dot, "🆕 New" pill for `lead_status=records_created`, human takeover state pill, time-since formatting.
- **Filter chips:** Unread / Drafts / Bookings / Needs review with live counts and pressed-state styling. Disabled when count is zero. Click-active chip to clear.
- **Detail pane:**
  - State pill in header (AI handling / Handled by staff / Snoozed / Closed)
  - Per-conversation **Auto-send toggle** (emerald)
  - Per-conversation **Autonomous booking toggle** (sky blue)
  - **Take over / Hand back to AI** button pair (flips `state` between `ai_handling` and `human_takeover`)
  - Message thread with WhatsApp-style bubbles, status sub-text, "(non-text message)" fallback
  - **Pending AI draft panel** with risk pill, intent, confidence, "Needs human review" pill, "Auto-send eligible" pill, model name. Five action modes: Approve / Approve & Apply (when booking attached) / Edit first / Send edit only / Reject — with optional reject-reason capture (stored on `whatsapp_drafts.rejected_reason`, capped at 500 chars).
  - **Booking action panel** with inline editable date / slot / service / size on each pending action. Apply via `apply_whatsapp_booking_action` RPC, reject with optional reason.
  - **Compose box** for free-form replies inside the 24h window, with `Enter` to send / `Shift+Enter` for newline, window-closes countdown.
  - **Template picker** when the 24h window has closed — selects Meta-approved templates from `WHATSAPP_TEMPLATES`, auto-fills customer first name and dog name where available, multi-dog dropdown, live preview.
- **Realtime subscriptions:** list-scoped on `whatsapp_conversations` + `whatsapp_drafts` + `whatsapp_booking_actions`; detail-scoped on `whatsapp_messages` + `whatsapp_drafts` + `whatsapp_booking_actions` filtered by `conversation_id`. Booking-actions table is NOT in the realtime publication (Bug F1).
- **Optimistic UI** for: marking conversation read, clearing pending-draft flag on approve/reject, removing applied action from local state, flipping the auto-send / autonomous-booking toggles.
- **Deep linking:** `?conversation=<id>` query param opens that thread on first load.
- **Two-approval UX coupling:** when a draft has an attached pending booking_action, the Approve button becomes Approve & Apply (sequential: RPC first, then send — if RPC fails, reply isn't sent; if send fails after RPC succeeds, booking is real and staff are told to reply manually). Spec: `docs/superpowers/specs/2026-04-28-two-approval-ux-coupling-design.md`.

### 1.4 What the inbox does NOT do today (the actual gaps)

Mapped against the brief's feature groups:

**Group A — Triage view**
- ❌ No search by name / dog / phone
- ❌ No "Last 24h" filter
- ❌ No "Booking-related" filter alias (we have "Bookings" which is *pending booking proposals*; the brief means "any conversation touching booking" which is a softer set)
- ❌ Dog name(s) not shown per row in the list (we'd need to join `dogs` via `human_id`)
- ⚠️ List sort is by `last_inbound_at` only — the brief wants "needs-attention first" (unread → draft pending → high-risk → awaiting customer → resolved). Doable; subset of fields already on each row.

**Group B — Conversation view**
- ❌ **No customer context panel.** This is the biggest single missing piece. Shows dog(s), last groom, allergies, behavioural notes, alerts, trusted contacts, links to full profile.
- ❌ **No conversation summary** at top of long threads.
- ⚠️ Soft sentiment cue — risk pill exists (low/medium/high) which is borderline "stamped label" territory. The brief says "subtle visual only, never a stamped label". I'd interpret this as "current is fine for staff-internal but consider colour-coding the row gutter instead of the pill text". Worth a small tweak in Phase 5 polish.
- ❌ **No booking action preview / calendar impact.** Today the panel shows the editable proposal; it doesn't show *what else is in that slot* or *will this fit the 2-2-1 rule*. The Postgres trigger would reject an invalid apply, but staff can't see ahead of time.
- ❌ **No suggested next actions** beneath the draft. We can derive some client-side ("Escalate" when risk=high; "Mark resolved" always; "Offer alternates" when intent=booking_propose) but "Offer 10:30 Wed" specifically requires the agent to suggest alternates, which it doesn't structure today.
- ⚠️ Quick-reply templates exist (`WHATSAPP_TEMPLATES`) but they're for **outside the 24h window**. Inside the window we have a free-form compose box only — no "snippet" picker for brand-voiced canned replies. New work.

**Group C — Auto-send controls**
- ✅ Per-conversation `auto_send_enabled` toggle — done.
- ⚠️ The "calm but unmissable summary" of which intents will auto-send is in the `title` tooltip on the toggle. Not unmissable. Could surface as a one-line caption under the toggle.
- ❌ Global kill switch UI — see Q4. The current state of `AI_ASSISTANT_ENABLED` lives in Edge Function secrets and is not readable from the browser.

**Group D — Analytics**
- ❌ Nothing exists. The data is there (`whatsapp_drafts.decided_at` - `created_at` for response time, `state` counts, etc.) but no view.

**Route**
- ❌ `/inbox` doesn't exist. `/whatsapp` exists. Redirect is trivial.

### 1.5 Brand & design tokens

- Dashboard styling uses **slate palette + warm-brand accents** (`brand-purple #2D004B`, `brand-yellow #FFCC00`, `brand-coral #E8567F`, `brand-paper #FAF9F6`). Inline classes use Tailwind utility strings, not BEM. Glass cards and full-bleed sections live on the public website only.
- Buttons are pill-shaped (`rounded-full`) with `font-bold` and `active-squish`. The existing inbox follows this.
- **Do not introduce a new design framework.** Reuse `AccessibleModal`, `ConfirmDialog`, `LoadingSpinner`, `ErrorBoundary`, `ErrorBanner`, `useToast` (via `ToastContext`).

### 1.6 Adjacent code that affects the cockpit

- **Capacity engine** — `src/engine/capacity.ts` exposes the 2-2-1 rule logic that the booking-action preview will need. There's a 492-line test suite (`capacity.test.js`) so importing it is cheap and safe.
- **Existing data hooks** — `useBookings`, `useDogs`, `useHumans` already handle pagination, search, optimistic updates. Customer context panel will likely use `fetchDogById` + a one-off query for "last groom" rather than a new hook.
- **Toast system** — `ToastContext.jsx` with `info/success/error` variants and undo. The cockpit should pipe its success/error feedback through this rather than inline-banners where possible.
- **Modal patterns** — `BookingDetailModal`, `DogCardModal`, `HumanCardModal` are the precedent for "card slides in with header gradient + body + action button". The customer context panel on mobile should slide in like these.
- **Skip-to-content + LiveAnnouncer** — `App.jsx` has a skip link but `LiveAnnouncerProvider` is built and **never mounted** (CODEBASE-AUDIT 4.1 / 7.2). New cockpit work should *not* re-invent this — mount it once and use it for "draft sent", "booking applied", "conversation reassigned" announcements.

### 1.7 Bugs found in passing (not in scope but worth flagging)

| ID | Where | What | Severity |
|---|---|---|---|
| F1 | `useWhatsAppInbox.js:198` + migration `20260427142614` | `whatsapp_booking_actions` is subscribed to but isn't in the `supabase_realtime` publication. In prod, the emerald "pending booking" dot won't appear without a hard refresh after the AI proposes a booking. | Medium |
| F2 | `src/components/views/WhatsAppInboxView.jsx:1287` | `h-[calc(100vh-180px)]` is a magic number that assumes a specific toolbar height. On a tall mobile viewport it leaves dead space below; on a short landscape phone it overflows. | Low |
| F3 | `useWhatsAppInbox.js:259` | When loading dog names for the template picker, we use `conversations.find(...).human_id` but the local closure can be stale (this isn't a ref). On rapid conversation switches, dog names can lag by one selection. | Low |
| F4 | `WhatsAppInboxView.jsx:1217` (`unreadCount` etc.) | Counts are computed across the *entire* list (200 rows max from `fetchConversationsList`). For salons that scale up this becomes a lie. Today fine; flag for later. | Low (informational) |

I'll spawn these as separate background tasks after the plan is approved — they don't belong in the cockpit slice.

---

## 2. Brief reality-check — places I think the brief was slightly off

Honesty, not pedantry. The brief told me to challenge it.

1. **"The existing `/whatsapp` page is from an older iteration and should be replaced."** Not so. It's actually quite advanced. Replacing it loses real work (draft approve/edit/reject with reason capture, inline-edit on booking proposals, both auto-send toggles, autonomous booking flow, lead-status, deep linking, realtime, optimistic UI). I'm going to refactor it into a `cockpit/` component tree and **extend**, not replace. The route becomes `/inbox`, the old `/whatsapp` redirects, and the file `WhatsAppInboxView.jsx` either gets renamed or becomes a thin re-export.

2. **"Drafts emit intent, risk, confidence, reasoning, proposed actions."** Drafts emit intent, risk, confidence, handoff-required, auto-send-eligible — but **not** a narrative `reasoning` field or a structured `suggested_actions` list. The agent stores `tool_calls` (jsonb log of what it queried) which is closer to a trace than a reasoning summary. Options under Q2.

3. **"Soft sentiment/urgency cue — subtle visual only, never a stamped label visible to the customer or implied in copy."** The current `RiskPill` shows "LOW RISK / MEDIUM RISK / HIGH RISK" as a literal stamped label. The customer never sees it — it's a staff-side UI element only — but if the spirit of the brief is "don't pigeonhole the customer with a stamp", I should swap the literal label for a coloured row gutter or a discreet dot. Worth a Phase 5 polish.

4. **"Global kill switch surfaced in settings, calling through to `AI_ASSISTANT_ENABLED`."** This env var lives in Supabase secrets and is **not** readable from the browser. We have three options under Q4. None is "read the env var".

5. **"Twilio SMS — wired in but outbound-only. Treat as a future inbound candidate but not in scope yet."** Confirmed correct. I'd specifically **not** put SMS channel markers on conversation rows yet. Reason: the only way an SMS event currently appears against a customer is as a booking reminder (`notification_log` entries), and that's not really a "conversation". Conflating the two creates a misleading channel marker. Better to leave it out and add a single-channel WhatsApp-only inbox now; if/when inbound SMS arrives later, design the merge then.

6. **"Resolved" state.** Not defined operationally. `whatsapp_conversations.state = 'closed'` is the closest thing today, but nothing in the UI sets or surfaces it. The brief asks where this lives — answer is "it doesn't, yet". Q-listed.

---

## 3. Open questions (answer these before Phase 2)

The brief asked me to surface five — I have those plus a few more.

| # | Question | Recommendation |
|---|---|---|
| Q1 | **Staging Supabase vs offline-mode sample data?** | **Staging.** Offline-mode is a hack for the booking grid to work on a dead Wi-Fi connection; the cockpit is realtime-first and needs an actual webhook to test the AI loop. Cost is trivial (free tier). I'd avoid investing in offline-mode for the inbox and put "no offline-mode" in a small banner on `/inbox` when `supabase` is null. |
| Q2 | **Does the agent emit reasoning per draft?** | **No.** Options: (a) **Cockpit-side synthesis** — show a one-liner derived from intent + confidence + risk + agent_state (e.g. "Booking change, high confidence; customer wants to move Tuesday's slot"). Quick, no agent change. (b) **Tool-calls disclosure** — surface the existing `tool_calls` jsonb in a collapsible "What the AI looked at" panel. Honest but raw. (c) **Add a `reasoning_summary` column** — small migration, small agent change. Best long-term. **I'd ship (a) + (b) in this cockpit pass and propose (c) as a separate, agent-side change** since the brief says "don't change AI agent behaviour in this pass". |
| Q3 | **Suggested next actions — agent-emitted or cockpit-derived?** | **Cockpit-derived for now.** I can derive 80% from existing fields: `risk=high` → "Escalate to phone"; `intent=booking_propose` + `confidence>0.7` → "Offer alternates from this week's availability"; `intent=escalate` → "Take over"; always-available → "Mark resolved", "Snooze 4h". Anything that needs the agent to surface "Offer 10:30 Wed" specifically would be a follow-up. |
| Q4 | **Global kill switch — read-and-write or write-only?** | **Write-only via DB + agent change.** Add `salon_config.ai_assistant_enabled boolean default true`. The agent reads it at the top of every invocation and short-circuits to the brand-voiced fallback if false. The cockpit's Settings → AI panel toggles this. Eliminates the secret-read problem and avoids re-deploying the function to pause the AI. Small change to the agent (1 query), but the brief says "don't change AI agent behaviour" — I think a single read of a DB flag isn't really a behaviour change. If you disagree, fall back to a banner that says "Global state unknown — set `AI_ASSISTANT_ENABLED=false` in Supabase to pause." |
| Q5 | **Inbound SMS hooks — leave room or stay WhatsApp-only?** | **WhatsApp-only.** See §2 #5. If inbound SMS later, design then. |
| Q6 | **What does "resolved" mean operationally?** | Proposal: a conversation transitions to `state='closed'` when staff explicitly mark it resolved (new button) OR when the agent emits `intent=smalltalk` with `auto_send_eligible=true` after a `booking_confirm` (i.e. closes naturally on "see you Wednesday"). Reopens automatically on next inbound. Frequency to decide on. **Punt to Phase 4 design.** |
| Q7 | **Apply-action capacity preview — what level of detail?** | Options: (a) just show "this slot has 2/4 capacity remaining"; (b) show "this slot has Spike (15kg) and Bella (8kg) already in"; (c) full mini-calendar of the day around the slot. I'd ship (a) in Phase 3 and gauge demand for (b). (c) is overkill. |
| Q8 | **Apply-action integration tests — what exists?** | I found no integration test directly exercising `apply_whatsapp_booking_action` end-to-end. Unit tests on `_shared/agentRisk.ts` are extensive. The RPC has been used in production (per the README) but the rollout playbook for autonomous booking expects manual testing per `docs/superpowers/runbooks/2026-05-12-whatsapp-autonomous-booking-rollout.md`. **Recommendation:** the cockpit's first prod-touching `applyBookingAction` call from the new UI should be exercised on a personal phone with a real proposal first, exactly per the runbook. No new automated integration tests in this cockpit slice — they belong to the agent track. |
| Q9 | **State management — Zustand or React Context?** | **Stick with the existing hook pattern: keep `useWhatsAppInbox` as the single owner of inbox state, extract narrowly-scoped sub-hooks for things that don't need to share state (`useCustomerContext`, `useSlotPreview`, `useInboxAnalytics`).** I considered Zustand but the codebase has zero stores today and a single source-of-truth hook with `useMemo`-derived state already works. Adding Zustand is a dependency + paradigm shift for marginal benefit. If `useWhatsAppInbox` crosses 1,200 lines, then we revisit. (It's at 741.) |
| Q10 | **Component scope — refactor or wrap?** | The existing `WhatsAppInboxView.jsx` is one ~1,500-line file with 12 sub-components defined in it. I want to split it under `src/components/views/inbox/` with one file per sub-component, so the cockpit additions can be located cleanly. This is a refactor with **no behavioural change** in Phase 2; I'll keep the diff reviewable by doing it as a separate "move-only" commit. |

---

## 4. Proposed architecture

### 4.1 Component tree (post-Phase 5)

Folder convention follows the existing `views/reports/` and `modals/booking-detail/` patterns.

```
src/components/views/inbox/
├── InboxView.jsx                       — entry; routing & top-level layout
├── InboxHeader.jsx                     — title + filter chips + search + global kill-switch surface
├── InboxFilters.jsx                    — chip group (Needs reply / Drafts / High-risk / Booking-related / Last 24h / All)
├── InboxSearch.jsx                     — debounced search across name / dog / phone
├── conversation-list/
│   ├── ConversationList.jsx            — list pane with attention-first sort
│   ├── ConversationListItem.jsx        — single row (extends current; adds dog names)
│   └── ConversationListEmptyState.jsx
├── thread/
│   ├── ConversationThread.jsx          — detail pane orchestrator
│   ├── ThreadHeader.jsx                — name + state pill + toggles + take-over + resolve
│   ├── ConversationSummary.jsx         — top-of-thread summary, only when message_count > 5
│   ├── MessageList.jsx                 — scrollable list
│   ├── MessageBubble.jsx               — single bubble (extracted from current)
│   ├── DraftPanel.jsx                  — extracted from current (refactor-only)
│   ├── DraftReasoning.jsx              — Q2 (a) + (b): one-line synthesised summary + collapsible tool-calls
│   ├── SuggestedActions.jsx            — Q3: client-derived chips
│   ├── BookingActionPanel.jsx          — extracted from current
│   ├── BookingCapacityPreview.jsx      — NEW; uses src/engine/capacity.ts
│   ├── ComposePanel.jsx                — extracted from current
│   ├── QuickReplyMenu.jsx              — NEW; brand-voiced snippets for inside-window
│   └── TemplatePicker.jsx              — extracted from current (out-of-window)
├── customer-context/
│   ├── CustomerContextPanel.jsx        — docked panel on tablet/desktop, slide-over on mobile
│   ├── DogSummaryCard.jsx              — name, breed, size, alerts, allergies, last groom, behavioural notes
│   ├── LastBookingChip.jsx
│   └── TrustedHumansChips.jsx
├── settings/
│   ├── InboxSettingsPanel.jsx          — surfaced from /settings → AI section
│   └── GlobalAiToggle.jsx              — Q4 implementation
├── analytics/
│   ├── InboxAnalyticsView.jsx          — route /inbox/analytics
│   ├── AnalyticsKPIs.jsx               — 4 KPIs in a row
│   ├── ResponseTimeChart.jsx           — sparkline-ish, no Chart.js dep
│   └── DraftOutcomeTable.jsx           — last 30 days
└── hooks/
    ├── useCustomerContext.js           — dogs + last booking + alerts + trusted contacts for the selected conv
    ├── useSlotCapacityPreview.js       — wraps capacity.ts for a single (date, slot, size) tuple
    ├── useConversationSummary.js       — client-side summariser (no LLM call)
    ├── useSuggestedActions.js          — derives action chips from draft + risk + intent + state
    └── useInboxAnalytics.js            — queries whatsapp_drafts + whatsapp_messages for last 7/30d

src/supabase/hooks/
├── useWhatsAppInbox.js                 — keep; remove customer-context derivation, add resolveConversation, addSnoozeConversation
└── useWhatsAppInbox.test.js            — extend
```

### 4.2 State ownership

**Single owner: `useWhatsAppInbox`.** Reasons:

- Realtime subscriptions belong here (already correct).
- Optimistic mutations need to update derived state on the conversation row (unread, has_pending_draft, has_pending_booking_action) atomically — this is what the current hook already does.
- The new sub-hooks (`useCustomerContext`, `useSlotCapacityPreview`, etc.) own their own narrow state and **do not need to share state** with each other or the inbox — they all key off `selectedId` or `selectedConversation` passed in.

**No Zustand.** Adding a store for one feature area is a bigger commitment than it sounds, and React 19 + hooks handle this just fine. If the inbox grows another 500 lines or we add a second feature area that needs cross-hook state, revisit.

### 4.3 Supabase queries (delta)

New queries:

| Hook | Query / RPC | Notes |
|---|---|---|
| `useCustomerContext` | `from('dogs').select('*, last_booking:bookings(...)').eq('human_id', humanId)` — joining the most recent past booking | Realtime not needed (low churn within a session); refresh on conversation change. |
| `useCustomerContext` | `from('humans').select('alerts, behaviour_notes, trusted_humans(...)').eq('id', humanId)` | Confirm `humans.alerts` exists in schema; if not, this comes from `dogs.alerts`. ⚠️ Check before implementing. |
| `useSlotCapacityPreview` | `from('bookings').select('id, dog_id, size').eq('booking_date', date).eq('slot', slot)` + capacity engine | Read-only; refresh on action edit. |
| `useInboxAnalytics` | Aggregates over `whatsapp_drafts` with `decided_at - created_at` and `state` group-by | Last 7d / 30d; SQL function may be cleaner than client-side aggregation. Decide at Phase 5. |
| `useWhatsAppInbox.resolveConversation` | `from('whatsapp_conversations').update({ state: 'closed' }).eq('id', ...)` | Tiny addition. |
| `useWhatsAppInbox.snoozeConversation` | `update({ state: 'snoozed', snoozed_until: ... })` | Tiny. |

No new RPCs needed for Phases 2–4.

For Q4 (kill switch), if we go with the recommended option:
- Migration: `alter table salon_config add column if not exists ai_assistant_enabled boolean not null default true;`
- Agent change: 1 line — read `salon_config.ai_assistant_enabled` at the top, short-circuit to fallback if false.
- Cockpit: read+write via `useSalonConfig` (already exists).

### 4.4 Realtime channels

Existing channels are correct. The bug to fix (separate task, see F1):

```sql
alter publication supabase_realtime add table public.whatsapp_booking_actions;
```

I'll include this in Phase 2's "smallest end-to-end slice" since the new SuggestedActions and BookingCapacityPreview both rely on realtime echoes of booking-action state changes.

### 4.5 Routing

```jsx
<Route path="/whatsapp" element={<Navigate to="/inbox" replace />} />
<Route path="/inbox" element={<InboxView />} />
<Route path="/inbox/analytics" element={<InboxAnalyticsView />} />
```

`/inbox?conversation=<id>` deep links retained (existing behaviour).

`AppToolbar` already has a WhatsApp tab — rename in-place. The toolbar's unread badge (`useWhatsAppUnread.js`) keeps working unchanged.

### 4.6 Accessibility & calm-UI principles

- Mount `LiveAnnouncerProvider` once in `App.jsx` (also fixes a pre-existing dead code path). Use `useAnnounce` for:
  - "Draft sent to {customer}" (success)
  - "Booking added: {dog} on {date} at {slot}" (success)
  - "Conversation reassigned to staff" (info)
  - "Draft rejected" (info)
- All toggle switches use `role="switch"` + `aria-checked` (the current ones do).
- All icon-only buttons get `aria-label`. The current Take over / Hand back buttons already have these.
- No new animations beyond fade-in. No nag toasts. No flashing. No sounds.
- Notification badge uses `aria-live="polite"` only.
- Focus management: when CustomerContextPanel slides over on mobile, trap focus inside it; first focusable element receives focus on open. Use the existing `AccessibleModal` if it fits, otherwise a smaller `useFocusScope` wrapper.

### 4.7 Mobile-first responsive behaviour

- **Phone (default):** single-column. Show list OR thread OR context panel, one at a time. Selecting a conversation slides the thread in. A "Customer info" pill in the thread header opens the context panel as a full-screen slide-over.
- **Tablet (>=768px):** two columns. List left, thread right. Context panel slides over the thread (full-height) when triggered.
- **Desktop (>=1280px):** three columns. List | Thread | Context (docked, persistent). Resizable later (not now).

Use CSS grid + Tailwind breakpoints (`md:` / `xl:`). Don't add a new media-query system.

### 4.8 Brand voice & UK English checks

- All copy passes through the `smarter-dog-replies` skill voice: warm, queer-inclusive, punk-honest, conversational. Avoid corporate words like "kindly", "we hereby", "as per".
- Dates: DD/MM display (`toLocaleDateString('en-GB', ...)`), times in 12h with am/pm to match the existing booking grid's pattern, weekday-first in long form ("Mon 12 May, 9:30am").
- Spellings: colour, organise, behaviour, cancelled.
- The existing template wording is good; review fallback messages in `_shared/agentRisk.ts` for brand consistency before adding new ones. Don't duplicate; **import**.

---

## 5. Phased delivery — 5 phases, each opens a PR

Each phase keeps the build green and is independently mergeable. Each phase ends with the PR description telling you exactly what to test and what's deferred.

### Phase 1 — Audit + plan (this document) ✅ DONE

Awaiting your sign-off on the 6 TL;DR points and the 10 open questions.

---

### Phase 2 — Cockpit baseline (smallest useful slice)

**Goal:** Move the existing inbox to `/inbox`, refactor into the new component tree with zero behavioural change, fix Bug F1 (realtime publication), wire the LiveAnnouncer, add unmissable Auto-send caption copy.

**Estimated effort:** 1–2 days.

**Tasks:**

- [ ] Create `feat/inbox-cockpit` branch.
- [ ] Add migration `20260513000000_whatsapp_booking_actions_realtime.sql` adding the table to `supabase_realtime`. Verify against schema-only diff.
- [ ] Add route `/inbox` mounting current `WhatsAppInboxView`.
- [ ] Redirect `/whatsapp` → `/inbox` via `<Navigate replace>`.
- [ ] Update `AppToolbar` tab label / icon — keep WhatsApp icon, change route target.
- [ ] Move `WhatsAppInboxView.jsx` to `views/inbox/InboxView.jsx`. Update the dynamic import in `App.jsx`.
- [ ] Split inline components into their own files under `views/inbox/`:
  - `InboxHeader`, `InboxFilters`, `conversation-list/*`, `thread/*`. No behaviour change. One file per component, named exports matching the current names. Verify by running the existing test suite and visually confirming.
- [ ] Mount `LiveAnnouncerProvider` once in `App.jsx`, wrap the routes. Add one announce call in `approveDraft` success path: `"Reply sent."`. Confirms wiring works.
- [ ] Auto-send toggle: surface the gate explanation as a one-line caption beneath the toggle when enabled (not just `title`): "Low-risk faq/greeting/smalltalk/confirm_time may auto-send. Booking changes always wait for you."
- [ ] PR: "Inbox cockpit baseline — move to /inbox, split components, wire announcer, fix F1". Target main; small.

**Verification:**
- `npm run test` — full suite passes, no new failures.
- `npm run typecheck` — passes.
- `npm run lint` — passes (or no new warnings).
- Manual: `npm run dev`, visit `/whatsapp` (redirects), then `/inbox`, confirm the list pane, detail pane, filter chips, draft panel, booking panel, compose panel, template picker all render exactly as before.
- Realtime: in a second tab, run `update whatsapp_booking_actions set state='applied' where id='...'` against staging — confirm the emerald dot updates without refresh.

**Deferred to later phases:** customer context panel, search, summary, suggested actions, capacity preview, quick-reply menu, analytics, global kill switch UI.

---

### Phase 3 — Customer context + booking action preview

**Goal:** The salon-floor "tell me about this customer and what their booking does" surface.

**Estimated effort:** 2–3 days.

**Tasks:**

- [ ] New hook `useCustomerContext(humanId)`:
  - Returns `{ human, dogs, lastBooking, behaviourNotes, alerts, trustedHumans, loading, error }`.
  - One query joining humans + dogs + most-recent past `bookings`; one for trusted_humans.
  - No realtime — refresh on conversation change only.
- [ ] New component `CustomerContextPanel.jsx`:
  - Header: customer name + phone tap-to-call (`tel:` link) + tap-to-message (`wa.me/` link)
  - Body: `DogSummaryCard` per dog (size dot, breed, age, alerts pills, behavioural notes excerpt)
  - `LastBookingChip` — "Last groom: Tue 6 May, full groom, Sam"
  - `TrustedHumansChips` — small pills
  - Footer: "Open full profile →" deep-links to `/humans?id=...` or `/dogs?id=...` (existing modal pattern).
  - Empty state: "We haven't matched this number to a customer yet. Adding a quick profile here will help the AI personalise replies."
- [ ] Wire CustomerContextPanel into `ConversationThread`:
  - Desktop ≥1280px: docked third column.
  - Tablet 768–1279px: slide-over from the right via `AccessibleModal`.
  - Mobile <768px: full-screen slide-over; reachable via "Customer info" button in the thread header.
- [ ] New hook `useSlotCapacityPreview(date, slot, size, ignoreBookingId)`:
  - Reads `bookings` for that date/slot.
  - Calls `getCapacityForSlot` from `src/engine/capacity.ts` to compute remaining seats and 2-2-1 fit.
  - Returns `{ existing: Booking[], remaining: number, fits: boolean, reason?: string }`.
- [ ] New component `BookingCapacityPreview.jsx`:
  - Renders inside the `BookingActionPanel`, beneath the editable fields, **only when the action's `action === 'create'`** and required fields are populated.
  - Shows: "Mon 12 May, 09:30 — small. Adds to 1 small + 1 medium already in. Fits the 2-2-1 rule."
  - Or: "Won't fit — 2 large already in this slot."
  - Updates as staff edit the date/slot/size in the panel above.
- [ ] PR: "Customer context panel + capacity preview".

**Verification:**
- Pick a sample conversation with a known customer (Leam's own number, or a sample data row in staging). Confirm the panel populates.
- Edit the booking action date/slot — confirm the capacity preview updates live.
- Try editing to an over-capacity slot — confirm the preview says it won't fit and the Apply button stays enabled (the trigger will reject if applied; we don't preemptively disable — we *inform*).
- Mobile: confirm the slide-over traps focus and Escape closes it.
- Lighthouse a11y audit on the inbox page — target >=95.

**Deferred:** search, summary, suggested actions, quick-reply menu, analytics, kill switch.

---

### Phase 4 — Triage upgrades: search, summary, suggested actions, quick-reply, kill switch, resolve

**Goal:** Make triage faster and add the operator-level controls.

**Estimated effort:** 3–4 days.

**Tasks:**

- [ ] Extend the conversation list:
  - Join dog names (one extra query in `fetchConversationsList` — bounded list size <=200 so this is fine).
  - "Last 24h" filter chip.
  - Resort by needs-attention rather than `last_inbound_at` alone — sort key derived in JS, no DB change.
- [ ] Add `InboxSearch.jsx` to the header:
  - Debounced 200ms input.
  - Matches customer name (case-insensitive), dog name, or phone (digits only).
  - Filters list locally — no server query (list is bounded).
- [ ] New hook `useConversationSummary(conversation, messages)`:
  - Pure client-side; no LLM call.
  - Builds a one-liner from `lead_status`, `agent_state` (dog name, breed, preferred day, missing fields), last inbound text, and intent of last draft.
  - Examples: "Returning client — asking about Tuesday." / "New enquiry — collecting dog details (still need breed, day)." / "Booking change pending — wants to move Wed 09:30."
  - Shows only when `messages.length > 5` (per the brief).
- [ ] New hook `useSuggestedActions(draft, conversation, customerContext)`:
  - Returns an array of `{ label, onClick, severity }` chips.
  - Logic:
    - `draft.risk === 'high'` → "Escalate to phone"
    - `draft.intent === 'booking_propose'` and confidence >0.7 and customer has prior bookings → "Show this week's availability"
    - `draft.intent === 'booking_cancel'` → "Mark cancelled in diary"
    - `customer.dogs.some(d => vaccinations_due)` → "Send vaccination reminder template" (only if that data field exists — confirm before implementing)
    - Always: "Snooze 4 hours", "Mark resolved"
- [ ] New component `SuggestedActions.jsx` — renders chips beneath the draft panel.
- [ ] New "Mark resolved" handler in `useWhatsAppInbox` — sets `state='closed'`. On next inbound, agent or webhook reopens to `ai_handling` (confirm agent behaviour — should be fine since state checks happen at draft time).
- [ ] New "Snooze 4 hours" handler — sets `state='snoozed'`, `snoozed_until=now()+4h`.
- [ ] New `QuickReplyMenu.jsx` — six brand-voiced snippets for inside-window:
  - "Hey 🐾 thanks for the message — popping you in the queue."
  - "Of course, no problem 😊"
  - "Could you send me {dog_name}'s breed when you have a sec?"
  - etc. (Final wording goes through brand-voice review.)
  - Tap inserts into compose box; doesn't auto-send.
- [ ] Migration `20260513000001_salon_config_ai_assistant.sql` adding `salon_config.ai_assistant_enabled boolean not null default true`.
- [ ] **(Pause for human decision on Q4 before implementing the agent read.)** If approved: update `whatsapp-agent` to short-circuit when `false`, returning the brand-voiced fallback as the draft.
- [ ] New component `GlobalAiToggle.jsx` — surfaces in the existing Settings page as an "AI" section. Reads + writes `salon_config.ai_assistant_enabled` via `useSalonConfig`.
- [ ] PR: "Inbox triage upgrades + AI kill switch".

**Verification:**
- Search across 50+ sample conversations, confirm <200ms response.
- Summary appears only on threads with >5 messages, reads naturally for the test cases.
- Suggested actions appear contextually; clicking each performs the expected action with a toast confirmation.
- Mark resolved → `state='closed'`, conversation drops out of "Needs reply" filter, reappears on next inbound.
- Flip the global AI toggle → confirm next inbound webhook gets a fallback draft.

**Deferred:** analytics.

---

### Phase 5 — Analytics + final polish + accessibility audit

**Goal:** The one-screen analytics check-in surface, plus everything-else cleanup.

**Estimated effort:** 2–3 days.

**Tasks:**

- [ ] New route `/inbox/analytics`.
- [ ] New hook `useInboxAnalytics(range)`:
  - Aggregates `whatsapp_drafts` by `state` over the range
  - Median + p90 of `decided_at - created_at` for drafts decided in range
  - Auto-send fire count
  - Escalation count (drafts with `handoff_required=true`)
- [ ] New components:
  - `AnalyticsKPIs.jsx` — 4 KPI cards in a row, mobile stacks 2x2
  - `ResponseTimeChart.jsx` — inline SVG sparkline, no Chart.js dependency
  - `DraftOutcomeTable.jsx` — last 30 days, group by intent + state
- [ ] Range toggle: 7 days / 30 days.
- [ ] Risk pill restyle (Q2 #3): subtle row gutter + tooltip rather than caps-lock stamped label. Pre/post screenshots in the PR.
- [ ] Touch target audit (CODEBASE-AUDIT §7.5): bring any inbox button below 44×44px up to size.
- [ ] Run `accessibility-reviewer` agent over the inbox tree.
- [ ] Lighthouse run, target Performance >=90, Accessibility >=95, Best Practices >=95.
- [ ] PR: "Inbox analytics + polish + a11y audit".

**Verification:**
- KPIs match a manually-run SQL aggregation against staging.
- Range toggle updates everything correctly.
- a11y review report clean.

**Deferred:** any items that come out of the a11y audit as separate follow-ups.

---

## 6. Testing strategy across phases

- **Vitest** for hooks and pure utility logic. The repo already has `useWhatsAppInbox.test.js`, `useReportsData.test.ts`, and `_shared/agentRisk.test.ts`. Mirror the patterns. Test the new hooks (`useCustomerContext`, `useSlotCapacityPreview`, `useConversationSummary`, `useSuggestedActions`, `useInboxAnalytics`) with synthetic data — no Supabase fetches.
- **No new component snapshot tests** unless we adopt React Testing Library across the codebase (we currently don't). The CODEBASE-AUDIT calls this out as a known gap; not solving it in this slice.
- **Manual smoke** per phase:
  - Personal phone → staging WhatsApp number → real webhook → real draft → approve/edit/reject from the cockpit. Per the autonomous-booking runbook pattern.
  - Tested in three viewports: 375×812 (phone), 820×1180 (iPad), 1440×900 (laptop).
- **Bug F1** verification: trigger a booking-action state change via SQL in one tab and confirm the badge updates in another tab.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Refactor-only diff hides a real regression** (Phase 2) | Two-commit PR: first commit moves files with no edits (use `git mv`); second commit does the small additions. Reviewer can diff each commit separately. |
| **Customer context query fans out to 5+ joins for every conversation switch** | Lazy-load: only fetch context when the panel is open or when the user explicitly views the conversation. Cache per-conversation in the hook for the session. |
| **Capacity preview shows the wrong state because the staff member is editing a slot but the same slot was just filled in another tab** | Refresh the preview on Supabase realtime echo of the `bookings` table. Already in `useBookings`. Wire it through. |
| **"Mark resolved" auto-closes a conversation that's actually still live** | Soft state — next inbound message reopens to `ai_handling` automatically. Staff can also `Reopen` from the closed conversation. No data lost. |
| **Global kill switch flips but the agent's already mid-flight** | Agent reads the flag at top of invocation; in-flight drafts complete. Worst case: one extra draft after the flip. Acceptable. |
| **Analytics queries are heavy** | Use date-bucketed indexes (`whatsapp_drafts(state, created_at desc)` partial indexes already exist for high-risk + handoff). For the median/p90 we may want a SQL function — punt to Phase 5 measurement. |
| **Brand voice drift in suggested actions / quick replies** | Run every new copy string past the `smarter-dog-replies` skill before merging. PR template includes a "brand voice reviewed" checkbox. |
| **Real prod traffic hitting cockpit features that aren't ready** | Cockpit doesn't expose new mutation paths to the customer. All AI/customer behaviour is gated by Edge Function env flags (`AI_AUTO_SEND_LOW_RISK`, `AI_AUTONOMOUS_BOOKING_ENABLED`) which stay off during the rollout. Cockpit ships dark-launched in this sense. |

---

## 8. What I'm explicitly NOT doing in this pass

- Not changing the WhatsApp agent's reasoning, system prompt, or decision logic.
- Not adding inbound SMS handling.
- Not building offline-mode for the inbox.
- Not migrating the existing customer portal CSS to Tailwind (CODEBASE-AUDIT 5.2 — separate large project).
- Not changing the way booking actions are applied (the `apply_whatsapp_booking_action` RPC is untouched).
- Not adding new Meta-approved templates (those need Meta-side approval; the cockpit just picks from `WHATSAPP_TEMPLATES`).
- Not introducing Zustand or any new state library.
- Not changing the website's Montserrat + cyan brand — dashboard styling is intentionally separate.
- Not running destructive migrations on prod.

---

## 9. Next step

Tell me:

1. Sign-off on the six TL;DR points (or push back on any of them).
2. Answer the 10 open questions (or say "your call" — I'll go with the recommendations as written).
3. Confirm the file location — `INBOX-PLAN.md` at repo root, or should I also drop a copy under `docs/superpowers/plans/2026-05-12-inbox-cockpit.md` per the existing planning convention? I'd actually do both, with the root copy as the brief asked.
4. Confirm staging Supabase setup — I'll need a project URL + publishable key in `.env.local` to run Phase 2 end-to-end. Don't paste them here; I can read them locally.

Once those are answered, Phase 2 is about 1–2 days of work to a small, reviewable PR.
