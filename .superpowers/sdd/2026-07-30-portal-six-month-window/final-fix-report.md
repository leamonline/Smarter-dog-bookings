# Final fix report — portal and AI truthfulness

Date: 30 July 2026

Starting HEAD: `20c2022ab008ff1b3200ed4feed979805df6ed96`

Commit subject: `Fix portal availability truthfulness`

## Outcome

All five Important final-review findings and both directly related Minor
findings are fixed within the existing six-month portal/AI branch. The portal
now makes response-limit-safe blocked-seat reads, preserves the date page and
successful page cache through Continue/Back, uses approved six-month copy,
never renders a new range from stale page state, and labels incomplete
availability honestly. The real WhatsApp handler now tells Anthropic, on every
request, that only listed small/medium date-and-slot combinations are verified
and that an omitted date is unverified.

No migration, policy activation, Flow change, generated type, configuration
write, pricing change or production write was made.

## Files changed

- `src/components/customer/booking/DateSelection.tsx`
  - Split blocked-seat reads into inclusive chunks of at most 14 calendar days.
  - Merged chunk maps and tracked open-day, occupancy and blocked-seat
    completeness.
  - Keyed displayed availability by the visible `rangeKey`.
  - Added rejected-promise handling, truthful degraded status and approved
    horizon copy.
  - Added optional controlled page/cache props while retaining the isolated
    component fallback.
- `src/components/customer/booking/BookingWizard.tsx`
  - Hoisted date-page state and the successful-page cache to the mounted
    wizard.
- `src/supabase/repositories/bookingsRepo.ts`
  - Made `listBlockedSeats` return `{ byDate, error }`, retaining the usable
    empty-map fallback.
- `supabase/functions/whatsapp-agent/handler.ts`
  - Added the positive small/medium verification rule to the Anthropic system
    contract and every non-empty availability context block.
- `src/components/customer/booking/DateSelection.paging.component.test.tsx`
  - Added/extended behavioural coverage for exact range arguments, 14-day
    chunking, chunk merging, blocked-seat retry/cache admission, all three
    degraded sources, stale/rejected ranges, horizon shrink, approved copy and
    both UK clock-change periods.
- `src/components/customer/booking/DateSelection.component.test.tsx`
  - Replaced the old degraded-state dimming claim with the truthful incomplete
    preview contract.
- `src/components/customer/booking/BookingWizard.horizon.component.test.tsx`
  - Added a real wizard Continue/Back journey covering later-page restoration,
    selected-date restoration and no repeated page availability read.
- `src/supabase/repositories/bookingsRepo.blockedSeats.test.ts`
  - Added repository boundary tests for successful folding and explicit errors.
- `supabase/functions/whatsapp-agent/__tests__/dispatch.test.ts`
  - Extended the real-handler test with one returned slot and one omitted
    default-open date, asserting the positive system and context rules.
- `.superpowers/sdd/2026-07-30-portal-six-month-window/final-fix-report.md`
  - This report.

`deno.lock` was refreshed by local Deno test execution and restored exactly to
HEAD; no lockfile churn is included.

## Implementation decisions

### 1. Response-limit-safe blocked seats

The first page still includes today for the existing immediate-slot
calculation, so it spans 29 inclusive dates and produces three blocked-seat
calls (`14 + 14 + 1`). Ordinary 28-day pages produce two calls (`14 + 14`).
Each result is folded into one `blockedByDate` map. Any chunk error is logged as
`DateSelection/get_blocked_seats`, marks the page incomplete and prevents cache
admission, while the empty-map fallback keeps the page usable.

### 2. Wizard-owned navigation state

`BookingWizard` owns `datePage` and a `Map<string, DatePageAvailability>` held
in a ref. `DateSelection` accepts those as controlled props but keeps its own
state/ref fallback for isolated tests and existing callers. A successful page
therefore survives the date step unmounting; Back restores the later page and
selected date without another open-day or occupancy read.

### 3. Approved customer copy

For exactly 180 days the range reads, for example:

> Days 29–56. Bookings are available up to six months ahead.

It does not say `of 180` or `180 days`. Other valid horizons retain a numerical
description such as `Days 1–28 of 28` and do not claim six months.

### 4. Range-keyed and degraded availability

Every page result carries its `rangeKey`. A mismatch between stored state and
the visible range renders loading rather than evaluating the new calendar
against old closure, occupancy or blocked-seat maps. Returned errors preserve
usable partial data but show a polite `role="status"` incomplete-preview
message. Rejected promises are caught, logged as
`DateSelection/get_page_availability`, replaced with an explicit incomplete
state for the current range, and always leave loading.

### 5. Positive AI verification contract

The Anthropic system rules now explicitly say that within every non-empty
small/medium availability block only listed date-and-slot combinations are
verified, and that a missing date is unverified rather than closed, full or
unavailable. The same instruction is appended to every non-empty availability
context block. The approved further-ahead wording, shared portal URL, 30-day AI
window, 60-day Flow behaviour and no-reply-handoff rule are unchanged.

### 6. Boundary coverage

