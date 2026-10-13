# Audit 06 — Frontend engineering, architecture, state, tests, CI/CD, flags, dependencies, dead code

Repository: `/home/user/Smarter-dog-bookings` at `850cad7` (main, 12 October 2026). Read-only audit.

## What I ran (baseline, all CONFIRMED)

| Check | Result |
|---|---|
| `npm run lint` | 0 errors, **66 warnings** (65 `no-explicit-any` in `*.test.*`, 1 unused `eslint-disable` directive at `src/supabase/hooks/useDaySettings.ts:457`); 45 s |
| `npm run typecheck` | pass; 22 s |
| `npx vitest run` | **408 files / 4,382 tests pass**; 222 s wall (4 workers), environment 314 s, import 165 s |
| `npm run build` | pass in 7.8 s; **115 JS chunks, 1,560 KB JS + 249 KB CSS** (uncompressed); PWA precache **149 entries / 2,188 KiB**; `supabase-*.js` is 1 byte (expected without credentials) |
| `npm run check:docs` | 140 governed Markdown files OK |
| `knip` / `ts-prune` / `madge` | not installed; I used two ad-hoc scripts (`scratchpad/unimported.sh`, `scratchpad/unused-exports.sh`) |

Source shape (non-test): 282 `.jsx`, 59 `.js`, 205 `.ts`, 20 `.tsx`. Tests: 173 `.test.jsx`, 162 `.test.ts`, 38 `.test.tsx`, 35 `.test.js`. 239 migrations. 264 commits since 1 September.

The register (`TECHNICAL-DEBT-REGISTER.md`) is accurate where I checked it: App.jsx is 576 lines (ratchet 600), the hooks layer is TS, components no longer import the Supabase client (0 files), realtime channel names are centralised. The findings below are what the register does **not** say.

---

## Findings

### A. Architecture and state

#### 1. `bookingPolicyRepo.ts` and its 1,365-line guard file have no production caller — CONFIRMED

- **What:** `src/supabase/repositories/bookingPolicyRepo.ts` (154 lines) is imported by exactly one file: its own test. `bookingPolicyProjectionGuards.ts` (1,365 lines) is imported only by that repo. `src/types/bookingPolicy.ts` (793 lines) backs them plus `engine/bookingPolicy.ts` (177). The live Settings → Booking rules screen goes through `useBookingPolicyRuntime.ts` / `useSalonConfig.ts`, which import from `../../types` and `../client`, not the repo.
- **Evidence:** `grep -rln "bookingPolicyRepo" src` (non-test) → only `bookingPolicyRepo.ts` itself and comments in the guards file. Register seam review (2 Sept) describes the guards as "the three reads in bookingPolicyRepo.ts trust nothing the database returns" — but nothing calls those three reads.
- **Why it matters:** ~2,300 lines of carefully written runtime validation for projections (`CustomerBookingVisitProjection`, `StaffBookingVisitProjection`, destination reservations) of a substrate AGENTS.md says is "deployed but inactive". It inflates the repositories coverage ratchet denominator, costs typecheck time, and every refactor of the visit types must keep it compiling for no runtime benefit. 5,320 lines of policy-related tests sit alongside.
- **What happens now:** carried, tested (19 repo tests), never executed in a browser.
- **Recommendation:** either (a) move the repo + guards + their tests to a clearly named `src/supabase/repositories/dormant/` with a one-line README and exclude them from the coverage ratchet, or (b) delete them and regenerate from the migration when a visit-authority caller actually lands (the shapes live in SQL and `database.types.ts`). Keep `types/bookingPolicy.ts` only for the parts `engine/bookingPolicy.ts` and `useBookingPolicyRuntime` consume.
- **Benefit:** −1,500 to −2,300 production lines, faster typecheck, honest coverage figures. **Difficulty:** Small (move) / Medium (delete + trim types). **Risk:** Low (no caller). **Priority:** High.

#### 2. Boot path is well engineered; the `/today` route then opens ~12 unfiltered realtime subscriptions per tab — CONFIRMED counts, HYPOTHESIS on cost

