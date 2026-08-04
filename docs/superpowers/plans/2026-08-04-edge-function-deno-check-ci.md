# Add Edge Function entrypoint type checking to CI

**Status:** awaiting approval — no implementation started.
**Scope:** item 1 of the four follow-ups recorded in PR #589.

## Context

During PR #589 the full verification bar passed while two real type errors sat in
an Edge Function. Both were found only by manually running `deno check`:

- an unsound cast from `PostgrestBuilder`, which is a *thenable*, not a `Promise`;
- `setTimeout` assumed to return `number`, when it resolves to `Timeout` under
  the lib set these functions compile against.

The cause is structural. CI's `agent-tests` job runs
`deno test --node-modules-dir=none --allow-env supabase/functions/`, and Deno
only type-checks modules **reachable from discovered `*.test.ts` files**. No test
imports any `index.ts`, so every Edge Function entrypoint is currently unchecked.

That matters more than it looks: a change under `supabase/functions/_shared/**`
triggers a redeploy of **every** Edge Function, so an undetected entrypoint error
surfaces after merge, during deployment, across all 25 functions at once.

**Intended outcome:** CI fails on a type error in any deployable Edge Function
entrypoint, and a guard makes that coverage hard to remove silently.

---

## Findings that changed the design

### 1. `deno check` fails on `main` today — this is a blocker, not a footnote

A sweep of all 25 entrypoints against `origin/main` (403d401):

```
24 PASS
 1 FAIL  supabase/functions/whatsapp-send/index.ts
```

```
TS2589  Type instantiation is excessively deep and possibly infinite.
          at whatsapp-send/index.ts:747  (runConfirmButtons call)
TS2322  Type 'SupabaseClient<…>' is not assignable to type 'SupabaseLike'.
        The types returned by 'from(...).select(...).single()' are incompatible:
        'PostgrestBuilder<…>' is missing 'catch', 'finally', '[Symbol.toStringTag]'
          from 'Promise<…>'
          at whatsapp-send/index.ts:749, via _shared/confirmButtons.ts:39
```

**Adding the CI check without fixing this turns `main` red immediately.** So the
fix is in scope by necessity — not scope creep. It is the *same* thenable-vs-Promise
class of bug the check exists to catch, which is a decent argument that the check
is worth having.

This is a **latent type error, not a runtime bug**: `supabase functions deploy`
bundles with esbuild and does not type-check, so `whatsapp-send` runs correctly in
production today. No user-visible defect; nothing urgent.

I verified the fix experimentally and reverted it. It is type-only, 3 lines, no
runtime change:

- `_shared/confirmButtons.ts` — `SupabaseSelectQuery.single()` and
  `SupabaseUpdateQuery.select()` return `PromiseLike<…>` rather than `Promise<…>`.
  The real client returns a thenable; `await` is unaffected, and test fakes
  returning real Promises still satisfy `PromiseLike`. **Clears TS2322.**
- `whatsapp-send/index.ts` — hoist the inline deps object into
  `const deps: ConfirmButtonsDeps = { supabase: supabase as unknown as SupabaseLike, … }`
  and pass `deps`. The explicit annotation stops TypeScript inferring through
  `SupabaseClient`'s generics. **Clears TS2589.**

Confirmed after the change: **all 25 entrypoints pass**, and `deno test` still
reports **68 passed / 0 failed**.

### 2. Cost is negligible — check everything, not just changed functions

All 25 entrypoints in one invocation: **~16s cold, ~1.3s warm**. No reason to
build changed-file detection. Checking the full set also means a function nobody
touched can't rot.

### 3. The new check must be its own CI step

The existing test step's retry loop ends with `exit 0` inside the `for`:

```yaml
if deno test --node-modules-dir=none --allow-env supabase/functions/; then
  echo "::endgroup::"
  exit 0
fi
```

Anything appended to that same `run:` block would **never execute**. The check
goes in a separate step in the same `agent-tests` job.

Order it **before** the tests: `deno check` warms Deno's remote-module cache for
the run, and a type error is a faster, clearer failure than a downstream test error.

### 4. `_shared` is the only non-deployable directory

Every other `supabase/functions/*/` has an `index.ts`. `supabase/functions/*/index.ts`
is exactly the deployable set today — but a glob that matches nothing silently
"passes", so the script must fail loudly on an empty discovery.

