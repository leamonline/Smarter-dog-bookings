# WhatsApp Inbox — Two-Approval UX Coupling

**Date:** 2026-04-28
**Approach:** Frontend-only gate with explicit override; no DB changes
**Scope:** `src/components/views/WhatsAppInboxView.jsx` + `src/supabase/hooks/useWhatsAppInbox.js`

## Background

The WhatsApp staff inbox shows two independent panels when the AI agent has emitted both a draft reply AND a booking proposal in response to a customer enquiry: the **DraftPanel** (with Approve / Edit / Reject) and the **BookingActionPanel** (with Apply / Reject per action). The Approve button on the draft sends the reply to the customer via the `whatsapp-send` edge function. The Apply button on a booking_action calls `apply_whatsapp_booking_action` (RPC from migration 033) which inserts the booking row.

The two are linked at the database level via `whatsapp_booking_actions.draft_id`, but **the UI treats them as fully independent**. Staff can click Approve on the draft (sending the reply) without first clicking Apply on the booking_action. The customer receives a soft-confirmation reply ("we'll get this passed to the team and we'll confirm once it's in the diary") while no actual booking row exists in the diary. If staff forgets to come back and apply, the customer's expectation diverges from reality — the trust footgun PR [#58](https://github.com/leamonline/Smarter-dog-bookings/pull/58) flagged as a follow-up.

Current temporary mitigation: a banned-phrase list in the system prompt (`pencilled in`, `booked in`, `you're in`, `all booked`, etc.) keeps the agent's language soft so the gap is at least less misleading. That's papering over the real problem.

This spec couples the two approvals at the UI level: when staff approves a draft that has an attached pending booking_action, the default action applies the booking AND sends the reply in one click. An explicit "Send reply only" override remains for the deliberate-split case.

## Goal

When a draft has at least one attached pending booking_action:

- The default Approve button is replaced by **Approve & Apply** — a single click that applies the booking and then sends the reply.
- An explicit **Send reply only** button preserves the deliberate-split workflow (reply goes out now, booking applied later).
- An inline banner above the buttons shows what's attached (dog, date, slot) so staff can sanity-check before clicking.
- Apply is attempted **before** send. If apply fails (slot raced, validation error), no reply is sent and the error surfaces inline.

When a draft has no attached pending booking_action, the panel renders exactly as today (single Approve button, no banner).

The reverse case — clicking Apply on the BookingActionPanel without sending the reply — is **unchanged**. That isn't the trust footgun (the customer doesn't have false expectations; they just don't have an updated status yet), and staff might want to apply now and craft a custom reply.

## Non-goals

- **DB changes.** No new states, no new columns. The state machine on `whatsapp_booking_actions` (`pending` / `applied` / `rejected`) already encodes "staff hasn't decided yet."
- **Edge function changes.** `whatsapp-send` and `apply_whatsapp_booking_action` are unchanged.
- **Auto-rejecting the booking_action when staff rejects the draft.** Independent decisions; staff can reject each separately.
- **Coupling Apply → auto-send draft.** Out of scope for the reasons above.
- **Refactoring the BookingActionPanel.** It still works as today for actions on prior drafts and actions where staff opted to defer.
- **Visual redesign.** This work reuses the existing amber/slate tokens and button shapes; no design-system change.

## Architecture

Three changes, all in two files. No DB migration, no edge function deploy.

### Changed: `src/supabase/hooks/useWhatsAppInbox.js`

**New derived state — `attachedActions`:**

```js
const attachedActions = useMemo(
  () =>
    draft
      ? bookingActions.filter(
          (a) => a.draft_id === draft.id && a.state === "pending",
        )
      : [],
  [draft, bookingActions],
);
```

Returned from the hook alongside the existing fields. Filter is `draft_id === current draft AND state still pending` — old-draft actions and unattached actions don't gate the current draft.

**New action — `approveDraftAndApply({ editedText })`:**

Sketch:

```js
const approveDraftAndApply = useCallback(async ({ editedText } = {}) => {
  if (!draft || actionInFlight) return { ok: false, reason: "no draft or action in flight" };
  if (attachedActions.length === 0) return approveDraft({ editedText });

  setActionInFlight(true);
  try {
    // 1. Apply each attached action sequentially. Stop on first error.
    const applied = [];
    for (const action of attachedActions) {
      const { data, error } = await supabase.rpc("apply_whatsapp_booking_action", {
        p_action_id: action.id,
      });
      if (error) {
        return {
          ok: false,
          reason: `Apply failed for ${action.payload?.dog_name ?? "booking"}: ${error.message}`,
          appliedSoFar: applied,
        };
      }
      applied.push({ actionId: action.id, bookingId: data });
    }

    // 2. Optimistic: clear applied actions from local state.
    setBookingActions((prev) =>
      prev.filter((a) => !applied.some((x) => x.actionId === a.id)),
    );

    // 3. Send the reply.
    const { data, error } = await supabase.functions.invoke(SEND_FUNCTION_PATH, {
      body: {
        mode: "draft",
        draft_id: draft.id,
        ...(editedText ? { edited_text: editedText } : {}),
      },
    });
    if (error || data?.error) {
      return {
        ok: false,
        reason: (error?.message ?? data?.error ?? "Send failed") +
          " (booking was applied — please send the reply manually)",
        appliedSoFar: applied,
      };
    }

    // 4. Optimistic: clear pending draft, flip both list-pane badges off.
    setDraft(null);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedIdRef.current
          ? { ...c, has_pending_draft: false, has_pending_booking_action: false }
          : c,
      ),
    );

    return { ok: true, applied, sendResult: data };
  } catch (err) {
    return { ok: false, reason: err.message ?? String(err) };
  } finally {
    setActionInFlight(false);
  }
}, [draft, attachedActions, actionInFlight, approveDraft]);
```