- **What:** `useStaffAppData` composes 5 data hooks; `bootPrefetch.js` fires the three tier-1 reads concurrently with the staff-profile fetch; directories (two 50-row RPC pages) are deferred by `useDirectoryWarmup` (2.5 s + rIC); `useBookings` derives `bookingsByDate` from raw rows so map growth no longer refetches. That is good. But the Today tree (`TodayView`, toolbar, nav strip, dashboard cards) also mounts `useTodos`, `useWhatsAppUnread`, `useWhatsAppSummary` (2 channels), `usePendingSignupsCount`, `useDeliveryFailures`, `useAgentFailures`, `useTomorrowReminders`, `useWaitlist`, `useWaitlistUpcoming`, `useBookingEvents`, `useMonthBookings`, `useMonthDaySettings` — each with its own fetch and channel. Several are module-level singletons (good), but it is still ~12–15 channels and ~15 initial requests per tab.
- **Evidence:** 25 `.channel(` sites, 51 `postgres_changes` handlers, only **4** use a server-side `filter:`. `useBookings` subscribes to every `bookings` and every `notification_log` change in the database and filters client-side (`inRange`).
- **Why it matters:** Supabase Realtime bills per connection/message and each `postgres_changes` subscription costs a WAL decoder on the server. For a 14-dogs/day salon with a handful of tabs this is fine functionally; it is the first thing to hit a plan limit if the staff PWA is left open on several devices, and every unrelated write anywhere wakes every tab.
- **Recommendation:** add `filter: "booking_date=gte.<week>"`-style filters where the table has a column to filter on (bookings, day_settings, notification_log by `trigger_type=eq.reminder`); consolidate the dashboard count hooks into one `useDashboardSignals` singleton with one channel on `booking_events`. Measure first in the Supabase dashboard (Realtime → connections) before spending.
- **Benefit:** fewer wakeups, lower realtime cost, simpler hook inventory. **Difficulty:** Medium. **Risk:** Low–Medium (filters must match RLS). **Priority:** Medium.

#### 3. The sample-data ("offline") mode re-implements the entire write path — CONFIRMED

- **What:** `src/hooks/useOfflineState.ts` (505 lines) hand-writes 17 handlers (`offlineHandleAdd`, `offlineAddClosure`, `offlineToggleImmediateSlot`, …) over `src/data/sample.js`; `useBookingActions.ts` then has 20 `isOnline ? online : offline` ternaries to pick an implementation per action. Partial-day closures alone added three offline handlers and one TS mirror (`lifecycleStamps.ts` "offline mirror of the arrival/ready/completion triggers").
- **Why it matters:** every new staff write is implemented twice, and the second copy is what `npm run dev`, the whole Playwright suite (79 tests) and the daily sample demo exercise. The AGENTS.md "assert the row that was written" rule cannot be applied end-to-end in e2e because the e2e store is not the hook that writes to Supabase.
- **Recommendation:** replace the parallel handlers with a tiny in-memory fake of the Supabase surface the hooks use (`from().select/insert/update/upsert/delete`, `rpc`, `channel`), seeded from `sample.js`, and run the *real* hooks against it in dev/e2e. `useBookingActions` collapses to the online branch. This is the single refactor that would both delete ~700 lines and make e2e assert the real write path.
- **Benefit:** −~700 lines, one write path, e2e exercising production hooks. **Difficulty:** Large. **Risk:** Medium (e2e fixtures move). **Priority:** Medium (high value, but schedule it).

#### 4. `src/hooks` vs `src/supabase/hooks` layering is documented but not enforced — CONFIRMED

- **What:** CLAUDE.md: "`src/hooks/` — UI-level state hooks. `src/supabase/hooks/` — data hooks." 11 of 33 files in `src/hooks` import the Supabase client directly: `useReportsData`, `useNeedsAttention`, `useStaffPush`, `useRetentionData`, `useFunnelData`, `useDenialsData`, `useUnpaidFortnight`, `useReplyConfirmations`, `useOnTheWaySignals`, `useNextOpenDayBrief`, `useGroomPhotos`. The `no-restricted-imports` rule (`eslint.config.js:191`) only guards `components/**`.
- **Recommendation:** move the 11 files (mechanical), extend the lint restriction to `src/hooks/**`.
- **Benefit:** the map in CLAUDE.md becomes true. **Difficulty:** Small. **Risk:** Low. **Priority:** Low.

#### 5. Staff components still carry DB column names — CONFIRMED

- **What:** 33 occurrences of `booking_date|dog_id|human_id|pickup_by_id|group_id|created_at|...` in 8 staff component files (`NewBookingModal.jsx`, `RecurringBookingModal.jsx`, `DogChainBooking.jsx`, `StepFirstBooking.jsx`, `BookingWorkspaceView.jsx`, `BookingActionPanel.jsx`, `DraftPanel.jsx`, `BroadcastMessageModal.jsx`). Partly by design (`StaffBookingInput` deliberately exposes `group_id`, `staff_capacity_override`, `notify_human_ids`, `confirmation_channel` as "write-only snake_case flags").
- **Why it matters:** register Debt 13 reads "Closed for the customer surface"; the staff surface is the half that writes. A column rename reaches components the typechecker cannot see (`.jsx`, `checkJs: false`).
- **Recommendation:** give `StaffBookingInput` camelCase fields and map them in `toInsertPayload` (already the single mapping point).
- **Difficulty:** Small–Medium. **Risk:** Low–Medium (write path; row-level tests exist in `useBookings.component.test.jsx`). **Priority:** Low.

