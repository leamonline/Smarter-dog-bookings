# Node runtime

**Status:** Accepted — authoritative for which Node version this project builds and tests on.

The project targets **Node 24** ("Krypton", the active LTS line).

## Where the version is declared

| Source | Governs | Enforced by |
|---|---|---|
| [`.nvmrc`](../.nvmrc) | local shells (`nvm`/`fnm` auto-switch on `cd`) | the consistency test below |
| [`package.json#engines.node`](../package.json) | `npm` installs, and Vercel's build image when no project setting overrides it | `engine-strict` |
| [`.npmrc`](../.npmrc) `engine-strict=true` | makes an engine mismatch fatal instead of a warning | npm itself |
| `.github/workflows/*.yml` `node-version:` | every CI job that runs Node | the consistency test below |
| Vercel project setting `nodeVersion` | production and preview builds | **not assertable from this repository** |

[`src/security/nodeRuntimeConsistency.test.ts`](../src/security/nodeRuntimeConsistency.test.ts)
fails if any workflow pin, `.nvmrc` or `engines.node` disagrees on the major, if
a pin goes missing, if `engine-strict` is removed, or if the declared major ever
drops below 24.

## Why it is pinned rather than left floating

Four sources drifted apart without anything failing:

- `ci.yml` pinned Node **20**, which reached end of life in **April 2026**.
- `db-tests.yml` pinned Node **22**.
- `.nvmrc` said **20**.
- Vercel was already building production on **24.x**.

So CI validated every change on a runtime that production did not use and that
Node no longer supported. Meanwhile `@supabase/supabase-js` declares
`engines.node: >=22.0.0`, a requirement CI violated on every run — npm reported
`EBADENGINE` as a warning and installed anyway, and nothing compared the
workflows to each other.

`engine-strict=true` is what converts that warning into a failure. Verified both
ways: `npm ci` installs cleanly on Node 24 with no dependency excluding it, and
fails with `EBADENGINE` on Node 22.

## Bumping the version

Change all four repository sources in one commit — `.nvmrc`, `engines.node`, and
every workflow pin — or the consistency test fails. Then update the Vercel
project's Node setting to match, because that lives in Vercel and this
repository cannot check it.

Note that `agent-tests` pins Node even though it never runs `npm ci`: two of its
steps (`check:edge-types`, `check:edge-auth`) are Node scripts, and without a pin
they run on whatever the runner image happens to ship.
