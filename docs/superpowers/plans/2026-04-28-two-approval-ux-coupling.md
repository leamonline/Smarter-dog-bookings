# WhatsApp Inbox — Two-Approval UX Coupling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the trust footgun where staff can approve a draft reply (sending it to the customer) without applying the attached `booking_action` — by gating the Approve button with an inline banner and dual buttons ("Approve & Apply" default, "Send reply only" override) when an action is attached, and leaving everything else unchanged when no action is attached.

**Architecture:** Frontend-only. Two files modified. New derived state `attachedActions` computed in the inbox hook (filter `bookingActions` by `draft_id === current draft.id AND state === 'pending'`). New action `approveDraftAndApply` that applies each attached action sequentially, then sends the reply only if all applies succeeded. DraftPanel renders an amber banner + dual buttons when `attachedActions.length > 0`. Pure-function helper `filterAttachedActions` extracted for unit testing.

**Tech Stack:** React 18, Supabase JS client (`supabase.rpc`, `supabase.functions.invoke`), Vitest (Node env, no JSDOM).

**Spec:** [docs/superpowers/specs/2026-04-28-two-approval-ux-coupling-design.md](docs/superpowers/specs/2026-04-28-two-approval-ux-coupling-design.md)

**Branch:** `feat/two-approval-ux-coupling` (already created, spec already committed at `77496fd`)

**Supabase project:** `nlzhllhkigmsvrzduefz` (`Smarter-dog-grooming`, eu-west-2)

---

## File Map

- **Modify:** `src/supabase/hooks/useWhatsAppInbox.js`
  - Add `draft_id` to the booking_actions SELECT in `fetchConversationDetail` (~line 89).
  - Export new pure helper `filterAttachedActions(draft, bookingActions)`.
  - Inside `useWhatsAppInbox`: add `attachedActions` via `useMemo`.
  - Inside `useWhatsAppInbox`: add `approveDraftAndApply` `useCallback` near the other actions (~line 256).
  - Return `attachedActions` and `approveDraftAndApply` from the hook (~line 492).
- **Modify:** `src/components/views/WhatsAppInboxView.jsx`
  - Add a `formatShortDate` helper near `formatDateLong` (~line 68).
  - `DraftPanel` (~line 303): accept new props `attachedActions` and `onApproveAndApply`, render banner when `attachedActions.length > 0`, render dual buttons in default/editing modes when attached.
  - `WhatsAppInboxView` (~line 545): destructure `attachedActions` and `approveDraftAndApply` from the hook, pass them as `DraftPanel` props.
- **Create:** `src/supabase/hooks/useWhatsAppInbox.test.js` — pure-function unit test for `filterAttachedActions`.

---

## Testing approach

The repo's existing Vitest config (`vitest.config.ts`) uses `environment: "node"` and `include: ["src/**/*.test.{js,ts}"]` — no JSDOM, no React rendering. **Deviation from spec:** the spec named a Vitest snapshot test for `DraftPanel`, but adding JSDOM + React Testing Library for a single snapshot is disproportionate scope. Substituting a pure-function unit test for `filterAttachedActions` + a thorough manual smoke test (Tests 1–4 below).

**Coverage:**
- **Filter logic:** unit-tested in `useWhatsAppInbox.test.js` (Task 2).
- **Hook + component wiring:** verified by manual smoke (Task 7) — three positive cases and one regression.
- **Failure modes:** Test 3 exercises the apply-error path; the spec's "send fails after apply succeeded" case is documented but not seeded (rare; same recovery path as standalone Apply errors today).

---

## Task 1: Add `draft_id` to booking_actions SELECT + extract `filterAttachedActions` helper

**Files:**
- Modify: `src/supabase/hooks/useWhatsAppInbox.js`

The current SELECT in `fetchConversationDetail` doesn't include `draft_id`, so the hook never has it in `bookingActions` state. We need it to filter attached actions. Same task adds the pure helper that the next task will unit-test.

- [ ] **Step 1.1: Add `draft_id` to the booking_actions SELECT**

In `src/supabase/hooks/useWhatsAppInbox.js`, find this line (around line 89):

```javascript
      .select("id, action, payload, target_booking_id, state, rejection_reason, applied_booking_id, error_message, created_at")
```

Replace with:

```javascript
      .select("id, draft_id, action, payload, target_booking_id, state, rejection_reason, applied_booking_id, error_message, created_at")
```

- [ ] **Step 1.2: Add the pure helper `filterAttachedActions`**

In the same file, add this function just below the imports (around line 28, after the `SEND_FUNCTION_PATH` constant, before the `// ── Fetchers ──` comment):

```javascript
// ── Pure helpers (exported for testing) ─────────────────────
// Filters the bookingActions list down to the actions attached to the
// current pending draft. An action is "attached" if its draft_id
// matches the draft's id AND it's still pending. Used by the inbox
// hook to gate the DraftPanel's Approve button on whether a booking
// proposal is hanging off the same draft.
export function filterAttachedActions(draft, bookingActions) {
  if (!draft) return [];
  if (!Array.isArray(bookingActions)) return [];
  return bookingActions.filter(
    (a) => a.draft_id === draft.id && a.state === "pending",
  );
}
```

- [ ] **Step 1.3: Verify the file still parses (no commit yet)**

Run:
```bash
cd /Users/leamonline/Documents/GitHub/Smarter-dogs-smart-humans
npx eslint src/supabase/hooks/useWhatsAppInbox.js
```

Expected: no errors. (If ESLint isn't configured to run on this file, skip — the next task's test will catch syntax issues anyway.)

- [ ] **Step 1.4: Commit**