#### 6. The customer portal has no code-splitting — CONFIRMED

- **What:** `CustomerApp.jsx` imports `BookingWizard` (1,221 lines), `JoinThePackOnboarding` (622), `SetPasswordGate`, `ProfileGate`, `PendingApprovalGate`, `CustomerLoginPage` (663) and `CustomerDashboard` eagerly. Result: `CustomerApp-*.js` is **135 KB**, the largest application chunk in the build (staff `App` is 102 KB with 47 `lazy()` sites).
- **Why it matters:** a returning customer opening `/book` to check an appointment downloads the whole wizard and all four onboarding gates. The staff side proved the pattern (route-chunk warming, `ROUTE_CHUNK_IMPORTS`).
- **Recommendation:** `lazy()` the wizard, the onboarding components and the login page; keep the dashboard eager.
- **Benefit:** roughly halves customer first-load JS (HYPOTHESIS on the exact figure). **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

#### 7. `rpc.ts` wrappers are typed by hand and accept an untyped client — CONFIRMED

- **What:** `src/supabase/rpc.ts` (1,210 lines, 81 exports) declares its own row interfaces and takes `client: SupabaseClient` (no `<Database>` generic), so `client.rpc("name", args)` is **not** checked against `database.types.ts`; a renamed function or parameter compiles. `client.type-contract.ts` proves the two clients are `SupabaseClient<Database>`, but the wrappers erase that at the boundary. Zero uses of `Database["public"]["Functions"]`.
- **Why it matters:** register Debt 21 claims "Argument shape becomes compile-checked." It does not. The parameter names in RPC calls are the most common drift between a migration and the app.
- **Recommendation:** `client: SupabaseClient<Database>` and derive `Args`/`Returns` from `Database["public"]["Functions"][K]`; delete the hand-written row interfaces that duplicate generated ones.
- **Benefit:** real compile-time RPC contract. **Difficulty:** Medium (81 wrappers, mechanical). **Risk:** Low. **Priority:** Medium.

#### 8. `database.types.ts` drift is generated in CI but never compared — CONFIRMED

- **What:** `db-tests.yml` regenerates types from the migrated local database and only uploads them as an artifact. The committed 5,246-line file was last regenerated by hand on 10 October (9 touches since September).
- **Recommendation:** add a step that diffs (header-normalised) and fails on mismatch, with a `--write` escape in a script.
- **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

#### 9. E2E-only transport lives in a production module — CONFIRMED

- **What:** `src/supabase/client.ts` contains `e2eBookingPolicyRpcCall` and `bookingPolicyClient = supabase || e2eBookingPolicyRpc`, selected by `VITE_E2E_BOOKING_POLICY_RPC`. Dead in production builds (constant folding), but test scaffolding in the most security-sensitive module.
- **Recommendation:** move to `src/supabase/e2eTransport.ts` and select it in `useBookingPolicyRuntime` behind the same flag.
- **Difficulty:** Small. **Risk:** Low. **Priority:** Low.

#### 10. Oversized components: the risk is concentrated in the three with no tests — CONFIRMED

| Component | Lines | Component test files |
|---|---|---|
| `BookingWizard.tsx` | 1,221 | 7 |
| `NewBookingModal.jsx` | 834 | 1 (register said 0 — now stale) |
| `HumansView.jsx` / `DogsView.jsx` | 794 / 664 | 1 each |
| `CustomerLoginPage.jsx` | 663 | 1 |
| `AddDogModal.jsx` | 654 | 1 |
| **`BookingRulesSettings.jsx`** | 637 | **0** |
| **`ChainBookingModal.jsx`** | 622 | **0** |
| `JoinThePackOnboarding.jsx` | 622 | 2 |
| `WeekCalendarView.jsx` | 603 | 2 |
| **`TodayView.jsx`** | 673 | **0 direct** (parts and day-stack e2e cover it) |

- **Recommendation:** do not split for size; add one component test each to `BookingRulesSettings` (it writes policy rules) and `ChainBookingModal` (it books), then extend `debtSizeRatchet.test.ts` to cap them.
- **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

#### 11. `index.css` compiles to 220 KB — HYPOTHESIS

- **What:** the build emits `index-*.css` at 219,993 bytes plus `CustomerApp-*.css` at 34 KB. A Tailwind 4 app of this size normally lands at 60–100 KB uncompressed. `src/index.css` imports `@fontsource/caveat/700.css` and has been the 6th most-churned file since September (brand reskin).
- **Recommendation:** inspect the output for duplicated `@layer` blocks / legacy hand-written utilities and dead selectors; the reskin plan (Draft) is the moment to do it.
- **Difficulty:** Small to measure. **Priority:** Low.

