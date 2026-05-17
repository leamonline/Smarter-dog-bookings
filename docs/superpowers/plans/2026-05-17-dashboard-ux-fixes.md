# Dashboard UX Fixes — May 2026 Review Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the top-10 fixes from the 17 May 2026 review of the SmarterDog salon dashboard — restoring trust in the data on screen (correct day, correct owner, correct totals) and making everyday actions safer (undo, disambiguation, prefill from WhatsApp).

**Architecture:** Nine sequential phases, each landing as its own PR. Each phase is independent and observable in the running app — the dashboard stays shippable between phases. Heavy use of existing utilities (`formatOwnerLabel`, `directorySearch`, `ToastContext`); we are mostly fixing wiring and labels rather than introducing new systems.

**Tech Stack:** React 19, Vite, Vitest, Tailwind v4, Supabase JS v2, react-router-dom v7.

---

## Self-Review Notes (for the implementer)

- This is **not a greenfield project**. Many of the fixes use utilities that already exist (`formatOwnerLabel`, `ensureHumansByIds`, `buildSearchEntries`). When a phase says "use the existing helper," do that — don't invent a parallel one.
- All work happens on the **salon dashboard** (`App.jsx`, `WeekCalendarView`, `components/dashboard/*`, `components/booking/*`, `components/modals/*`). The **customer portal** (`CustomerApp.jsx`, `components/customer/*`) is out of scope.
- UK English everywhere in copy (`colour`, `de-shed`, etc.).
- Vitest is the test runner: `npm run test` for the full suite, `npx vitest run path/to/test.ts` for a single file.
- The user uses Linear for issue tracking but only wants Linear tickets created if explicitly asked. Don't auto-create them mid-plan.

---

## Phase 0: Set up working branch

**Files:** none — git only.

- [ ] **Step 0.1: Create the integration branch**

```bash
git checkout -b feat/may-2026-review-pass-dashboard main
git push -u origin feat/may-2026-review-pass-dashboard
```

Each subsequent phase will branch off this and PR back into it, OR PR straight to `main` if Bleep prefers. Confirm with Bleep before opening the first phase PR.

---

## Phase 1: Default the dashboard to today

**Why:** Highest-impact, lowest-blast-radius fix. The dashboard currently lands on Monday of the current ISO week regardless of which day "today" is — so on a Sunday it shows last Monday, six days stale. (`useWeekNav` initialises `selectedDay = 0`.)

**Files:**
- Modify: `src/hooks/useWeekNav.js:13` — change initial `selectedDay` state.
- Create: `src/hooks/useWeekNav.test.ts` — new test file (none exists today).

### Task 1: Initial day matches today when no URL param

**Files:**
- Modify: `src/hooks/useWeekNav.js`
- Create: `src/hooks/useWeekNav.test.ts`

- [ ] **Step 1.1: Add a helper that computes the Monday-indexed day-of-week for a Date**

In `src/hooks/useWeekNav.js`, just above the `useWeekNav` function declaration, add:

```javascript
/**
 * Returns 0..6 where 0 = Monday, 6 = Sunday — i.e. the index into the
 * weekly `dates` array. Exported for testing only.
 */
export function mondayIndexedDayOfWeek(date) {
  const dow = date.getDay(); // 0 = Sunday in JS
  return dow === 0 ? 6 : dow - 1;
}
```

- [ ] **Step 1.2: Write failing test for the helper**

Create `src/hooks/useWeekNav.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mondayIndexedDayOfWeek } from "./useWeekNav.js";

describe("mondayIndexedDayOfWeek", () => {
  it("returns 0 for Monday", () => {
    // 11 May 2026 is a Monday.
    expect(mondayIndexedDayOfWeek(new Date("2026-05-11T12:00:00"))).toBe(0);
  });

  it("returns 6 for Sunday", () => {
    // 17 May 2026 is a Sunday.
    expect(mondayIndexedDayOfWeek(new Date("2026-05-17T12:00:00"))).toBe(6);
  });

  it("returns 2 for Wednesday", () => {
    expect(mondayIndexedDayOfWeek(new Date("2026-05-13T12:00:00"))).toBe(2);
  });
});
```

- [ ] **Step 1.3: Run the test and verify it passes**

Run: `npx vitest run src/hooks/useWeekNav.test.ts`
Expected: 3 passing.

- [ ] **Step 1.4: Change the initial `selectedDay` to today's index**

In `src/hooks/useWeekNav.js`, replace line 13:

```javascript
  const [selectedDay, setSelectedDay] = useState(0);
```

with:

```javascript
  const [selectedDay, setSelectedDay] = useState(() => mondayIndexedDayOfWeek(new Date()));
```

This is the entire behavioural change. The existing `useEffect` that honours the `?date=` URL param will override this for direct/shared links (it calls `handleDatePick(parsed)` which resets both `selectedDay` and `weekOffset`).

- [ ] **Step 1.5: Manual smoke test in the dev server**

Run: `npm run dev`
Visit: `http://localhost:5173/` (no query string)
Expected: the day banner shows today's day-of-week, not Monday.
Visit: `http://localhost:5173/?date=2026-05-11`
Expected: still shows Mon 11 May — URL param wins.

- [ ] **Step 1.6: Commit**

```bash
git add src/hooks/useWeekNav.js src/hooks/useWeekNav.test.ts
git commit -m "fix(dashboard): default to today's day-of-week, not Monday"
```

---

## Phase 2: Stop "Unknown Owner" leaking into the new-booking dialog

**Why:** `buildSearchEntries` (in `src/components/modals/new-booking/helpers.js`) refuses to render UUID-shaped owner keys and falls back to "Unknown owner". The dogs map carries `humanId` as a UUID for dogs whose owner sits past the paginated `humans` page boundary. App.jsx already has `ensureHumansByIds` pre-fetching for the dogs map, but the **search-result dogs** returned by `dogsSearchDogs` are loaded outside that effect, so their owner UUIDs never get resolved.

