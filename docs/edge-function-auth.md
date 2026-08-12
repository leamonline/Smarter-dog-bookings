# Edge Function caller and authentication contract

**Status:** Accepted — authoritative for Edge Function caller/authentication classification.

Every deployable Edge Function is deployed with `--no-verify-jwt`, so the
Supabase gateway authenticates **nothing**. Each function's own in-function
check is the entire security boundary, and that boundary is spread across every
directory under `supabase/functions/`.

This document explains the contract that makes that boundary reviewable, and —
just as importantly — what it does not prove.

## Where the contract lives

| Artefact | Role |
|---|---|
| [`supabase/functions/_shared/authManifest.json`](../supabase/functions/_shared/authManifest.json) | The data. One entry per deployable function, plus the family definitions. |
| [`supabase/functions/_shared/authManifest.ts`](../supabase/functions/_shared/authManifest.ts) | Typed access for Deno consumers. |
| [`scripts/check-edge-function-auth.mjs`](../scripts/check-edge-function-auth.mjs) | The guard. Run by `npm run check:edge-auth` in CI's `agent-tests` job. |
| [`supabase/functions/_shared/authContracts.test.ts`](../supabase/functions/_shared/authContracts.test.ts) | Deno negative tests for the shared primitives and the manifest invariants. |
| [`src/security/edgeFunctionAuthContract.test.ts`](../src/security/edgeFunctionAuthContract.test.ts) | Negative controls proving the guard fails on each drift mode. |

## Why a manifest rather than prose

Nothing else in the pipeline notices a missing auth check. `deno check`
type-checks an unauthenticated function happily, and the Deno tests never import
an entrypoint. A new function could ship as an unreviewed public endpoint with
CI fully green.

A manifest alone would rot, so every mechanically checkable field is
**recomputed from the actual sources** and compared with what the entry claims:

- `originPolicy` — against the `buildAllowedOrigins("…")` call in the function's sources.
- `serviceRole` — against whether `SUPABASE_SERVICE_ROLE_KEY` appears.
- `configToml` — against the real `[functions.*]` block in `supabase/config.toml`.
- the declared family's `requiredPrimitives` — against the file the entry names as `authSource`.
- `gatewayVerifyJwt` — against the deploy workflow still passing `--no-verify-jwt`.

An entry therefore cannot describe code that no longer exists. Deleting an
`is_staff()` gate while leaving the entry claiming a staff-only endpoint fails
the build.

## Authentication families

| Family | Credential | Refuses with |
|---|---|---|
| `webhook-bearer` | `Authorization: Bearer <WEBHOOK_SECRET>` from pg_net triggers and cron | 401, or 500 when the secret is unset |
| `webhook-bearer-or-internal-secret` | The above, or `x-internal-secret: <SEND_INTERNAL_SECRET>` | 401 |
| `webhook-bearer-or-staff-jwt` | The webhook bearer, or a staff JWT + `is_staff()` | 401 / 403 |
| `staff-jwt` | Staff session JWT verified via `auth.getUser()`, then `is_staff()` | 401 / 403 |
| `staff-jwt-or-internal-secret` | The above, or `x-internal-secret` for service callers | 401 / 403 |
| `internal-secret` | `x-internal-secret` only; no browser path | 401 |
| `agent-secret` | `x-agent-secret: <AGENT_CALLBACK_SECRET>` | 401 |
| `meta-signature` | HMAC-SHA256 `X-Hub-Signature-256` over the raw body, and/or the `hub.verify_token` handshake | 403, or 200-and-not-processed (see below) |
| `feed-token` | Opaque token from `calendar_feed_tokens`, in the URL | 401 / 403 |
| `public-rate-limited` | None by design — origin allowlist plus per-IP and global rate limits | 400 / 429 |

`is_staff()` is always executed **under the caller's own token**, never the
service role, so a client cannot assert staff status.

### The two cases that are not a plain 401

