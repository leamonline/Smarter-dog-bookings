# Major-version upgrade plan (assessment item 2.2)

**Status:** Active
**Authority:** Order, gates and blockers for the dependency majors Dependabot will never open
**Base:** `main@e77303780cd6a69c7851621dd431cb4564c84260`
**Last verified:** 2 September 2026 (registry peer ranges read that day)
**Owners:** Unassigned; each upgrade is its own PR
**Related:** [`.github/dependabot.yml`](../../../.github/dependabot.yml) (majors are ignored by design), [`docs/node-runtime.md`](../../node-runtime.md), [`src/test/viteConfig.test.js`](../../../src/test/viteConfig.test.js)

Dependabot's groups are minor/patch only, so every major below is manual. Each
one is routine now and painful in six months; the point of this page is that
they happen one at a time, in an order that respects the peer constraints, with
the same bar every time.

## The bar for every upgrade PR

1. One package family per PR, on its own branch off `main`.
2. Upgrade with `npm install <pkg>@<major>` **on Linux** (a darwin `npm install`
   strips the Linux `libc` metadata from the lockfile — `scripts/check-lockfile-platform.mjs`
   fails `npm run lint` if it happens, and the fix is `git restore package-lock.json`).
   Resync `deno.lock` in its own commit if `deno test` rewrites it.