This is **also** what makes owner-name search fail (finding #7 / Top-10 item 7): `h.key` is "Unknown owner" for every result, so typing the owner's actual name matches nothing.

**Files:**
- Modify: `src/components/modals/new-booking/helpers.js` — make `buildSearchEntries` look up owner by `_humanId` UUID, matching `formatOwnerLabel`'s strategy.
- Modify: `src/components/modals/new-booking/helpers.test.js` — add coverage.
- Modify: `src/App.jsx` — extend the `ensureHumansByIds` effect to also cover dogs returned by search.

### Task 2: buildSearchEntries falls back to id-keyed lookup

**Files:**
- Modify: `src/components/modals/new-booking/helpers.js`
- Modify: `src/components/modals/new-booking/helpers.test.js`

- [ ] **Step 2.1: Inspect the current test file to see its conventions**

Run: `cat src/components/modals/new-booking/helpers.test.js | head -40`
Note the existing imports and `describe` blocks, then add new tests in the same style.

- [ ] **Step 2.2: Write a failing test for id-based owner lookup**

Append to `src/components/modals/new-booking/helpers.test.js`:

```javascript
describe("buildSearchEntries — id-keyed owner resolution", () => {
  it("resolves a dog whose humanId is a UUID via the humans map's id field", () => {
    const dogs = {
      "dog-1": {
        id: "dog-1",
        name: "Alfie",
        humanId: "1b2e9d3a-4c5f-6789-abcd-ef0123456789", // UUID
        _humanId: "1b2e9d3a-4c5f-6789-abcd-ef0123456789",
      },
    };
    const humans = {
      "Anna Cragg": {
        id: "1b2e9d3a-4c5f-6789-abcd-ef0123456789",
        fullName: "Anna Cragg",
        name: "Anna",
        surname: "Cragg",
        phone: "+447700900123",
      },
    };
    const entries = buildSearchEntries(dogs, humans);
    expect(entries).toHaveLength(1);
    expect(entries[0].humans).toHaveLength(1);
    expect(entries[0].humans[0].key).toBe("Anna Cragg");
    expect(entries[0].humans[0].missing).toBe(false);
  });
});
```

- [ ] **Step 2.3: Run the test and verify it fails**

Run: `npx vitest run src/components/modals/new-booking/helpers.test.js`
Expected: 1 failing — current code returns `key: "Unknown owner", missing: true`.

- [ ] **Step 2.4: Fix `buildSearchEntries` to try id-based lookup**

Replace the body of `buildSearchEntries` in `src/components/modals/new-booking/helpers.js` with:

```javascript
export function buildSearchEntries(dogs, humans) {
  const entries = [];
  const humansList = humans ? Object.values(humans) : [];

  for (const dog of Object.values(dogs || {})) {
    const ownerKey = dog.humanId || "";
    const ownerIsUuid = looksLikeUuid(ownerKey);

    // Resolve the owner record. Prefer `_humanId` (the UUID stamped at
    // fetch time) over `humanId` (which is the camelCase display key
    // when present, or a UUID fallback when the human row hadn't loaded).
    let owner = null;
    if (dog._humanId) {
      owner = humansList.find((h) => h?.id === dog._humanId) || null;
    }
    if (!owner && ownerKey && !ownerIsUuid) {
      owner = humans?.[ownerKey] || null;
    }
    if (!owner && ownerKey) {
      // Last resort: try matching the key against any human's id, in
      // case humanId itself is a UUID and _humanId wasn't populated.
      owner = humansList.find((h) => h?.id === ownerKey) || null;
    }

    const hasAlerts = Boolean(dog.alerts?.length);
    const humansForDog = [];

    if (owner) {
      const displayKey = owner.fullName || `${owner.name || ""} ${owner.surname || ""}`.trim();
      humansForDog.push({
        key: displayKey || "Unknown owner",
        phone: owner.phone || "",
        isTrusted: false,
        missing: false,
      });
    } else if (ownerKey && !ownerIsUuid) {
      // Have a name-shaped key but no humans-map row yet — render the
      // name anyway, with a soft "missing" flag so callers can show a
      // "link owner" affordance if they want to.
      humansForDog.push({
        key: ownerKey,
        phone: "",
        isTrusted: false,
        missing: true,
      });
    } else if (ownerKey) {
      // UUID with no resolution at all.
      humansForDog.push({
        key: "Unknown owner",
        phone: "",
        isTrusted: false,
        missing: true,
      });
    }

    if (owner?.trustedIds?.length) {
      for (const trustedKey of owner.trustedIds) {
        if (looksLikeUuid(trustedKey)) continue;
        const trusted = humans?.[trustedKey];
        if (trusted) {
          humansForDog.push({
            key: trustedKey,
            phone: trusted.phone || "",
            isTrusted: true,
            missing: false,
          });
        }
      }
    }

    entries.push({ dog, hasAlerts, humans: humansForDog });
  }
  return entries;
}
```

- [ ] **Step 2.5: Run the test suite for this file and confirm it passes**

Run: `npx vitest run src/components/modals/new-booking/helpers.test.js`
Expected: all tests passing (existing + new).

- [ ] **Step 2.6: Commit**

```bash
git add src/components/modals/new-booking/helpers.js src/components/modals/new-booking/helpers.test.js
git commit -m "fix(new-booking): resolve owners via id when humanId is a UUID"
```

### Task 3: Pre-fetch owners for dogs returned by search

**Files:**
- Modify: `src/App.jsx` (around line 360-379, the existing `ensureHumansByIds` effects).

- [ ] **Step 3.1: Locate the existing pre-fetch effect**

Read `src/App.jsx` lines 354–380. Note the two existing `useEffect` blocks that call `sbEnsureHumansByIds`. We need a third one keyed on the search-result dog set if the search hook surfaces its results separately, OR — if `sbDogs` already includes search results — adjust the existing effect's dependency.

Run: `grep -n "dogsSearchDogs\|sbDogs\b\|searchDogs" src/App.jsx src/supabase/hooks/useDogs.js | head -20`
Inspect whether `useDogs` merges search results into `sbDogs` or surfaces a separate `searchResults` map.

- [ ] **Step 3.2: Confirm via inspection of useDogs**

Run: `grep -n "setDogs\|setDogsById\|searchResults\|setSearchResults" src/supabase/hooks/useDogs.js`
- If `sbDogs` already absorbs search results: no extra effect needed — the existing effect at App.jsx:360 already covers them, since it depends on `[sbDogs, sbEnsureHumansByIds]`. The fix in Task 2 alone is sufficient.
- If a separate map is returned: add a third `useEffect` mirroring lines 360–367 but iterating over the search-results map.

Decide which case applies and act accordingly. **Do NOT add a redundant effect** if `sbDogs` already covers it.

- [ ] **Step 3.3: If a new effect is needed, add it**

Below the existing two effects (after line 379), add:

```javascript
  // Search results may include dogs whose owner sits past the humans
  // page boundary. Ensure their owner rows are loaded so the New Booking
  // dialog can label them instead of falling back to "Unknown owner".
  useEffect(() => {
    if (!sbEnsureHumansByIds) return;
    const ids = new Set();
    for (const d of Object.values(sbDogsSearchResults || {})) {
      if (d?._humanId) ids.add(d._humanId);
    }
    if (ids.size > 0) sbEnsureHumansByIds([...ids]);
  }, [sbDogsSearchResults, sbEnsureHumansByIds]);
```

…with `sbDogsSearchResults` destructured from `useDogs` (add to the destructure at line 311). Skip this step entirely if Step 3.2 showed search merges into `sbDogs`.

- [ ] **Step 3.4: Manual smoke test**

```bash
npm run dev
```
1. Click "+ New booking" in the header.
2. Search by an owner name that you know sits past the first humans page (use one of the records the review found: "Anna Cragg" / "Leam Waddington").
3. Expected: the dropdown shows the owner's actual name, not "Unknown Owner".

- [ ] **Step 3.5: Commit**

```bash
git add src/App.jsx
git commit -m "fix(dashboard): pre-fetch owners for dogs returned by search"
```

### Task 4: Replace "Null" surname renders with empty surname (data + display)

**Why:** The migration `supabase/migrations/20260513150000_fix_null_surnames.sql` already resets surname to '' for the three literal-Null variants and adds a CHECK constraint. We need to (a) confirm it has been applied to staging/prod, (b) defensively make the UI render an empty surname as just the first name everywhere.

**Files:**
- Modify: `src/utils/formatOwnerLabel.js` — confirm the trim already drops empty surname; add explicit test.
- Modify: `src/utils/formatOwnerLabel.test.js` — create if missing (verify with `ls src/utils/`).

- [ ] **Step 4.1: Verify migration deployment status**

Run:
```bash
grep -A2 "fix_null_surnames" supabase/migrations/20260513150000_fix_null_surnames.sql | head -5
```
Then ASK BLEEP: "Has migration `20260513150000_fix_null_surnames.sql` been applied to the Supabase project the deployed dashboard talks to?" Block the rest of Task 4 on the answer.

- [ ] **Step 4.2: If migration not applied, apply it via the Supabase MCP**

If Bleep confirms it hasn't been run, use the `mcp__plugin_supabase_supabase__authenticate` tool then `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__apply_migration` to apply it. Do **not** run this without explicit go-ahead — it touches production data.

- [ ] **Step 4.3: Confirm formatOwnerLabel handles empty surname cleanly**

Open `src/utils/formatOwnerLabel.js` and confirm line 51 already trims:
```javascript
(human ? `${human.name || ""} ${human.surname || ""}`.trim() : "")
```
A human with `surname: ""` yields `"Anna"`, not `"Anna "`. Good.

- [ ] **Step 4.4: Add a regression test if the file lacks one**

Run: `ls src/utils/formatOwnerLabel.test.js 2>/dev/null && echo "exists" || echo "missing"`

If missing, create `src/utils/formatOwnerLabel.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { formatOwnerLabel } from "./formatOwnerLabel.js";

describe("formatOwnerLabel", () => {
  it("renders just the first name when surname is empty", () => {
    const humans = {
      "Andrea": {
        id: "h-1", fullName: "Andrea", name: "Andrea", surname: "", phone: "07700900111",
      },
    };
    const dog = { id: "d-1", _humanId: "h-1", humanId: "Andrea" };
    expect(formatOwnerLabel(dog, humans).label).toBe("Andrea");
  });

  it("refuses to render a UUID-shaped name", () => {
    const dog = { id: "d-2", humanId: "1b2e9d3a-4c5f-6789-abcd-ef0123456789" };
    expect(formatOwnerLabel(dog, {}).label).toBe("Unknown owner");
  });

  it("falls back to Unknown owner when humans map is empty", () => {
    const dog = { id: "d-3", humanId: "Anna Cragg" };
    expect(formatOwnerLabel(dog, {}).label).toBe("Anna Cragg");
  });
});
```

- [ ] **Step 4.5: Run the new test**

Run: `npx vitest run src/utils/formatOwnerLabel.test.js`
Expected: 3 passing.

- [ ] **Step 4.6: Commit**

```bash
git add src/utils/formatOwnerLabel.test.js
git commit -m "test(format-owner-label): cover empty-surname and UUID cases"
```

---

## Phase 3: Inbox graceful error & schema verification

**Why:** `/inbox` shows "column whatsapp_conversations.autonomous_booking_enabled does not exist". Migration `20260512140000_whatsapp_autonomous_booking.sql` defines that column. So either the migration is unapplied on the deployed Supabase, or PostgREST's schema cache is stale. Either way, the UI must not leak the raw DB error to the user.

**Files:**
- Modify: `src/components/views/inbox/InboxView.jsx` (or the parent that consumes the inbox error) — render a friendly error with retry.
- Modify: `src/supabase/hooks/useWhatsAppInbox.js` — surface the error type so the UI can react.

### Task 5: Verify the migration is applied

- [ ] **Step 5.1: Ask Bleep**

Ask: "The autonomous_booking column migration is in source control as `20260512140000_whatsapp_autonomous_booking.sql`. Can you confirm whether it has been applied to the Supabase project at `VITE_SUPABASE_URL`? If not, we need to run it before the inbox will load."

- [ ] **Step 5.2: If unapplied, apply it via MCP — pause for explicit Bleep go-ahead**

Use `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__list_migrations` to compare local vs remote, then `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__apply_migration` with the file body **only after Bleep confirms**.

- [ ] **Step 5.3: If applied but cache is stale, refresh PostgREST**

Run via the Supabase SQL editor (or `mcp__27bf0079-3c44-48ab-9bd8-774abbea16b6__execute_sql`):

```sql
notify pgrst, 'reload schema';
```

This reloads PostgREST's schema cache without a deploy.

### Task 6: Graceful error UI for inbox load failures

**Files:**
- Modify: `src/components/views/inbox/InboxView.jsx` — find the error branch and improve it.

- [ ] **Step 6.1: Locate the error branch**

Run: `grep -n "Couldn't load\|loadError\|conversationsError\|error" src/components/views/inbox/InboxView.jsx | head -20`
Identify the JSX branch that currently renders the raw error message.

- [ ] **Step 6.2: Replace the raw error display**

Where the inbox renders `error.message` or similar, replace with:

```jsx
{loadError && (
  <div role="alert" className="m-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <h2 className="text-sm font-bold text-amber-900">We can't load your messages right now</h2>
    <p className="mt-1 text-xs text-amber-800">
      The inbox is temporarily unavailable. This usually clears within a minute. If it doesn't, ping support.
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-900 px-3 py-1.5 text-xs font-bold text-amber-50 hover:bg-amber-950"
    >
      Try again
    </button>
    {import.meta.env.DEV && (
      <details className="mt-3 text-[10px] text-amber-700">
        <summary>Dev: error details</summary>
        <pre className="whitespace-pre-wrap mt-1">{String(loadError?.message || loadError)}</pre>
      </details>
    )}
  </div>
)}
```

The raw DB error stays in dev mode for debugging but never reaches a live user.

- [ ] **Step 6.3: Wire up `onRetry`**

In the same file, ensure the `useWhatsAppInbox` hook (or whichever fetches) exposes a retry function. If `fetchConversationsList` is wrapped in something like `refetch`, pass `refetch` as `onRetry`. If not, add one — re-invoke the fetcher and clear local error state.

- [ ] **Step 6.4: Manual test**

Temporarily break the query — e.g. add a dummy column to the SELECT in `src/supabase/hooks/useWhatsAppInbox.js:52` — reload `/inbox` in the dev server, confirm the friendly error appears, and revert the dummy column.

- [ ] **Step 6.5: Commit**

```bash
git add src/components/views/inbox/InboxView.jsx
git commit -m "fix(inbox): friendly error UI when conversations fail to load"
```

---

## Phase 4: WhatsApp "Create booking" prefills date/time/dog/owner

**Why:** WhatsAppInboxCard's "Create booking" button passes the `top` conversation object up to its parent. But the parent (`WeekCalendarView.jsx:238, 247`) drops the argument and calls `openNewBooking(currentDateStr, "")` — losing the conversation. NewBookingModal already supports `initialDateStr` and `initialSlot`; we extend it with optional `initialOwnerHumanId`, `initialDogId`, and a banner showing the source message.

**Files:**
- Modify: `src/components/dashboard/WhatsAppInboxCard.jsx` — already passes `top`; no change.
- Modify: `src/components/dashboard/RightWorkflowSidebar.jsx`, `src/components/dashboard/UtilityTabs.jsx` — forward the conversation up.
- Modify: `src/components/layout/WeekCalendarView.jsx:238, 247` — receive conversation, derive prefill, call `openNewBooking`.
- Create: `src/utils/parseBookingHintsFromMessage.js` + `.test.js` — pure string parser.
- Modify: `src/components/modals/NewBookingModal.jsx` — accept `initialHumanId`, `initialDogId`, `sourceConversationId`.
- Modify: `src/App.jsx` — extend `showNewBooking` state shape.

### Task 7: Message hint parser (TDD)

**Files:**
- Create: `src/utils/parseBookingHintsFromMessage.js`
- Create: `src/utils/parseBookingHintsFromMessage.test.js`

- [ ] **Step 7.1: Write the failing test first**

Create `src/utils/parseBookingHintsFromMessage.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { parseBookingHintsFromMessage } from "./parseBookingHintsFromMessage.js";

describe("parseBookingHintsFromMessage", () => {
  const referenceDate = new Date("2026-05-17T10:00:00"); // Sun 17 May 2026

  it("parses an explicit day-of-month and time", () => {
    const hints = parseBookingHintsFromMessage(
      "book him in on the 11th at 09:30am",
      { referenceDate },
    );
    // 11th in the same month as referenceDate
    expect(hints.dateStr).toBe("2026-05-11");
    expect(hints.slot).toBe("09:30");
  });

  it("parses a UK-formatted date like 18/05", () => {
    const hints = parseBookingHintsFromMessage("can we do 18/05 at 8.30?", { referenceDate });
    expect(hints.dateStr).toBe("2026-05-18");
    expect(hints.slot).toBe("08:30");
  });

  it("parses 'tomorrow at 2pm' relative to the reference date", () => {
    const hints = parseBookingHintsFromMessage("tomorrow at 2pm", { referenceDate });
    expect(hints.dateStr).toBe("2026-05-18");
    expect(hints.slot).toBe("14:00");
  });

  it("returns no date when nothing parses", () => {
    const hints = parseBookingHintsFromMessage("hi! is alfie due for a groom?", { referenceDate });
    expect(hints.dateStr).toBeNull();
    expect(hints.slot).toBeNull();
  });

  it("normalises 9:30am into the 09:30 SALON_SLOTS format", () => {
    const hints = parseBookingHintsFromMessage("9:30am on monday", { referenceDate });
    expect(hints.slot).toBe("09:30");
  });
});
```

- [ ] **Step 7.2: Run the test (it should fail with module-not-found)**

Run: `npx vitest run src/utils/parseBookingHintsFromMessage.test.js`
Expected: fails — file does not exist.

- [ ] **Step 7.3: Implement the parser**

Create `src/utils/parseBookingHintsFromMessage.js`:

```javascript
// parseBookingHintsFromMessage — pull date + slot hints out of a WhatsApp
// customer message so the New Booking dialog can pre-fill instead of
// defaulting to today.
//
// Out of scope: ML-grade natural language understanding. We handle the
// half-dozen phrasings real customers actually use. If we can't parse,
// caller falls back to the existing default (today's date, no slot).
//
// Returns: { dateStr: "YYYY-MM-DD" | null, slot: "HH:MM" | null }

const DOW_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function pad2(n) { return String(n).padStart(2, "0"); }
function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseTime(text) {
  // 9am, 9:30am, 9.30am, 09:30, 14:00, 2pm
  const re = /\b(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm)?\b/i;
  const m = text.match(re);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const period = (m[3] || "").toLowerCase();
  if (period === "pm" && h < 12) h += 12;
  if (period === "am" && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${pad2(h)}:${pad2(min)}`;
}