### B. Dead code, flags and incomplete work

#### 12. Three source files are imported by nothing — CONFIRMED

- `src/components/booking/AddBookingForm.jsx` (369 lines; only references are in `docs/archive/**` plans from March–May), `src/components/dashboard/CountBadgeCard.jsx` (104), `src/components/views/inbox/customer-context/SlideOverPanel.jsx` (33; named only in a comment in `DrawerShell.tsx`). `client.type-contract.ts` and `seed.ts` are correctly unimported (typecheck-only / script).
- **Recommendation:** delete all three. **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

#### 13. ~150 exports are unused outside their file; ~60 are unused even by tests — CONFIRMED (rough)

- **Evidence:** `scratchpad/unused-exports.txt`. Non-type examples with zero references anywhere: `inbox/helpers.js` `windowRemainingMs`/`isWindowClosingSoon`/`WINDOW_MS`/`CLOSING_SOON_MS`; `bookingWorkspaceModel.js` `requestStatus`/`mergedRequestState`/`formatRequestAge`; `salonContact.ts` `SALON_PHONE_E164`/`SALON_PHONE_NATIONAL`; `salon.ts` `ADDON_PRICES`; `icons/index.jsx` `IconBlock`/`IconEdit`; `TodoModal.jsx` `ClosureRearrangementTodo`/`RescheduleRequestTodo`/`UnavailableTypedTodo`; `SignupLinkDialogs.jsx` `ClaimSignupDialog`/`PhoneLinkSignupDialog`; `parts.jsx` `formatLondonTime`; `DogTokenAvatar.jsx` `dogInitials`.
- **Recommendation:** add `knip` as a devDependency and to `npm run lint` with a committed baseline; delete what it confirms. My script does word matching, so verify each before deleting.
- **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

#### 14. `legacy_salon_board_enabled` has outlived its stated purpose — CONFIRMED

- **What:** `features.ts` says the flag "is expected to be removed once the stack has run through a few trading days" and that a Vercel rollback is the faster path anyway because the flag is build-time. The stack shipped in September; it is 12 October. Footprint: `components/views/today/board/` 2,325 lines (incl. 543 test), the board branch in `TodayView.jsx:570–604`, and the zone/drag half of `engine/salonBoard.ts` (`BOARD_ZONES`, `BOARD_ZONE_META`, `groupTokensBySlot`, `canDragToken`, `dropZoneFor`); `tokenActions`, `buildBoardTokens`, `buildAttentionSummary` are still used by the stack and must stay.
- **Recommendation:** delete the flag, the board directory and the drag/zone sections of the engine; move `tokenActions` to `dayStack.ts` or keep a slimmer `salonBoard.ts`.
- **Benefit:** −~1,800 lines, smaller `TodayView` chunk (114 KB), one fewer build-time flag to explain. **Difficulty:** Small–Medium. **Risk:** Low (flag is off; Vercel rollback remains). **Priority:** High.

#### 15. `booking_workspace_enabled` is a months-old pilot behind a build-time flag — CONFIRMED footprint, HYPOTHESIS on prod state