```bash
cd /Users/leamonline/Documents/GitHub/Smarter-dogs-smart-humans
git add src/supabase/hooks/useWhatsAppInbox.js
git commit -m "$(cat <<'EOF'
refactor(whatsapp-inbox): include draft_id in booking_actions select + extract filterAttachedActions helper

Pure helper that filters bookingActions down to those linked to the
current pending draft (draft_id match AND state='pending'). Will be
used by the next commit to gate the Approve button when a booking
proposal is attached. Exporting it pure makes it unit-testable
without standing up React Testing Library.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Unit test for `filterAttachedActions`

**Files:**
- Create: `src/supabase/hooks/useWhatsAppInbox.test.js`

- [ ] **Step 2.1: Write the failing test**

Create `src/supabase/hooks/useWhatsAppInbox.test.js` with this exact content:

```javascript
/**
 * useWhatsAppInbox helpers — unit tests
 *
 * Run: npx vitest run src/supabase/hooks/useWhatsAppInbox.test.js
 *
 * Covers the pure-function helpers exported from the hook module.
 * The hook itself (with React state, supabase, realtime) isn't tested
 * here — that's covered by manual smoke tests against a seeded draft.
 */

import { describe, it, expect } from "vitest";
import { filterAttachedActions } from "./useWhatsAppInbox.js";

