# Responsive Inbox Booking Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Inbox presentation with the approved responsive three-pane communication workspace while preserving every existing data query, booking rule and messaging boundary.

**Architecture:** Add pure presentation helpers and a reducer-backed workspace state first, then build a slot-based responsive shell before extracting the existing list and thread from `InboxView`. Extract the existing Booking Desk diary as a reusable pane, compose Booking and Customer into the third pane, and keep `/inbox` plus the flagged `/booking-workspace` preview route on the same reusable surfaces without changing either route.

**Tech Stack:** React 19 JSX, Vite, Tailwind CSS 4, Supabase through existing hooks, Vitest logic/component projects, Testing Library and the browser `visualViewport`/History APIs.

**Spec:** `docs/superpowers/specs/2026-08-02-responsive-inbox-booking-desk-design.md`

## Global Constraints

- Work only on `codex/booking-desk-inbox-replacement`, stacked on Booking Desk PR #579 commit `39451c9e`; rebase onto a changed #579 head before continuing.
- Do not change `/inbox` or `/booking-workspace` route definitions, navigation labels, feature flags or deployment environment settings.
- Do not modify `src/engine/**`, pricing/policy constants, `supabase/**`, any Supabase select clause or mutation semantics.
- Reuse `useWhatsAppInbox({ includeBookingWorkspaceData: true })`; do not add fields to its query.
- Reuse existing capacity, slot-grid, occupancy and staff-booking behaviour; do not recreate the 2-2-1 rule in presentation code.
- Keep all active conversations as the default list and render the complete loaded thread.
- Booking intent may show **Booking suggested** but must never open, move or focus a panel automatically.
- Keep the status precedence and separate reply-window constraint exactly as specified; remove the New and suggested-close row chips deliberately.
- Preserve Enter to send and Shift+Enter for newline.
- All mutable workspace UI data is keyed by conversation ID; no draft, date or slot choice may leak between customers.
- Use `100dvh`, never `100vh`; the document must not become the Inbox scroller.
- No new dependencies, schema, query, route, migration or production flag changes.
- Task 8 must not start until Booking Desk PR #579 is merged or its head is explicitly frozen. Tasks 1–7 may proceed independently of that gate.
- Any whole-file relocation uses two adjacent commits: first `git mv` only, then import/behaviour edits. The pair is one tranche and must return to green before review.
- Every tranche ends with the complete CI bar:

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

- Visual checks use only `VITE_FORCE_OFFLINE=1 npm run dev`; never connect the manual viewport pass to live customer data.
- Deferred throughout: proactive `whatsapp_opted_out`, outside-hours and past-slot warnings until the authoritative fields described in the spec are available.

---

### Task 1: Pure workspace presentation model

**Review boundary:** Pure functions and logic tests only; no rendered Inbox behaviour changes.

**Files:**
- Modify: `src/components/views/inbox/helpers.js`
- Modify: `src/components/views/inbox/helpers.test.js`
- Create: `src/components/views/inbox/workspace/inboxWorkspaceModel.js`
- Create: `src/components/views/inbox/workspace/inboxWorkspaceModel.test.js`

**Interfaces:**
- Consumes: existing conversation fields, `{ dateStr: string, slot: string }[]` slot choices and the exact review-reason strings currently in `ConversationListItem.jsx:68-74`.
- Produces: `getConversationRowStatus(conversation)`, `buildDiaryDates(dateStr, count)`, `formatSlotOffer(choices)` and `appendSlotOffer(draft, choices)`.
- Reuses `formatConversationalDate(dateStr)` from `helpers.js` for customer-facing slot-offer copy. The existing `formatWhen` is not suitable because it is a relative conversation-timestamp formatter (`Today`/`Yesterday`/locale date), not the long conversational date voice used in a drafted customer message.
- `getConversationRowStatus` returns `null` or `{ key, label, tone, title, ariaLabel }`; its winner order is failed, human review, draft, booking action, unread, closed/snoozed/takeover.
- `formatSlotOffer` groups times by date and returns lines such as `Weds 6 Aug — 9:00am / 10:30am`.

The formatter split is deliberate: customer-facing message text uses the long conversational forms `Tues`, `Weds` and `Sept`, while UI chrome continues to use `en-GB` locale formatting through helpers such as `formatWhen`, `formatDayToken` and `formatShortDate`. The long form is intentional Smarter Dog brand voice, not a locale bug.

**Verified in this tranche:** status precedence, unchanged review reason text, no-source/no-badge behaviour and exact reply insertion formatting.

**Deferred from this tranche:** React rendering, reply-window constraint, reducer state and all booking UI.

- [ ] **Step 1: Write failing model tests**

First extend `helpers.test.js` with the customer-message date voice:

```js
import { formatConversationalDate } from "./helpers.js";

describe("formatConversationalDate", () => {
  it("uses the established long conversational weekday and month forms", () => {
    expect(formatConversationalDate("2025-08-06")).toBe("Weds 6 Aug");
    expect(formatConversationalDate("2025-09-02")).toBe("Tues 2 Sept");
  });
});
```

Then create the model test:

```js
import { describe, expect, it } from "vitest";
import {
  appendSlotOffer,
  buildDiaryDates,
  formatSlotOffer,
  getConversationRowStatus,
} from "./inboxWorkspaceModel.js";

describe("getConversationRowStatus", () => {
  it("chooses the highest-priority existing signal", () => {
    expect(getConversationRowStatus({
      has_failed_message: true,
      needs_human_review: true,
      has_pending_draft: true,
      has_pending_booking_action: true,
      unread_count: 4,
      state: "human_takeover",
    })?.key).toBe("failed");
  });

  it("keeps the existing combined handoff and high-risk reason", () => {
    const status = getConversationRowStatus({
      needs_human_review: true,
      whatsapp_drafts: [{ state: "pending", handoff_required: true, risk_level: "high" }],
    });
    expect(status).toMatchObject({
      label: "Action needed",
      title: "Needs review: AI flagged a handoff AND the draft is high-risk. Open to see the reason.",
      ariaLabel: "Needs review: AI flagged a handoff AND the draft is high-risk. Open to see the reason.",
    });
  });

  it("returns null when no source status exists", () => {
    expect(getConversationRowStatus({ unread_count: 0, state: "ai_handling" })).toBeNull();
  });
});

describe("formatSlotOffer", () => {
  it("groups specific times by UK display date", () => {
    expect(formatSlotOffer([
      { dateStr: "2025-08-06", slot: "09:00" },
      { dateStr: "2025-08-06", slot: "10:30" },
    ])).toBe("Weds 6 Aug — 9:00am / 10:30am");
  });

  it("appends after one blank line", () => {
    expect(appendSlotOffer("Hello Sarah", [
      { dateStr: "2025-08-06", slot: "09:00" },
    ])).toBe("Hello Sarah\n\nWeds 6 Aug — 9:00am");
  });
});

it("builds five local calendar dates without UTC drift", () => {
  expect(buildDiaryDates("2026-08-02", 5).map((item) => item.dateStr)).toEqual([
    "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
  ]);
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npm run test:logic -- src/components/views/inbox/helpers.test.js src/components/views/inbox/workspace/inboxWorkspaceModel.test.js`

