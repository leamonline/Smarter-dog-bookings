# Inbox declutter + click-only AI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Backend phase touches a production edge function — do Phase 1 on its own, verify in logs, before the UI phases.**

**Goal:** Make AI reply-drafting happen only on an explicit staff click (no API call without one), retire the now-dead AI-auto controls, and declutter the inbox so the composer is always visible, one action shows at a time, and the booking proposal reads as part of the brand.

**Architecture:** Three phases. (1) Backend: tighten one gate in `whatsapp-agent` so Claude only runs on `force_draft`, plus a belt-and-braces guard so a clicked draft never auto-sends. (2) Cleanup: delete three orphaned toggle files and retire the `ai_auto` mode + `AIModeSelector`. (3) Layout: pin the composer, collapse inactive panels, give the booking proposal an explicit status pill and brand colours, and fold the AI draft into the composer.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), React 19, Tailwind v4, Vitest.

---

## Before you start — read these (not read during planning)
- `src/supabase/hooks/useWhatsAppInbox.js` — functions `setAIMode` and `generateReplyForConversation` (the UI↔DB-column mapping and the force_draft call bottom out here).
- `supabase/functions/whatsapp-generate-reply/index.ts` — the staff bridge that injects `{ force_draft: true }`.

## ⚠️ Decision to confirm before Phase 1
The auto-draft gate currently exempts **unknown customers** (`human_id IS NULL`) so a brand-new cold inbound still gets one agent pass for onboarding (collect name/dog). Two options:
- **(a) Recommended — click-only for known customers, keep the one onboarding pass for unknowns.** Existing customers never trigger a draft without a click; a first-time stranger still gets an automated first touch (bounded, one call per new contact). Smaller change, keeps lead capture.
- **(b) Click-only for everyone.** Even cold inbounds wait for a manual click. Fully literal to "no API without a click", but new enquiries get no automated first response.

This plan is written for **(a)**. If you want (b), Task 1 changes `if (isKnownCustomer && !forceDraft)` to `if (!forceDraft)`.

---

# Phase 1 — Backend: drafting is click-only

**File:** `supabase/functions/whatsapp-agent/index.ts`

### Task 1: Tighten the auto-draft gate
The gate at `index.ts:2079-2083` only skips Claude when the conversation is *not* `ai_handling`. Remove the `isHumanOnly` dependency so a **known** customer never gets an automatic draft regardless of state.

- [ ] **Step 1: Write/extend the gate test.** If a Deno test harness exists for this function, add a case; otherwise add a logic test for the predicate. The predicate to verify: `shouldSkipClaude = isKnownCustomer && !forceDraft`. Cases: known + no force → skip; known + force → run; unknown + no force → run (onboarding); unknown + force → run.

- [ ] **Step 2: Change the gate.** Replace:

```ts
          const isHumanOnly = conversation.state !== "ai_handling";
          const isKnownCustomer = conversation.human_id != null;
          if (isHumanOnly && isKnownCustomer && !forceDraft) {
            continue;
          }
```

with:

```ts
          // AI replies are generated ONLY on an explicit staff click
          // (force_draft via the "Generate reply" button). A known customer
          // never gets an automatic draft — the inbound is persisted and
          // waits. Unknown customers (human_id IS NULL) still get one agent
          // pass so the onboarding state machine can collect their details.
          const isKnownCustomer = conversation.human_id != null;
          if (isKnownCustomer && !forceDraft) {
            continue;
          }
```

This preserves everything before the gate (conversation upsert `index.ts:1988`, inbound store `index.ts:1996`, button-reply routing `2006-2047`, reminder-confirm `2056-2070`) and the separate status loop (`2253`).

- [ ] **Step 3: Guard auto-send for clicked drafts.** At `index.ts:2250`, ensure a hand-generated draft never auto-sends. Replace `await dispatchIfEligible(draftId, policy);` with:

```ts
          // A staff-clicked draft always waits for approval — never auto-send
          // it, regardless of env/conversation flags.
          if (!forceDraft) {
            await dispatchIfEligible(draftId, policy);
          }
```

(With `ai_auto` retired in Phase 2, `auto_send_enabled` is never set true, so the remaining `dispatchIfEligible` path is dormant anyway; this guard makes the click=draft-only contract explicit.)

- [ ] **Step 4: Typecheck the function** (Deno): `deno check supabase/functions/whatsapp-agent/index.ts` — Expected: no errors.

