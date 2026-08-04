# Fable 5 prompt — SmarterDog Bookings long-horizon overhaul

> **How to use this file.** Open a fresh Claude Code session on **Claude Fable 5** (`claude-fable-5`) with this repository checked out clean, then paste **everything below the horizontal rule** as your first message. Don't preface, don't summarize, don't split it across turns — Fable 5 produces its best long-horizon work when the entire spec arrives in one well-formed initial turn and `effort` is set high from the start.
>
> Recommended session config: `effort: "xhigh"` for waves 1–2, bump to `"max"` for wave 3. Default-on adaptive thinking. Set `max_tokens` generous (≥ 64K). If your harness exposes Task Budgets, give the run a large one (≥ 500K tokens) so Fable 5 can self-pace across the full backlog.

---

You are a senior engineer joining the SmarterDog Bookings codebase for a focused, multi-day overhaul. The product is live: a tablet-first booking and management dashboard for a UK dog grooming salon, with a WhatsApp AI receptionist drafting replies and proposing booking changes for staff approval. It works end-to-end for the daily workflow. It is also architecturally fragile in specific, documented ways. Your job is to harden it — without changing what the staff and customers see day-to-day — and to leave the next engineer (and the next AI run) a more workable base than you found.

Three audits already mapped the work and gave each finding a stable ID. Use those IDs in commits, PR bodies, and your own notes — don't restate findings, reference them.

## Read these before you touch anything

In this order, end-to-end, no skimming:

1. `CODEBASE-AUDIT.md` — stack map, architecture, current state of every directory.
2. `UX-AUDIT-REPORT.md` — the three live UX blockers, numbered "Top 5 Issues" #1–5.
3. `TECHNICAL-DEBT-REGISTER.md` — 25 numbered debts with `file:line` evidence. Cost rubric: **S** = hours, **M** = a few days, **L** = sustained workstream. We'll cite these as "Debt #N".
4. `INBOX-PLAN.md` — the 5-phase plan for the WhatsApp inbox cockpit refactor. Out of scope for this run except where wave 1 fixes intersect it; read it so you don't trample its surface.
5. `docs/whatsapp-agent.md` and `docs/capacity-engine.md` — domain docs. The capacity engine (2-2-1 rule, large-dog windows) and the WhatsApp risk-gating model are load-bearing. Treat both as invariants.
6. `package.json` for the exact script names (`npm test`, `npm run typecheck`, `npm run lint`, `npm run coverage`, `npm run e2e`).
7. `eslint.config.js` lines 51-66 (Debt #3 — the disabled safety rules you'll be re-enabling).
8. `tsconfig.json` (Debt #1 — `allowJs: true, checkJs: false`).

After reading: open a scratchpad at `.claude-scratch/fable5-run.md` (gitignored — create the gitignore entry if needed). Use it as a running notes file across the whole run: current wave, what you decided and why, file-level invariants you discovered, anything you want to remember after compaction. Check it at the start of every new wave. This survives context compaction; your in-window memory does not.

## The work — three waves, each ships independently

Each wave is one branch, one PR, gradable "done" criteria. **Do not start wave N+1 until wave N's PR is green in CI** — if a wave grows past its budget, stop, write what's left into the scratchpad, and ask before continuing.

### Wave 1 — Stop the bleeding (1–2 days)

Branch: `fable5/wave-1-stabilize`. PR title: `Wave 1: UX blockers + observability foundations`.

| # | Finding | What to do |
|---|---|---|
| 1 | **UX #1** dog search in New Booking Modal hangs on "Searching..." | Reproduce locally, identify the broken handler (likely a debounce/filter bug or stuck loading flag in the search hook used by the modal), fix, write a regression test that exercises the typed-search path. |
| 2 | **UX #2** Settings page renders blank below the first two sections | Inspect the long-scroll layout container — likely a CSS `overflow`/`height` or lazy-render bug. The DOM exists; it just isn't painting. Fix without altering the section content. Add an e2e (`npm run e2e`) check that each of the 8 settings tabs surfaces interactive content. |
| 3 | **UX #3** Add Human Modal pre-fills with stale data | Clear form state on `onOpen` / when the modal enters "create" mode. Add a unit test that opening the modal in create mode after editing an existing record renders empty fields. |
| 4 | **Debt #22** 80+ `console.error` calls, only `ErrorBoundary` reaches Sentry | Add `src/lib/logger.ts` — `logger.error(err, context?)` routes to `@sentry/react`'s `captureException` in prod and `console.error` only in dev (`import.meta.env.DEV`). Migrate `useWhatsAppInbox.js` (the loudest offender, ~15 sites) and the customer-portal modules in this PR. Other modules in later waves. Add an ESLint rule that bans bare `console.error` outside `src/lib/logger.ts` and the existing dev-gated site in `transforms.ts:364`. |
| 5 | **INBOX-PLAN Bug F1** `whatsapp_booking_actions` not in the Supabase realtime publication | Add a migration under `supabase/migrations/` that includes the table in the realtime publication. Verify staff see pending booking-action dots without a hard refresh. |

**Wave 1 done when:**
- New regression tests for UX #1, #2, #3 pass; `npm test` is green; `npm run e2e` is green for the settings-tabs check.
- `git grep -nE "console\.(error|warn)\b" src/ supabase/functions/ | grep -v "src/lib/logger" | grep -v "transforms.ts"` returns only sites scheduled for waves 2–3 (note the count in the PR body).
- Manual smoke test: search for a dog in the New Booking Modal, navigate every Settings tab, open Add Human Modal after editing an existing human — all behave correctly on a fresh page load.
- Realtime: a `whatsapp_booking_actions` insert triggers a UI update without a refresh.
- PR description lists each closed finding ID and links the regression test for it.

### Wave 2 — Stop the drift (3–5 days)

Branch: `fable5/wave-2-foundations`. PR title: `Wave 2: test coverage, magic-string cleanup, dog-map drift`.

| # | Finding | What to do |
|---|---|---|
| 1 | **Debt #25** zero tests on critical hooks | Add Vitest test files for `useBookings`, `useDogs`, `useHumans`, `useCustomerAuth`, and a dispatcher-level test for `supabase/functions/whatsapp-agent/index.ts`. Cover the realistic failure modes — pagination boundaries, realtime resync, offline fallbacks, RLS-denied paths — not just the happy path. Target coverage **≥ 80%** per hook (`npm run coverage`). Use the Supabase JS client mocking pattern already present in `engine/capacity.test.js`'s test setup as a starting point. |
| 2 | **Debt #18** booking status as raw string literals | All 65 occurrences route through `BOOKING_STATUSES` in `constants/salon.ts`. Add `"Cancelled"` to the `BookingStatusId` union in `types/index.ts:14-20` so it stops being a magic string. After the sweep, `git grep -nE '"(Booked|Cancelled|Checked in|Completed|No[- ]?show)"' src/` returns only the constants definition and test fixtures. |
| 3 | **Debt #20** salon phone number in 3 formats across 4 files | Move to `src/constants/salon.ts` as `SALON_PHONE = { e164: "+44...", local: "07...", waMe: "447..." }`. Replace the 4 call sites. |
| 4 | **Debt #21** RPC names as scattered string literals | Add `src/supabase/rpcs.ts` exporting a typed object `{ applyWhatsAppBookingAction: "apply_whatsapp_booking_action", … }` covering all 8 RPCs. Replace inline literals. |
| 5 | **Debt #14** `useDogs.ts` parallel `dogsById` + name-keyed `dogs` maps | Make `dogsById` the source of truth; derive `dogs` (or a `getDogByName` helper) from it via `useMemo`. Audit every mutation site (lines 113-148, 198-236, 320-321 per the register) and remove the parallel updates. Add a unit test that a rename updates lookups by old name correctly (i.e. the stale entry is gone). |
| 6 | **Debt #4** `.js` import extension on `.ts`/`.tsx` modules | Codemod or manual sweep — drop the extension where the resolved file is TS. Add ESLint `import/extensions: ["error", "never"]` to keep them off. |

**Wave 2 done when:**
- `npm run coverage` shows ≥ 80% line coverage on each of the five named hooks/modules.
- Each of the magic-string sweeps (`BOOKING_STATUSES`, phone, RPCs) shows only the constants module + tests in `git grep` for the literals.
- `useDogs` has a single source of truth; the rename test passes.
- `npm run lint` is green with the new ESLint rules on.
- PR description lists every Debt # closed, with before/after `git grep -c` counts for each magic-string sweep.

### Wave 3 — Reshape (open-ended; one PR per file or per ESLint rule)

Branch prefix: `fable5/wave-3-*`. Each god-file extraction and each ESLint-rule re-enable ships as its own small PR, in this order:

1. **Debt #5** `useHumans.ts` (1050 LoC) → `useHumansData` + `useHumansSearch` + `useTrustedContacts`. Tests from wave 2 anchor the refactor — they must still pass at each step.
2. **Debt #6** `useWhatsAppInbox.js` (1042 LoC) → `useInboxList` + `useInboxThread` + `useInboxComposer` + `useInboxBookingActions`, with a thin reducer for shared state. Do not collide with `INBOX-PLAN` — read its phase 2 first; if your refactor would change a name or surface that plan depends on, stop and ask.
3. **Debt #7, #8, #9** modal god files (`HumanCardModal`, `DogCardModal`, `BookingDetailModal`) → orchestrator + leaf components per the register's recommendations (#7, #8, #9 in `TECHNICAL-DEBT-REGISTER.md`).
4. **Debt #1, #2** incremental TS migration. Flip `checkJs: true` on a per-directory basis starting with `src/engine/` (already mostly typed), then `src/hooks/`, then `src/supabase/hooks/`. Replace `: any` at the 11 hot sites listed in Debt #2 using `mcp__Supabase__generate_typescript_types` to mint `Database['public']['Tables'][...]` row types. Do **not** attempt a big-bang migration; cap each PR to ≤ 3 files.
5. **Debt #3** re-enable each disabled ESLint rule one PR at a time: `react-hooks/exhaustive-deps` first (sweep the loudest 20, then promote to `error`), then `no-unused-vars`, then drop `allowEmptyCatch`, then `@typescript-eslint/no-explicit-any` at `warn`. Wire each into CI as it goes.

**Wave 3 done when:** All five steps land. No god file exceeds ~400 LoC. `tsconfig.json` has `checkJs: true` for the migrated directories. All four disabled ESLint rules are back on at `error` (or `warn` for `no-explicit-any`). CI blocks on lint, typecheck, and tests.

## Engineering guardrails — non-negotiable

- **Preserve user-facing behavior** unless a finding says to change it. This is a refactor + bugfix run, not a redesign.
- **No speculative refactors.** No abstractions for hypothetical futures. Three similar lines is better than a premature abstraction.
- **No half-finished migrations.** If you can't finish a file in this run, don't start it.
- **Don't touch the capacity engine** (`src/engine/capacity.ts` and tests) without a finding explicitly directing you to. The 2-2-1 rule, large-dog windows, and slot validation are the product.
- **Don't touch RLS policies** (`supabase/migrations/*.sql` rows that grant or restrict) without a finding. RLS is the security model.
- **The WhatsApp agent's risk gating is intentional.** Auto-send defaults off, low-risk-only allowlist, per-conversation opt-in, global kill switch. Do not "improve" it by widening the auto-send envelope. The conservative defaults are the policy.
- **Offline mode and sample-data fallbacks must keep working** (`src/data/sample.js`, `useOfflineState.js`). The front desk runs on tablets with flaky WiFi; the offline path is real.
- **Customer-facing snake_case bypass (Debt #13) is in scope but tricky.** When you route customer surfaces through `transforms.ts`, verify the booking wizard, dashboard, and login flows all still work against the live RLS rules — these don't have full test coverage yet.
- **No `--no-verify`, no force-pushes, no amends to pushed commits.** If a pre-commit hook fails, fix the cause and make a new commit.

## Workflow

- One branch per wave (`fable5/wave-1-stabilize`, `fable5/wave-2-foundations`, `fable5/wave-3-*`). PRs may be draft.
- Run **`npm test && npm run lint && npm run typecheck`** before every push. Run **`npm run e2e`** before opening any PR that touches user-facing flows.
- Commit at logical seams (per-finding for waves 1–2, per-file for wave 3). Each commit message ends with `Closes: UX #N` or `Closes: Debt #N` (or `Refs:` if partial).
- PR body template:
  ```
  ## Summary
  - Wave: 1 / 2 / 3
  - Closes: <finding IDs>

  ## What changed
  <bullet list, one per finding>

  ## Verification
  - npm test: green
  - npm run lint: green
  - npm run typecheck: green
  - npm run e2e: green / N/A
  - Manual smoke: <what you did>

  ## What's deliberately out of scope
  <bullet list — surface anything you spotted but didn't fix>
  ```
- After pushing a wave, wait for CI green before starting the next. If CI fails, diagnose and fix on the same branch — don't open the next wave on top of a red one.

## How to actually use Fable 5 well on this run

These are deliberate departures from defaults — set them and stay in them.

- **Effort.** Start at `xhigh`. Bump to `max` for the god-file extractions (Debt #5–10) and the TS migration (Debt #1–2) — anywhere correctness matters more than cost. Don't reflexively run at `max` on simple sweeps; `xhigh` is usually the sweet spot.
- **Subagents (delegate fan-out).** When work is N independent items — N test files to write, N call sites of a magic string to update, N leaf components to extract from a modal — delegate to subagents in parallel. Do **not** delegate sequential work within a single file. (Fable 5's default is conservative on delegation; this nudge matters.)
- **Scratchpad (`.claude-scratch/fable5-run.md`).** Maintain it. At minimum: current wave, decisions log, file-level invariants discovered, open questions for the user. Check it at the start of every wave. Compaction will eat your in-window memory; this file is what survives.
- **Search-first.** Before answering anything that depends on current docs — Supabase realtime publication syntax, RLS policy patterns, Deno runtime constraints for Edge Functions, Twilio Verify behavior, Tailwind v4 / Vite 7 specifics — search and confirm. Don't answer from memory on these.
- **Tool triggering for the user.** Small choices (variable name, file location among equivalents, which test runner option) — pick a reasonable default and note it in the scratchpad. Scope changes, destructive ops (DB schema, deleting tests, behavior changes, archiving anything), or anything that contradicts an audit finding — stop and ask first.
- **Silence default.** Don't narrate routine tool calls. One sentence at wave boundaries, on direction changes, and on blockers. End-of-wave summary: 2–3 bullets on what landed and what's next.
- **Push back when warranted.** If a finding looks wrong, a wave's scope is bigger than it reads, or a guardrail conflicts with shipping the fix — say so before executing. Better to surface the friction than to silently widen scope.

## Kickoff

When you're ready:

1. Read the docs listed above in order.
2. Create `.claude-scratch/fable5-run.md`. Write a 5-bullet summary of wave 1 in your own words.
3. Cut `fable5/wave-1-stabilize` and start with UX #1 (dog search). Reproduce the bug locally first — write the failing test, then fix.
4. From there, you're running the playbook.

Acknowledge the brief, share the wave-1 summary, and begin.