3. The full local bar: `lint → check:docs → typecheck → check:migrations → test → build`,
   plus `npm run coverage` (the engine/repositories thresholds) and `npm run e2e`
   (desktop; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` in a remote container).
4. Read the package's migration notes and grep the repository for every
   documented breaking change before trusting green CI: several of these are
   type-only or config-only breaks that the suite cannot see.
5. For anything that touches the build output (Vite, plugin-react, the PWA
   plugin): dispatch the full E2E matrix (`CI` workflow, `workflow_dispatch`),
   compare the `dist/assets` chunk list and sizes against the previous build,
   and after the merge deploys run `npm run check:sentry` against production —
   the Sentry chunk is the canary for tree-shaking changes.
6. Revert is the rollback: these PRs must contain nothing else.

## The packages, in order

| # | Package | Now | Latest | Peer constraints read on 2 Sept 2026 | Verdict |
|---|---|---|---|---|---|
| 1 | `jsdom` | 30.0.1 | 30.0.1 | Verified 10 Sept: Node `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`; optional `canvas ^3.2.3`; Vitest accepts jsdom 30 | **Upgrade prepared.** Test-environment only; see the validation record below and [issue #816](https://github.com/leamonline/Smarter-dog-bookings/issues/816). |
| 2 | `@testing-library/jest-dom` | 6.9 | 7.0 | needs `vitest >= 0.32`, `@testing-library/dom >=10 <11` (we have 10.4) | **Second.** Matcher-only package; check the 7.0 notes for renamed/removed matchers and grep `expect(...).to` usages. |
| 3 | `@types/node` | 25.9 | 26.4 | `vitest` accepts `>=24` | **Do not chase.** The runtime is Node 24 (`.nvmrc`, `engines.node`, every workflow — see node-runtime.md); type definitions ahead of the runtime can only describe APIs the runtime lacks. Pin `@types/node` to **24.x** in the same commit that next touches it, and move it with the runtime, not with the registry. |
| 4 | `vite` + `@vitejs/plugin-react` + `vite-plugin-pwa` | 7.3 / 4.7 / 1.3 | 8.2 / 6.1 / 1.3 | `@vitejs/plugin-react@6` requires `vite ^8` (v5 is the last that accepts Vite 7); `vite-plugin-pwa@1.3`, `@tailwindcss/vite`, `vitest@4.1` and `@vitest/coverage-v8` all accept Vite 8 | **One PR, the risky one.** Vite 8 makes Rolldown the default bundler, which is the `rollupOptions` / `rolldownOptions` landmine the config comment and the guard test exist for. See the Vite 8 section below. `plugin-react` goes 4 → 6 in the same PR because 6 cannot run on Vite 7; its `oxc-transform-react` / Babel split changes how the React Compiler and Fast Refresh are configured — read its migration notes. |
| 5 | `eslint` | 9.39 | 10.9 | `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` and `@eslint/js` (already 10) accept ESLint 10; **`eslint-plugin-react@7.37` peers `eslint ^9.7` at most** | **Blocked by `eslint-plugin-react`** until it publishes an ESLint 10 range. `.npmrc` sets `legacy-peer-deps=true`, so `npm install` would not stop you — that is exactly why this row waits for the plugin, not for npm. Re-check `npm view eslint-plugin-react peerDependencies` monthly. |
| 6 | `typescript` | 6.0 | 7.0 | **`typescript-eslint@8.69` peers `typescript >=4.8.4 <6.1.0`** | **Blocked by `typescript-eslint`.** TypeScript 7 is the native (Go) compiler; expect `tsc` flag and `tsconfig` differences beyond the type-checker itself (`moduleResolution: "bundler"` and `isolatedModules` are the settings to re-verify). Wait for a `typescript-eslint` major that declares TS 7 support, then do it as one PR with the lint plugin bump. |

Everything else with a newer major (`vitest`, `typescript-eslint`, `@supabase/supabase-js`,
`react`, `react-router-dom`, Tailwind) is already on its current major.

## jsdom 30.0.1 validation — 10 September 2026

Prepared from `main@5246a5ab56fa7325db898426d8c9784094f3c056` on
`codex/jsdom-30`, tracked by [issue #816](https://github.com/leamonline/Smarter-dog-bookings/issues/816).
Installed with `npm install --save-dev jsdom@30.0.1 --no-audit --no-fund` on
Linux arm64 (Alpine), Node 24.21.0. This does not change the supported Node
major; installations and tests now need at least Node 24.15.0.

Reviewed the upstream [v30.0.0 release notes](https://github.com/jsdom/jsdom/releases/tag/v30.0.0)
and [v30.0.1 release notes](https://github.com/jsdom/jsdom/releases/tag/v30.0.1).
The only documented breaking change is the Node minimum. No DOM API removals
are listed. The changes also cover CSS escaping/support checks, computed
lengths and CSS function serialisation, and XPath error types; v30.0.1 fixes
the v30.0.0 computed-style regression with `calc()` and other functions.
Repository searches found `CSS.escape()` in `BreedCombobox` and
`getComputedStyle()` in `ComposePanel` and its component test; no
`document.evaluate()` or `CSS.supports()` usage was found in `src`.

The lockfile changes 19 installed package entries, all development-only and
within jsdom's dependency tree. All 12 Linux `libc` entries remain intact;
unrelated direct dependencies and production package versions are unchanged.
The optional canvas peer is not installed. Validation uses deterministic
offline data (`CI=1`, `VITE_FORCE_OFFLINE=1`) without Supabase credentials.

Local validation passed on that environment:

- A separate clean `npm ci --no-audit --no-fund` installation resolved jsdom 30.0.1.
- `npm run test:component`: 174 files, 1,293 tests passed.
- `npm run lint`: no errors (65 existing warnings); platform metadata guard passed.
- `npm run check:docs`, `npm run typecheck`, `npm run check:migrations`: passed.
- `npm run test`: 343 files, 3,528 tests passed.
- `npm run coverage`: 3,528 tests passed and both directory thresholds passed;
  combined statements 92.05%, branches 84%, functions 92.55%, lines 93.36%.
- `npm run build`: passed.
- `npm run e2e -- --project=desktop --workers=2`: all 49 tests passed, using
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium-browser` (Chromium 152.0.7977.82).

No application or test changes were needed. Hosted PR checks remain separate
release evidence; these local results do not claim a merge or deployment.
Rollback is reverting the upgrade PR. Tranche B remains stopped.

## Vite 8: what to check specifically

The reason this one gets its own branch and the full matrix:

- **The bundler changes.** Rolldown replaces Rollup as the default. Vite 8 keeps
  `build.rollupOptions` as the compatibility spelling; whether it is an alias
  of `build.rolldownOptions` or the reverse in the shipped version is what to
  read in the migration guide first. `src/test/viteConfig.test.js` asserts the
  key the bundler actually reads and that the dead key is absent — **if Vite 8
  moves the canonical key, update the config and the test together**, never
  one without the other. The failure mode being guarded is silent: the
  manual-chunk map is ignored, the app ships one ~443 KB entry chunk, and the
  PWA precache thrashes on every deploy.
- **Chunk names and sizes.** Compare `dist/assets` before and after. The
  vendor groups (`react-vendor`, `router`, `supabase`, `sentry`, …) must still
  exist as separate files; `scripts/check-sentry-live.mjs` finds the Sentry
  chunk by its `sentry-*.js` name, so a renamed chunk breaks the production
  check even though the build is green.
- **The PWA plugin.** `vite-plugin-pwa@1.3` declares Vite 8 support; confirm
  the generated `sw.js` precache manifest still lists every asset (the
  `precachedAssets` helper in the Sentry check reads it).
- **`plugin-react@6`.** Fast Refresh and the optional React Compiler move to
  the Oxc transform; the repo does not use the compiler today, so the
  expected change is config-shape only.
- **Gates:** full local bar, `npm run coverage`, the desktop E2E locally, the
  full E2E matrix by dispatch, a manual look at the built app in preview
  (`npm run preview`), and `npm run check:sentry` after the deploy.

## When a row unblocks

Re-run the peer check for the blocked rows on the first Monday of each month
(the same cadence as the Dependabot groups):

```bash
npm view eslint-plugin-react@latest peerDependencies
npm view typescript-eslint@latest peerDependencies
```

When the range admits the new major, move the row's verdict to "do", open the
PR against this bar, and update the table here in the same PR.