- [ ] **Step 5: Deploy + verify.** Deploy: `supabase functions deploy whatsapp-agent`. Then send a test inbound from a known customer in `ai_handling` (or any state) and confirm via `get_logs` / function logs that **no Claude call** is made and the message still lands in the inbox. Click "Generate reply" and confirm a draft is produced. (No DB migration — logic only.)

- [ ] **Step 6: Commit.** `git commit -am "whatsapp-agent: only draft on explicit force_draft (no auto-drafting)"`

### Task 2 (optional): Normalise existing AI-auto conversations
Not required for correctness (the new gate handles any state), but tidy: set lingering `ai_handling` rows back to the human default so state is consistent after the UI loses the toggle.
- [ ] **Step 1:** Inspect: `select id, state, auto_send_enabled from whatsapp_conversations where state = 'ai_handling';`
- [ ] **Step 2:** If any, normalise: `update whatsapp_conversations set state = 'human_takeover', auto_send_enabled = false, autonomous_booking_enabled = false where state = 'ai_handling';` (run via MCP `execute_sql`, review first — production).

---

# Phase 2 — Retire the dead AI-auto controls

### Task 3: Delete the orphaned toggle files
These have **no live imports** (confirmed): `AutoSendToggle.jsx`, `AutonomousBookingToggle.jsx`, and their shared `ConversationGateToggle.jsx` (only used by those two).
- [ ] **Step 1:** `git rm src/components/views/inbox/thread/AutoSendToggle.jsx src/components/views/inbox/thread/AutonomousBookingToggle.jsx src/components/views/inbox/thread/ConversationGateToggle.jsx`
- [ ] **Step 2:** Grep to confirm nothing references them: `grep -rn "AutoSendToggle\|AutonomousBookingToggle\|ConversationGateToggle" src` — Expected: no matches.
- [ ] **Step 3:** `npx vitest run && npx tsc --noEmit` — Expected: green.
- [ ] **Step 4:** Commit: `git commit -m "Remove orphaned auto-send/autonomous-booking toggle components"`

### Task 4: Remove `AIModeSelector` and the `ai_auto` mode
AI is now always on-demand, so there is no "mode" to pick.
- [ ] **Step 1:** In `InboxView.jsx`, remove the import (`:36`) and the render block (`:504-524`, the closed/active ternary that renders `AIModeSelector`). Keep the `MarkCompleteButton` that sits beside it; replace the ternary with just the `closed` span when closed, nothing when active.
- [ ] **Step 2:** Remove `handleSetAIMode` (`InboxView.jsx:124-139`) and the `setAIMode` destructure (`:69`) if now unused.
- [ ] **Step 3:** In `src/supabase/hooks/useWhatsAppInbox.js`, remove/simplify `setAIMode` (and drop the `ai_auto` branch). If nothing else writes `state`/`auto_send_enabled`/`autonomous_booking_enabled` from the UI, leave those columns alone in the DB (they just stay at defaults).
- [ ] **Step 4:** Delete `src/components/views/inbox/AIModeSelector.jsx` and update/remove `src/components/views/inbox/AIModeSelector.test.js` (it tests `deriveAIMode`).
- [ ] **Step 5:** `npx vitest run && npx tsc --noEmit && npx eslint src/components/views/inbox` — Expected: green.
- [ ] **Step 6:** Commit: `git commit -m "Retire AI-auto mode; AI assistance is on-demand only"`

---

# Phase 3 — Layout declutter

Visual target: the proposed side of the inbox mockup shared in chat (composer pinned, one action expanded, others collapsed to a line, brand-coloured proposal with an explicit status pill). This phase is design-led: build to the mockup and verify visually. Each task is independently committable.

### Task 5: Keep the composer visible (pinned dock)
The detail pane (`InboxView.jsx:471`) is already `flex-1 flex flex-col` with the thread as `flex-1 ... overflow-y-auto` (`:557`); the panels below are bottom siblings. The problem is they have no bound, so a tall draft+booking stack pushes the composer off-screen.
- [ ] **Step 1:** Wrap the draft/booking/generate panels (everything between the thread and `ComposePanel`) in a single **action-dock** div: `className="shrink-0 max-h-[45%] overflow-y-auto border-t border-slate-200"`. The dock scrolls internally; the `ComposePanel` stays as the final, non-scrolling child of the detail pane → always visible.
- [ ] **Step 2:** Verify on a short viewport that with a draft + booking both present, the composer remains on screen and the dock scrolls.
- [ ] **Step 3:** Commit.