**Order rationale:** apply-then-send (sequential, not parallel). If apply fails, no misleading reply goes out. If apply succeeds and send fails, the booking is real and staff can manually retry the send via the compose box.

**Existing actions — unchanged:**

- `approveDraft({ editedText })` — used directly when no attachment, AND used by the "Send reply only" button as the explicit override path.
- `applyBookingAction(actionId)` — unchanged. Used by BookingActionPanel for standalone Apply.
- `rejectDraft`, `rejectBookingAction` — unchanged.

**Realtime subscriptions** — no change. The optimistic updates are convergent with the realtime echo from the `whatsapp_drafts` and `whatsapp_booking_actions` channels.

### Changed: `src/components/views/WhatsAppInboxView.jsx`

**`WhatsAppInboxView`:** destructure the new `approveDraftAndApply` and `attachedActions` from the hook, pass them as props into `DraftPanel`.

**`DraftPanel`:** new prop `attachedActions` and a new prop `onApproveAndApply`. The panel switches buttons based on `attachedActions.length > 0`.

**Default mode, with attached action(s):**

```
┌─────────────────────────────────────────────┐
│ {draft text preview}                        │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 📋 Booking attached:                    │ │  ← amber-tinted banner
│ │ Alfie · Mon 27 Apr · 09:00              │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Approve & Apply] [Send reply only]         │  ← primary + secondary
│ [Edit first] [Reject]                       │  ← unchanged
└─────────────────────────────────────────────┘
```

If multiple attached actions, banner lists each on its own line.

**Editing mode, with attached action(s):**

```
[Send edit & Apply]   ← primary
[Send edit only]      ← secondary
[Cancel edit]         ← unchanged
```

**Rejecting mode:** unchanged.

**Default mode, no attached action:** unchanged. Single "Approve & send" button as today.

**Banner data source:** for each attached action, render a one-line summary derived from `action.payload`:

- Dog name (from `payload.dog_name` or fallback to "booking" if missing)
- Booking date (formatted "Mon 27 Apr")
- Slot (HH:MM)

Fallback if `payload.dog_name` is missing: `<unnamed dog>`. The BookingActionPanel below already renders a richer card; the banner stays terse.

**Banner styling:** amber-50 background, amber-200 border, amber-800 text — same tokens as the existing rejecting-mode banner. Icon is a clipboard or note glyph; pure text is fine if no clean glyph available.

**Button copy reference:**
- Primary: `Approve & Apply` (default mode), `Send edit & Apply` (editing mode)
- Secondary: `Send reply only` (default mode), `Send edit only` (editing mode)

### Unchanged: `BookingActionPanel`

The Apply / Reject buttons on the booking_action panel itself stay as-is. They handle:

- Standalone Apply for actions on prior drafts (where the draft already shipped).
- Standalone Apply for actions where staff opted to defer via "Send reply only."
- Standalone Reject for any action staff doesn't want to honour.

## Data flow

```
Staff clicks "Approve & Apply"
  → hook.approveDraftAndApply({ editedText? })
    → for each action in attachedActions:
        → rpc.apply_whatsapp_booking_action(action.id)
          → 006 trigger validates capacity
          → on success: bookings row inserted, action.state → 'applied'
          → on error: return; no further actions applied
    → optimistic: clear applied actions from state
    → edge.whatsapp-send({ mode: "draft", draft_id, edited_text? })
      → Meta API call
      → on success: draft.state → 'approved', outbound message recorded
      → on error: surface "booking was applied — send manually"
    → optimistic: clear pending draft, flip list badges
    → return { ok, applied, sendResult }

Staff clicks "Send reply only"
  → hook.approveDraft({ editedText? })  (existing path, unchanged)
    → edge.whatsapp-send({ mode: "draft", draft_id, edited_text? })
    → action stays 'pending'; BookingActionPanel still shows it below
```

## Failure modes