**`whatsapp-webhook` answers an invalid signature with `200`.** Meta retries
non-2xx responses indefinitely, so a 401 would produce a retry storm. The
request is *not* processed: the event is recorded with `signature_valid = false`
and `processing_status = 'failed'` as a forensic trail, and the handler returns
before any handling. Treat that 200 as a rejection.

**`whatsapp-flow-endpoint` degrades when `META_APP_SECRET` is unset.** The
signature check is skipped and the RSA request envelope plus the `flow_token`
session lookup become the sole authentication. This is deliberate and documented
in-source as AUDIT-4. When the secret *is* set, a missing `X-Hub-Signature-256`
header is rejected too, so omitting the header cannot skip the HMAC check.

It is the only family with `failsClosedOnEmptySecret: false`, and the guard
requires any such family to carry a written rationale and every member to
describe its own degraded mode.

## Non-deployable directories

`supabase/functions/_shared/` is common code imported by the entrypoints, never
deployed as a function. It is excluded by name from discovery, so adding an
`index.ts` there would not quietly enrol it. It is the single writer for the
shared auth helpers — `webhook-auth.ts`, `calendar-auth.ts` and `cors.ts`.

A function directory counts as deployable when it contains an `index.ts`, which
is the same rule `supabase functions deploy` applies.

`whatsapp-agent/index.ts` is a bare `serve(handleAgentRequest)` shim so the
dispatch contract stays importable under `deno test`; its auth check lives in
`handler.ts`, which is why entries name an `authSource` rather than assuming
`index.ts`.

## Known divergence: `config.toml` vs CI

The two deploy paths set `verify_jwt` by different means, and they do not agree:

- **CI** passes `--no-verify-jwt` for every changed function and never reads `config.toml`.
- **A local `supabase functions deploy`** does read `config.toml`.

The manifest records the real state per function as `declared-false`,
`declared-unset` (a `[functions.x]` block with no `verify_jwt` key) or `absent`
(no block at all). Both of the latter mean a local deploy would fall back to the
Supabase default of `verify_jwt = true` and behave differently from production.

At the time of writing five functions are `absent` and four are
`declared-unset`. The guard pins the current state rather than demanding it be
fixed, so closing the gap is a deliberate follow-up rather than a silent drift.
Consult the manifest for the live list — do not rely on the counts here.

## What this does and does not prove

**It proves:**

- Every deployable function is classified, or the build fails.
- Each function still calls the auth primitives its declared family requires.
- The shared primitives refuse missing, empty, wrong-length, near-miss and
  wrong-prefix credentials, and refuse an unset expected secret.
- A disallowed or absent `Origin` receives no `Access-Control-Allow-Origin`, and
  matching is exact rather than prefix- or suffix-based.
- Unauthenticated functions carry both an origin allowlist and documented rate
  limiting.

**It does not prove:**

- That a function's check is *wired into the request path* correctly. The guard
  asserts the primitive is referenced in the declared source file; it does not
  execute the handler. Importing an entrypoint starts an HTTP server, so proving
  this would mean restructuring all 27 functions.
- Anything about the deployed instances. It reads the repository, never the live
  project, and inspecting secrets is explicitly out of scope.
- That the rate limits are correctly tuned, only that they are documented.
- That `is_staff()` itself is correct — that is the database's contract.

## Adding a function

1. Write the function with an in-function auth check.
2. Add its entry to `authManifest.json` in the **same commit**, with every field
   populated — the guard rejects a blank field rather than treating it as
   answered.
3. Add a `[functions.<name>]` block with `verify_jwt = false` to `config.toml`
   so local and CI deploys agree, and record `declared-false`.
4. If it needs a new family, define it with `requiredPrimitives` that genuinely
   appear in the code, and cover the new primitive in `authContracts.test.ts`.
5. Run `npm run check:edge-auth`.

If a function ever genuinely needs gateway JWT verification, setting
`verify_jwt = true` in `config.toml` is **not enough** — CI's blanket
`--no-verify-jwt` loop will override it. It must also be deployed outside that
loop, and its manifest entry updated.