- **What:** on in `DEV`, off in production unless `VITE_BOOKING_WORKSPACE_ENABLED=1` is set at build time; owner-only. `components/views/booking-workspace/` is 1,614 lines with 6 tests, plus `bookingWorkspaceSamples.js` sample data and several unused exports (#13). Whether Vercel sets the variable is not visible from the repo.
- **Recommendation:** decide. If it is not on in production, either ship it or delete it; a lazy-loaded chunk is cheap to download but not to maintain. Build-time flags should carry an expiry date in the comment (the legacy board one implicitly does).
- **Difficulty:** Small (delete) / Medium (ship). **Risk:** Low. **Priority:** Medium.

#### 16. One-off July workflow still in the tree, pinned by a 124-line test — CONFIRMED

- **What:** `.github/workflows/staging-tranche1-smoke.yml` hard-codes `CANDIDATE_MIGRATION: 20260712115759_legal_risk_tranche1.sql`; `src/security/stagingTranche1Workflow.test.ts` asserts its text. The migration has been live for three months; `staging-apply-migrations.yml` is the general tool.
- **Recommendation:** delete both. **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

#### 17. `e2e-bootprobe/` guards the boot waterfall but nothing runs it — CONFIRMED

- **What:** `playwright.bootprobe.config.ts` + `boot-request-order.spec.ts` assert the tier-1 requests fire before the profile resolves and that directory RPCs stay off the boot path. `useDirectoryWarmup.ts` cites it ("the e2e boot probe asserts none fire within the first second"). Only `package.json` references `e2e:bootprobe`; no workflow does.
- **Recommendation:** add it to the post-merge `e2e` job (it needs its own build with a stub URL, ~1 minute), or delete it and the comment that relies on it.
- **Difficulty:** Small. **Risk:** Low. **Priority:** Medium.

#### 18. Duplicate test files for one module — CONFIRMED

- `src/engine/capacity.test.js` (896 lines) **and** `capacity.test.ts` (154) both test `capacity.ts`; `utilisation.test.js` tests `utilisation.ts`. The JS test files sit in the `logic` project untyped.
- **Recommendation:** convert `.test.js` → `.test.ts` and merge. **Difficulty:** Small. **Priority:** Low.

#### 19. Lint carries a permanent 66-warning floor — CONFIRMED

- 65 `no-explicit-any` warnings in tests (allowed at `warn`) plus one genuinely stale directive (`useDaySettings.ts:457`). New warnings disappear into the floor.
- **Recommendation:** fix the stale directive now; either type the 65 test sites or pass `--max-warnings 65` so the number can only go down.
- **Difficulty:** Small. **Priority:** Low.

#### 20. Repo hygiene items (all CONFIRMED, each Small / Low)

- `TODO/FIXME/HACK`: only 4 in `src` (two are deliberate grep-able placeholders in `useHumanCardActions.js`). Excellent.
- `eslint-disable`: 24 in `src` (21 `exhaustive-deps`, 3 `no-console`); each has a justification comment.
- `archive/edge-functions/ai-briefing/` is a single retired function with a README; `prompts/archive/` is a README only. Fine; consider folding `archive/` into `docs/archive/` so the root has one archive.
- `skills-lock.json` pins two Supabase agent skills; harmless.
- `docs/plans/active/`: 9 plans; 2 are `Status: Draft`, 4 have no header `**Status:**` line (the field is in body text). `2026-09-10-smarterdog-domain-routing.md` is Draft although the cutover happened 11 September — move to `completed/` per AGENTS.md.
- `CHANGELOG.md` top three entries are all "Unreleased — …": the changelog has no release boundary, so it is a commit log in a different format.

### C. Tests

#### 21. Forty-two "security" tests assert on file text; they churn more than the code they guard — CONFIRMED churn, HYPOTHESIS on value

- **What:** 50 files in `src/security/`; 42 `readFileSync` repository files (workflow YAML, migration SQL, scripts) and regex-match them. `productionApplyMigrationsWorkflow.test.ts` is the **most-changed file in `src` since 1 September (17 commits)**, ahead of any application file; `stagingApplyMigrationsWorkflow.test.ts` 8, `lexMigrationSql.test.ts` 6.
- **Why it matters:** these tests cannot run the workflow; they pin prose and structure, so every legitimate edit to a workflow requires editing the test that mirrors it. Some pin genuinely important invariants (`nodeRuntimeConsistency`, `websiteWorkflowIsolation`, `offlineTestGuard`, `bookingPolicyInactiveIsolation`, `triggerFunctionGrants`); others pin wording.
- **Recommendation:** keep the invariant tests; replace the "the workflow still contains step X with text Y" tests with `actionlint` in CI plus one small schema check per workflow (job names, `environment:`, secret names, `if:` guards). Delete the tranche-1 one outright (#16).
- **Difficulty:** Medium. **Risk:** Low. **Priority:** Low–Medium.

#### 22. Write-path tests: the #878 lesson is applied where it hurt; elsewhere assertions still stop at the call — PARTLY CONFIRMED

- 359 `toHaveBeenCalledWith` across tests; 28 test files assert a payload object (`onUpdateBooking`, `.insert(...)`, `mock.calls[0]`). `components/views/today/useBookingActions.component.test.tsx` asserts `paidAmount`/`paymentMethod` on the written row 18 times — the rule from CONTRIBUTING.md is live there. `useBookings.component.test.jsx` covers insert/group/remove. I did not verify that the 7 `BookingWizard` tests assert the `create_customer_booking_group` args row rather than the wizard's own state — HYPOTHESIS that at least some stop at the near end.
- **Recommendation:** a one-page inventory of write paths (staff insert, group insert, update, remove, customer RPC, day-settings upsert, dog/human mutations) against the test that asserts the far-end row. Add the missing ones; `BookingRulesSettings` (#10) is the obvious gap.
- **Difficulty:** Small–Medium. **Priority:** Medium.

#### 23. E2E: 79 tests in 11 specs, almost entirely staff — CONFIRMED

- `goto` targets: `/settings` ×9, `/` ×7, `/today` ×5, `/humans` ×4, `/inbox` ×2, `/dogs` ×2; the customer portal is a single `/book` smoke navigation plus the wizard *shell* preview at `/dev/booking-wizard-shell-preview`. No OTP login or booking journey (sample data has no auth), so the customer write path has only jsdom coverage.
- The PR gate (`pr-production-smoke`) is good: every spec on desktop Chromium, three continuity specs on WebKit, and specs the PR changes on tablet/mobile, with a non-empty-suite assertion.
- **Recommendation:** add a sample-data customer dashboard + wizard journey behind `VITE_FORCE_OFFLINE` (the wizard shell preview already proves the pattern) — this is where #3 (fake client) pays off.
- **Difficulty:** Medium. **Priority:** Medium.

#### 24. The `e2e` job is a required check that does nothing on pull requests — CONFIRMED

- `ci.yml` `e2e` job: on `pull_request` every step is skipped except an `echo`, "so branch protection is never left hanging". `pr-production-smoke` is the real gate. A green `e2e` on a PR is therefore a false signal to anyone reading the checks list.
- **Recommendation:** drop `e2e` from the required contexts (keep it for push/dispatch) and delete the skip step; or rename it `e2e-post-merge`.
- **Difficulty:** Small (ruleset change). **Risk:** Low. **Priority:** Low.

#### 25. Test suite health — CONFIRMED

- 0 `.skip`/`.only`; 11 real-timer sleeps vs 39 `useFakeTimers`; `maxWorkers: 4` for memory. 211 component test files dominate (environment 314 s). Coverage ratchet on `src/engine` (95/86/94/96) and repositories (72/74/80/76) runs as the single test gate — good design; the engine threshold is earning its keep, the repositories one is partly inflated by #1.

### D. CI/CD and delivery

#### 26. Deploy ordering is enforced for the database, documented for everything else — CONFIRMED

- Migration → merge is a hard gate (`check-migrations-applied.yml` is required; it also compares recorded SQL to the committed file and refuses edits/renames of applied migrations). Frontend (Vercel) and Edge Functions (`deploy-edge-functions.yml`, path-filtered, serialised) deploy independently and unordered after merge; a frontend that needs a new Edge Function version can be live before the function is. `db-tests.yml` is path-filtered to SQL/scripts, so an app change that depends on SQL semantics does not run pgTAP (by design).
- **Recommendation:** accept, but write the two-deploy race down in `docs/migrations.md`'s neighbour (release checklist) and prefer backward-compatible Edge changes. The CLAUDE.md "expand/contract cannot live in one PR" note already covers the schema side.
- **Priority:** Low.

#### 27. Workflow secrets and refs — CONFIRMED

- Production apply uses an environment-scoped `PRODUCTION_SUPABASE_ACCESS_TOKEN`, checks the environment really has reviewers and a branch policy, and reads inputs via `env:` — strong. The repo-level `SUPABASE_ACCESS_TOKEN` is used for read-only Management-API queries in three workflows but is a full-power PAT (platform limitation). Project refs are hard-coded in six workflows with a lint guard (`check-hosted-supabase-targets.mjs`). `website.yml` never receives the token. No `permissions:` block on `ci.yml`/`deploy-edge-functions.yml` (default token scope) — add `permissions: contents: read`.
- **Difficulty:** Small. **Priority:** Low.

#### 28. Service-worker update strategy will reload an open tab mid-task after every deploy — CONFIRMED mechanism, HYPOTHESIS on frequency

- **What:** `vite.config.js` sets `registerType: "autoUpdate"`, `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`. On a deploy, the new worker activates immediately and evicts the old precache; the next lazy chunk the open tab requests 404s (served the HTML shell), `chunkReload.js` detects it and calls `location.reload()` once (loop-guarded, reported to Sentry). Unsaved modal state is lost unless the modal persists drafts: `useDraftPersistence` covers the New Booking drawer and `BookingDetailModal` autosaves; `HumanCardModal`/`DogCardModal`/`AddDogModal` edits do not appear to be persisted.
- **Why it matters:** `main` auto-deploys on every merge (264 commits since September ≈ several deploys a week) while the salon has the PWA open all morning.
- **Recommendation:** switch to `registerType: "prompt"` with a "New version — reload when ready" toast, or keep autoUpdate but persist every edit modal's draft. Add a Playwright test for the reload-with-draft path.
- **Difficulty:** Small–Medium. **Risk:** Low. **Priority:** Medium.

#### 29. Vercel headers — CONFIRMED

- CSP applies only to app paths (correct, the marketing site is separate); `style-src 'unsafe-inline'`; no `report-uri`/`report-to`, so a CSP break (e.g. a new Sentry region or Turnstile host) is invisible until a user reports it; HSTS has no `includeSubDomains`/`preload`; hashed assets are `immutable`, `sw.js`/workbox `must-revalidate`, `index.html` relies on Vercel's default (`max-age=0, must-revalidate`) — fine. The `/(.*)` redirect table (28 legacy redirects) is also mirrored in `entrypoints.ts` and tested (`vercelRouting.test.ts`).
- **Recommendation:** add `report-to` to a Sentry CSP endpoint; add `includeSubDomains`.
- **Difficulty:** Small. **Priority:** Low.

#### 30. `scripts/build-combined.mjs` — CONFIRMED good

- Builds both apps, refuses file collisions, refuses a root `robots.txt` that disallows everything, proves `/` is the marketing page and `/app/index.html` survived; `previewDataGuard` stops a production build on sample data. This is the right amount of paranoia for a merge that can take the salon's website down. No finding.

### E. Error handling and observability

#### 31. Sentry has no `release` and the build ships no source maps — CONFIRMED

- **What:** `src/lib/sentry.js` `Sentry.init({ dsn, environment, enabled: PROD, tracesSampleRate: 0, sendDefaultPii: false, beforeSend })` — no `release`, no `dist`. `vite.config.js` sets no `build.sourcemap`; `dist/app/assets/*.map` count is 0; no `@sentry/vite-plugin`. `logger.error` (135 call sites) and `ErrorBoundary` (9 wrappers) do forward with `component`/`op` tags, and `beforeSend` redacts PII by pattern and by column name — that part is thoughtful.
- **What an incident looks like today:** "TypeError in `index-COs7iGCs.js:1:48213`, tag hook=useBookings op=addBooking", not attributable to a deploy, not symbolicated. You would reproduce from the tag, not the trace.
- **Recommendation:** `release: import.meta.env.VITE_RELEASE` fed from Vercel's `VERCEL_GIT_COMMIT_SHA` (map it to a `VITE_` var in project settings; it is public), upload *hidden* source maps with `@sentry/vite-plugin` in the Vercel build (auth token as a build env secret, not `VITE_`), and `Sentry.setTag("mount", mount)` in `index.jsx` so staff vs customer errors separate. Keep `sendDefaultPii: false`.
- **Benefit:** readable stack traces, per-deploy regression attribution. **Difficulty:** Small–Medium. **Risk:** Low. **Priority:** High.

#### 32. Error-UX pattern is consistent in practice, undocumented in rule — CONFIRMED

- 155 `catch` blocks, 0 empty; 135 `logger.error`, 30 `logger.warn`, 150 toast sites. The register's Debt 23 ("convention only; still no documented rule") is still true. Customer app: one `ErrorBoundary` around dashboard + wizard; the four onboarding gates and the login page render outside any boundary, so a render error there is a blank screen.
- **Recommendation:** wrap `CustomerAppContent` in the boundary; write the three-line rule ("user action → toast; background load → banner; always logger.error") into CONTRIBUTING.md.
- **Difficulty:** Small. **Priority:** Medium.

### F. Dependencies

#### 33. Dependency set is lean; the notable items are small — CONFIRMED

- No date library (hand-rolled `londonTime.ts`), one icon library (lucide, per-icon chunks confirmed in the build), one router, no duplicate React in the lockfile. Good.
- `react-aria` (umbrella, 3.52) is used for `OverlayProvider`, `FocusScope`, `useDialog`, `useModal`, `mergeProps`, `OverlayContainer` — tree-shakes to a 19 KB `FocusScope` chunk + 6 KB `AccessibleModal`, so runtime cost is fine; the umbrella drags ~50 `@react-aria/*` packages into the lockfile and Dependabot noise. Consider the three scoped packages. Low.
- `@fontsource/caveat` is the only font via npm; the other four families are vendored under `public/app/fonts` with licence files. Pick one approach. Low.
- `@types/node` is 25.9.8 against a Node 24 runtime; the upgrade plan says "pin to 24.x in the same commit that next touches it" — not yet done. Small.
- `.npmrc` `legacy-peer-deps=true` means the ESLint-10 / TypeScript-7 blockers in the plan rely on humans reading the plan, not on npm failing. The plan acknowledges this. Keep the plan's monthly re-check.
- `deno.lock` resynced 11 October; clean.
- **The `website/` app is already on Vite 8.3, plugin-react 6.1, ESLint 10.11, Vitest 5.0** while the root is on 7.3 / 4.7 / 9.39 / 4.1 (and jsdom 30 vs 29). The major-version plan does not mention that the sibling app is a live canary for the exact upgrades it calls "the risky one". Use it: the Rolldown `rolldownOptions` landmine is already being exercised there.
- **Priority:** Low overall; the website-as-canary note is worth a line in the plan.

### G. Accessibility and performance quick scan

#### 34. Accessibility — CONFIRMED

- All 7 `<img>` have `alt`; 445 `aria-label`s; 54 reduced-motion references; 18 modal files use `AccessibleModal` (react-aria focus trap, `aria-modal`, ref-counted scroll lock) and only one ad-hoc `fixed inset-0` overlay bypasses it. Good baseline.
- **470 of 532 `<button>` elements have no `type=`** — inside a `<form>` they submit on click and on Enter. Enable `react/button-has-type` and fix mechanically.
- 39 arbitrary hex colours (`bg-[#E6F5F2]` ×12, `bg-[#25D366]` WhatsApp green, five one-off text tints) outside the token set while a brand reskin is in Draft — token drift to fold into that plan.
- **Difficulty:** Small. **Priority:** Low–Medium.

#### 35. Bundle and precache — CONFIRMED

- 1,560 KB JS over 115 chunks; largest: `react-vendor` 216 KB (stable hash across deploys — the manualChunks fix works), `CustomerApp` 135 (#6), `useInboxWorkspaceState` 115, `TodayView` 114 (#14), `WeekCalendarView` 111, `App` 102. `NetworkOfflineBanner-*.js` is 31 KB for a one-line component — Rollup hoisted shared modules into a chunk named after the wrong entry (cosmetic, but misleading when reading build output). Precache is 2,188 KiB across 149 entries; every deploy that touches shared code re-downloads most of it to each installed PWA.
- **Recommendation:** after #6 and #14, re-measure; consider `workbox.globIgnores` for the customer chunks (the SW is staff-scoped but precaches the customer CSS/JS too).
- **Priority:** Low.

---

## What is already done well

- **Ratchets that bite:** `appShell.test.ts` (App.jsx ≤ 600 lines, no inline data hooks, ≤ 3 lazies), `debtSizeRatchet.test.ts` (four files), the engine/repositories coverage thresholds in `vitest.config.ts`, `nodeRuntimeConsistency.test.ts`. They are earning their keep: three register items regressed silently before them and none since.
- **Offline test guard** (`offlineTestGuard.test.ts` + `env: offlineEnv` on every Vitest project) — a committed, tested answer to "tests touched prod".
- **Capacity parity harness:** one governed fixture list (`capacityParityFixtures.ts`, 614 lines) read by browser, Deno and pgTAP harnesses. The Deno copy differs by 231 diff lines, all header/type-mirror. HYPOTHESIS: `src/engine/capacity.ts` imports only `constants/index` and `types/index`, both pure, so the stated reason for duplication ("barrel imports pull in browser code") may no longer hold and a Deno import map could make the file single-source — worth one afternoon to test before accepting the third copy forever.
- **Boot path:** `bootPrefetch` + `useDirectoryWarmup` + derived `bookingsByDate` + auth-gate route-chunk warming + `chunkReload` loop guard. The waterfall was measured, fixed and (almost — #17) guarded.
- **Production migration workflow:** environment-gated, confirms the environment has reviewers, applies files from a reviewed SHA while running the script from `main`, records the SQL applied so the merge gate can compare content, and the merge gate refuses edits/renames of anything applied. This is better than most teams' schema discipline.
- **`build-combined.mjs`** and `vercel.json` routing, both tested (`combinedOutput.test.ts`, `vercelRouting.test.ts`, `staticOutputNamespace.test.ts`).
- **Sentry `beforeSend`** redaction by pattern and by schema column name; `sendDefaultPii: false`; `tracesSampleRate: 0`.
- **Realtime channel registry** (`realtimeChannels.ts`) and the singleton `useSyncExternalStore` pattern in the dashboard hooks.
- **PR e2e gate design** (every spec on desktop, WebKit for the viewport-sensitive specs, changed specs on narrow viewports, non-empty-suite assertion, absolute JSON output path with the reason written down).
- Only 4 TODOs and 24 justified `eslint-disable`s in ~100k lines of source.

## Top 5 for this area

1. **Delete or quarantine the dormant booking-policy repo + guards (#1) and the legacy salon board (#14).** ~3,500–4,000 lines gone, both with no production caller, both Low risk. Do these before any other refactor so the ratchets and coverage numbers describe live code.
2. **Make Sentry diagnosable (#31):** `release` from the Vercel commit SHA, hidden source maps via `@sentry/vite-plugin`, a `mount` tag. One PR; the next production incident is otherwise a minified line number.
3. **Code-split the customer portal (#6) and decide the SW update UX (#28).** Both are about the people who actually use the app: customers download the wizard they did not ask for; staff get reloaded mid-task on every merge.
4. **Type the RPC boundary properly (#7) and gate `database.types.ts` drift in CI (#8).** The repo believes it has a typed RPC contract; it has typed clients and untyped wrappers.
5. **Plan the fake-client refactor of sample-data mode (#3)** and, while planning, wire `e2e-bootprobe` into CI or delete it (#17), delete the tranche-1 workflow + test (#16), and the three unimported files (#12). The small deletions are a morning; the fake client is the one Large item that pays back across tests, dev and the AGENTS.md row rule.