### Task 6: Collapse inactive panels (one expanded at a time)
- [ ] **Step 1:** Add a small `CollapsibleSection` primitive (header row with title + chevron, click toggles body) under `src/components/views/inbox/thread/`. Follow existing class idioms (`text-[11px] font-bold uppercase`, `bg-slate-50`, etc.).
- [ ] **Step 2:** In the action dock, render the booking proposal and any secondary panel (e.g. "Why this was held") as collapsible sections; default-expand the single most relevant one (booking proposal if a pending action exists, else the draft), collapse the rest to a one-line header.
- [ ] **Step 3:** Verify only one is expanded by default; clicking a collapsed header expands it.
- [ ] **Step 4:** Commit.

### Task 7: Explicit booking-proposal state + brand colours
Recolour `BookingActionPanel.jsx` (currently emerald, `:77-78,106,113` + an emerald shadow) to the brand palette and add a status pill.
- [ ] **Step 1:** Replace the emerald header/border/text with brand tokens: container `bg-brand-yellow/10 border-brand-yellow/40`, heading `text-brand-purple`; field borders `border-slate-200`; capacity line `text-brand-teal`. Remove the `rgba(16,185,129,...)` emerald shadow (use `shadow-card-resting` or none).
- [ ] **Step 2:** Add a status pill next to the "Booking proposal" heading: `Proposed · awaiting your OK` in `bg-brand-yellow/20 text-brand-purple border border-brand-yellow` (matches the mockup). On apply, the resulting `BookingCreatedCard` already shows the brand-green "confirmed" state (from the colour PR).
- [ ] **Step 3:** Recolour the action buttons: Apply → `bg-brand-yellow text-brand-purple` (primary); Reject/Decline → `bg-white text-brand-coral-text border border-brand-coral` (outline).
- [ ] **Step 4:** `npx vitest run` (BookingActionPanel tests, if any) + visual check. Commit.

### Task 8: Fold the AI draft into the composer
Replace the standalone amber `DraftPanel` with a draft surfaced *inside* the composer.
- [ ] **Step 1:** When a `draft` exists, render a compact strip above the `ComposePanel` textarea: `✨ AI draft · {intent} · {risk} · Use · Edit · Regenerate · Dismiss`, and pre-fill the textarea with `draft.proposed_text` on "Use" (staff can edit, then Send via the normal composer). Keep the "why held" explainer as a collapsed one-liner (Task 6).
- [ ] **Step 2:** Preserve the existing draft actions' behaviour through the composer: sending the (edited) text approves the draft; a "Dismiss" maps to the existing reject path. Reuse `handleApproveDraft`/`handleRejectDraft` from `InboxView` (`:88-104`).
- [ ] **Step 2a:** Keep the booking-apply flow separate from the composer (it stays in the proposal panel) — only the *reply text* folds in.
- [ ] **Step 3:** Remove the now-unused standalone `DraftPanel` render in `InboxView` (`:612-622`); decide whether to delete `DraftPanel.jsx` or keep its action-bar logic in the new composer-draft strip. Reuse, don't duplicate.
- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit && npx eslint src/components/views/inbox`. Manual: open a conversation → composer empty + "Generate reply"; click → draft appears in the composer; edit + send works; dismiss works.
- [ ] **Step 5:** Commit.

---

## Risks & trade-offs
- **Production edge function.** Phase 1 changes live AI behaviour. Deploy and verify in logs *before* the UI phases. No migration, so rollback is a redeploy of the previous function.
- **Onboarding exemption** is the one behavioural judgement (decision above). Get it confirmed before Task 1.
- **Auto-send becomes unreachable**, not deleted — `dispatchIfEligible` stays in the code, dormant (no UI sets `auto_send_enabled`, and clicked drafts are guarded out). If auto-send is wanted again later, it needs a deliberate new control.
- **DraftPanel logic reuse (Task 8)** is the fiddliest part — the existing five-mode action bar (edit/reject/attached-booking) must not be lost when folding into the composer. Prefer extracting its handlers over rewriting.

## Test/verification approach
- Backend: predicate test for the gate; live log check that a known-customer inbound makes no Claude call and the button still drafts.
- Frontend: existing suite stays green after deletions; component checks for the booking pill and the composer empty/draft states; manual pass for the pinned dock on a short viewport.

## Self-review notes
- Spec coverage: pin composer (T5), collapse inactive (T6), explicit booking state + brand colour (T7), click-first/no-auto (T1+T8), retire dead controls (T3+T4). All spec items mapped.
- Phase 1 is isolated and shippable alone; Phases 2–3 are frontend-only and independently committable.
- Layout tasks are intentionally spec-not-verbatim-JSX (visual, iterative against the mockup) — the one place exact code is premature.