| Scenario | Behaviour |
|---|---|
| Apply RPC errors (slot raced, rule violation) | Surface error inline (red bg, same as existing draft errors). Don't send reply. Action stays `pending`. Staff can fix and retry, or fall back to "Send reply only." |
| Apply succeeds, Meta send fails | Booking applied, reply not sent. Error: *"booking was applied — please send the reply manually"*. Staff sends via the compose box. Draft stays in `pending` state because `whatsapp-send` only marks it `approved` on successful send. |
| Multiple attached actions, partial apply success | Realistic frequency ~zero (agent emits 0–1 per draft). Loop stops on first failure. Already-applied stay applied. Don't send. Surface error. No automatic rollback. Staff manually compensates. Documented as a known edge. |
| Staff clicks "Send reply only" | Reply sent via existing `approveDraft` path. Action stays `pending`. BookingActionPanel below still shows it. |
| Staff edits, then "Send edit & Apply" | Same as Approve & Apply but with edited text passed to `whatsapp-send`. Apply happens first; if it fails, edits preserved in textarea. |
| Staff clicks Reject | Draft → `rejected`. Action stays `pending`. No coupling. |
| Action's `draft_id` is NULL (not linked to any draft) | Excluded from `attachedActions`. No gating. Renders in BookingActionPanel as today. |
| Action's `draft_id` matches a different (older) draft | Filter excludes it. Old-draft actions render in BookingActionPanel separately. |
| Realtime echo races optimistic update | Same direction (pending → applied/sent). UI converges. `actionInFlight` flag prevents double-clicks. |

## Testing

Repo pattern (per PR #58, #61): minimal automated tests, manual smoke as the meaningful check.

### Automated (Vitest)

1. **Snapshot test for `DraftPanel`** — `src/components/views/__tests__/WhatsAppInboxView.test.jsx` (or co-located). Two cases: no attached action (renders single "Approve & send" button), one attached action (renders banner + "Approve & Apply" + "Send reply only"). Catches accidental copy or layout drift.
2. **Unit test for `attachedActions` derivation** — pass mock `draft` and `bookingActions` arrays, assert the filter output. Three cases: no draft, draft with no matching action, draft with matching action.

### Manual smoke (the meaningful test)

A pre-test SQL setup script creates a pending draft + matching booking_action, then teardown deletes them.

**Setup** (run via Supabase MCP `execute_sql`):

1. Find Leam's existing test conversation (`8a165012-…`) and Alfie's dog ID.
2. Insert a `whatsapp_drafts` row in `pending` state with realistic text.
3. Insert a `whatsapp_booking_actions` row with `draft_id` set to the new draft's id, `action = 'create'`, `state = 'pending'`, payload with Alfie's dog_id, a near-future weekday, and a slot that's currently free.

**Test 1 — Approve & Apply happy path:**

1. Open inbox on localhost, select the test conversation.
2. Verify banner appears with "Alfie · {date} · {slot}" and two buttons present.
3. Click "Approve & Apply."
4. Verify: action moves to `applied`, draft moves to `approved`, booking row appears in Weekly Calendar at the right slot, reply sends to the customer.

**Test 2 — Send reply only override:**

1. Re-run setup.
2. Click "Send reply only."
3. Verify: draft moves to `approved`, reply sent, action stays `pending` and visible in BookingActionPanel below.
4. Click Apply on the BookingActionPanel. Verify the booking is created.

**Test 3 — Apply error surfaces, reply not sent:**

1. Set up a test draft with a booking_action whose slot is full (or seed a competing booking that occupies the slot).
2. Click "Approve & Apply."
3. Verify: error appears inline, no reply sent (no new outbound `whatsapp_messages` row), booking_action stays `pending`. Recovery: click "Send reply only" or Reject.

**Test 4 — Regression check (no attachment):**

1. Open a conversation with a draft that has no booking_action (e.g. a large-dog enquiry from PR #61).
2. Verify: single "Approve & send" button as today, no banner. Click → reply sends, draft → `approved`. Identical to pre-feature behaviour.

**Teardown:** delete the test draft and action rows.

### Out of scope for testing

- Actual race condition where someone else books the slot mid-flow. Already handled at the trigger level; we just verify the UI surfaces the error gracefully.
- Multiple-attached-actions case. Realistic frequency is zero; the code handles it but we don't seed a test for it.

## Rollout

1. Branch from `main` (PR #61 still open at time of writing — this work doesn't conflict).
2. Implement per the implementation plan (separate doc under `docs/superpowers/plans/`).
3. Vitest runs in CI on PR open; manual smoke tests run on a Vercel preview deploy.
4. Merge after preview-deploy smoke passes.
5. Watch the next ~5 inbound bookings via WhatsApp for any UX regressions or false positives in the gating.

## Rollback

- Frontend only. Revert the merge commit; Vercel auto-redeploys the prior build.
- No DB or edge-function changes to undo.
- `useWhatsAppInbox` and `WhatsAppInboxView` revert to their pre-feature shapes.