function parseDate(text, referenceDate) {
  const t = text.toLowerCase();
  const now = new Date(referenceDate);

  // "today" / "tomorrow"
  if (/\btomorrow\b/.test(t)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return toDateStr(d);
  }
  if (/\btoday\b/.test(t)) return toDateStr(now);

  // UK dd/mm or dd/mm/yyyy
  const slashMatch = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return toDateStr(d);
  }

  // "the 11th" / "11th" — assume current month, or next month if already past
  const ordinalMatch = t.match(/\b(?:on the |the )?(\d{1,2})(?:st|nd|rd|th)\b/);
  if (ordinalMatch) {
    const day = parseInt(ordinalMatch[1], 10);
    let candidate = new Date(now.getFullYear(), now.getMonth(), day);
    if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      candidate = new Date(now.getFullYear(), now.getMonth() + 1, day);
    }
    if (day >= 1 && day <= 31) return toDateStr(candidate);
  }

  // Day-of-week (next occurrence)
  for (let i = 0; i < DOW_NAMES.length; i++) {
    const re = new RegExp(`\\b${DOW_NAMES[i]}\\b`);
    if (re.test(t)) {
      const target = i;
      const today = now.getDay();
      let offset = target - today;
      if (offset <= 0) offset += 7;
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return toDateStr(d);
    }
  }

  // "5 May" / "5th of May"
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const re = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_NAMES[i]}\\b`);
    const m = t.match(re);
    if (m) {
      const day = parseInt(m[1], 10);
      const d = new Date(now.getFullYear(), i, day);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return toDateStr(d);
    }
  }

  return null;
}

export function parseBookingHintsFromMessage(text, { referenceDate = new Date() } = {}) {
  if (!text) return { dateStr: null, slot: null };
  return {
    dateStr: parseDate(text, referenceDate),
    slot: parseTime(text),
  };
}
```