### 5. Established conventions to follow

- `scripts/*.mjs`, `#!/usr/bin/env node`, node builtins only, explanatory header
  (`check-migrations.mjs`, `check-import-extensions.mjs`).
- npm script named `check:*`.
- CI/script contract guards live in `src/security/*.test.ts` and read the
  workflow or script as text — four precedents, incl. `dbTestsWorkflow.test.ts`
  and `prepareDbTestProject.test.ts`.
- `agent-tests` deliberately never runs `npm ci`. A zero-dependency `.mjs` script
  is fine (node is present on the runner); anything needing `node_modules` is not.

---

## Steps

Test-driven: each guard fails first, for the right reason, before the change lands.

### Step 0 — branch

- [ ] `git fetch origin main && git checkout -B <branch> origin/main`
      (PR #589 is merged; start fresh from `main`, do not reuse its branch.)

### Step 1 — prove the gap (failing check, no code yet)

- [ ] Run: `deno check --node-modules-dir=none supabase/functions/*/index.ts`
- [ ] **Expect failure:** `TS2589` + `TS2322` in `whatsapp-send/index.ts`, `Found 2 errors.`
      This is the baseline the rest of the plan removes.

### Step 2 — fix the one failing entrypoint (type-only)

- [ ] `supabase/functions/_shared/confirmButtons.ts`: `Promise` → `PromiseLike` on
      `SupabaseSelectQuery.single()` and `SupabaseUpdateQuery.select()`, with a
      comment saying why (the client returns a thenable, not a Promise).
- [ ] `supabase/functions/whatsapp-send/index.ts`: hoist the deps object to a
      `const deps: ConfirmButtonsDeps`, cast `supabase as unknown as SupabaseLike`,
      import both types. Comment why the annotation is load-bearing (TS2589).
- [ ] Rerun `deno check --node-modules-dir=none supabase/functions/*/index.ts` →
      **expect clean** (no `Found N errors`).
- [ ] `deno test --node-modules-dir=none --allow-env supabase/functions/` →
      **expect 68 passed**, proving the type widening changed no behaviour.

### Step 3 — discovery script

- [ ] Add `scripts/check-edge-function-types.mjs`:
  - exports `discoverEdgeFunctionEntrypoints(root = process.cwd())` — reads
    `supabase/functions`, keeps directories containing `index.ts`, returns
    **sorted** repo-relative paths;
  - main-guard (`import.meta.url` vs `process.argv[1]`) so importing it from a
    test does **not** execute `deno check`;
  - exits non-zero with a clear message if discovery is empty;
  - prints the entrypoints it is about to check;
  - spawns `deno check --node-modules-dir=none <sorted paths>` inheriting stdio,
    exits with its status.
  - **No `--allow-*` flags.** `deno check` takes no runtime permissions; it
    resolves remote imports without them.
- [ ] Add `"check:edge-types": "node scripts/check-edge-function-types.mjs"` to
      `package.json`.
- [ ] Run `npm run check:edge-types` → **expect pass**, listing 25 entrypoints.

### Step 4 — discovery unit tests (failing first)

- [ ] Add `src/security/edgeFunctionTypeCheck.test.ts` asserting
      `discoverEdgeFunctionEntrypoints`:
  - includes every deployable `supabase/functions/<name>/index.ts`;
  - **excludes `_shared`** (and any directory without an `index.ts`);
  - returns sorted output (deterministic ordering);
  - throws/errors clearly when pointed at a root with no entrypoints
    (use a temp dir; do not mutate the repo).
- [ ] Run `npx vitest run --project logic src/security/edgeFunctionTypeCheck.test.ts`
      → **expect failure before Step 3's script exists**, pass after.

### Step 5 — CI contract guard (failing first)

- [ ] Add `src/security/edgeFunctionTypeCheckCi.test.ts`, in the
      `dbTestsWorkflow.test.ts` idiom — read `.github/workflows/ci.yml` as text and
      assert:
  - it contains the invocation (`node scripts/check-edge-function-types.mjs`,
    or `npm run check:edge-types` — whichever Step 6 uses);
  - the referenced script file exists on disk (catches a rename that leaves CI
    calling a missing path);
  - the check appears in the `agent-tests` job and **before** the `deno test`
    invocation (index comparison, as `dbTestsWorkflow.test.ts` does).
  - No line numbers, no formatting-sensitive assertions.
- [ ] Run it → **expect failure** (CI not yet wired), then pass after Step 6.

### Step 6 — wire it into CI

- [ ] In `.github/workflows/ci.yml`, `agent-tests` job, add a **new step** before
      "Run Edge Function (Deno) tests":

      - name: Type-check Edge Function entrypoints
        run: <3-attempt retry wrapper around npm run check:edge-types>

- [ ] Mirror the existing 3-attempt retry with the same backoff. Rationale: the
      entrypoints import `@supabase/supabase-js` from esm.sh, so `deno check` has
      the *same* transient-CDN exposure the test step already documents. Leave the
      existing test step's retries untouched.
- [ ] Do not touch any other job.

### Step 7 — full verification bar

- [ ] `npm run check:edge-types` *(replaces the raw glob — the script is the
      contract, and it fails loudly on empty discovery where a glob would not)*
- [ ] `deno test --node-modules-dir=none --allow-env supabase/functions/`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run check:migrations`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Validate the workflow still parses (e.g. `python3 -c "import yaml,sys;
      yaml.safe_load(open('.github/workflows/ci.yml'))"`), and after pushing,
      confirm the new step appears **in the `agent-tests` job** on the PR.

### Step 8 — negative control

- [ ] Temporarily introduce a deliberate type error in one entrypoint, confirm
      `npm run check:edge-types` fails, then revert. A guard that has never been
      seen to fail is not yet a guard.

### Step 9 — commit

- [ ] One commit. Message explains the CI blind spot, the two errors it would
      have caught, and that the `whatsapp-send` fix is type-only.

---

## Files this plan changes

| File | Change |
|---|---|
| `supabase/functions/_shared/confirmButtons.ts` | `Promise` → `PromiseLike` on two structural methods (type-only) |
| `supabase/functions/whatsapp-send/index.ts` | hoist deps to an annotated `ConfirmButtonsDeps` const (type-only) |
| `scripts/check-edge-function-types.mjs` | **new** — discovery + `deno check` runner |
| `package.json` | add `check:edge-types` script |
| `.github/workflows/ci.yml` | new step in `agent-tests` |
| `src/security/edgeFunctionTypeCheck.test.ts` | **new** — discovery unit tests |
| `src/security/edgeFunctionTypeCheckCi.test.ts` | **new** — CI contract guard |

No migrations. No pgTAP. No deployment-behaviour change. No other CI job touched.

---

## Risks and caveats

- **The `whatsapp-send` fix is required, and is the one judgement call here.** It
  is type-only and verified, but it touches a live, deployed function. Merging
  redeploys it (and, because `_shared/confirmButtons.ts` changes, **all** Edge
  Functions). If you would rather not touch `whatsapp-send` in this PR, the
  fallback is a documented single-entry exclusion list plus a drift guard
  asserting the list only shrinks — **I do not recommend it**: it ships a CI check
  that exempts the one file already known to be broken.
- **`as unknown as SupabaseLike` is a cast**, i.e. the very construct that hid the
  original bug. It is narrower here — `SupabaseLike` is a deliberate minimal
  structural type and the widening to `PromiseLike` is what makes it honest — but
  it is worth a reviewer's eye.
- **New CDN exposure.** `deno check` resolves remote imports, so it can fail on an
  esm.sh blip. Mitigated by the same retry the test step uses; net CI time rises
  by roughly 16s cold.
- **TS2589 is fragile by nature.** A future `@supabase/supabase-js` bump could
  reintroduce it elsewhere. That is the check working as intended, but expect it
  to occasionally demand an annotation.
- **Coverage boundary:** this checks entrypoints and everything they import. A
  `_shared` module imported by neither a test nor an entrypoint stays unchecked.
  No such file exists today; not worth solving pre-emptively.

---

## Recommended follow-up issue titles (not to be opened yet)

1. **Preserve staff reschedule notification preferences on replacement bookings**
   — carry `confirmation_channel` and `notify_human_ids` across
   `reschedule_staff_booking_visit` replacement inserts.
2. **Design visit-level customer notifications for live staff reschedules**
   — live staff reschedule paths move rows in place and tell the customer nothing.
3. **Implement visit-level notification fan-in and group identity propagation**
   — set `group_id` on Path-B inserts and fan notifications in at visit level.