Expected: FAIL because `formatConversationalDate` is not exported and `inboxWorkspaceModel.js` does not exist.

- [ ] **Step 3: Implement the minimal pure interface**

Add the brand-voice formatter beside the existing Inbox helpers:

```js
const CONVERSATIONAL_WEEKDAYS = ["Sun", "Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"];
const CONVERSATIONAL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

export function formatConversationalDate(dateStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${CONVERSATIONAL_WEEKDAYS[date.getDay()]} ${date.getDate()} ${CONVERSATIONAL_MONTHS[date.getMonth()]}`;
}
```

Import that helper into the model rather than defining another date-display owner:

```js
import { formatConversationalDate } from "../helpers.js";

const REVIEW_COPY = Object.freeze({
  both: "Needs review: AI flagged a handoff AND the draft is high-risk. Open to see the reason.",
  handoff: "Needs review: the AI explicitly flagged this conversation for human handoff. Open to see why.",
  highRisk: "Needs review: the draft is rated high-risk (bookings, refunds, complaints, medical). Open to read it.",
  fallback: "Needs review: draft is awaiting your approval.",
});

function status(key, label, tone, title, ariaLabel = title) {
  return { key, label, tone, title, ariaLabel };
}

function reviewTitle(conversation) {
  const drafts = Array.isArray(conversation?.whatsapp_drafts)
    ? conversation.whatsapp_drafts.filter((draft) => draft.state === "pending")
    : [];
  const handoff = drafts.some((draft) => draft.handoff_required === true);
  const highRisk = drafts.some((draft) => draft.risk_level === "high");
  if (handoff && highRisk) return REVIEW_COPY.both;
  if (handoff) return REVIEW_COPY.handoff;
  if (highRisk) return REVIEW_COPY.highRisk;
  return REVIEW_COPY.fallback;
}

export function getConversationRowStatus(conversation) {
  if (conversation?.has_failed_message) {
    const title = conversation.latest_failed_message?.error_message
      ? `Latest failed send: ${conversation.latest_failed_message.error_message}`
      : "Latest send failed. Open the thread to check the delivery state.";
    return status("failed", "Failed send", "danger", title);
  }
  if (conversation?.needs_human_review) {
    const title = reviewTitle(conversation);
    return status("review", "Action needed", "danger", title);
  }
  if (conversation?.has_pending_draft) {
    return status(
      "draft",
      "Draft pending",
      "warning",
      "AI has drafted a reply for this conversation — open to read it and approve, edit, or reject.",
      "AI draft pending review",
    );
  }
  if (conversation?.has_pending_booking_action) {
    return status(
      "booking-action",
      "Booking action pending",
      "success",
      "The AI is proposing a booking (create / reschedule / cancel) — open to review the proposed dog, date, and slot before applying.",
      "Booking proposal pending approval",
    );
  }
  const unread = conversation?.unread_count ?? 0;
  if (unread > 0) return status("unread", "Unread", "info", `${unread} unread`);
  if (conversation?.closed_at) return status("closed", "Closed", "neutral", "Conversation closed");
  if (conversation?.state === "snoozed") return status("snoozed", "Snoozed", "neutral", "Conversation snoozed");
  if (conversation?.state === "human_takeover") return status("takeover", "Taken over", "neutral", "Conversation taken over by staff");
  return null;
}

