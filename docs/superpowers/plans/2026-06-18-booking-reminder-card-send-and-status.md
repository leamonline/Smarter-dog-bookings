# Booking-detail reminder card — send + honest status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the booking-detail reminder card actually send a reminder (via the existing `reminder-send` edge function and `SendReminderModal`) and honestly reflect `none → sent → confirmed`, derived from `notification_log`.

**Architecture:** Front-end only. The bookings read embeds `notification_log`; the transform derives `reminderState`. The card's Send button opens the existing dashboard `SendReminderModal` via a small booking→row adapter. A `notification_log` realtime listener refetches so the calendar/reopened modal stay correct; an optimistic local override flips the open modal instantly. No DB or edge-function change.

**Tech Stack:** React 19, Supabase JS v2 (PostgREST embeds + realtime), Vitest (logic project = node, component project = jsdom + Testing Library), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-18-booking-reminder-card-send-and-status-design.md`

**Conventions:**
- Logic tests: `src/**/*.test.{js,ts}` (node). Run one file: `npx vitest run <path>`.
- Component tests: `src/**/*.component.test.{jsx,tsx}` (jsdom). Run one file: `npx vitest run <path>`.
- Full suite: `npm test`. Types: `npm run typecheck`. Lint: `npm run lint`.
- Branch: `feat/reminder-card-send-status` (already created; the spec commit is on it).

---

### Task 1: Derive `reminderState` from `notification_log` in the transform

**Files:**
- Test: `src/supabase/transforms.test.ts` (add a describe block after the existing `dbBookingsToArray — reminder_confirmed_at` block, ~line 850)
- Modify: `src/supabase/transforms.ts` (`DbBookingRow` interface ~line 75; `dbBookingsToArray` map body ~lines 322–355)
- Modify: `src/types/index.ts` (`Booking` type, after line 109)

- [ ] **Step 1: Write the failing tests**

Append to `src/supabase/transforms.test.ts`:

```ts
describe("dbBookingsToArray — reminder lifecycle from notification_log", () => {
  const dogsById = buildDogsById([{ id: "d-1", name: "Bella", human_id: "h-1" } as any]);
  const humansById = buildHumansById([{ id: "h-1", name: "Jane", surname: "S" } as any]);

  it("derives reminderState 'sent' from a sent reminder log row", () => {
    const out = dbBookingsToArray(
      [
        bookingRow({
          id: "b-1",
          dog_id: "d-1",
          reminder_confirmed_at: null,
          notification_log: [
            { trigger_type: "reminder", status: "sent", sent_at: "2026-06-18T08:00:00Z", channel: "whatsapp" },
          ],
        }) as any,
      ],
      dogsById,
      humansById,
    );
    expect(out[0].reminderState).toBe("sent");
    expect(out[0].reminderSentAt).toBe("2026-06-18T08:00:00Z");
    expect(out[0].reminderChannel).toBe("whatsapp");
  });

  it("prefers 'confirmed' over 'sent' when reminder_confirmed_at is set", () => {
    const out = dbBookingsToArray(
      [
        bookingRow({
          id: "b-1",
          dog_id: "d-1",
          reminder_confirmed_at: "2026-06-18T09:00:00Z",
          notification_log: [
            { trigger_type: "reminder", status: "sent", sent_at: "2026-06-18T08:00:00Z", channel: "sms" },
          ],
        }) as any,
      ],
      dogsById,
      humansById,
    );
    expect(out[0].reminderState).toBe("confirmed");
  });

  it("ignores failed/pending reminder rows and non-reminder rows (stays 'none')", () => {
    const out = dbBookingsToArray(
      [
        bookingRow({
          id: "b-1",
          dog_id: "d-1",
          reminder_confirmed_at: null,
          notification_log: [
            { trigger_type: "reminder", status: "failed", sent_at: null, channel: "whatsapp" },
            { trigger_type: "reminder", status: "pending", sent_at: null, channel: "whatsapp" },
            { trigger_type: "confirmed", status: "sent", sent_at: "2026-06-18T07:00:00Z", channel: "whatsapp" },
          ],
        }) as any,
      ],
      dogsById,
      humansById,
    );
    expect(out[0].reminderState).toBe("none");
    expect(out[0].reminderSentAt).toBeNull();
    expect(out[0].reminderChannel).toBeNull();
  });

  it("defaults to 'none' when there is no notification_log", () => {
    const out = dbBookingsToArray([bookingRow({ dog_id: "d-1" }) as any], dogsById, humansById);
    expect(out[0].reminderState).toBe("none");
  });

  it("picks the latest sent reminder when several exist", () => {
    const out = dbBookingsToArray(
      [
        bookingRow({
          id: "b-1",
          dog_id: "d-1",
          notification_log: [
            { trigger_type: "reminder", status: "sent", sent_at: "2026-06-18T08:00:00Z", channel: "whatsapp" },
            { trigger_type: "reminder", status: "sent", sent_at: "2026-06-18T10:00:00Z", channel: "sms" },
          ],
        }) as any,
      ],
      dogsById,
      humansById,
    );
    expect(out[0].reminderSentAt).toBe("2026-06-18T10:00:00Z");
    expect(out[0].reminderChannel).toBe("sms");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/supabase/transforms.test.ts`
Expected: the 5 new tests FAIL — `reminderState` is `"none"` for the sent case and `reminderChannel` is `undefined` (property doesn't exist yet).

- [ ] **Step 3a: Add the embed field to `DbBookingRow`**

In `src/supabase/transforms.ts`, inside `interface DbBookingRow` (immediately after `reminder_confirmed_at?: string | null;`, ~line 74):

```ts
  notification_log?: Array<{
    trigger_type: string;
    status: string;
    sent_at: string | null;
    channel: string | null;
  }>;
```

- [ ] **Step 3b: Add `reminderChannel` to the `Booking` type**

In `src/types/index.ts`, immediately after `reminderConfirmedBy?: string | null;` (line 109):

```ts
  reminderChannel?: string | null;
```

- [ ] **Step 3c: Derive the reminder lifecycle in `dbBookingsToArray`**

In `src/supabase/transforms.ts`, inside the `rows.map((row) => { ... })` body, add these lines after `const owner = ...` (~line 322) and before `return {`:

```ts
    // Reminder lifecycle. `confirmed` (the customer tapped the WhatsApp
    // Confirm button, persisted on bookings.reminder_confirmed_at) always
    // wins; otherwise a successfully-sent reminder row gives `sent`; else
    // `none`. failed/pending rows don't count — failures live on the
    // Delivery Failure card.
    const reminderLog = row.notification_log ?? [];
    const sentReminder =
      reminderLog
        .filter((n) => n.trigger_type === "reminder" && n.status === "sent")
        .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0] ?? null;
    const reminderState = row.reminder_confirmed_at
      ? "confirmed"
      : sentReminder
        ? "sent"
        : "none";
```

Then replace the existing reminder fields in the returned object (the block at ~lines 346–355 starting `reminderConfirmedAt: row.reminder_confirmed_at ?? null,`) with:

```ts
      reminderConfirmedAt: row.reminder_confirmed_at ?? null,
      // Lifecycle derived above from notification_log + reminder_confirmed_at.
      // "read" stays null (no WhatsApp read receipt is captured).
      reminderState,
      reminderSentAt: sentReminder?.sent_at ?? null,
      reminderReadAt: null,
      reminderChannel: sentReminder?.channel ?? null,
      reminderConfirmedBy: null,
```

- [ ] **Step 4: Run tests + typecheck to verify they pass**

Run: `npx vitest run src/supabase/transforms.test.ts && npm run typecheck`
Expected: all transforms tests PASS (including the 5 new ones); typecheck reports no errors.

- [ ] **Step 5: Commit**

```bash
git add src/supabase/transforms.ts src/supabase/transforms.test.ts src/types/index.ts
git commit -m "feat: derive booking reminderState from notification_log" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Embed `notification_log` in the bookings read

**Files:**
- Modify: `src/supabase/queries/bootQueries.js:13-22` (`fetchBookingsWeek`)

`fetchBookingsWeek` is the single shared query body — `useBookings` (`src/supabase/hooks/useBookings.js:70`) and the boot prefetch (`src/supabase/bootPrefetch.js:65`) both call it, so this one change covers both read paths. There is no unit test for the query builder in this repo (no `bootQueries.test.*`); it is verified by typecheck, lint, and the preview check in Task 7.

- [ ] **Step 1: Add the embed to the select**

In `src/supabase/queries/bootQueries.js`, change the `.select("*")` on line 16 to:

```js
    .select("*, notification_log(trigger_type, status, sent_at, channel)")
```

Leave the rest of the function (`.gte`/`.lte`/`.order`/`abortSignal`) unchanged. The FK `notification_log_booking_id_fkey` is the only relationship between the tables, so the embed is unambiguous; staff RLS on `notification_log` permits the read.

- [ ] **Step 2: Verify typecheck, lint, and existing tests still pass**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS. (The transform tests from Task 1 already validate the derivation against this embed shape.)

- [ ] **Step 3: Commit**

```bash
git add src/supabase/queries/bootQueries.js
git commit -m "feat: embed notification_log in the bookings week query" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Keep reminder status live in `useBookings`

**Files:**
- Modify: `src/supabase/hooks/useBookings.js` (realtime handlers ~lines 95–138)

A reminder send writes `notification_log`, not `bookings`, so the existing bookings handlers won't fire. Add a `notification_log` listener that refetches (the refetch re-runs the embedded query, re-deriving `reminderState`). Also preserve the embed when patching a bookings row from a realtime payload, because realtime payloads don't include PostgREST embeds — without this, editing a booking after a reminder was sent would wipe its `sent` state. Realtime subscriptions aren't unit-tested in this repo; verified by typecheck, lint, and the Task 7 preview check.

- [ ] **Step 1: Preserve the embed in the INSERT handler**

In `src/supabase/hooks/useBookings.js`, replace the INSERT handler's `setRows` body (the block at ~lines 101–106) with:

```js
          setRows((prev) => {
            const base = prev || [];
            const existing = base.find((r) => r.id === newRow.id);
            // Realtime payloads omit the notification_log embed; keep the
            // one we already fetched so reminderState survives the patch.
            const merged = existing?.notification_log
              ? { ...newRow, notification_log: existing.notification_log }
              : newRow;
            return base.some((r) => r.id === newRow.id)
              ? base.map((r) => (r.id === newRow.id ? merged : r))
              : [...base, merged];
          });
```

- [ ] **Step 2: Preserve the embed in the UPDATE handler**

Replace the UPDATE handler's `setRows` body (the block at ~lines 117–126) with:

```js
          setRows((prev) => {
            const base = prev || [];
            // Moved outside the visible week → drop it.
            if (!inRange(newRow?.booking_date)) {
              return base.filter((r) => r.id !== id);
            }
            const existing = base.find((r) => r.id === id);
            const merged = existing?.notification_log
              ? { ...newRow, notification_log: existing.notification_log }
              : newRow;
            return base.some((r) => r.id === id)
              ? base.map((r) => (r.id === id ? merged : r))
              : [...base, merged];
          });
```

- [ ] **Step 3: Add the notification_log listener**

Add a fourth `.on(...)` immediately after the DELETE handler's closing `)` and before `.subscribe()` (~line 137):

```js
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_log" },
        (payload) => {
          // Reminder sends write notification_log, not bookings. Re-pull the
          // week (which embeds notification_log) so reminderState re-derives.
          // Reminder events are rare, so a full refetch is acceptable.
          const triggerType = payload.new?.trigger_type ?? payload.old?.trigger_type;
          if (triggerType === "reminder") refetch();
        },
      )
```

`refetch` (defined later in the hook as `useCallback(() => setRefreshKey((k) => k + 1), [])`) is stable and in lexical scope; the callback only runs after render, so referencing it here is safe. Do not add it to the effect's dependency array (it is declared after the effect — matching the hook's existing dependency style of `[weekStart, refreshKey]`).

- [ ] **Step 4: Verify typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS, no new warnings about the edited handlers.

- [ ] **Step 5: Commit**

```bash
git add src/supabase/hooks/useBookings.js
git commit -m "feat: refresh booking reminder status on notification_log realtime" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Booking → reminder-row adapter

**Files:**
- Create: `src/components/modals/send-reminder/bookingToReminderRow.js`
- Test: `src/components/modals/send-reminder/bookingToReminderRow.test.js` (logic project — `*.test.js`)

- [ ] **Step 1: Write the failing tests**

Create `src/components/modals/send-reminder/bookingToReminderRow.test.js`:

```js
import { describe, it, expect } from "vitest";
import { bookingToReminderRow } from "./bookingToReminderRow.js";

const base = {
  id: "b-1",
  _ownerId: "h-1",
  _bookingDate: "2026-06-18",
  owner: "Jane Smith",
  dogName: "Bella",
  slot: "09:00",
  reminderState: "none",
  reminderChannel: null,
  reminderSentAt: null,
};

describe("bookingToReminderRow", () => {
  it("maps a normal booking onto the reminder-row shape", () => {
    const row = bookingToReminderRow(base);
    expect(row.anchorBookingId).toBe("b-1");
    expect(row.customerKey).toBe("h-1");
    expect(row.bookingIds).toEqual(["b-1"]);
    expect(row.customerName).toBe("Jane Smith");
    expect(row.dogNames).toEqual(["Bella"]);
    expect(row.dogNamesDisplay).toBe("Bella");
    expect(row.slot).toBe("09:00");
    expect(row.slots).toEqual(["09:00"]);
    expect(row.reminderStatus).toBeUndefined();
  });

  it("leaves customerKey null for an orphan booking (no owner)", () => {
    const row = bookingToReminderRow({ ...base, _ownerId: null });
    expect(row.customerKey).toBeNull();
  });

  it("flags reminderStatus 'sent' when the booking is already sent", () => {
    const row = bookingToReminderRow({
      ...base,
      reminderState: "sent",
      reminderChannel: "whatsapp",
      reminderSentAt: "2026-06-18T08:00:00Z",
    });
    expect(row.reminderStatus).toBe("sent");
    expect(row.reminderChannel).toBe("whatsapp");
    expect(row.reminderSentAt).toBe("2026-06-18T08:00:00Z");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/modals/send-reminder/bookingToReminderRow.test.js`
Expected: FAIL — `Failed to resolve import "./bookingToReminderRow.js"` (module doesn't exist yet).

- [ ] **Step 3: Implement the adapter**

Create `src/components/modals/send-reminder/bookingToReminderRow.js`:

```js
// Adapts an app Booking object onto the row shape SendReminderModal expects
// (it was built for the dashboard's reminder rows). Lets the booking-detail
// reminder card reuse the same modal. The reminder-send edge function gathers
// the customer's whole day itself, so bookingIds only needs the anchor — the
// modal uses it for service-name display, not for the send.
export function bookingToReminderRow(booking) {
  return {
    anchorBookingId: booking.id,
    customerKey: booking._ownerId ?? null,
    bookingIds: [booking.id],
    customerName: booking.owner || "",
    dogNames: booking.dogName ? [booking.dogName] : [],
    dogNamesDisplay: booking.dogName || "",
    slot: booking.slot || "",
    slots: booking.slot ? [booking.slot] : [],
    // 'sent' opens the modal's existing read-only "already sent" view, which
    // is exactly the no-resend behaviour we want. undefined → composer view.
    reminderStatus: booking.reminderState === "sent" ? "sent" : undefined,
    reminderChannel: booking.reminderChannel ?? null,
    reminderSentAt: booking.reminderSentAt ?? null,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/modals/send-reminder/bookingToReminderRow.test.js`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/send-reminder/bookingToReminderRow.js src/components/modals/send-reminder/bookingToReminderRow.test.js
git commit -m "feat: add bookingToReminderRow adapter for the reminder card" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire the card's Send button and make 'sent' read-only

**Files:**
- Modify: `src/components/modals/booking-detail/ReminderCard.jsx`
- Test: `src/components/modals/booking-detail/ReminderCard.component.test.jsx` (component project — jsdom)

- [ ] **Step 1: Write the failing component test**

Create `src/components/modals/booking-detail/ReminderCard.component.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ReminderCard } from "./ReminderCard.jsx";

const baseBooking = {
  dogName: "Bella",
  owner: "Jane Smith",
  reminderState: "none",
  reminderSentAt: null,
  reminderConfirmedAt: null,
};

describe("ReminderCard", () => {
  it("shows a Send reminder button in the 'none' state and calls onSendReminder", async () => {
    const onSendReminder = vi.fn();
    render(
      <ReminderCard booking={{ ...baseBooking }} pickupHuman={null} isEditing={false} onSendReminder={onSendReminder} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /send reminder/i }));
    expect(onSendReminder).toHaveBeenCalledTimes(1);
  });

  it("shows read-only sent status and no send/resend button once sent", () => {
    render(
      <ReminderCard
        booking={{ ...baseBooking, reminderState: "sent", reminderSentAt: "2026-06-18T08:00:00Z" }}
        pickupHuman={null}
        isEditing={false}
        onSendReminder={vi.fn()}
      />,
    );
    expect(screen.getByText(/reminder sent/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send reminder|resend/i })).toBeNull();
  });

  it("shows confirmed status only when confirmed", () => {
    render(
      <ReminderCard
        booking={{ ...baseBooking, reminderState: "confirmed" }}
        pickupHuman={null}
        isEditing={false}
        onSendReminder={vi.fn()}
      />,
    );
    expect(screen.getByText(/confirmed by/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send reminder|resend/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/modals/booking-detail/ReminderCard.component.test.jsx`
Expected: FAIL — the 'none' click test fails because the button currently fires the toast stub, not `onSendReminder`; the 'sent' test fails because a "Resend" button currently renders.

- [ ] **Step 3: Edit `ReminderCard.jsx`**

In `src/components/modals/booking-detail/ReminderCard.jsx`:

(a) Remove the toast import (line 2) and the `const toast = useToast();` line (line 79) — the card no longer toasts.

(b) Change the `sent` state's `action` (line 53) from `"resend"` to `null`, and update its comment:

```js
  sent: {
    card: "bg-amber-50 border-amber-200",
    chip: "bg-amber-100 text-amber-700",
    eyebrow: "text-amber-700/80",
    statusTone: "text-amber-900",
    StatusIcon: Check,
    action: null, // read-only once sent — reminder-send is idempotent (no resend)
    status: (ctx) =>
      `Reminder sent${ctx.sentWhen ? ` · ${ctx.sentWhen}` : ""}`,
  },
```

(c) Change the component signature to accept the callback:

```jsx
export function ReminderCard({ booking, pickupHuman, isEditing, onSendReminder }) {
```

(d) Delete the `handleReminderAction` stub (lines 102–113, the comment block plus the function).

(e) In the actions JSX, point the send button at the callback and remove the now-dead resend block. Replace the two `cfg.action === "send"` / `cfg.action === "resend"` blocks (lines 152–171) with just:

```jsx
          {cfg.action === "send" && (
            <button
              type="button"
              onClick={onSendReminder}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border-none bg-brand-purple text-white text-[13px] font-bold cursor-pointer font-inherit transition-colors hover:bg-brand-purple-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-1"
            >
              <Send size={13} aria-hidden="true" />
              Send reminder
            </button>
          )}
```

Leave the `showPickupMessage` SMS link block below it unchanged.

- [ ] **Step 4: Run component test + lint to verify pass**

Run: `npx vitest run src/components/modals/booking-detail/ReminderCard.component.test.jsx && npm run lint`
Expected: all 3 tests PASS; lint clean (no unused `useToast`/`toast`).

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/booking-detail/ReminderCard.jsx src/components/modals/booking-detail/ReminderCard.component.test.jsx
git commit -m "feat: wire reminder card Send button, make sent state read-only" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Host `SendReminderModal` in the booking-detail modal

**Files:**
- Modify: `src/components/modals/BookingDetailModal.jsx`

This wires the card's `onSendReminder` to open `SendReminderModal`, and flips the open card to "sent" optimistically on success (the booking prop is a snapshot from `App`, so realtime alone won't update the *open* modal — the optimistic override handles the instant flip; Task 3's listener handles the calendar + reopen). No automated test (the modal needs many props/hooks mocked); verified by the Task 7 preview check plus the Task 4/5 unit tests covering the adapter and card.

- [ ] **Step 1: Add imports**

In `src/components/modals/BookingDetailModal.jsx`, change line 1 to include `lazy` and `Suspense`:

```jsx
import { useMemo, useEffect, useCallback, useState, lazy, Suspense } from "react";
```

Add, near the other component imports (after line 35):

```jsx
import { bookingToReminderRow } from "./send-reminder/bookingToReminderRow.js";

// Lazy so the channel composers don't load until staff first send from here.
const SendReminderModal = lazy(() =>
  import("./send-reminder/SendReminderModal.jsx").then((m) => ({
    default: m.SendReminderModal,
  })),
);
```

- [ ] **Step 2: Add state and a per-booking reset**

After the existing `useState` declarations (~line 100), add:

```jsx
  const [showSendReminder, setShowSendReminder] = useState(false);
  // Optimistic flip for the open modal: SendReminderModal.onSent doesn't
  // report the channel, so we set state+time only; the realtime refetch
  // (useBookings) backfills the real channel on reopen.
  const [reminderSentOverride, setReminderSentOverride] = useState(null);

  // A different booking opened in the same modal instance must not inherit
  // the previous booking's override or open send modal.
  useEffect(() => {
    setReminderSentOverride(null);
    setShowSendReminder(false);
  }, [booking.id]);
```

- [ ] **Step 3: Pass the callback and the effective booking to the card**

Replace the `<ReminderCard ... />` block (lines 367–371) with:

```jsx
          <ReminderCard
            booking={reminderSentOverride ? { ...booking, ...reminderSentOverride } : booking}
            pickupHuman={pickupHuman}
            isEditing={isEditing}
            onSendReminder={() => setShowSendReminder(true)}
          />
```

- [ ] **Step 4: Render the send modal**

Immediately after the closing `/>` of `<BookingDetailOverlays ... />` (line 410) and before `</ModalShell>` (line 411), add:

```jsx
      {showSendReminder && (
        <Suspense fallback={null}>
          <SendReminderModal
            row={bookingToReminderRow(booking)}
            targetDate={booking._bookingDate}
            onClose={() => setShowSendReminder(false)}
            onSent={() => {
              setReminderSentOverride({
                reminderState: "sent",
                reminderSentAt: new Date().toISOString(),
              });
              setShowSendReminder(false);
            }}
          />
        </Suspense>
      )}
```

- [ ] **Step 5: Verify typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/BookingDetailModal.jsx
git commit -m "feat: open SendReminderModal from the booking-detail reminder card" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Full verification

**Files:** none (verification gate).

- [ ] **Step 1: Run the full automated suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all tests PASS, no type errors, lint clean.

- [ ] **Step 2: Manual preview check** (orchestrator, via the preview tools / the user's logged-in browser — `npm run dev` points at the live cloud DB)

Verify the end-to-end behaviour:
1. Open a booking whose customer has a valid WhatsApp/SMS/email contact and no reminder yet → reminder card shows **"No reminder sent yet"** with a **Send reminder** button.
2. Click **Send reminder** → `SendReminderModal` opens with channel pills; pick a channel and send.
3. On success the modal closes and the card flips to **"Reminder sent · {time}"** with no button (optimistic override).
4. Close and reopen the booking → still shows **"Reminder sent"** (Task 2 embed + Task 3 refetch).
5. Open a booking with no linked customer → Send opens the modal's **"link a customer first"** message.
6. A booking the customer has already confirmed shows **"Confirmed by …"** (confirmed beats sent).

- [ ] **Step 3: Confirm the branch is ready**

Run: `git log --oneline main..HEAD`
Expected: the spec commit plus six feature commits (Tasks 1–6), tree clean. Ready to open a PR for human review.

---

## Out of scope (do not implement)

- Resend after a successful send; "read" state / WhatsApp read receipts; `reminderConfirmedBy` derivation.
- The nightly cron path (`notify-booking-reminder`), the `reminder-send` edge function, and `SendReminderModal` internals — all unchanged.
- The human-card modal actions — already wired in `App.jsx`.
