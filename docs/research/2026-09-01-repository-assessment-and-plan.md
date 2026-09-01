# Repository assessment and plan — 1 September 2026

**Status:** Active
**Authority:** Point-in-time assessment and a prioritised backlog. It does not
change programme order ([`../../ROADMAP.md`](../../ROADMAP.md)) or product
policy; where it names an issue, the issue stays the live authority.
**Baseline:** `main@9b03448` (merge of PR #722), assessed in a clean remote
container on Node 24.20.0.
**Method:** every CI-bar command was run locally, the offline Playwright smoke
suite was run on desktop Chromium, the last 40 GitHub Actions runs were read,
`npm audit` / `npm outdated` were run, and the hosted production project's
security and performance advisors were read (read-only). Numbers below are
measured, not copied from older documents.

## 1. Summary

The repository is in good health. Every check a contributor runs before
pushing passes at the baseline, the last 40 Actions runs are all green
(including the daily migration-drift audit), there are no known dependency
vulnerabilities, browser error reporting is confirmed live on production, and
the production Supabase advisors report nothing that the changelog has not
already classified as deliberate, apart from one Auth setting.

What needs addressing is therefore not breakage. It is:

1. a handful of small, cheap fixes that are cheaper to do now than to carry;
2. an engineering-debt burn-down that is already under way and should keep its
   cadence, with a few items that have quietly got worse (`App.jsx` has grown
   by half since the register was last refreshed);
3. platform and release-control gaps that the documentation is honest about but
   nothing enforces (`main` is unprotected; migrations are applied by hand);
4. major-version dependency upgrades that Dependabot's minor/patch groups will
   never open;
5. programme hygiene: several `#603` child issues appear finished but remain
   open, and the "last verified" baselines in the governing documents are
   roughly forty merges old.

Nothing here requires a production write, a policy decision or customer
contact. Two items (branch protection and the leaked-password setting) are
dashboard changes that need a human with the right access.

## 2. Measured state at the baseline

| Check | Result |
|---|---|
| `npm run lint` | 0 errors, 127 warnings (all `no-explicit-any`: 62 in non-test code, 65 in tests) |
| `npm run typecheck` | Clean (app and node-test projects) |
| `npm run test` | 302 files, 3201 tests, all passing, ~100 s |
| `npm run build` | Clean, except one warning: `Generated an empty chunk: "supabase"` |
| `npm run check:docs` | 103 governed Markdown files, links and anchors OK |
| `npm run check:migrations` | 211 migration files, order and names OK |
| Playwright smoke (`e2e/smoke.spec.ts`, desktop) | 9/9 passing offline |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run check:sentry` | ACTIVE on smarterdog.vercel.app |
| GitHub Actions, last 40 runs | All `success` (CI, Migrations Applied Check, Migration Drift Audit, DB Tests) |
| Open issues | 10, all children of the `#603` convergence programme |
| Open pull requests | 3: two Dependabot groups (CI green), one Claude docs close-out (#716, draft, CI green) |
| Supabase security advisor (production) | 111 findings: 82 SECURITY DEFINER executable by `authenticated`/`anon` (the intended RPC write path), 28 RLS-enabled-no-policy tables (RPC-only by design), 1 Auth setting: leaked-password protection is off |
| Supabase performance advisor (production) | 106 INFO findings: 60 unindexed foreign keys, 46 unused indexes |

Codebase shape: 357 non-test `.js/.jsx` files and 119 `.ts/.tsx`; 27
deployable Edge Functions; 40 pgTAP files under `supabase/tests/`; six
Playwright specs plus the boot-probe.

Things that could **not** be verified in this container: the Deno-side checks
(`check:edge-types`, `check:edge-auth`, the Deno tests) because Deno is not
installed here. CI ran them green on the baseline commit, so they are
reported from CI, not from a local run.

## 3. What needs addressing

Each row names one concrete next move. Cost uses the register's rubric:
**S** hours, **M** a few days, **L** a sustained workstream.

### Tier 0 — cheap fixes, do this week

| # | What | Why now | Cost |
|---|---|---|---|
| 0.1 | Merge the two Dependabot PRs (#717 production group, #718 development group). | Both are green on CI, pgTAP and Migrations Applied. Every week they sit they accumulate conflicts with the lockfile. | S |
| 0.2 | Merge or close PR #716 (closes out the completed `#614` follow-up and `#618` plans under `docs/plans/`). | It is the only non-bot open PR and it only moves plan status. Leaving it open leaves `docs/plans/active/` listing two finished plans. | S |
| 0.3 | Enable **leaked-password protection** in Supabase Auth on production (dashboard → Authentication → Password security). | This is the only advisor finding that is not a deliberate architectural choice. It is an Auth setting, not a migration, so the migration workflow does not apply; try it on staging (`btjnxvgkpdbfrrqxvkfj`) first because it affects every password sign-in, including the customer `SetPasswordGate`. | S |
| 0.4 | Fix the empty `supabase` manual chunk in [`vite.config.js`](../../vite.config.js). The `manualChunks` matcher `/node_modules\/@supabase\//` no longer captures supabase-js — the build emits a 1-byte `supabase-*.js` and the client lands in another chunk. | The guard test only checks that the key is `rollupOptions`; it does not check that the chunk has contents, which is the actual PWA-precache concern the comment describes. Fix the matcher (or drop the rule) and extend the test to assert the chunk is non-empty. | S |
| 0.5 | Move `test-aria.component.test.tsx` off the repository root. `src/components/shared/AccessibleModal.component.test.tsx` already exists; fold the one assertion in or delete the stray file. | A root-level test file is a leftover from a one-off check and breaks the "tests colocated" convention. | S |
| 0.6 | Fix stale package metadata: `package.json` `name` is `smarter-dogs-smart-humans` and `repository.url` points at a local proxy URL for a repository of that old name. | Harmless at runtime, misleading to tooling and humans. | S |
| 0.7 | Update [`TECHNICAL-DEBT-REGISTER.md`](../../TECHNICAL-DEBT-REGISTER.md) with today's numbers. Debt 24 can be marked CLOSED (0 `catch (e)` sites, the unhandled `.then()` is gone); Debt 15's two stragglers are gone; Debt 11 must be marked **worse** (`App.jsx` 1,525 lines, was 1,025 in June); Debt 12 stands at 21 files. | The register is the file new contributors read first, and its status notes now span June to September with no single current view. | S |

### Tier 1 — engineering debt burn-down (keep the existing cadence)

| # | What | Evidence | Cost |
|---|---|---|---|
| 1.1 | Continue removing files from the `no-restricted-imports` allowlist in [`eslint.config.js`](../../eslint.config.js): 21 remain. Suggested order: the wizard screens (`BookingWizard.tsx`, `SlotSelection.tsx`, `DateSelection.tsx`) as one slice; the customer onboarding gates (`ProfileGate`, `JoinThePackOnboarding`, `SetPasswordGate`, `AddressPicker`) as another; the staff modals (`RescheduleModal`, `SendReminderModal`, `CollectionNoticeModal`, `BroadcastMessageModal`, `DeliveryFailureCard`, `ComposeNewModal`, `TomorrowRemindersCard`) one or two per PR; the auth pages and `App.jsx`/`index.jsx` last. | The September slices (PRs #719–#722) show the pattern works: one surface per PR, a hook over a repository, allowlist shrinks. | M per slice, L overall |
| 1.2 | Burn down the 62 non-test `no-explicit-any` warnings. They sit almost entirely in [`useDogs.ts`](../../src/supabase/hooks/useDogs.ts) (20) and `src/supabase/hooks/humans/*` (41). Type them against `database.types.ts`, then promote the rule to `error` for non-test `src/**` and leave it at `warn` for tests. | A 127-line warning wall means nobody reads lint output; splitting the rule by file glob makes the signal usable. | M |
| 1.3 | Convert the remaining `.js` data hooks to TypeScript, boundary-first. 40 `.js` files remain across `src/hooks` and `src/supabase/hooks`, including `useBookings.js`, `useAuth.js`, `useCustomerAuth.js`, `useSalonConfig.js`, `useDaySettings.js`, `useWhatsAppInbox.js`. `tsconfig` is still `checkJs: false`. | These hooks sit on the database boundary, where `database.types.ts` already gives a free typed contract; JS there means a column rename fails silently. Keep PRs to ≤3 files, as the register recommends. | L |
| 1.4 | Shrink [`App.jsx`](../../src/App.jsx) (1,525 lines). Extract the modal/route map into a registry component and move the data-hook declarations behind `SalonProvider` so `WeekCalendarView` and the directory views stop receiving 30-odd props. | Debt 11 is the one register item that has moved the wrong way; every new feature adds to it. | L |
| 1.5 | Split the inbox controller: [`InboxWorkspaceController.jsx`](../../src/components/views/inbox/workspace/InboxWorkspaceController.jsx) (760 lines) and the 113 KB `useInboxWorkspaceState` chunk carry Debt 10's list-mode cascade. One component per mode, mode in the URL. | Largest lazy chunk after the two app shells; the most user-visible AI surface. | L |
| 1.6 | Review the next tier of large files for a seam: `bookingPolicyRepo.ts` (1,486), `rpc.ts` (1,182), `BookingWizard.tsx` (1,183), `engine/today.ts` (1,069), `useDogs.ts` (875), `NewBookingModal.jsx` (834). Not all need splitting; `rpc.ts` being long is arguably fine because it is a flat registry. | Size alone is not debt, but four of these are on the booking write path. | M each |
| 1.7 | Add the two missing tests the register still lists: `src/hooks/useSlotDragAndDrop.ts` (drag-to-reschedule, untested) and `src/engine/londonTime.ts` (the only engine module without a test file; every other engine file has one). | Drag-and-drop reschedule is a staff write path with no coverage. | S |
| 1.8 | Add coverage thresholds to [`vitest.config.ts`](../../vitest.config.ts). None exist. Start with a ratchet on `src/engine/**` and `src/supabase/repositories/**` at their current measured level so coverage cannot fall silently. | `npm run coverage` exists but nothing reads its result. | S |

### Tier 2 — platform, release control and dependencies

| # | What | Why | Cost |
|---|---|---|---|
| 2.1 | **Protect `main`.** Require the `CI` and `Migrations Applied Check` workflows to pass before merge, and require a PR. | `CLAUDE.md` and `docs/migrations.md` are explicit that nothing enforces the "apply the migration before merging" rule; the check already exists, so protection is a settings change, not new engineering. This is the single highest-leverage item in the plan. | S (needs repo admin) |
| 2.2 | Plan the **major-version upgrades** Dependabot will never open (its groups are minor/patch only): Vite 8, ESLint 10, TypeScript 7, jsdom 30, `@vitejs/plugin-react` 6, `@testing-library/jest-dom` 7, `@types/node` 26. Do Vite 8 on its own branch with the full E2E matrix: Vite 8 makes Rolldown the default bundler, which is exactly the `rollupOptions`/`rolldownOptions` landmine the config comment warns about. | Each one is a routine upgrade now and a painful one in six months. | M (Vite), S (the rest) |
| 2.3 | Make E2E runnable in remote containers. The repo pins Playwright 1.62, which wants a headless-shell build the pre-installed browser set does not include; the suite passes once `launchOptions.executablePath` points at the installed Chromium. Add an optional env var (for example `PLAYWRIGHT_CHROMIUM_EXECUTABLE`) to [`playwright.config.ts`](../../playwright.config.ts) and document it in the E2E section of the README. | Today an agent or contributor in a hosted session gets nine identical "Executable doesn't exist" failures and cannot run the PR gate locally. | S |
| 2.4 | One migration adding indexes for the **60 unindexed foreign keys**, concentrated in the booking-policy and visit tables (`booking_visits`, `booking_events`, `booking_financial_ledger`, `booking_change_requests`, and so on). Follow the standing migration workflow: show SQL, apply to prod before merge, verify with the applied check. | Cheap insurance for joins and cascading deletes as the visit model goes live; low urgency at 14 dogs/day, but the work is mechanical. | S |
| 2.5 | Review the **46 unused indexes** (mostly `whatsapp_*`, `booking_financial_ledger`, `salon_todos`) after a further month of statistics before dropping any. Do not drop on the current sample. | Some cover features that are dark-launched or seasonal; a premature drop is worse than an idle index. | S, later |
| 2.6 | Commit an **advisor baseline** and a `check:advisors` script (in the style of `check:sentry`) that diffs the hosted advisor output against it. | The changelog already reasons about "111 findings, the non-deliberate ones fixed"; capturing that as a file turns a memory into a check, and any new finding shows up as a diff rather than being lost among 111 known ones. | S |
| 2.7 | Tidy the repository root. Move the dated reports (`QA-PASS-2026-05-18.md`, `UX-AUDIT-REPORT.md`, `UX_REVIEW.md` + its two JSON manifests, `SECURITY_SCAN_REPORT.md`, `PRODUCT_UX_CONTEXT.md`, `design-qa.md`) and the already-superseded `LAUNCH_PLAN.md`, `DESIGN.md` and `INBOX-PLAN.md` into `docs/archive/` with the status vocabulary from `docs/README.md`. Mark `SECURITY_SCAN_REPORT.md` superseded: its two findings (broad CORS on `whatsapp-send`, no audit access) have since been addressed by the CORS allowlists and by `npm audit` reporting clean. | Fourteen top-level Markdown files, most of them historical, bury the six that matter. `check:docs` governs links, so this is a link-fixing PR, not a risky one. | S |

### Tier 3 — programme and documentation hygiene

| # | What | Why | Cost |
|---|---|---|---|
| 3.1 | Close or re-scope the `#603` child issues that appear finished: `#608` (capacity convergence) was rescoped on 19 August to the parity harness, which is delivered and measured; `#612` (measurement catalogue) has its deliverable at `docs/specifications/measurement-catalogue.md`. Confirm each against its exit criteria and close it, or write one comment saying what is left. | Ten open issues where the true count of actionable work is closer to five confuses prioritisation. | S |
| 3.2 | Re-verify the governing documents. `PROJECT.md`, `ROADMAP.md`, `docs/README.md` and `docs/interface-capability-truth.md` all carry "last verified" baselines of 9–11 August; roughly forty merges have landed since (telemetry, reason codes, staff confirmation, the repository-layer slices). Re-run their verification against `main` and bump the SHA, or add a status line saying the baseline is historical. | AGENTS.md makes these the authority on intent; a stale SHA weakens that. | S |
| 3.3 | Record the reconsideration trigger for the `#604` reschedule-notification STOP somewhere staff can see it, not only in the go/no-go research record. | The STOP is correct, but the manual-contact procedure it retains is a real operational cost; the trigger for revisiting it should be visible where the cost is felt. | S |
| 3.4 | Keep the Debt 12 section of the register as the single burn-down ledger rather than adding a fifth "update" paragraph per slice. Replace the four dated updates with one current table (file, status, PR). | The register's readability is what makes the burn-down keep going. | S |

## 4. Suggested sequencing

The order below keeps every step independently mergeable and never blocks on
a product decision.

1. **Week 1 — Tier 0 in full, plus 2.1 and 2.3.** Everything in Tier 0 is a
   single-PR change. Branch protection (2.1) and the E2E executable override
   (2.3) unblock every later step, because they make the PR gate real and make
   it runnable where the work happens.
2. **Weeks 2–4 — Tier 1 at one slice per PR.** Alternate an allowlist slice
   (1.1) with an `any` burn-down or a hook conversion (1.2, 1.3), and land the
   two missing tests (1.7) and the coverage ratchet (1.8) early so later
   refactors are measured. Start the `App.jsx` extraction (1.4) once the
   allowlist no longer includes `App.jsx`'s own dependencies.
3. **Weeks 3–5, in parallel — Tier 2 platform work.** Foreign-key index
   migration (2.4) and the advisor baseline (2.6) are small and independent.
   Take the major upgrades (2.2) one at a time, Vite 8 last and on its own
   branch with the full E2E matrix.
4. **Any quiet afternoon — Tier 3.** Issue close-outs and document
   re-verification are small, and they are the ones most likely to be skipped
   for ever if they are not scheduled.

## 5. Risks and trade-offs worth naming

- **Branch protection changes the day-to-day flow.** Today PRs merge the
  moment their author decides; protection adds a wait for CI. That is the
  point, but it should be said plainly before it is switched on.
- **Leaked-password protection can reject a password a customer already
  chose.** Supabase applies the check at sign-in and password-set time; a
  customer with a compromised password will be asked to change it. The
  customer copy in `SetPasswordGate` should say so rather than showing a raw
  Auth error.
- **Vite 8 is the one upgrade with real regression risk.** The manual-chunk
  configuration, the PWA precache and the `vite.config.js` guard test all
  depend on Rollup semantics. Budget a day, not an hour.
- **Dropping unused indexes early is a false economy.** The performance advisor
  samples usage since the last statistics reset; several of the flagged
  indexes serve dark-launched features.
- **The debt burn-down is working but slow.** Twenty-one files at the current
  pace of one or two per PR is several weeks of steady effort. That is fine as
  long as it stays scheduled; it stops the moment it is "when we have time".

## 6. What was deliberately not assessed

- Runtime behaviour on production data: no production query was run beyond the
  read-only advisor reports.
- Edge Function behaviour under Deno: reported from CI only (see §2).
- WhatsApp agent prompt quality and Meta template state: out of scope for a
  repository assessment; see [`../whatsapp-agent.md`](../whatsapp-agent.md).
- UX and accessibility: the June review under
  [`../ux-review-2026-06.md`](../ux-review-2026-06.md) is the authority there.