- [ ] **Step 7.4: Run the test and verify passes**

Run: `npx vitest run src/utils/parseBookingHintsFromMessage.test.js`
Expected: all 5 passing.

- [ ] **Step 7.5: Commit**

```bash
git add src/utils/parseBookingHintsFromMessage.js src/utils/parseBookingHintsFromMessage.test.js
git commit -m "feat(util): parse date/time hints from customer messages"
```

### Task 8: Wire the parser into the inbox → new-booking flow

**Files:**
- Modify: `src/components/dashboard/RightWorkflowSidebar.jsx`
- Modify: `src/components/dashboard/UtilityTabs.jsx`
- Modify: `src/components/layout/WeekCalendarView.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/modals/NewBookingModal.jsx`

- [ ] **Step 8.1: Confirm the prop shape in RightWorkflowSidebar / UtilityTabs**

Run: `sed -n '1,30p' src/components/dashboard/RightWorkflowSidebar.jsx src/components/dashboard/UtilityTabs.jsx`
Verify both already accept `onCreateBookingFromWhatsApp` and pass it as `onCreateBooking` to WhatsAppInboxCard. No change needed in these two files **unless** they swallow the conversation arg — confirm `<WhatsAppInboxCard onCreateBooking={onCreateBookingFromWhatsApp} />` forwards it directly (currently it does).