Range tests assert the exact open-day and occupancy page bounds and every
blocked-seat chunk. Horizon shrink is covered after visiting the final page.
The spring and autumn UK clock-change periods use fixed local `Date`
constructors and fake only `Date`; assertions are on consecutive local calendar
strings (`2026-03-29` through `2026-03-31`, and `2026-10-25` through
`2026-10-27`). This avoids depending on the test runner's timezone offset while
exercising the production `setDate` calendar arithmetic across both boundary
dates.

## TDD evidence

### RED

Portal/repository command:

```text
npx vitest run src/components/customer/booking/DateSelection.paging.component.test.tsx src/components/customer/booking/BookingWizard.horizon.component.test.tsx src/supabase/repositories/bookingsRepo.blockedSeats.test.ts
```

Result: exit `1`; 15 tests failed. Thirteen exercised the intended missing
behaviours; two new clock-change assertions initially omitted the existing
Sunday `, closed` accessible-name suffix and were corrected without changing
the dates asserted. Representative production failures:

- `listBlockedSeats` returned no `error` property on either success or failure.
- the calendar made one blocked-seat call per page instead of 14-day chunks;
- six-month range text still rendered `of 180`;
- no incomplete `role="status"` appeared for any failed source;
- the rejected page promise escaped without the required catch;
- wizard Continue/Back lost the later page/cache;

Real-handler command:

```text
deno test --node-modules-dir=none --allow-env --filter "keeps later dates honest" supabase/functions/whatsapp-agent/__tests__/dispatch.test.ts
```

Result: exit `1`; `0 passed, 1 failed, 13 filtered out`. The captured Anthropic
system prompt did not contain the positive verification rule.

### GREEN

The first portal GREEN attempt exposed an implementation mistake
(`pageCache.current` after changing the value to a `Map`) and correctly failed.
After correcting the Map access, two deterministic boundary assertions were
adjusted to allow the existing Sunday `, closed` label without weakening the
calendar-date check.

Final focused portal/repository command:

```text
npx vitest run src/components/customer/booking/DateSelection.paging.component.test.tsx src/components/customer/booking/BookingWizard.horizon.component.test.tsx src/supabase/repositories/bookingsRepo.blockedSeats.test.ts
```

Result: exit `0`; `3 passed` files, `21 passed` tests.

Wider booking command:

```text
npx vitest run src/components/customer/booking src/supabase/repositories/bookingsRepo.blockedSeats.test.ts
```

Result: exit `0`; `13 passed` files, `49 passed` tests.

Focused real-handler command:

```text
deno test --node-modules-dir=none --allow-env --filter "keeps later dates honest" supabase/functions/whatsapp-agent/__tests__/dispatch.test.ts
```

Result: exit `0`; `1 passed`, `0 failed`, `13 filtered out`.

Full dispatch command:

```text
deno test --node-modules-dir=none --allow-env supabase/functions/whatsapp-agent/__tests__/dispatch.test.ts
```

Result: exit `0`; `14 passed`, `0 failed`.

## Complete verification

- `npm run lint`
  - Exit `0`.
  - `0 errors`; 124 existing `no-explicit-any` warnings in untouched legacy
    files. No warning is in a file changed by this fix.
- `npm run typecheck`
  - Exit `0`; both TypeScript passes completed with no diagnostics.
- `npm run check:migrations`
  - Exit `0`; `Migration validation OK (197 files)`.
- `npm test`
  - Exit `0`; `249 passed` files, `2437 passed` tests.
- `npm run build`
  - Exit `0`; Vite transformed 3,506 modules and completed the production/PWA
    build. It retained the existing informational empty `supabase` chunk.
- `deno test --node-modules-dir=none --allow-env supabase/functions/`
  - Exit `0`; `54 passed`, `0 failed`.
- `git diff --check`
  - Exit `0`; no whitespace errors.
- `git diff --quiet -- deno.lock`
  - Exit `0`; no lockfile change remains.

## Self-review

- Confirmed every blocked-seat call is inclusive and no wider than 14 calendar
  dates; first-page and later-page exact calls are asserted.
- Confirmed cache admission requires successful open-day, occupancy and every
  blocked-seat chunk read.
- Confirmed every returned-error branch remains usable and visibly incomplete,
  and every rejected page request installs current-range state and stops
  loading.
- Confirmed a visible range cannot consume availability state with another
  `rangeKey`.
- Confirmed BookingWizard, not the transient date step, owns both page and
  cache.
- Confirmed 180-day copy says six months and tests reject `of 180` and
  `180 days`; non-180 copy does not claim six months.
- Confirmed the real handler sends the positive rule in both the system prompt
  and non-empty availability context.
- Confirmed no approved further-ahead wording, portal URL, query window, Flow
  logic or handoff behaviour changed.
- Confirmed the diff contains no migration, policy, generated type, config,
  pricing, production-data or unrelated change.

## Concerns

No remaining functional concern was found. Two non-blocking repository
conditions remain visible and unchanged: lint emits 124 pre-existing warnings,
and the build reports an informational empty `supabase` chunk. Page reads now
make two blocked-seat RPCs for a normal page and three for the first page; that
is the intentional response-limit safety trade-off.
