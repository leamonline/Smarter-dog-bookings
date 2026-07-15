# Final whole-branch review fixes

Date: 2026-07-15

Branch: `design/today-live-arrivals-directory-cards`

Worktree: `/Users/leamonline/Developer/.worktrees/Smarter-dog-bookings/today-live-arrivals-directory-cards`

Runtime: Node `v22.23.1`, npm `10.9.8`

## Scope completed

1. `selectLiveFocus` now orders in-salon fallback bookings by the oldest valid `checkedInAt`; absent, invalid, or equal timestamps fall back deterministically to slot order.
2. Successful Ready and Collected actions now use the existing one-shot focused-booking scroll authorisation. A successful action on a non-focused booking does not authorise scrolling; existing minute, filter, and background-refetch safeguards remain covered.
3. The dog silhouette itself now carries the authoritative tone: small yellow-dark, medium teal-dark, large coral-dark, and unknown grey.
4. Collection contact loading now treats owner, trusted-link, same-day booking, and trusted-human query errors as load failures rather than “no contacts”. The Ready state remains visible, with Retry and close/not-now exits. Retry re-runs the queries. Template sending and logging code was not changed.
5. Human initials now use the first and last non-empty words (`Mary Jane Smith` → `MS`) while retaining one-word and empty-name fallbacks.

## RED evidence

Tests were added before production changes.

Command:

```sh
fnm exec --using=22 npm test -- src/engine/today.test.ts src/components/views/directory/IdentityMarker.component.test.jsx src/components/views/today/today.component.test.jsx src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx
```

Result: expected failure, 4 files failed; 10 tests failed and 137 passed. The failures showed:

- in-salon focus still chose the earlier slot instead of the older check-in;
- `Mary Jane Smith` rendered `MJ`;
- none of the four silhouettes carried their expected colour class;
- focused Ready did not request the second scroll;
- focused Collected initially exposed an ambiguous test query, which was corrected to target Jack’s booking card;
- contact query errors still rendered recipients/no-error state and offered no Retry.

After correcting only the ambiguous Collected test selector, the Today suite was rerun. Result: 2 expected failures (focused Ready and Collected scroll), 51 passed; the non-focused mutation, minute-tick, filter, and background-refetch safeguards passed.

## GREEN evidence

Focused command:

```sh
fnm exec --using=22 npm test -- src/engine/today.test.ts src/components/views/directory/IdentityMarker.component.test.jsx src/components/views/today/today.component.test.jsx src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx
```

Result: 4 files passed, 150 tests passed, 0 failed.

Repository-wide commands were each run once under Node 22:

```sh
fnm exec --using=22 npm test
fnm exec --using=22 npm run typecheck
fnm exec --using=22 npm run lint
fnm exec --using=22 npm run build
```

Results:

- Full test: 212 files passed; 2,056 tests passed; 0 failed.
- Typecheck: exit 0 (`tsc --noEmit` and node-test TypeScript project).
- Lint: exit 0; 0 errors and 124 existing `no-explicit-any` warnings outside these changed files.
- Build: exit 0; Vite transformed 3,483 modules and generated the PWA assets successfully. It retained the existing informational empty `supabase` chunk notice.
- `git diff --check`: clean.

## Files changed

- `src/engine/today.ts`
- `src/engine/today.test.ts`
- `src/components/views/TodayView.jsx`
- `src/components/views/today/today.component.test.jsx`
- `src/components/views/directory/IdentityMarker.jsx`
- `src/components/views/directory/IdentityMarker.component.test.jsx`
- `src/components/modals/collection-notice/CollectionNoticeModal.jsx`
- `src/components/modals/collection-notice/CollectionNoticeModal.component.test.jsx`
- `.superpowers/sdd/final-review-fixes-report.md`

## Self-review

- Confirmed the in-salon comparator uses oldest check-in only when both timestamps are valid and unequal, then uses slot order for absent/invalid/equal values.
- Confirmed Ready and Collected pass only the existing `advanceLiveFocus` option; the shared authoriser still gates on successful saves and `booking.id === liveFocusId`.
- Confirmed the silhouette’s own `currentColor` class changed, not merely the wrapper metadata or background.
- Confirmed all four Supabase response error paths are checked before partial contact data can be presented, and thrown/rejected queries are caught.
- Confirmed Retry increments a load attempt dependency and therefore re-runs the same owner/link/day/trusted query path.
- Confirmed the WhatsApp template invocation, parameters, success state, and send logging path are unchanged.
- Confirmed no files outside the requested implementation, tests, and this report were modified.

## Concerns

- No new functional concern remains from this review wave.
- The repository-wide lint command reports 124 pre-existing warnings, but no errors and none in the files changed here.
- Browser E2E was not run because the requested verification gate was focused tests plus one full npm test/typecheck/lint/build pass.