- [ ] **Step 8.2: Update WeekCalendarView to consume the conversation**

In `src/components/layout/WeekCalendarView.jsx`, find lines 238 and 247:

```jsx
onCreateBookingFromWhatsApp={() => openNewBooking(currentDateStr, "")}
```

Replace with a handler that receives the conversation:

```jsx
onCreateBookingFromWhatsApp={(conversation) => {
  if (!conversation) {
    openNewBooking(currentDateStr, "");
    return;
  }
  const text = conversation.lastText || conversation.last_customer_text || "";
  const hints = parseBookingHintsFromMessage(text, { referenceDate: new Date() });
  setShowNewBooking({
    dateStr: hints.dateStr || currentDateStr,
    slot: hints.slot || "",
    initialHumanId: conversation.humanId || conversation.human_id || null,
    sourceConversationId: conversation.id || conversation.conversationId || null,
    sourceMessageText: text,
  });
}}
```

Add the import at the top of `src/components/layout/WeekCalendarView.jsx`:

```javascript
import { parseBookingHintsFromMessage } from "../../utils/parseBookingHintsFromMessage.js";
```

Note that `setShowNewBooking` must be accepted as a prop from App.jsx — check the prop list at line 68 (it's already there). The local `openNewBooking` helper sets a 2-key object; we now set a richer object, so the modal receives the extra keys.

- [ ] **Step 8.3: Make NewBookingModal accept the new props**

In `src/components/modals/NewBookingModal.jsx`, around line 23, extend the props list to include:

```javascript
  initialHumanId,
  sourceConversationId,
  sourceMessageText,
```

…and pass `initialHumanId` down to the dog-picker so a matching dog/owner can be pre-selected. The simplest version of this fix:

1. If `initialHumanId` is set, on mount filter `dogs` by `_humanId === initialHumanId` and pre-populate the search query with the owner's `fullName`. The user reviews and confirms.
2. If `sourceMessageText` is set, render a small banner above the form:

```jsx
{sourceMessageText && (
  <div className="mx-6 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
    <span className="font-bold">From WhatsApp:</span> "{sourceMessageText.slice(0, 140)}"
  </div>
)}
```

The banner anchors the user to what triggered the dialog, so if our parser missed something (e.g. parsed wrong day), they can spot and correct it.

- [ ] **Step 8.4: Update App.jsx's NewBookingModal usage**

Around line 677 in `src/App.jsx`, pass the new keys through:

```jsx
initialDateStr={showNewBooking.dateStr}
initialSlot={showNewBooking.slot}
initialHumanId={showNewBooking.initialHumanId}
sourceConversationId={showNewBooking.sourceConversationId}
sourceMessageText={showNewBooking.sourceMessageText}
```

- [ ] **Step 8.5: Manual smoke test**

```bash
npm run dev
```
1. On the dashboard, click "Create booking" inside the WhatsApp inbox card.
2. Expected: NewBookingModal opens with the green "From WhatsApp" banner, the date prefilled if the message contained one (e.g. "11th"), the slot prefilled if the message contained a time, and the dog search prefilled with the owner's name.

- [ ] **Step 8.6: Commit**

```bash
git add src/components/layout/WeekCalendarView.jsx src/App.jsx src/components/modals/NewBookingModal.jsx
git commit -m "feat(inbox): prefill new booking with date/time/owner from message"
```

---

## Phase 5: Revenue card label + "This week" consistency

**Why:** `WeeklyRevenueCard.jsx` hardcodes the label as "Today" regardless of selected day. The sub-text shows the **selected** day's date — so you can land on Mon 11 May and the card says "Today Mon 11 May" even when today is Sun 17 May. `CapacityCard.jsx` already does this correctly (lines 51, 89). We mirror its pattern.

The "This week 2% vs 0%" inconsistency the review noted may be a label confusion (the user was reading the Today/Selected-day mismatch as a week mismatch) or a transient state issue. We add a reproducer test and gate the fix on what we observe.

**Files:**
- Modify: `src/components/dashboard/WeeklyRevenueCard.jsx`.
- Create: `src/components/dashboard/WeeklyRevenueCard.test.tsx` (new) — uses Vitest + react-testing-library? **Check first** — see Step 9.1.

### Task 9: Fix the "Today" label

**Files:**
- Modify: `src/components/dashboard/WeeklyRevenueCard.jsx`

- [ ] **Step 9.1: Check the existing testing conventions**

Run: `ls src/components/dashboard/*.test.* 2>/dev/null && grep -l "render\|@testing-library" src/components/dashboard/*.test.* 2>/dev/null`
If no React component tests exist in `components/dashboard`, do not introduce a new testing dependency for this fix. Skip Step 9.2 and rely on manual verification + the engine-level test (`computeRevenue` already tested).

- [ ] **Step 9.2: (Conditional) Add a snapshot-style test if RTL is available**

Only if step 9.1 shows `@testing-library/react` is already installed:
```javascript
// src/components/dashboard/WeeklyRevenueCard.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { WeeklyRevenueCard } from "./WeeklyRevenueCard.jsx";

describe("WeeklyRevenueCard", () => {
  it("labels the day row 'This day' when selected day is not today", () => {
    const future = new Date();
    future.setDate(future.getDate() + 2);
    render(
      <WeeklyRevenueCard
        dates={[]}
        bookingsByDate={{}}
        dogs={{}}
        currentDateObj={future}
      />,
    );
    expect(screen.getByText(/This day/)).toBeInTheDocument();
    expect(screen.queryByText(/^Today$/)).toBeNull();
  });
});
```
Otherwise skip.

- [ ] **Step 9.3: Mirror CapacityCard's logic**

In `src/components/dashboard/WeeklyRevenueCard.jsx`, replace the body of `WeeklyRevenueCard` (lines 55–113). Key changes:

1. Add `const todayStr = toDateStr(new Date());` near the top, *separate* from `selectedStr`.
2. Rename the existing `todayStr` (line 61) to `selectedStr`.
3. Update `useMemo` for `dayRevenue` to use `selectedStr`.
4. Change the `<RevenueBar label="Today" ... />` line to `<RevenueBar label={selectedStr === todayStr ? "Today" : "This day"} ... />`.

Concrete replacement:

```jsx
export function WeeklyRevenueCard({
  dates,
  bookingsByDate,
  dogs,
  currentDateObj,
}) {
  const todayStr = toDateStr(new Date());
  const selectedStr = currentDateObj ? toDateStr(currentDateObj) : null;

  const dayRevenue = useMemo(() => {
    if (!selectedStr) return 0;
    return computeRevenue(bookingsByDate?.[selectedStr] || [], dogs);
  }, [bookingsByDate, dogs, selectedStr]);

  const weekRevenue = useMemo(() => {
    return (dates || []).reduce(
      (sum, d) =>
        sum + computeRevenue(bookingsByDate?.[d.dateStr] || [], dogs),
      0,
    );
  }, [dates, bookingsByDate, dogs]);

  const dayPct = Math.round((dayRevenue / DAY_REVENUE_TARGET) * 100);
  const weekPct = Math.round((weekRevenue / WEEK_REVENUE_TARGET) * 100);

  return (
    <section
      aria-label="Revenue summary"
      className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-4"
    >
      <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
        Revenue
      </h2>

      <div className="flex flex-col gap-3">
        <RevenueBar
          amount={dayRevenue}
          pct={dayPct}
          label={selectedStr === todayStr ? "Today" : "This day"}
          sub={
            currentDateObj
              ? currentDateObj.toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })
              : ""
          }
          statusLabel={revenueLabel(dayPct, dayRevenue > 0)}
        />
        <RevenueBar
          amount={weekRevenue}
          pct={weekPct}
          label="This week"
          statusLabel={revenueLabel(weekPct, weekRevenue > 0)}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 9.4: Manual smoke test**

```bash
npm run dev
```
1. Open the dashboard — today's date.
2. Confirm the Revenue card shows "Today" for the day row.
3. Navigate to another day in the same week.
4. Confirm it now says "This day" with the selected day's date.

- [ ] **Step 9.5: Reproduce or rule out the "this week 0% vs 2%" bug**

This is an investigation step, not a fix step.
1. Run the dev server.
2. Land on the dashboard (now defaults to today's day per Phase 1).
3. Note the "This week" revenue value.
4. Click through each day of the same calendar week and note the value at each step.
5. Result: either the value stays constant (the user's report was actually about the Today/Selected label confusion fixed in 9.3), or it changes — in which case capture the exact reproduction in `WeeklyRevenueCard.test.tsx` and triage.

If the value does drift between days of the same week, the most likely culprits are (in order): a stale `bookingsByDate` reference due to render order with `useBookings`, the `dates` array being recomputed without matching `bookingsByDate`, or a real-time subscription resetting state. Investigate with React DevTools before changing code.

- [ ] **Step 9.6: Commit**

```bash
git add src/components/dashboard/WeeklyRevenueCard.jsx
git commit -m "fix(dashboard): revenue card labels 'Today' only when selected = today"
```

---

## Phase 6: Reports figures — clearly label scopes

**Why:** `/reports` shows "This week £42 · 1 booking · 5% filled" at the top and "£202 · 5 bookings · 3 customers · 13% seat fill" in the cards below. The numbers differ because the period is different (this week so far vs last 30 days, or similar), but neither card says so. We add explicit scope labels.

**Files:**
- Modify: `src/components/views/ReportsView.jsx` (and any header/card subcomponents it composes).

### Task 10: Label every Reports figure with its scope

**Files:**
- Modify: `src/components/views/ReportsView.jsx`
- Modify: any sub-components in `src/components/views/reports/` that render headline figures.

- [ ] **Step 10.1: Map every figure to its source**

Run: `grep -rn "curRev\|weekStats\|monthStats\|periodStats" src/components/views/ReportsView.jsx src/components/views/reports/ 2>/dev/null`

For each top-level figure in the ReportsView output, identify whether it's the "current week" subset or the full `useReportsData(days)` window. The header insight ("This week £42 · 1 booking") almost certainly filters `cur` to `booking_date >= mondayStr`, while the cards use the full window from `useReportsData(30)` or similar.

- [ ] **Step 10.2: Replace ambiguous "This week" labels**

For any card labelled "This week" that actually reflects a longer window, rename to "Last 30 days" / "Last 7 days" depending on what `useReportsData` is being called with.

For genuine same-week-so-far cards, keep "This week" but add a `<span>` sub-label clarifying:

```jsx
<h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
  This week so far
  <span className="ml-1 text-slate-300 font-medium normal-case">(Mon–today)</span>
</h3>
```

- [ ] **Step 10.3: Reconcile the seat fill rate calculation**

The review reports "13% seat fill across 2 open days" alongside a daily revenue chart showing only Mon active. Open `useReportsData.ts` and find where `util` (utilisation) is computed. Confirm the denominator matches the periods displayed. If `util` is over the full `days` window but rendered as a week-level figure, add a separate `weekUtil` and surface that instead.

Concretely: in `src/hooks/useReportsData.ts`, search for `util` (around line 220–260 by visual scan). Add a sibling `util7` keyed on the most recent 7 calendar days, exported alongside `util`. Update the consumer card to read `util7` with the label "Seat fill (last 7 days)".

- [ ] **Step 10.4: Manual smoke test**

```bash
npm run dev
```
Visit `/reports` and confirm every figure carries an unambiguous period label. No two cards should both say "This week" with different numbers.

- [ ] **Step 10.5: Commit**

```bash
git add src/hooks/useReportsData.ts src/components/views/ReportsView.jsx src/components/views/reports/
git commit -m "fix(reports): label every figure with its scope, add util7"
```

---

## Phase 7: Mini-calendar today vs selected day

**Why:** When a day is both "today" and "selected", only the selected style applies — losing the visual cue for "today". Pick another day and you can no longer tell where today is. Today should always be discoverable.

**Files:**
- Modify: `src/components/dashboard/MiniCalendarCard.jsx` (the `<button>` className at lines 131–137 and the rendered children at 138–145).

### Task 11: Distinguish today from selected at all times

- [ ] **Step 11.1: Update the className composition**

In `src/components/dashboard/MiniCalendarCard.jsx`, replace the button at lines 126–147 with:

```jsx
              <button
                key={dateStr}
                onClick={() => onSelectDate(date)}
                aria-label={ariaLabel}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                className={`relative w-full aspect-square rounded-md text-[11px] font-bold border-none cursor-pointer transition-all flex items-center justify-center ${
                  isSelected
                    ? "bg-brand-yellow text-brand-purple shadow-[0_2px_6px_rgba(254,204,19,0.35)]"
                    : `bg-transparent ${numberColor} hover:bg-slate-50`
                } ${
                  isToday
                    ? "ring-2 ring-brand-purple ring-offset-1 ring-offset-white"
                    : ""
                }`}
              >
                <span>{date.getDate()}</span>
                {dotColor && !isSelected && (
                  <span
                    className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${dotColor}`}
                    aria-hidden="true"
                  />
                )}
              </button>
```

Result:
- **Today, not selected**: yellow background absent, but a purple ring around the cell.
- **Selected, not today**: solid yellow fill, no ring.
- **Today AND selected**: solid yellow fill + purple ring (both indicators stack).
- **Other day**: transparent.

- [ ] **Step 11.2: Add a small legend below the calendar grid**

Append below the `<div className="grid grid-cols-7 gap-1">` block (after line 149, inside the surrounding `<div className="p-3">`):

```jsx
        <div className="mt-3 flex items-center justify-center gap-3 text-[9px] font-semibold text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full ring-2 ring-brand-purple inline-block" />
            Today
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-brand-yellow inline-block" />
            Selected
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Bookings
          </span>
        </div>
```

- [ ] **Step 11.3: Manual smoke test**

```bash
npm run dev
```
1. Open dashboard.
2. Confirm today's cell has a purple ring even when another day is selected.
3. Confirm the legend renders below the grid and matches the visual treatment.

- [ ] **Step 11.4: Commit**

```bash
git add src/components/dashboard/MiniCalendarCard.jsx
git commit -m "fix(calendar): distinguish today from selected day with a ring + legend"
```

---

## Phase 8: Status pill — extended undo window + icons

**Why:** `changeStatus` in `BookingCardNew.jsx:161` calls `toast.show(message, "info", undoCallback)`. The toast clears after 4000ms (`TOAST_DURATION` in `ToastContext.jsx:15`). The review found this too short to react to a misclick. We extend the timeout when an undo callback is present and add icon hints to the status pills for colour-deficient users.

**Files:**
- Modify: `src/contexts/ToastContext.jsx` — duration depends on whether `onUndo` was passed.
- Modify: `src/components/booking/BookingCardNew.jsx` — toast text + (optional) confirm before destructive jumps.
- Modify: `src/constants/index.ts` or wherever `STATUS_DISPLAY` lives — add icons.

### Task 12: Longer toast duration when undo is available

**Files:**
- Modify: `src/contexts/ToastContext.jsx`

- [ ] **Step 12.1: Make the duration depend on whether undo exists**

In `src/contexts/ToastContext.jsx`, replace the relevant section:

```javascript
const TOAST_DURATION = 4000;
const TOAST_DURATION_WITH_UNDO = 10000;
```

…then:

```javascript
  const show = useCallback((message, variant = "info", onUndo) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, variant, onUndo }]);

    const ms = onUndo ? TOAST_DURATION_WITH_UNDO : TOAST_DURATION;
    setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);
```

- [ ] **Step 12.2: Manual smoke test**

```bash
npm run dev
```
1. Click a booking's status pill, pick a new status.
2. Time how long the toast stays — should be roughly 10 seconds now.
3. Click "Undo" and confirm the booking returns to the previous status.

- [ ] **Step 12.3: Commit**

```bash
git add src/contexts/ToastContext.jsx
git commit -m "fix(toast): 10s window for undo, 4s otherwise"
```

### Task 13: Confirm destructive status jumps

**Files:**
- Modify: `src/components/booking/BookingCardNew.jsx`

- [ ] **Step 13.1: Define the "destructive" jumps**

A jump from `Booked` → `Completed` (skipping all intermediate steps) is the kind of misclick that hurts most. Treat any jump that skips two or more steps in `STATUS_PROGRESSION` as destructive and ask for confirmation.

- [ ] **Step 13.2: Add the guard**

In `src/components/booking/BookingCardNew.jsx`, change `changeStatus` (line 161) to:

```javascript
  const changeStatus = (nextStatus) => {
    if (!nextStatus || nextStatus === booking.status) return;
    const previous = booking.status || "Booked";
    const prevIdx = STATUS_PROGRESSION.indexOf(previous);
    const nextIdx = STATUS_PROGRESSION.indexOf(nextStatus);
    const skipped = nextIdx - prevIdx;
    if (skipped >= 2) {
      const ok = window.confirm(
        `Skip from "${STATUS_DISPLAY[previous]?.label || previous}" straight to "${STATUS_DISPLAY[nextStatus]?.label || nextStatus}"?`,
      );
      if (!ok) return;
    }
    if (onUpdate) onUpdate({ ...booking, status: nextStatus }, currentDateStr, currentDateStr);
    toast.show(
      `Marked as ${STATUS_DISPLAY[nextStatus]?.label ?? nextStatus}`,
      "info",
      () => onUpdate?.({ ...booking, status: previous }, currentDateStr, currentDateStr),
    );
  };
```

- [ ] **Step 13.3: Manual smoke test**

```bash
npm run dev
```
1. On a booking with status "Booked", click the status pill and try to jump to "Completed".
2. Confirm the browser confirm prompt appears.
3. Decline — booking stays "Booked". Accept — booking moves to "Completed".

- [ ] **Step 13.4: Commit**

```bash
git add src/components/booking/BookingCardNew.jsx
git commit -m "fix(booking): confirm when status jump skips two+ steps"
```

### Task 14: Add icons to status pills

**Files:**
- Modify: wherever `STATUS_DISPLAY` is defined (likely `src/constants/index.ts` or `src/constants/salon.ts` — confirm with `grep -rn "STATUS_DISPLAY" src/constants` first).

- [ ] **Step 14.1: Locate STATUS_DISPLAY**

Run: `grep -rn "STATUS_DISPLAY\b" src/constants /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/types 2>/dev/null | head -10`

Open the file that defines it.

- [ ] **Step 14.2: Add an icon name per status**

For each status (Booked / Checked in / In bath / Ready / Completed), assign a `lucide-react` icon name. Suggested mapping:

```
Booked     → "calendar"
CheckedIn  → "log-in"
InBath     → "droplets"
Ready      → "sparkles"
Completed  → "check"
```

Add an `icon` property to each entry in `STATUS_DISPLAY`.

- [ ] **Step 14.3: Render the icon in BookingCardNew**

In `src/components/booking/BookingCardNew.jsx`, near the import block, add:

```javascript
import { Calendar, LogIn, Droplets, Sparkles, Check } from "lucide-react";

const STATUS_ICONS = {
  Booked: Calendar,
  CheckedIn: LogIn,
  InBath: Droplets,
  Ready: Sparkles,
  Completed: Check,
};
```

Then in the rendered status pill `<button>` (around line 348), prepend the icon component before the text:

```jsx
{(() => {
  const Icon = STATUS_ICONS[booking.status] || Calendar;
  return <Icon size={10} strokeWidth={2.5} aria-hidden="true" />;
})()}
```

Make sure to confirm the exact status keys used in your codebase first (some may be "checked-in" vs "CheckedIn"; check `STATUS_PROGRESSION`).

- [ ] **Step 14.4: Manual smoke test**

Each pill now shows its icon — verify a colourblind palette test (e.g. zoom Chrome DevTools' rendering tab → Emulate vision deficiencies → Deuteranopia) doesn't make adjacent statuses look identical.

- [ ] **Step 14.5: Commit**

```bash
git add src/constants/ src/components/booking/BookingCardNew.jsx
git commit -m "fix(booking): pair status pills with icons for colour-deficient users"
```

---

## Phase 9: Duplicate dog name disambiguation

**Why:** "Alfie" appears 8+ times in the directory. Without owner + breed visible, picking one is a coin flip. Phase 2's fix already restores owner names in the search dropdown; this phase adds a softer prompt when an owner search returns multiple same-name dogs.

**Files:**
- Modify: `src/components/modals/new-booking/DogSearchSection.jsx` — render a "(N dogs share this name)" badge when needed.

### Task 15: Show a duplicate badge in the dog-picker

**Files:**
- Modify: `src/components/modals/new-booking/DogSearchSection.jsx`

- [ ] **Step 15.1: Compute duplicate name counts**

In `DogSearchSection.jsx`, after the `filteredEntries` `useMemo` (around line 52), add:

```javascript
  const nameCounts = useMemo(() => {
    const counts = {};
    for (const entry of filteredEntries) {
      const k = (entry.dog.name || "").toLowerCase();
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }, [filteredEntries]);
```

- [ ] **Step 15.2: Show the badge in the dropdown header row**

In the same file, around line 250 (where `<span className="text-sm font-bold text-slate-800">{titleCase(entry.dog.name)}</span>` renders), wrap with:

```jsx
<span className="text-sm font-bold text-slate-800">{titleCase(entry.dog.name)}</span>
{nameCounts[(entry.dog.name || "").toLowerCase()] > 1 && (
  <span
    className="ml-1 text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded-full"
    aria-label={`${nameCounts[(entry.dog.name || "").toLowerCase()]} dogs share this name`}
  >
    {nameCounts[(entry.dog.name || "").toLowerCase()]}×
  </span>
)}
```

The breed + owner row immediately below already gives the disambiguator (after Phase 2's owner fix).

- [ ] **Step 15.3: Manual smoke test**

```bash
npm run dev
```
1. Open "+ New booking".
2. Type "Alfie" — confirm each result shows the "8×" (or whatever count) badge.
3. Pick one and confirm the booking flow proceeds with the right dog.

- [ ] **Step 15.4: Commit**

```bash
git add src/components/modals/new-booking/DogSearchSection.jsx
git commit -m "fix(new-booking): show duplicate-name count badge in search dropdown"
```

---

## Phase 10: Copy fix — "Bath & Deshed" → "Bath & De-shed"

**Why:** Trivial copy fix that the review flagged. Bundled here so it doesn't get lost.

**Files:** `src/constants/salon.ts:12`, `src/components/customer/dashboardConstants.js:4` (customer portal — out of scope for this plan but ship anyway since it's one line), `src/components/views/inbox/helpers.js:49`, `src/components/customer/booking/ServiceSelection.tsx:19` (out of scope), `src/supabase/seed.js` if it has a display label.

- [ ] **Step 16.1: Find every display occurrence**

Run: `grep -rn "Bath & Deshed\|Bath & deshed\|Bath, blow-dry, and de-shedding" src 2>/dev/null`

- [ ] **Step 16.2: Replace in each**

For each match, change "Bath & Deshed" → "Bath & De-shed". Leave the `bath-and-deshed` slug alone (DB column / type / IDs).

- [ ] **Step 16.3: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

- [ ] **Step 16.4: Commit**

```bash
git add src/
git commit -m "fix(copy): 'Bath & Deshed' -> 'Bath & De-shed' across UI"
```

---

## Self-Review (run before opening any PR)

- **Spec coverage:** every numbered item in the original review (1–10 top fixes plus "Bath & Deshed" and the closed-day-seat tooltip) maps to at least one task in this plan. The closed-day-seat tooltip ("Mon 18 May 9:30 right seat shows 'Closed' with no explanation") is *not yet covered* — see Backlog below. Add a Phase 11 if Bleep wants it in this batch.
- **Placeholder scan:** no "TBD" or "implement appropriately" in any step.
- **Type consistency:** `STATUS_DISPLAY` key names referenced in Task 13/14 must match the actual keys in the constants file — Step 14.1 is the verification step. `parseBookingHintsFromMessage` returns `{ dateStr, slot }`, used consistently in Task 8.

## Backlog (out of scope for this plan, but worth tracking)

- **Closed-day seat tooltip** (review issue under §1) — explain *why* a seat is closed when the day is open (groomer 2 unavailable, lunch, etc.). Touches `BlockedSeatCell.jsx`. Probably a single small PR.
- **Phone-number tel: links in /humans** (review issue under §7).
- **Sort/filter in Dogs and Humans directories** ("incomplete only", "has alerts", etc.).
- **Closed-day "Add to waitlist / Propose alternative"** CTA on the closed-day empty view.
- **Drop `?date=` from non-bookings routes** (review issue under §9).
- **Reduce decorative yellow paw watermark opacity** (review §8 last item).
- **Single header "+ New booking" button** (review §8) — currently rendered twice on wide screens.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-dashboard-ux-fixes.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per phase, with review checkpoints between. Best for this plan because the phases are mostly independent and the implementer can parallelise (e.g. Phase 7 and Phase 10 can run alongside Phase 5).

2. **Inline Execution** — execute phases in this session using `superpowers:executing-plans`, with the user reviewing after each phase.

Which approach do you want?