describe("filterAttachedActions", () => {
  const draft = { id: "draft-1", proposed_text: "hello", state: "pending" };

  it("returns [] when draft is null", () => {
    expect(filterAttachedActions(null, [])).toEqual([]);
    expect(filterAttachedActions(undefined, [])).toEqual([]);
  });

  it("returns [] when bookingActions is not an array", () => {
    expect(filterAttachedActions(draft, null)).toEqual([]);
    expect(filterAttachedActions(draft, undefined)).toEqual([]);
  });

  it("returns [] when no booking_actions match the draft", () => {
    const actions = [
      { id: "a-1", draft_id: "other-draft", state: "pending" },
      { id: "a-2", draft_id: null, state: "pending" },
    ];
    expect(filterAttachedActions(draft, actions)).toEqual([]);
  });

  it("excludes actions matching the draft but already applied or rejected", () => {
    const actions = [
      { id: "a-1", draft_id: "draft-1", state: "applied" },
      { id: "a-2", draft_id: "draft-1", state: "rejected" },
    ];
    expect(filterAttachedActions(draft, actions)).toEqual([]);
  });

  it("returns matching pending actions", () => {
    const actions = [
      { id: "a-1", draft_id: "draft-1", state: "pending", payload: { dog_name: "Alfie" } },
      { id: "a-2", draft_id: "other-draft", state: "pending" },
      { id: "a-3", draft_id: "draft-1", state: "applied" },
    ];
    const result = filterAttachedActions(draft, actions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a-1");
  });

  it("returns multiple matching pending actions in original order", () => {
    const actions = [
      { id: "a-1", draft_id: "draft-1", state: "pending" },
      { id: "a-2", draft_id: "draft-1", state: "pending" },
      { id: "a-3", draft_id: "other", state: "pending" },
    ];
    const result = filterAttachedActions(draft, actions);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(["a-1", "a-2"]);
  });
});
```

- [ ] **Step 2.2: Run the tests to verify they pass**

Run:
```bash
cd /Users/leamonline/Documents/GitHub/Smarter-dogs-smart-humans
npx vitest run src/supabase/hooks/useWhatsAppInbox.test.js
```

Expected: all 5 tests pass (the helper was already written in Task 1, so this is "implementation already exists" — verifying behaviour matches expectations). Output should include `5 passed` and exit code 0.

If any test fails, the helper has a bug — read the failure, fix the helper code from Task 1.2, re-run.

- [ ] **Step 2.3: Run the full test suite to confirm no regressions**

Run:
```bash
cd /Users/leamonline/Documents/GitHub/Smarter-dogs-smart-humans
npm run test
```

Expected: all existing tests still pass plus the new ones. Note: `npm run test` runs Vitest in watch mode by default in some setups. If it hangs, use `npx vitest run` instead.

- [ ] **Step 2.4: Commit**

```bash
git add src/supabase/hooks/useWhatsAppInbox.test.js
git commit -m "$(cat <<'EOF'
test(whatsapp-inbox): unit tests for filterAttachedActions helper

5 cases: null draft, non-array bookingActions, no matching action,
already-applied/rejected actions, and the happy path with multiple
matches. Pure-function tests run in the existing Vitest "node"
environment — no React Testing Library required.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire `attachedActions` through the hook

**Files:**
- Modify: `src/supabase/hooks/useWhatsAppInbox.js`

- [ ] **Step 3.1: Import `useMemo`**

Find the React import line near the top of the file (around line 26):

```javascript
import { useState, useEffect, useCallback, useRef } from "react";
```

Replace with:

```javascript
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
```

- [ ] **Step 3.2: Add the `attachedActions` `useMemo`**

In the same file, find the `actionInFlight` declaration inside `useWhatsAppInbox` (around line 121):

```javascript
  const [actionInFlight, setActionInFlight] = useState(false);
```

Add this block immediately after that line (before the `selectedIdRef` declaration):

```javascript

  // Derived: actions attached to the currently-pending draft.
  // The DraftPanel uses this to switch from single Approve to the
  // Approve & Apply / Send reply only pair. See spec section
  // "Architecture" in 2026-04-28-two-approval-ux-coupling-design.md.
  const attachedActions = useMemo(
    () => filterAttachedActions(draft, bookingActions),
    [draft, bookingActions],
  );
```

- [ ] **Step 3.3: Return `attachedActions` from the hook**

Find the return object near the end of `useWhatsAppInbox` (around line 480-500). It currently returns an object with all the state and actions. Add `attachedActions` to it.

Locate this exact block (around line 484):

```javascript
    bookingActions,
    loadingDetail,
```

Replace with:

```javascript
    bookingActions,
    attachedActions,
    loadingDetail,
```

- [ ] **Step 3.4: Verify the hook still works (no test, manual)**

Open the file in an editor and confirm:
- `useMemo` is in the imports.
- The new `attachedActions` block sits between `actionInFlight` and `selectedIdRef`.
- The return object includes `attachedActions` between `bookingActions` and `loadingDetail`.

No commit yet — Task 4 adds the action that uses this state.

---

## Task 4: Add `approveDraftAndApply` action to the hook

**Files:**
- Modify: `src/supabase/hooks/useWhatsAppInbox.js`

- [ ] **Step 4.1: Add the `approveDraftAndApply` callback**

In `src/supabase/hooks/useWhatsAppInbox.js`, find the closing `}` of the existing `approveDraft` callback (around line 296):

```javascript
    } finally {
      setActionInFlight(false);
    }
  }, [draft, actionInFlight]);

  // rejectDraft accepts an optional free-text reason
```

Insert this block immediately after the closing `}, [draft, actionInFlight]);` line and before the `// rejectDraft accepts...` comment:

```javascript

  // Approve the draft AND apply each attached booking_action in one go.
  // Order: apply each action sequentially (stop on first error), then
  // send the reply only if all applies succeeded. If apply fails, no
  // reply is sent and the error is surfaced. If apply succeeds and the
  // subsequent send fails, the booking is real and the error message
  // tells staff to send manually. See spec "Failure modes" table.
  //
  // Falls through to plain approveDraft when no actions are attached —
  // keeps the call site agnostic about whether to call this or that.
  const approveDraftAndApply = useCallback(async ({ editedText } = {}) => {
    if (!draft || actionInFlight) {
      return { ok: false, reason: "no draft or action in flight" };
    }
    if (attachedActions.length === 0) {
      return approveDraft({ editedText });
    }

    setActionInFlight(true);
    try {
      // 1. Apply each attached action sequentially. Stop on first error.
      const applied = [];
      for (const action of attachedActions) {
        const { data: bookingId, error: applyError } = await supabase.rpc(
          "apply_whatsapp_booking_action",
          { p_action_id: action.id },
        );
        if (applyError) {
          const dogLabel = action.payload?.dog_name ?? "booking";
          return {
            ok: false,
            reason: `Apply failed for ${dogLabel}: ${applyError.message}`,
            appliedSoFar: applied,
          };
        }
        applied.push({ actionId: action.id, bookingId });
      }

      // 2. Optimistic: clear applied actions from local state so the
      //    BookingActionPanel doesn't briefly show them as pending.
      setBookingActions((prev) =>
        prev.filter((a) => !applied.some((x) => x.actionId === a.id)),
      );

      // 3. Send the reply via the whatsapp-send Edge Function.
      const { data: sendData, error: sendError } = await supabase.functions
        .invoke(SEND_FUNCTION_PATH, {
          body: {
            mode: "draft",
            draft_id: draft.id,
            ...(editedText ? { edited_text: editedText } : {}),
          },
        });
      if (sendError || sendData?.error) {
        const reason = sendError?.message ?? sendData?.error ?? "Send failed";
        return {
          ok: false,
          reason: `${reason} (booking was applied — please send the reply manually)`,
          appliedSoFar: applied,
        };
      }

      // 4. Optimistic: clear the pending draft and flip both list-pane
      //    badges off (mirrors approveDraft's optimistic update).
      setDraft(null);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedIdRef.current
            ? { ...c, has_pending_draft: false, has_pending_booking_action: false }
            : c,
        ),
      );

      return { ok: true, applied, sendResult: sendData };
    } catch (err) {
      console.error("approveDraftAndApply:", err);
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    } finally {
      setActionInFlight(false);
    }
  }, [draft, attachedActions, actionInFlight, approveDraft]);

```

- [ ] **Step 4.2: Return `approveDraftAndApply` from the hook**

Find the return object at the end of `useWhatsAppInbox`. Locate this exact block (around line 492):

```javascript
    approveDraft,
    rejectDraft,
```

Replace with:

```javascript
    approveDraft,
    approveDraftAndApply,
    rejectDraft,
```

- [ ] **Step 4.3: Verify it compiles (best effort)**

Run a quick type/lint check:
```bash
cd /Users/leamonline/Documents/GitHub/Smarter-dogs-smart-humans
npx vitest run src/supabase/hooks/useWhatsAppInbox.test.js
```

Expected: still 5 tests pass (Task 2's test should still pass — we only added new code; the helper hasn't changed).

If you see a parse error, read the message and fix in place.

- [ ] **Step 4.4: Commit**

```bash
git add src/supabase/hooks/useWhatsAppInbox.js
git commit -m "$(cat <<'EOF'
feat(whatsapp-inbox): wire attachedActions + approveDraftAndApply through hook

Adds derived attachedActions (filtered via filterAttachedActions) and
a new approveDraftAndApply callback. The new callback applies each
attached booking_action sequentially via apply_whatsapp_booking_action,
then sends the reply via whatsapp-send only if all applies succeeded.
On apply error, the error is surfaced and no reply is sent. On send
error after a successful apply, the message tells staff to send
manually because the booking is already real.

Falls through to plain approveDraft when no actions are attached.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update `DraftPanel` to render banner + dual buttons

**Files:**
- Modify: `src/components/views/WhatsAppInboxView.jsx`

- [ ] **Step 5.1: Add `formatShortDate` helper**

In `src/components/views/WhatsAppInboxView.jsx`, find `formatDateLong` (around line 68):

```javascript
function formatDateLong(dateStr) {
  if (!dateStr) return "No date";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
```

Add this helper immediately after it (before the `// Meta only lets us...` comment):

```javascript
// Compact UK-style "Mon 27 Apr" used by the booking-attached banner.
// Year is omitted because the banner is showing imminent bookings; the
// full date is available in the BookingActionPanel below.
function formatShortDate(dateStr) {
  if (!dateStr) return "?";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
```

- [ ] **Step 5.2: Update `DraftPanel` props signature**

Find the `DraftPanel` function declaration (around line 303):

```javascript
function DraftPanel({ draft, onApprove, onReject, inFlight }) {
```

Replace with:

```javascript
function DraftPanel({ draft, attachedActions = [], onApprove, onApproveAndApply, onReject, inFlight }) {
```

- [ ] **Step 5.3: Add `handleApproveAndApply` inside `DraftPanel`**

In the same function, find the existing `handleApprove`:

```javascript
  async function handleApprove(useEditedText) {
    setError(null);
    const res = await onApprove(useEditedText ? { editedText } : {});
    if (!res.ok) setError(res.reason ?? "Send failed");
  }
```

Add this handler immediately after it:

```javascript

  async function handleApproveAndApply(useEditedText) {
    setError(null);
    const res = await onApproveAndApply(useEditedText ? { editedText } : {});
    if (!res.ok) setError(res.reason ?? "Send failed");
  }
```

- [ ] **Step 5.4: Add the attached-booking banner**

In the same function, find this existing block (just after the draft text / edit textarea):

```javascript
      {rejecting && (
        <div className="mt-2">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-amber-800 mb-1">
            Why are you rejecting? (optional — helps us tune the AI)
          </label>
```

Insert this banner block immediately **before** the `{rejecting && (` line (so the banner sits above the reject reason textarea, between the draft text and the buttons):

```javascript
      {attachedActions.length > 0 && !rejecting && (
        <div className="mt-2 p-2 bg-amber-100 border border-amber-300 rounded text-[12px] text-amber-900">
          <div className="font-bold mb-1">📋 Booking attached:</div>
          {attachedActions.map((action) => (
            <div key={action.id}>
              {action.payload?.dog_name ?? "<unnamed dog>"}
              {" · "}
              {formatShortDate(action.payload?.booking_date)}
              {" · "}
              {action.payload?.slot ?? "?"}
            </div>
          ))}
        </div>
      )}

```

- [ ] **Step 5.5: Replace the default-mode and editing-mode button blocks**

Still inside `DraftPanel`, find this entire block (around line 392-452):

```javascript
      <div className="flex flex-wrap gap-2 mt-2">
        {editing ? (
          <>
            <button
              onClick={() => handleApprove(true)}
              disabled={inFlight || !editedText.trim()}
              className="px-3 py-1.5 rounded-md bg-brand-purple text-white text-[13px] font-bold disabled:opacity-50"
            >
              Send edit
            </button>
            <button
              onClick={() => { setEditing(false); setEditedText(draft.proposed_text); }}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
            >
              Cancel edit
            </button>
          </>
        ) : rejecting ? (
          <>
            <button
              onClick={handleConfirmReject}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-red-600 text-white text-[13px] font-bold disabled:opacity-50"
            >
              Confirm reject
            </button>
            <button
              onClick={() => { setRejecting(false); setRejectReason(""); }}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => handleApprove(false)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-brand-purple text-white text-[13px] font-bold disabled:opacity-50"
            >
              Approve &amp; send
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
            >
              Edit first
            </button>
            <button
              onClick={() => setRejecting(true)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-500 text-[13px]"
            >
              Reject
            </button>
          </>
        )}
      </div>
```

Replace it with:

```javascript
      <div className="flex flex-wrap gap-2 mt-2">
        {editing ? (
          attachedActions.length > 0 ? (
            <>
              <button
                onClick={() => handleApproveAndApply(true)}
                disabled={inFlight || !editedText.trim()}
                className="px-3 py-1.5 rounded-md bg-brand-purple text-white text-[13px] font-bold disabled:opacity-50"
              >
                Send edit &amp; Apply
              </button>
              <button
                onClick={() => handleApprove(true)}
                disabled={inFlight || !editedText.trim()}
                className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
              >
                Send edit only
              </button>
              <button
                onClick={() => { setEditing(false); setEditedText(draft.proposed_text); }}
                disabled={inFlight}
                className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
              >
                Cancel edit
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleApprove(true)}
                disabled={inFlight || !editedText.trim()}
                className="px-3 py-1.5 rounded-md bg-brand-purple text-white text-[13px] font-bold disabled:opacity-50"
              >
                Send edit
              </button>
              <button
                onClick={() => { setEditing(false); setEditedText(draft.proposed_text); }}
                disabled={inFlight}
                className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
              >
                Cancel edit
              </button>
            </>
          )
        ) : rejecting ? (
          <>
            <button
              onClick={handleConfirmReject}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-red-600 text-white text-[13px] font-bold disabled:opacity-50"
            >
              Confirm reject
            </button>
            <button
              onClick={() => { setRejecting(false); setRejectReason(""); }}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
            >
              Cancel
            </button>
          </>
        ) : attachedActions.length > 0 ? (
          <>
            <button
              onClick={() => handleApproveAndApply(false)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-brand-purple text-white text-[13px] font-bold disabled:opacity-50"
            >
              Approve &amp; Apply
            </button>
            <button
              onClick={() => handleApprove(false)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
            >
              Send reply only
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
            >
              Edit first
            </button>
            <button
              onClick={() => setRejecting(true)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-500 text-[13px]"
            >
              Reject
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => handleApprove(false)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-brand-purple text-white text-[13px] font-bold disabled:opacity-50"
            >
              Approve &amp; send
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 text-[13px]"
            >
              Edit first
            </button>
            <button
              onClick={() => setRejecting(true)}
              disabled={inFlight}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-500 text-[13px]"
            >
              Reject
            </button>
          </>
        )}
      </div>
```

Note: the **rejecting** branch and the **no-attachment default** branch are unchanged from the original. The **editing-with-attachment** and **default-with-attachment** branches are new.

- [ ] **Step 5.6: No commit yet — Task 6 wires the props through**

The file won't render correctly yet because `WhatsAppInboxView` isn't passing the new props. Task 6 closes that gap before committing.

---

## Task 6: Wire new props through `WhatsAppInboxView`

**Files:**
- Modify: `src/components/views/WhatsAppInboxView.jsx`

- [ ] **Step 6.1: Destructure new fields from the hook**

Find this block inside `WhatsAppInboxView` (around line 547):

```javascript
  const {
    conversations,
    loadingList,
    selectedId,
    selectedConversation,
    messages,
    draft,
    bookingActions,
    loadingDetail,
    selectConversation,
    approveDraft,
    rejectDraft,
    sendManualReply,
    applyBookingAction,
    rejectBookingAction,
    takeoverConversation,
    releaseConversation,
    actionInFlight,
  } = useWhatsAppInbox();
```

Replace with:

```javascript
  const {
    conversations,
    loadingList,
    selectedId,
    selectedConversation,
    messages,
    draft,
    bookingActions,
    attachedActions,
    loadingDetail,
    selectConversation,
    approveDraft,
    approveDraftAndApply,
    rejectDraft,
    sendManualReply,
    applyBookingAction,
    rejectBookingAction,
    takeoverConversation,
    releaseConversation,
    actionInFlight,
  } = useWhatsAppInbox();
```

- [ ] **Step 6.2: Pass new props to `DraftPanel`**

Find the `DraftPanel` render (around line 672):

```javascript
              {/* Pending AI draft — only rendered when there is one */}
              {draft && (
                <DraftPanel
                  draft={draft}
                  onApprove={approveDraft}
                  onReject={rejectDraft}
                  inFlight={actionInFlight}
                />
              )}
```

Replace with:

```javascript
              {/* Pending AI draft — only rendered when there is one */}
              {draft && (
                <DraftPanel
                  draft={draft}
                  attachedActions={attachedActions}
                  onApprove={approveDraft}
                  onApproveAndApply={approveDraftAndApply}
                  onReject={rejectDraft}
                  inFlight={actionInFlight}
                />
              )}
```

- [ ] **Step 6.3: Verify the file still parses**

Run:
```bash
cd /Users/leamonline/Documents/GitHub/Smarter-dogs-smart-humans
npm run build
```

Expected: build succeeds with no errors. (If `npm run build` runs Vite production build, this is the most reliable check that the JSX is valid.)

If you see syntax errors, read the message — most likely a misplaced brace or missing closing tag from the Step 5.5 replacement. Fix in place and retry.

- [ ] **Step 6.4: Commit Tasks 5 + 6 together**

```bash
git add src/components/views/WhatsAppInboxView.jsx
git commit -m "$(cat <<'EOF'
feat(whatsapp-inbox): gate Approve with dual buttons when booking attached

When a draft has at least one attached pending booking_action, the
DraftPanel renders an amber banner showing what's attached (dog · date
· slot) and replaces the single Approve button with "Approve & Apply"
(default, primary) and "Send reply only" (override). Editing mode
mirrors with "Send edit & Apply" / "Send edit only".

When no action is attached, the panel renders exactly as before —
single "Approve & send" button, no banner. Zero behaviour change for
non-booking drafts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Manual smoke test

This task seeds a test draft + matching booking_action via SQL, exercises three positive cases plus a regression check in the localhost dev server, then cleans up.

**Files:** none (transient SQL via Supabase MCP).

**Pre-requisites:**
- Localhost dev server running: `npm run dev` (defaults to http://localhost:5173).
- The Supabase MCP `execute_sql` tool loaded (`ToolSearch select:mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__execute_sql` if not already).

- [ ] **Step 7.1: Confirm there's no leftover test draft from a prior run**

Run via `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__execute_sql`:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `query`:
```sql
select count(*) as leftover_drafts
  from whatsapp_drafts
 where proposed_text like '[TEST]%';
```

Expected: `[{"leftover_drafts": 0}]`. If non-zero, run the teardown SQL from Step 7.7 first.

- [ ] **Step 7.2: Setup — seed Test 1 (happy path)**

Run via `execute_sql`:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `query`:
```sql
do $$
declare
  v_conversation_id uuid := '8a165012-2a00-4659-adc0-254644b1ae9f';
  v_dog_id uuid := '91f5e990-1866-4686-a39e-5f6cf3cdd603';  -- Alfie (small Boston Terrier)
  v_test_date date;
  v_slot text := '10:00';
  v_draft_id uuid;
  v_action_id uuid;
begin
  -- Pick the next Monday at least 7 days out (avoids today's diary).
  v_test_date := current_date + ((8 - extract(dow from current_date)::int) % 7 + 7);

  insert into whatsapp_drafts (
    conversation_id, proposed_text, intent, confidence, state, model
  ) values (
    v_conversation_id,
    '[TEST] Of course! Alfie''s in for a full groom — would ' ||
      to_char(v_test_date, 'Dy DD Mon') || ' at ' || v_slot ||
      ' work? We''ll get this passed to the team to confirm. 🐾' || E'\n\n🎓🐶❤️ X',
    'booking_propose',
    0.9,
    'pending',
    'claude-sonnet-4-6'
  ) returning id into v_draft_id;

  insert into whatsapp_booking_actions (
    conversation_id, draft_id, action, payload, state
  ) values (
    v_conversation_id,
    v_draft_id,
    'create',
    jsonb_build_object(
      'dog_id', v_dog_id,
      'dog_name', 'Alfie',
      'booking_date', v_test_date::text,
      'slot', v_slot,
      'service', 'full-groom',
      'size', 'small'
    ),
    'pending'
  ) returning id into v_action_id;

  raise notice 'Test 1 setup: draft=% action=% date=% slot=%',
    v_draft_id, v_action_id, v_test_date, v_slot;
end;
$$;
```

Expected: notice line confirming the draft + action IDs and the chosen date.

- [ ] **Step 7.3: Test 1 — Approve & Apply happy path**

In the browser at `http://localhost:5173/whatsapp`:

1. Hard-refresh the page (Cmd+Shift+R) so the dev server picks up your code changes and reloads the realtime subscription.
2. In the conversation list, click the conversation for `+447540550564` (should have a 1-draft badge).
3. Verify the DraftPanel shows the test draft text.
4. **Verify the new banner is present:** `📋 Booking attached: Alfie · {short date} · 10:00`
5. **Verify the buttons are:** `Approve & Apply` (primary purple), `Send reply only` (secondary), `Edit first`, `Reject`.
6. Click **Approve & Apply**.
7. Verify in this order:
   - The buttons disable briefly while in flight.
   - The DraftPanel disappears (draft state → `approved`).
   - The BookingActionPanel disappears (action state → `applied`).
   - Navigate to the Weekly Calendar (`/bookings` or `/`) and find the chosen date — Alfie's full groom appears at 10:00.

If any step fails, capture the error from the inline error display or the browser console and STOP.

- [ ] **Step 7.4: Cleanup Test 1 + Setup Test 2 (override path)**

Run via `execute_sql`:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `query`:
```sql
-- Cleanup Test 1's resulting booking and any leftover test rows.
delete from bookings
 where dog_id = '91f5e990-1866-4686-a39e-5f6cf3cdd603'
   and booking_date >= current_date + 7
   and slot = '10:00';
delete from whatsapp_booking_actions
 where draft_id in (
   select id from whatsapp_drafts where proposed_text like '[TEST]%'
 );
delete from whatsapp_drafts where proposed_text like '[TEST]%';

-- Re-seed for Test 2 (same shape as Step 7.2 but a different slot
-- to avoid colliding with anything Test 1 might have left behind).
do $$
declare
  v_conversation_id uuid := '8a165012-2a00-4659-adc0-254644b1ae9f';
  v_dog_id uuid := '91f5e990-1866-4686-a39e-5f6cf3cdd603';
  v_test_date date;
  v_slot text := '11:00';
  v_draft_id uuid;
begin
  v_test_date := current_date + ((8 - extract(dow from current_date)::int) % 7 + 7);

  insert into whatsapp_drafts (
    conversation_id, proposed_text, intent, confidence, state, model
  ) values (
    v_conversation_id,
    '[TEST] Test 2 — override. Alfie at ' || to_char(v_test_date, 'Dy DD Mon') ||
      ' ' || v_slot || ' · 🎓🐶❤️ X',
    'booking_propose', 0.9, 'pending', 'claude-sonnet-4-6'
  ) returning id into v_draft_id;

  insert into whatsapp_booking_actions (
    conversation_id, draft_id, action, payload, state
  ) values (
    v_conversation_id, v_draft_id, 'create',
    jsonb_build_object(
      'dog_id', v_dog_id, 'dog_name', 'Alfie',
      'booking_date', v_test_date::text, 'slot', v_slot,
      'service', 'full-groom', 'size', 'small'
    ),
    'pending'
  );

  raise notice 'Test 2 setup: draft=%', v_draft_id;
end;
$$;
```

Expected: cleanup deletes anything leftover, then a notice line for the new Test 2 draft.

- [ ] **Step 7.5: Test 2 — Send reply only override**

Back in the browser:

1. Hard-refresh, click the conversation, verify banner + dual buttons appear.
2. Click **Send reply only**.
3. Verify:
   - The DraftPanel disappears (draft → `approved`).
   - The BookingActionPanel **stays visible** below the thread, still showing the pending booking_action with its own Apply / Reject buttons.
4. Click **Add to diary** on the BookingActionPanel.
5. Verify the booking appears in the Weekly Calendar at 11:00.

This proves the deliberate-split workflow still works.

- [ ] **Step 7.6: Test 3 — Apply error surfaces, reply not sent**

This test seeds a draft + action where the slot is already booked, so the `apply_whatsapp_booking_action` RPC will fail and the dual-button flow should NOT send the reply.

Run setup via `execute_sql`:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `query`:
```sql
-- Cleanup any leftover test rows.
delete from whatsapp_booking_actions
 where draft_id in (
   select id from whatsapp_drafts where proposed_text like '[TEST]%'
 );
delete from whatsapp_drafts where proposed_text like '[TEST]%';

do $$
declare
  v_conversation_id uuid := '8a165012-2a00-4659-adc0-254644b1ae9f';
  v_dog_id uuid := '91f5e990-1866-4686-a39e-5f6cf3cdd603';
  v_other_dog_id uuid;  -- a different small dog to seed the conflicting booking
  v_test_date date := current_date + 14;  -- two weeks out (less likely to collide)
  v_slot text := '12:30';
  v_draft_id uuid;
begin
  -- Find any other small dog (not Alfie) for the conflicting booking.
  select id into v_other_dog_id
    from dogs
   where size = 'small' and id <> v_dog_id
   limit 1;

  if v_other_dog_id is null then
    raise exception 'No other small dog available — cannot seed conflict';
  end if;

  -- Seed a booking that fills 12:30 (small dogs cap = 2 by default; use
  -- two of the same size to ensure cap is hit when we add Alfie later).
  insert into bookings (booking_date, slot, dog_id, size, service)
    values (v_test_date, v_slot, v_other_dog_id, 'small', 'full-groom');
  insert into bookings (booking_date, slot, dog_id, size, service)
    values (v_test_date, v_slot, v_other_dog_id, 'small', 'full-groom');

  -- Now seed the test draft + action proposing the same full slot.
  insert into whatsapp_drafts (
    conversation_id, proposed_text, intent, confidence, state, model
  ) values (
    v_conversation_id,
    '[TEST] Test 3 — error path. Alfie at ' || to_char(v_test_date, 'Dy DD Mon') ||
      ' ' || v_slot || ' · 🎓🐶❤️ X',
    'booking_propose', 0.9, 'pending', 'claude-sonnet-4-6'
  ) returning id into v_draft_id;

  insert into whatsapp_booking_actions (
    conversation_id, draft_id, action, payload, state
  ) values (
    v_conversation_id, v_draft_id, 'create',
    jsonb_build_object(
      'dog_id', v_dog_id, 'dog_name', 'Alfie',
      'booking_date', v_test_date::text, 'slot', v_slot,
      'service', 'full-groom', 'size', 'small'
    ),
    'pending'
  );

  raise notice 'Test 3 setup: filled slot %, draft=%, conflict_dog=%',
    v_slot, v_draft_id, v_other_dog_id;
end;
$$;
```

Expected: notice line with the seeded draft id and the conflict dog id.

In the browser:

1. Hard-refresh, click the conversation, verify banner + dual buttons.
2. Click **Approve & Apply**.
3. Verify:
   - Inline error message appears in the DraftPanel (red background) with text mentioning "Apply failed for Alfie" or similar — the exact wording comes from the trigger ("Slot is full" or "Capped at 1 (2-2-1 rule)").
   - The DraftPanel **stays visible** (draft still `pending`).
   - The BookingActionPanel **stays visible** with the action still pending.
   - No new outbound row in `whatsapp_messages` (the reply did NOT send).

Verify "no reply was sent" via:
```sql
select count(*) as outbound_count
  from whatsapp_messages
 where conversation_id = '8a165012-2a00-4659-adc0-254644b1ae9f'
   and direction = 'outbound'
   and content like '[TEST] Test 3%';
```
Expected: `[{"outbound_count": 0}]`.

- [ ] **Step 7.7: Teardown — clean up all test data**

Run via `execute_sql`:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `query`:
```sql
-- Remove any test bookings we created during the smoke tests.
delete from bookings
 where dog_id = '91f5e990-1866-4686-a39e-5f6cf3cdd603'
   and booking_date >= current_date + 7;
-- Also remove the conflict bookings seeded by Test 3.
delete from bookings
 where booking_date in (current_date + 14)
   and slot = '12:30'
   and service = 'full-groom';

delete from whatsapp_booking_actions
 where draft_id in (
   select id from whatsapp_drafts where proposed_text like '[TEST]%'
 );
delete from whatsapp_drafts where proposed_text like '[TEST]%';

-- Confirm clean
select
  (select count(*) from whatsapp_drafts where proposed_text like '[TEST]%') as drafts,
  (select count(*) from whatsapp_booking_actions where payload->>'dog_name' = 'Alfie' and state = 'pending'
     and conversation_id = '8a165012-2a00-4659-adc0-254644b1ae9f'
     and (payload->>'booking_date')::date >= current_date + 7) as actions;
```

Expected: `[{"drafts": 0, "actions": 0}]`.

If non-zero, run the deletes again or investigate manually.

- [ ] **Step 7.8: Test 4 — Regression (no attachment)**

This test confirms that drafts with NO attached booking_action still render with the original single-button layout. It exercises the fallthrough path in `approveDraftAndApply` and the no-attachment branch of the DraftPanel.

Run setup via `execute_sql`:
- `project_id`: `nlzhllhkigmsvrzduefz`
- `query`:
```sql
do $$
declare
  v_conversation_id uuid := '8a165012-2a00-4659-adc0-254644b1ae9f';
  v_draft_id uuid;
begin
  insert into whatsapp_drafts (
    conversation_id, proposed_text, intent, confidence, state, model
  ) values (
    v_conversation_id,
    '[TEST] Test 4 — no attachment. Just a draft, no booking. 🎓🐶❤️ X',
    'faq', 0.95, 'pending', 'claude-sonnet-4-6'
  ) returning id into v_draft_id;
  raise notice 'Test 4 setup: draft=% (no booking_action)', v_draft_id;
end;
$$;
```

In the browser:

1. Hard-refresh, click the conversation.
2. Verify:
   - **No banner.** The amber "📋 Booking attached" banner is not present.
   - Buttons are: `Approve & send` (primary), `Edit first`, `Reject` — exactly the pre-feature layout.
3. Click **Approve & send**.
4. Verify the draft moves to `approved` and the reply is sent (outbound `whatsapp_messages` row appears).

Cleanup the Test 4 draft:
```sql
delete from whatsapp_drafts where proposed_text like '[TEST] Test 4%';
```

- [ ] **Step 7.9: No commit (manual test only)**

This task has no file changes. Skip the commit step.

If any test failed, fix the underlying bug, redo the affected step. Don't commit fixes from smoke tests as a single bulk commit — make a separate `fix(...)` commit for each issue surfaced.

---

## Task 8: Push branch and open PR

**Files:** none (git operations).

- [ ] **Step 8.1: Verify the branch is in shape**

Run:
```bash
cd /Users/leamonline/Documents/GitHub/Smarter-dogs-smart-humans
git log --oneline main..feat/two-approval-ux-coupling
git status
```

Expected commits (in order):
- `77496fd docs(whatsapp-inbox): two-approval UX coupling spec`
- (Task 1) `refactor(whatsapp-inbox): include draft_id in booking_actions select + extract filterAttachedActions helper`
- (Task 2) `test(whatsapp-inbox): unit tests for filterAttachedActions helper`
- (Task 4) `feat(whatsapp-inbox): wire attachedActions + approveDraftAndApply through hook`
- (Tasks 5+6 combined) `feat(whatsapp-inbox): gate Approve with dual buttons when booking attached`
- (Plus this plan, if you committed it separately — see Step 8.2.)

Working tree should be clean.

- [ ] **Step 8.2: Commit this plan if not already committed**

If `docs/superpowers/plans/2026-04-28-two-approval-ux-coupling.md` is untracked or modified:

```bash
git add docs/superpowers/plans/2026-04-28-two-approval-ux-coupling.md
git commit -m "$(cat <<'EOF'
docs(whatsapp-inbox): two-approval UX coupling implementation plan

Step-by-step plan for the frontend gate: hook changes (attachedActions
useMemo + approveDraftAndApply callback), DraftPanel banner + dual
buttons, pure-function unit test for the filter helper, and a manual
smoke test with SQL setup/teardown using Leam's existing test
conversation and Alfie.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8.3: Push the branch**

```bash
git push -u origin feat/two-approval-ux-coupling
```

- [ ] **Step 8.4: Open the PR**

```bash
gh pr create --title "feat(whatsapp-inbox): two-approval UX coupling" --body "$(cat <<'EOF'
## Summary

Closes the trust footgun where staff can approve a WhatsApp draft (sending it to the customer) without applying the attached `booking_action` — leaving the customer with false expectations about their booking.

When a draft has at least one attached pending `booking_action`, the inbox's DraftPanel now shows:
- An inline amber banner: *"📋 Booking attached: {dog} · {date} · {slot}"*
- Two buttons in place of the single "Approve & send":
  - **Approve & Apply** (primary) — applies the action(s) then sends the reply
  - **Send reply only** (secondary) — explicit override for the deliberate-split workflow

When a draft has no attachment, the panel renders exactly as before. Zero behaviour change for non-booking drafts.

## What changed

- **`src/supabase/hooks/useWhatsAppInbox.js`**:
  - Added `draft_id` to the `whatsapp_booking_actions` SELECT so the filter has the column it needs.
  - Exported pure helper `filterAttachedActions(draft, bookingActions)`.
  - New derived `attachedActions` via `useMemo`.
  - New `approveDraftAndApply` callback: applies each attached action sequentially (stops on first error), then sends the reply only if all applies succeeded. On apply error: reply not sent, error surfaced. On send error after a successful apply: error message instructs staff to send manually.
  - Returns `attachedActions` and `approveDraftAndApply` from the hook.
- **`src/components/views/WhatsAppInboxView.jsx`**:
  - Added `formatShortDate` helper for the banner format.
  - `DraftPanel` accepts new `attachedActions` and `onApproveAndApply` props.
  - Banner renders when `attachedActions.length > 0`.
  - Default and editing modes render dual buttons when attached; unchanged otherwise.
  - `WhatsAppInboxView` destructures the new fields from the hook and passes them through.
- **`src/supabase/hooks/useWhatsAppInbox.test.js`** (new):
  - 5 unit tests for `filterAttachedActions`: null draft, non-array bookingActions, no match, applied/rejected excluded, single match, multiple matches in order.

## What didn't change

- No DB migration. No edge function changes. The state machine on `whatsapp_booking_actions` (`pending` / `applied` / `rejected`) already encoded everything.
- BookingActionPanel is unchanged. Standalone Apply still works for drafts where staff opted to defer or for actions on prior drafts.
- Reject flow is unchanged. Rejecting the draft and rejecting the action are still independent decisions.

## Spec & plan

- Spec: [docs/superpowers/specs/2026-04-28-two-approval-ux-coupling-design.md](docs/superpowers/specs/2026-04-28-two-approval-ux-coupling-design.md)
- Plan: [docs/superpowers/plans/2026-04-28-two-approval-ux-coupling.md](docs/superpowers/plans/2026-04-28-two-approval-ux-coupling.md)

## Test plan

- [x] Unit tests for `filterAttachedActions`: 5 cases pass via `npx vitest run`
- [x] Build succeeds (`npm run build`)
- [x] **Manual smoke Test 1 — Approve & Apply happy path**: banner shows, dual buttons render, click Approve & Apply → action applied + reply sent + booking appears in Weekly Calendar
- [x] **Manual smoke Test 2 — Send reply only override**: click Send reply only → draft approved + reply sent, action stays pending in BookingActionPanel; click Add to diary → booking created
- [x] **Manual smoke Test 3 — Apply error**: seeded a full slot; click Approve & Apply → error displayed inline, draft stays pending, reply NOT sent (verified via `whatsapp_messages` count)
- [x] **Manual smoke Test 4 — Regression (no attachment)**: draft with no booking_action renders single "Approve & send" button as before; no banner; click → reply sends as today
- [ ] Watch the next ~5 inbound bookings via WhatsApp for any UX regressions

## Out of scope

- React component snapshot test (would require adding JSDOM + RTL infrastructure for one test). Pure-function helper test covers the meaningful logic; manual smoke covers the rendered UI.
- Reverse case: Apply on BookingActionPanel without sending the draft — unchanged. That isn't the trust footgun (customer doesn't have false expectations, just no status update yet).
- Auto-rejecting the booking_action when staff rejects the draft — kept independent.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: a PR URL printed back. Capture it for follow-up.

- [ ] **Step 8.5: Done**

Wait for CI to go green (`build` workflow runs lint + Vitest + Vite build). If anything fails, read the log and fix on the branch.

---

## Self-review

### Spec coverage

- ✅ Frontend-only gate, no DB/edge changes — Tasks 1–6 all touch only React + hook code
- ✅ Filter logic `draft_id === current draft AND state === 'pending'` — Task 1.2 (helper) + Task 3.2 (`useMemo` wiring)
- ✅ Banner format "📋 Booking attached: {dog} · {date} · {slot}" — Task 5.4
- ✅ "Approve & Apply" + "Send reply only" buttons in default mode when attached — Task 5.5
- ✅ "Send edit & Apply" + "Send edit only" buttons in editing mode when attached — Task 5.5
- ✅ Single "Approve & send" preserved when not attached — Task 5.5 default-mode-no-attachment branch
- ✅ Apply-then-send order, stop on first apply error — Task 4.1 (sequential `for` loop with early `return`)
- ✅ Send-failure message mentions "booking was applied — send manually" — Task 4.1 step 3
- ✅ "Send reply only" override calls existing `approveDraft` unchanged — Task 5.5 wiring (calls `handleApprove(false)`)
- ✅ BookingActionPanel unchanged — confirmed by Task scope (no `BookingActionPanel` modifications)
- ✅ Reject flow unchanged — confirmed by Task scope (rejecting branch in Task 5.5 is identical to original)
- ✅ Realtime subscriptions unchanged — confirmed by Task scope
- ✅ Pure-function unit test for filter — Task 2
- ✅ Manual smoke test exercises happy path, override, error, regression — Task 7 Tests 1–4
- ⚠️ **Deviation from spec:** spec named a Vitest snapshot test for `DraftPanel`. Plan substitutes a pure-function unit test (Task 2) plus the manual smoke (Task 7). Reason: the existing Vitest config is `environment: "node"` with no JSDOM; adding RTL infrastructure for one snapshot is disproportionate. Documented in the testing-approach section above.

### Placeholder scan

No "TBD", "TODO", "implement later", or "similar to Task N" patterns. All code blocks are complete and copy-pasteable.

### Type consistency

- `filterAttachedActions(draft, bookingActions)` — defined in Task 1.2 with two args (draft can be null/undefined; bookingActions can be non-array). Used identically in Task 2 (test) and Task 3.2 (`useMemo`).
- `approveDraftAndApply({ editedText })` — defined in Task 4.1 with `{ editedText }` destructuring. Called in Task 5.3 (`onApproveAndApply(useEditedText ? { editedText } : {})`) — same shape as the existing `onApprove` call.
- `attachedActions` — array of action rows with `id`, `draft_id`, `state`, `payload` (object). Consumed in DraftPanel banner (Task 5.4) via `action.id`, `action.payload?.dog_name`, `action.payload?.booking_date`, `action.payload?.slot`. All optional-chained, fallbacks present.
- `whatsapp_booking_actions.action` enum: `'create' | 'reschedule' | 'cancel'` — Task 7 SQL uses `'create'` (matches migration 026).
- `whatsapp_booking_actions.draft_id` is nullable uuid — filter's `=== draft.id` correctly excludes null draft_ids and other-draft draft_ids.