function parseLocalDate(dateStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function localDateStr(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildDiaryDates(dateStr, count = 5) {
  const start = parseLocalDate(dateStr);
  return Array.from({ length: count }, (_, index) => {
    const dateObj = new Date(start);
    dateObj.setDate(start.getDate() + index);
    return { dateObj, dateStr: localDateStr(dateObj) };
  });
}

function displayTime(slot) {
  const [hourValue, minute] = String(slot).split(":").map(Number);
  const suffix = hourValue >= 12 ? "pm" : "am";
  const hour = hourValue % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")}${suffix}`;
}

export function formatSlotOffer(choices) {
  const grouped = new Map();
  for (const choice of choices ?? []) {
    const times = grouped.get(choice.dateStr) ?? [];
    times.push(displayTime(choice.slot));
    grouped.set(choice.dateStr, times);
  }
  return [...grouped.entries()]
    .map(([dateStr, times]) => `${formatConversationalDate(dateStr)} — ${times.join(" / ")}`)
    .join("\n");
}

export function appendSlotOffer(draft, choices) {
  const offer = formatSlotOffer(choices);
  if (!offer) return draft;
  const prefix = String(draft || "").trimEnd();
  return prefix ? `${prefix}\n\n${offer}` : offer;
}
```

Keep the four `reviewTitle` strings byte-for-byte aligned with `ConversationListItem.jsx` until Task 6 removes the old inline decoder.

- [ ] **Step 4: Run focused logic tests**

Run: `npm run test:logic -- src/components/views/inbox/helpers.test.js src/components/views/inbox/workspace/inboxWorkspaceModel.test.js`

Expected: PASS for every precedence, reason and formatting case.

- [ ] **Step 5: Run the full CI bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Expected: all five commands exit 0.

- [ ] **Step 6: Commit the pure model tranche**

```bash
git add docs/superpowers/plans/2026-08-02-responsive-inbox-booking-desk.md docs/superpowers/specs/2026-08-02-responsive-inbox-booking-desk-design.md src/components/views/inbox/helpers.js src/components/views/inbox/helpers.test.js src/components/views/inbox/workspace/inboxWorkspaceModel.js src/components/views/inbox/workspace/inboxWorkspaceModel.test.js
git commit -m "feat(inbox): define workspace presentation model"
```

---

### Task 2: Reducer-backed workspace state and mobile history

**Review boundary:** UI state and History API behaviour only; no shell or pane rendering.

**Files:**
- Create: `src/components/views/inbox/workspace/useInboxWorkspaceState.js`
- Create: `src/components/views/inbox/workspace/useInboxWorkspaceState.component.test.jsx`

**Interfaces:**
- Consumes: `{ initialConversationId, initialDateStr, onSelectConversation }`.
- Produces: `{ state, actions }`, where `state` contains `selectedId`, `mobilePane`, `contextSection`, `contextOpen`, `workByConversation` and `dismissedSuggestionIds`.
- Each `workByConversation[id]` is `{ draft: string, dateStr: string, slots: Array<{dateStr, slot}> }`.
- Actions: `selectConversation`, `openContext`, `closeContext`, `paneBack`, `setDraft`, `setDate`, `setSlots`, `clearDraft`, `insertSlots`, `dismissSuggestion` and `syncSelectedConversation`.

**Verified in this tranche:** per-conversation isolation, breakpoint-independent state, session dismissal and same-URL mobile Back sequencing.

**Deferred from this tranche:** focus restoration, visual overlays and component composition.

- [ ] **Step 1: Write failing reducer and hook tests**

```jsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInboxWorkspaceState } from "./useInboxWorkspaceState.js";

it("keeps drafts, dates and slots isolated by conversation", () => {
  const { result } = renderHook(() => useInboxWorkspaceState({
    initialConversationId: "a",
    initialDateStr: "2026-08-02",
    onSelectConversation: vi.fn(),
  }));
  act(() => result.current.actions.setDraft("a", "Draft A"));
  act(() => result.current.actions.setSlots("a", [{ dateStr: "2026-08-03", slot: "09:00" }]));
  act(() => result.current.actions.selectConversation("b"));
  act(() => result.current.actions.setDraft("b", "Draft B"));
  expect(result.current.state.workByConversation.a.draft).toBe("Draft A");
  expect(result.current.state.workByConversation.b.draft).toBe("Draft B");
  expect(result.current.state.workByConversation.a.slots).toHaveLength(1);
});

it("maps mobile browser Back from context to thread to list", () => {
  const { result } = renderHook(() => useInboxWorkspaceState({
    initialConversationId: null,
    initialDateStr: "2026-08-02",
    onSelectConversation: vi.fn(),
  }));
  act(() => result.current.actions.selectConversation("a"));
  act(() => result.current.actions.openContext("booking"));
  act(() => window.dispatchEvent(new PopStateEvent("popstate")));
  expect(result.current.state.mobilePane).toBe("thread");
  act(() => window.dispatchEvent(new PopStateEvent("popstate")));
  expect(result.current.state.mobilePane).toBe("list");
});
```

Stub `matchMedia("(max-width: 767px)")` as matching in the history test and restore `window.history` spies after each case.

- [ ] **Step 2: Run the focused component test and confirm failure**

Run: `npm run test:component -- src/components/views/inbox/workspace/useInboxWorkspaceState.component.test.jsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the reducer state shape and public actions**

```js
const initialState = ({ initialConversationId, initialDateStr }) => ({
  selectedId: initialConversationId ?? null,
  mobilePane: initialConversationId ? "thread" : "list",
  contextSection: "customer",
  contextOpen: false,
  workByConversation: {},
  dismissedSuggestionIds: {},
  initialDateStr,
});

function workFor(state, conversationId) {
  return state.workByConversation[conversationId] ?? {
    draft: "",
    dateStr: state.initialDateStr,
    slots: [],
  };
}
```

Use immutable object maps rather than `Set` so reducer assertions stay deterministic. `insertSlots(id)` must call `appendSlotOffer` from Task 1 and retain the selected slots.

- [ ] **Step 4: Add the one-sentinel mobile history effect**

Use one same-URL sentinel while mobile depth is greater than zero. On `popstate`, dispatch one `paneBack`; reinstall the sentinel only when another depth remains. At list depth, do not intercept normal route Back. Remove listeners and any live sentinel when the hook unmounts or the viewport leaves `<768px`.

- [ ] **Step 5: Run focused state tests**

Run: `npm run test:component -- src/components/views/inbox/workspace/useInboxWorkspaceState.component.test.jsx`

Expected: PASS, including listener cleanup and no route/query-string mutation.

- [ ] **Step 6: Run the full CI bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Expected: all five commands exit 0.

- [ ] **Step 7: Commit the workspace-state tranche**

```bash
git add src/components/views/inbox/workspace/useInboxWorkspaceState.js src/components/views/inbox/workspace/useInboxWorkspaceState.component.test.jsx
git commit -m "feat(inbox): preserve workspace state across panes"
```

---

### Task 3: Dynamic viewport and iOS keyboard measurement

**Review boundary:** Extend the existing height hook without changing its return type or any booking/list behaviour.

**Files:**
- Modify: `src/components/views/inbox/hooks/useFillViewportHeight.js:1-75`
- Create: `src/components/views/inbox/hooks/useFillViewportHeight.component.test.jsx`

**Interfaces:**
- Preserves: `useFillViewportHeight(ref): number | null`.
- Adds CSS properties on the referenced element: `--inbox-shell-top`, `--inbox-bottom-gap` and `--inbox-visible-height`.
- Consumes `window.visualViewport.height` and `offsetTop` when available; falls back to `window.innerHeight`.

**Verified in this tranche:** `100dvh` support data, keyboard-open height, orientation/resize response and listener cleanup.

**Deferred from this tranche:** applying the CSS variables to the new shell.

- [ ] **Step 1: Write failing visualViewport tests**

```jsx
it("uses the visible viewport bottom while the keyboard is open", () => {
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 430, offsetTop: 12 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  const { result } = renderHook(() => useFillViewportHeight({
    current: { getBoundingClientRect: () => ({ top: 120 }), style: document.createElement("div").style },
  }));
  expect(result.current).toBeLessThanOrEqual(322);
});
```

Add cases for the existing mobile safe-area gap, desktop gap, `visualViewport` `resize`/`scroll` events and unmount cleanup.

- [ ] **Step 2: Run the focused hook test and confirm failure**

Run: `npm run test:component -- src/components/views/inbox/hooks/useFillViewportHeight.component.test.jsx`

Expected: FAIL because the hook currently reads only `window.innerHeight` and sets no CSS properties.

- [ ] **Step 3: Extend the existing computation**

```js
const viewportBottom = window.visualViewport
  ? window.visualViewport.offsetTop + window.visualViewport.height
  : window.innerHeight;
const top = el.getBoundingClientRect().top;
const available = Math.max(MIN_HEIGHT, Math.round(viewportBottom - top - bottomGap));
el.style.setProperty("--inbox-shell-top", `${Math.round(top)}px`);
el.style.setProperty("--inbox-bottom-gap", `${Math.round(bottomGap)}px`);
el.style.setProperty("--inbox-visible-height", `${available}px`);
setHeight(available);
```

Schedule repeated viewport events through one `requestAnimationFrame`, preserve the current safe-area probe and remove both visual and window listeners during cleanup.

- [ ] **Step 4: Run focused viewport tests**

Run: `npm run test:component -- src/components/views/inbox/hooks/useFillViewportHeight.component.test.jsx`

Expected: PASS for fallback, keyboard-open, resize and cleanup cases.

- [ ] **Step 5: Run the full CI bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Expected: all five commands exit 0.

- [ ] **Step 6: Commit the viewport tranche**

```bash
git add src/components/views/inbox/hooks/useFillViewportHeight.js src/components/views/inbox/hooks/useFillViewportHeight.component.test.jsx
git commit -m "fix(inbox): follow the visible mobile viewport"
```

---

### Task 4: Responsive three-pane shell primitive

**Review boundary:** A tested layout primitive with stub pane content; no Inbox orchestration is moved yet.

**Files:**
- Create: `src/components/views/inbox/workspace/InboxWorkspaceShell.jsx`
- Create: `src/components/views/inbox/workspace/InboxWorkspaceShell.component.test.jsx`

**Interfaces:**
- Consumes: `rootRef`, `fillHeight`, `mobilePane`, `contextOpen`, `contextSection`, `conversationPane`, `threadPane`, `contextPane`, `onPaneBack`, `onDismissContext` and `returnFocusRef`.
- Produces three named regions: `Conversations`, `Message thread`, and `Booking and customer context`.
- Keeps every pane mounted while CSS changes its visibility, preserving child state across breakpoint transitions.

**Verified in this tranche:** semantic regions, explicit mobile Back, overlay Escape/scrim dismissal, focus restoration and exact responsive class contract.

**Deferred from this tranche:** real list/thread/context contents and visual acceptance against the full app chrome.

- [ ] **Step 1: Write failing shell interaction tests**

```jsx
it("dismisses a context overlay with Escape and restores its trigger", () => {
  const triggerRef = { current: document.createElement("button") };
  document.body.appendChild(triggerRef.current);
  const onDismissContext = vi.fn();
  render(<InboxWorkspaceShell
    contextOpen
    contextSection="booking"
    mobilePane="context"
    returnFocusRef={triggerRef}
    onDismissContext={onDismissContext}
    conversationPane={<div>List</div>}
    threadPane={<div>Thread</div>}
    contextPane={<div>Booking</div>}
  />);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onDismissContext).toHaveBeenCalledTimes(1);
  expect(triggerRef.current).toHaveFocus();
});
```

Add cases for scrim dismissal, mobile Back and no dismissal when `contextOpen` is false.

- [ ] **Step 2: Run the focused shell test and confirm failure**

Run: `npm run test:component -- src/components/views/inbox/workspace/InboxWorkspaceShell.component.test.jsx`

Expected: FAIL because the shell does not exist.

- [ ] **Step 3: Implement the shell grid and overlay contract**

```jsx
<div
  ref={rootRef}
  style={fillHeight ? { "--inbox-visible-height": `${fillHeight}px` } : undefined}
  className="h-[var(--inbox-visible-height,calc(100dvh-var(--inbox-shell-top)-var(--inbox-bottom-gap)))] min-h-[360px] overflow-hidden bg-white"
>
  <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] min-[1440px]:grid-cols-[300px_minmax(560px,1fr)_360px]">
    {conversationPane}
    {threadPane}
    <div className="hidden min-[1440px]:flex min-h-0 border-l border-slate-200">{contextPane}</div>
  </div>
</div>
```

Each supplied pane wrapper uses `min-h-0 overflow-y-auto overscroll-contain`. Below 1440px render context as a `380px` right sheet at 1024–1439px, `min(520px, 100%)` at 768–1023px, and the sole mobile pane below 768px. Use an actual button for the scrim and no animation when `prefers-reduced-motion` matches.

- [ ] **Step 4: Run focused shell tests**

Run: `npm run test:component -- src/components/views/inbox/workspace/InboxWorkspaceShell.component.test.jsx`

Expected: PASS for regions, Back, Escape, scrim and focus restoration.

- [ ] **Step 5: Run the full CI bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Expected: all five commands exit 0.

- [ ] **Step 6: Commit the shell tranche**

```bash
git add src/components/views/inbox/workspace/InboxWorkspaceShell.jsx src/components/views/inbox/workspace/InboxWorkspaceShell.component.test.jsx
git commit -m "feat(inbox): add responsive workspace shell"
```

---

### Task 5: Relocate the Inbox controller and install the shell seam

**Review boundary:** One mechanical move commit followed by one import/composition commit; existing list, thread, actions and modals remain behaviourally unchanged.

**Files:**
- Move: `src/components/views/inbox/InboxView.jsx` -> `src/components/views/inbox/workspace/InboxWorkspaceController.jsx`
- Create: `src/components/views/inbox/InboxView.jsx`
- Modify: `src/components/views/inbox/InboxView.component.test.jsx`
- Modify: `src/components/views/inbox/workspace/InboxWorkspaceController.jsx`

**Interfaces:**
- `InboxView(props)` stays the `/inbox` entry point and delegates to `InboxWorkspaceController(props)`.
- `InboxWorkspaceController` remains the sole live-data/action orchestrator.
- The shell receives the existing inline list, thread and customer-context JSX as React-node slots; dedicated panes arrive in Tasks 6–9.

**Verified in this tranche:** route export compatibility, unchanged data/action calls and the shell mounted beneath the existing page header.

**Deferred from this tranche:** row redesign, controlled composer, Booking/Customer accordion and final breakpoints with real panes.

- [ ] **Step 1: Verify the route import shape**

Read the `/inbox` route component import in `src/App.jsx` before moving the file. It currently uses `React.lazy` with an explicit named-export adapter:

```jsx
const InboxView = lazy(() =>
  import("./components/views/inbox/InboxView.jsx").then((module) => ({
    default: module.InboxView,
  })),
);
```

Because `App.jsx` maps `module.InboxView` to the lazy component's required default, the route entry must continue to expose a **named** `InboxView` export. The planned `export { InboxView } from "./workspace/InboxWorkspaceController.jsx";` matches the actual import shape and will not fail at runtime. If this import shape changes before Task 5 starts, re-check the re-export before moving anything.

- [ ] **Step 2: Make the move-only commit**

```bash
git mv src/components/views/inbox/InboxView.jsx src/components/views/inbox/workspace/InboxWorkspaceController.jsx
git add src/components/views/inbox/workspace/InboxWorkspaceController.jsx
git commit -m "refactor(inbox): move workspace controller"
```

Do not edit, test, push or offer this first commit alone; its old import path is intentionally restored by the immediately following commit. The two commits form one review tranche.

- [ ] **Step 3: Restore the route entry and import paths**

```jsx
// src/components/views/inbox/InboxView.jsx
export { InboxView } from "./workspace/InboxWorkspaceController.jsx";
```

In the moved controller, add one directory level to every existing relative import, keep the exported function name `InboxView`, and import `InboxWorkspaceShell`, `useInboxWorkspaceState` and `useFillViewportHeight` from their final paths.

- [ ] **Step 4: Replace only the outer layout with shell slots**

Assign the current list block to `conversationPane`, the current detail block to `threadPane`, and the current `CustomerContextPanel` block to `contextPane`. Pass them unchanged into `InboxWorkspaceShell`; keep modals and the bulk action bar as siblings after the shell.

- [ ] **Step 5: Update the entry-point smoke test**

Keep `InboxView.component.test.jsx` importing `./InboxView.jsx`. Add assertions for the three named regions while retaining the existing Inbox header, empty state, filter and action tests.

- [ ] **Step 6: Run the focused entry and shell tests**

```bash
npm run test:component -- src/components/views/inbox/InboxView.component.test.jsx
npm run test:component -- src/components/views/inbox/workspace/InboxWorkspaceShell.component.test.jsx
```

Expected: PASS with existing actions still routed through the mocked `useWhatsAppInbox` object.

- [ ] **Step 7: Run the full CI bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Expected: all five commands exit 0; the tranche is green despite the mechanical first commit.

- [ ] **Step 8: Commit the controller restoration and shell seam**

```bash
git add src/components/views/inbox/InboxView.jsx src/components/views/inbox/InboxView.component.test.jsx src/components/views/inbox/workspace/InboxWorkspaceController.jsx
git commit -m "refactor(inbox): compose the controller through the shell"
```

---

### Task 6: Conversation pane and compact status row

**Review boundary:** Conversation discovery, filtering and row presentation only; thread and context nodes remain unchanged.

**Files:**
- Create: `src/components/views/inbox/workspace/ConversationPane.jsx`
- Create: `src/components/views/inbox/workspace/ConversationPane.component.test.jsx`
- Modify: `src/components/views/inbox/workspace/InboxWorkspaceController.jsx`
- Modify: `src/components/views/inbox/conversation-list/ConversationListItem.jsx:20-242`
- Modify: `src/components/views/inbox/conversation-list/ConversationListItem.component.test.jsx`
- Modify: `src/components/views/inbox/InboxView.component.test.jsx`

**Interfaces:**
- `ConversationPane` consumes existing list/search/filter state plus `selectedId`, `onSelectConversation`, selection handlers and `refreshList`.
- `ConversationListItem` consumes `status` from `getConversationRowStatus(conv)` and separately consumes `inboxWindowBadge(conv)`.
- `ConversationPane` owns the roving visible-row index; ArrowUp/ArrowDown move it and Enter calls `onSelectConversation(id)`.

**Verified in this tranche:** all-active default, exact status precedence, decoded needs-review accessibility, independent reply-window constraint, deliberate removed signals, 64–72px rows, absolute timestamps and keyboard selection.

**Deferred from this tranche:** thread/composer and Booking/Customer changes.

- [ ] **Step 1: Add failing status-row tests**

```jsx
it("renders one winning status plus an independent closing-window constraint", () => {
  render(<ConversationListItem
    conv={baseConversation({
      has_pending_draft: true,
      unread_count: 3,
      last_inbound_at: new Date(Date.now() - 23.5 * 60 * 60 * 1000).toISOString(),
      last_outbound_at: null,
    })}
    isSelected={false}
    onSelect={vi.fn()}
  />);
  expect(screen.getByText("Draft pending")).toBeInTheDocument();
  expect(screen.queryByText("3")).not.toBeInTheDocument();
  expect(screen.getByText(/Closes/)).toBeInTheDocument();
});

it("drops New and suggested-close row chips deliberately", () => {
  render(<ConversationListItem
    conv={baseConversation({ lead_status: "records_created", closure_suggested_at: new Date().toISOString(), closure_suggested_reason: "stale_30d" })}
    isSelected={false}
    onSelect={vi.fn()}
  />);
  expect(screen.queryByText("New")).not.toBeInTheDocument();
  expect(screen.queryByText(/Suggest closing/)).not.toBeInTheDocument();
});
```

Add a test that the Action needed badge's `title` and `aria-label` equal the exact `reviewTitle` returned by Task 1, and lifecycle cases for `closed_at`, `snoozed` and `human_takeover`.

- [ ] **Step 2: Add failing pane keyboard tests**

Render three visible conversations, focus the list, fire ArrowDown twice and Enter, then assert that the third ID reached `onSelectConversation`. Filter one row out and assert navigation uses only the two visible IDs.

- [ ] **Step 3: Run focused list tests and confirm failure**

```bash
npm run test:component -- src/components/views/inbox/conversation-list/ConversationListItem.component.test.jsx
npm run test:component -- src/components/views/inbox/workspace/ConversationPane.component.test.jsx
```

Expected: FAIL because the pane does not exist and the row still renders multiple old signals.

- [ ] **Step 4: Extract the list header and rows into `ConversationPane`**

Move the existing filter/search/loading/error/empty/list JSX from the controller without changing filter semantics. Give the scroller `role="listbox"`, `aria-label="Conversations"`, `overflow-y-auto` and `overscroll-contain`. Keep search backend behaviour in `useInboxMessageSearch` unchanged.

- [ ] **Step 5: Implement the compact row contract**

Use `getConversationRowStatus(conv)` once, render at most one status badge, render `inboxWindowBadge(conv)` in a separate constraint slot, remove the New and suggested-close JSX, and wrap the checkbox in a 44px target. Put the absolute `toLocaleString("en-GB")` value on the relative timestamp's `title` and `aria-label`.

- [ ] **Step 6: Run focused list and entry tests**

```bash
npm run test:component -- src/components/views/inbox/conversation-list/ConversationListItem.component.test.jsx
npm run test:component -- src/components/views/inbox/workspace/ConversationPane.component.test.jsx
npm run test:component -- src/components/views/inbox/InboxView.component.test.jsx
```

Expected: PASS for precedence, constraint coexistence, timestamps, filters and roving selection.

- [ ] **Step 7: Run the full CI bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Expected: all five commands exit 0.

- [ ] **Step 8: Commit the conversation-pane tranche**

```bash
git add src/components/views/inbox/workspace/ConversationPane.jsx src/components/views/inbox/workspace/ConversationPane.component.test.jsx src/components/views/inbox/workspace/InboxWorkspaceController.jsx src/components/views/inbox/conversation-list/ConversationListItem.jsx src/components/views/inbox/conversation-list/ConversationListItem.component.test.jsx src/components/views/inbox/InboxView.component.test.jsx
git commit -m "feat(inbox): add the compact conversation pane"
```

---

### Task 7: Full thread, controlled composer and confirmed Retry

**Review boundary:** Thread reading and reply interaction only; booking diary composition remains deferred.

**Files:**
- Create: `src/components/views/inbox/workspace/ThreadPane.jsx`
- Create: `src/components/views/inbox/workspace/ThreadPane.component.test.jsx`
- Modify: `src/components/views/inbox/workspace/InboxWorkspaceController.jsx`
- Modify: `src/components/views/inbox/thread/ComposePanel.jsx:1-185`
- Modify: `src/components/views/inbox/thread/ComposePanel.component.test.jsx`
- Modify: `src/components/views/inbox/thread/MessageBubble.jsx:1-174`
- Modify: `src/components/views/inbox/thread/MessageBubble.component.test.jsx`
- Modify: `src/components/views/inbox/InboxView.component.test.jsx`

**Interfaces:**
- `ComposePanel` gains controlled props `value`, `onChange` and `textareaRef`; it stops owning message text.
- `ThreadPane` consumes the complete existing `messages`, AI draft/action props, customer header data, `draftValue`, `onDraftChange`, `onSend`, `onRetryMessage` and Booking/Customer trigger callbacks.
- `MessageBubble` consumes `onRetry(message)` and owns its local `"idle" | "confirm" | "sending" | "succeeded" | "failed"` presentation state while the mounted thread keeps the message keyed by ID.

**Verified in this tranche:** complete chronology, sticky controlled draft, one-to-five-line growth, Enter/Shift+Enter, scroll anchoring, explicit Retry confirmation, new-send semantics and success/failure copy.

**Deferred from this tranche:** slot insertion and contextual Booking/Customer bodies.

**Retry state precondition:** Before moving Retry outcome into local `MessageBubble` state, confirm the rendered bubble is keyed by message ID rather than array index. The current thread constructs the key from `m-${m.id}` and passes it to `<MessageBubble key={item.key}>`; preserve that identity. An index key would let a newly arrived inbound message shift the mounted bubbles and put Retry success on the wrong message.

- [ ] **Step 1: Write failing controlled-composer tests**

```jsx
it("keeps Enter to send and Shift+Enter for newline", () => {
  const onSend = vi.fn();
  const onChange = vi.fn();
  render(<ComposePanel
    conversation={openWindowConversation()}
    value="Hello"
    onChange={onChange}
    onSend={onSend}
    onSendTemplate={vi.fn()}
    dogNames={[]}
    inFlight={false}
  />);
  fireEvent.keyDown(screen.getByLabelText("Write a reply"), { key: "Enter", shiftKey: true });
  expect(onSend).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByLabelText("Write a reply"), { key: "Enter" });
  expect(onSend).toHaveBeenCalledWith({ text: "Hello" });
});
```

Mock `scrollHeight` and computed line height to assert growth stops at five lines and then sets internal `overflowY: "auto"`.

- [ ] **Step 2: Write failing Retry tests**

```jsx
it("confirms before creating a new send and marks the original attempt", async () => {
  const failedMessage = {
    id: "failed-1",
    direction: "outbound",
    content: "See you Tuesday",
    status: "failed",
    error_message: "Meta callback timed out",
    sent_at: "2026-08-02T09:00:00Z",
  };
  const onRetry = vi.fn().mockResolvedValue({ ok: true });
  render(<MessageBubble message={failedMessage} onRetry={onRetry} />);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(onRetry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send again" }));
  await screen.findByText("Original send failed · Sent again successfully");
  expect(onRetry).toHaveBeenCalledWith(failedMessage);
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
});
```

Add Cancel and rejected-new-send cases; a rejection keeps the original failure and Retry available.

- [ ] **Step 3: Run focused composer and bubble tests and confirm failure**

```bash
npm run test:component -- src/components/views/inbox/thread/ComposePanel.component.test.jsx
npm run test:component -- src/components/views/inbox/thread/MessageBubble.component.test.jsx
```

Expected: FAIL because ComposePanel is uncontrolled and MessageBubble has no confirmation flow.

- [ ] **Step 4: Make `ComposePanel` controlled and auto-growing**

Remove local `text` state. On input, call `onChange(event.target.value)` and resize the textarea to `min(scrollHeight, fiveLineHeight)`. When Generate reply succeeds, pass `replyText` to `onChange` and focus the textarea. Keep the current window/template controls and the exact existing keydown condition `e.key === "Enter" && !e.shiftKey`.

- [ ] **Step 5: Extract `ThreadPane` and preserve scroll position**

Move the existing header, `WindowClosedBanner`, full message/action chronology, draft/action dock and composer into `ThreadPane`. Keep the message scroller separate from the sticky composer. Record whether the user is within 80px of the bottom before message changes; scroll to the new bottom only in that case.

- [ ] **Step 6: Wire Retry as a new manual send**

`onRetryMessage(message)` calls the existing `handleSendManualReply({ text: message.content })`. `MessageBubble` keeps its own confirmation/outcome state; a successful callback changes only that original keyed bubble's presentation and realtime supplies the new outbound row.

- [ ] **Step 7: Run focused thread and entry tests**

```bash
npm run test:component -- src/components/views/inbox/thread/ComposePanel.component.test.jsx
npm run test:component -- src/components/views/inbox/thread/MessageBubble.component.test.jsx
npm run test:component -- src/components/views/inbox/workspace/ThreadPane.component.test.jsx
npm run test:component -- src/components/views/inbox/InboxView.component.test.jsx
```

Expected: PASS for full chronology, composer control, keyboard binding, anchoring and Retry outcomes.

- [ ] **Step 8: Run the full CI bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Expected: all five commands exit 0.

- [ ] **Step 9: Commit the thread tranche**

```bash
git add src/components/views/inbox/workspace/ThreadPane.jsx src/components/views/inbox/workspace/ThreadPane.component.test.jsx src/components/views/inbox/workspace/InboxWorkspaceController.jsx src/components/views/inbox/thread/ComposePanel.jsx src/components/views/inbox/thread/ComposePanel.component.test.jsx src/components/views/inbox/thread/MessageBubble.jsx src/components/views/inbox/thread/MessageBubble.component.test.jsx src/components/views/inbox/InboxView.component.test.jsx
git commit -m "feat(inbox): add the full message thread pane"
```

---

### Task 8: Reusable Booking pane extraction

**Review boundary:** Extract existing Booking Desk diary/choice presentation for reuse; `/booking-workspace` must remain behaviourally equivalent at this tranche boundary.

**Files:**
- Create: `src/components/views/booking-workspace/BookingPane.jsx`
- Create: `src/components/views/booking-workspace/BookingPane.component.test.jsx`
- Modify: `src/components/views/booking-workspace/BookingWorkspaceView.jsx:52-698`
- Test without modifying: `src/components/views/booking-workspace/bookingWorkspaceModel.test.js`

**Interfaces:**
- `BookingPane` consumes `{ request, dates, currentDateStr, daySettings, bookingsByDate, dailyDogCap, choices, onToggleChoice, onPickDate, atLimit, onClear, onInsertIntoReply, showInsertAction }`.
- It reuses `buildSlotGrid`, `findGroupedSlots`, `canBookSlot`, `excludeCancelled`, `isDateOpen` and `toggleDraftSlot` exactly as the current view does.
- `BookingWorkspaceView` keeps its existing public props and renders `BookingPane` in place of its private `DateStrip`, `DiaryPanel` and `DraftOffer` definitions.

**Verified in this tranche:** identical open/closed/capacity slot states, three-choice limit, date movement and existing preview route behaviour.

**Deferred from this tranche:** Inbox context accordion, suggestion state and insertion into the live composer.

- [ ] **Step 1: Add failing BookingPane component tests**

Render fixed day settings/bookings and assert that a valid slot is enabled, a capacity-rejected slot is disabled with the existing reason, three selected choices block a fourth, and `onInsertIntoReply` appears only when `showInsertAction` is true and choices are non-empty.

- [ ] **Step 2: Run the focused Booking pane test and confirm failure**

Run: `npm run test:component -- src/components/views/booking-workspace/BookingPane.component.test.jsx`

Expected: FAIL because `BookingPane.jsx` does not exist.

- [ ] **Step 3: Extract the existing presentation without editing engine calls**

Move `parseDate`, `formatDate`, `DateStrip`, `DiaryPanel` and `DraftOffer` from `BookingWorkspaceView.jsx` into `BookingPane.jsx`. Replace only their outer prop plumbing; do not alter `canBookSlot`, `findGroupedSlots`, `buildSlotGrid`, `excludeCancelled` or `isDateOpen` arguments.

- [ ] **Step 4: Recompose the existing preview view through BookingPane**

Keep RequestQueue and current offline samples in `BookingWorkspaceView`. Replace the inline diary instances with `BookingPane` and pass `showInsertAction={false}` so this extraction does not silently enable sending on the existing preview.

- [ ] **Step 5: Run focused Booking Workspace tests**

```bash
npm run test:component -- src/components/views/booking-workspace/BookingPane.component.test.jsx
npm run test:logic -- src/components/views/booking-workspace/bookingWorkspaceModel.test.js
```

Expected: PASS with unchanged capacity and request-model behaviour.

- [ ] **Step 6: Run the full CI bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Expected: all five commands exit 0.

- [ ] **Step 7: Commit the Booking-pane extraction**

```bash
git add src/components/views/booking-workspace/BookingPane.jsx src/components/views/booking-workspace/BookingPane.component.test.jsx src/components/views/booking-workspace/BookingWorkspaceView.jsx
git commit -m "refactor(booking-desk): extract the reusable booking pane"
```

---

### Task 9: Booking/Customer composition, insertion and final acceptance

**Review boundary:** Complete the third pane and cross-breakpoint interaction, then run the full offline viewport matrix. This is the final implementation tranche.

**Files:**
- Create: `src/components/views/inbox/workspace/BookingCustomerPane.jsx`
- Create: `src/components/views/inbox/workspace/BookingCustomerPane.component.test.jsx`
- Modify: `src/components/views/inbox/workspace/InboxWorkspaceController.jsx`
- Modify: `src/components/views/inbox/workspace/InboxWorkspaceShell.jsx`
- Modify: `src/components/views/inbox/workspace/InboxWorkspaceShell.component.test.jsx`
- Modify: `src/components/views/inbox/workspace/ThreadPane.jsx`
- Modify: `src/components/views/inbox/workspace/ThreadPane.component.test.jsx`
- Modify: `src/components/views/booking-workspace/BookingWorkspaceView.jsx`
- Modify: `src/components/views/booking-workspace/bookingWorkspaceSamples.js`
- Modify: `src/components/views/inbox/InboxView.component.test.jsx`

**Interfaces:**
- `BookingCustomerPane` consumes `{ expandedSection, bookingSuggested, suggestionDismissed, onExpand, onDismissSuggestion, bookingPane, customerPane }`.
- `InboxWorkspaceController` calls `useWhatsAppInbox({ includeBookingWorkspaceData: true })`, derives the selected request through existing `bookingWorkspaceModel.js`, uses `useSalon()` only for existing dates/settings/bookings, and reads the daily cap from the existing `useSalonConfig()` loader without widening shared context.
- Thread triggers call `actions.openContext("booking" | "customer")`; no intent-derived effect calls that action.
- `Insert into reply` calls `actions.insertSlots(selectedId)`, focuses the controlled composer and calls `actions.closeContext()` below 1440px.
- `BookingWorkspaceView` uses the same shell/panes with its existing offline samples so the flagged preview remains the safe populated visual-review surface.

**Verified in this tranche:** one-tap Booking/Customer access, manual suggestion behaviour, session dismissal, slot insertion/focus, overlay close rules, state across resize, mobile Back, accessibility and all required viewport widths with the 390px keyboard open.

**Deferred after completion:** only the three documented authoritative-data follow-ups; route/nav cutover, file deletion and production flag changes remain separately approval-gated.

- [ ] **Step 1: Write failing Booking/Customer behaviour tests**

```jsx
it("shows a suggestion without opening Booking and keeps dismissal for the session", () => {
  const onExpand = vi.fn();
  const onDismissSuggestion = vi.fn();
  const { rerender } = render(<BookingCustomerPane
    expandedSection="customer"
    bookingSuggested
    suggestionDismissed={false}
    onExpand={onExpand}
    onDismissSuggestion={onDismissSuggestion}
    bookingPane={<div>Diary</div>}
    customerPane={<div>Customer details</div>}
  />);
  expect(screen.getByText("Booking suggested")).toBeInTheDocument();
  expect(onExpand).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss suggestion" }));
  expect(onDismissSuggestion).toHaveBeenCalledTimes(1);
  rerender(<BookingCustomerPane
    expandedSection="customer"
    bookingSuggested
    suggestionDismissed
    onExpand={onExpand}
    onDismissSuggestion={onDismissSuggestion}
    bookingPane={<div>Diary</div>}
    customerPane={<div>Customer details</div>}
  />);
  expect(screen.queryByText("Booking suggested")).not.toBeInTheDocument();
});
```

Add a controller test that selects two slots, clicks Insert into reply, observes the exact appended text, composer focus and closed overlay, then switches conversations and back without losing either conversation's own work.

- [ ] **Step 2: Run focused context tests and confirm failure**

```bash
npm run test:component -- src/components/views/inbox/workspace/BookingCustomerPane.component.test.jsx
npm run test:component -- src/components/views/inbox/InboxView.component.test.jsx
```

Expected: FAIL because the combined context pane and insertion wiring do not exist.

- [ ] **Step 3: Implement the two-section context pane**

Render persistent 44px Booking and Customer header buttons. Only the selected body scrolls; the other header remains visible. Customer is the initial section. The Booking header renders the suggestion dot/label and its separate 44px dismissal control without opening itself.

- [ ] **Step 4: Wire existing intent and diary data in the controller**

Use `isActiveAppointmentRequest(selectedConversation)` and `buildBookingRequest(selectedConversation)` from `bookingWorkspaceModel.js`; do not call `parseBookingHintsFromMessage`. Build the five display dates with `buildDiaryDates` from Task 1. The verified existing source is `useSalonConfig()` in `src/supabase/hooks/useSalonConfig.js`: it returns `{ config, ... }`, and `config.dailyDogCap` is the transformed `salon_config.daily_dog_cap` value already consumed by `App.jsx`. Call that existing loader from `InboxWorkspaceController`, use the configured value when present, and retain the established default while it loads. Continue to read `salon.daySettings` and `salon.bookingsByDate` from `useSalon()`, then pass those values and the resolved daily cap through `BookingPane` unchanged. Do not add `dailyDogCap` to `SalonContext`, do not edit `App.jsx`, and do not edit the route table.

- [ ] **Step 5: Wire insertion and focus**

Keep one composer ref in the controller. After `actions.insertSlots(selectedId)`, call `requestAnimationFrame(() => composerRef.current?.focus())`; below 1440px return to the thread and dismiss the context overlay. Do not clear slots or send a message.

- [ ] **Step 6: Recompose the flagged preview with offline samples**

Keep `BookingWorkspaceView`'s public props and route unchanged. Feed its existing sample conversations/messages/context into the shared pane composition whenever `isOnline` is false; extend only the sample objects needed to display the full-thread/status cases. No sample data enters the live hook or production bundle path beyond the existing development preview import.

- [ ] **Step 7: Run all focused workspace tests**

```bash
npm run test:logic -- src/components/views/inbox/workspace/inboxWorkspaceModel.test.js
npm run test:component -- src/components/views/inbox/workspace/useInboxWorkspaceState.component.test.jsx
npm run test:component -- src/components/views/inbox/workspace/InboxWorkspaceShell.component.test.jsx
npm run test:component -- src/components/views/inbox/workspace/ConversationPane.component.test.jsx
npm run test:component -- src/components/views/inbox/workspace/ThreadPane.component.test.jsx
npm run test:component -- src/components/views/inbox/workspace/BookingCustomerPane.component.test.jsx
npm run test:component -- src/components/views/inbox/InboxView.component.test.jsx
```

Expected: PASS across state, shell, list, thread, context and orchestration.

- [ ] **Step 8: Run the offline manual viewport matrix**

**OPEN — awaiting a decision:** this matrix currently exercises only `/booking-workspace`, so `/inbox` itself is never visually verified. The intended resolution is to extend `src/data/sample.js` so `/inbox` renders populated under `VITE_FORCE_OFFLINE=1`. Do not start that work or change this acceptance step until the decision is made.

Start only:

```bash
VITE_FORCE_OFFLINE=1 npm run dev
```

Open the local `/booking-workspace?date=2026-08-13` preview and verify:

- `1440px`: 300px list, thread at least 560px, 360px context rail;
- `1280px` and `1024px`: 300px list plus thread, 380px Booking/Customer overlay with scrim and Escape;
- `834px`: 280px list plus thread, full-height `min(520px, 100%)` context overlay;
- `390px`: list -> thread -> Booking/Customer with explicit and browser/hardware Back;
- every width: pane-local scrolling, no document scroll, state retained through resize and visible focus rings;
- `390px` with the on-screen keyboard open: type more than five lines, insert slots, confirm the composer stays visible and the thread does not jump.

Stop the offline server after the matrix. Do not open a Vercel, Supabase or production URL during this check.

- [ ] **Step 9: Run the full CI bar**

```bash
npm run lint
npm run typecheck
npm run check:migrations
npm run test
npm run build
```

Expected: all five commands exit 0 after the complete integration.

- [ ] **Step 10: Commit the completed responsive workspace**

```bash
git add src/components/views/inbox/workspace/BookingCustomerPane.jsx src/components/views/inbox/workspace/BookingCustomerPane.component.test.jsx src/components/views/inbox/workspace/InboxWorkspaceController.jsx src/components/views/inbox/workspace/InboxWorkspaceShell.jsx src/components/views/inbox/workspace/InboxWorkspaceShell.component.test.jsx src/components/views/inbox/workspace/ThreadPane.jsx src/components/views/inbox/workspace/ThreadPane.component.test.jsx src/components/views/booking-workspace/BookingWorkspaceView.jsx src/components/views/booking-workspace/bookingWorkspaceSamples.js src/components/views/inbox/InboxView.component.test.jsx
git commit -m "feat(inbox): compose Booking Desk into the responsive workspace"
```

---

## Final hand-off checklist

- [ ] `git diff 39451c9e...HEAD -- src/engine supabase` shows no changes introduced after the approved Booking Desk base.
- [ ] `git diff 39451c9e...HEAD -- src/supabase/hooks/useWhatsAppInbox.js src/components/views/inbox/hooks/useCustomerContext.js` shows no query or mutation changes from this plan.
- [ ] `rg -n "100vh|Cmd/Ctrl|Command\+Enter|Control\+Enter" src/components/views/inbox` returns no newly introduced workspace binding or viewport usage.
- [ ] The status, reply-window, Retry and three deferred-warning decisions match the approved spec.
- [ ] PR #579 is still the unchanged dependency base; this branch has not altered its route, flag or production environment.
