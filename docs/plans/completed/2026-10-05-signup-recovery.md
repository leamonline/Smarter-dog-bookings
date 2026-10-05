# Customer signup recovery

Status: Completed  
Issue: [#942](https://github.com/leamonline/Smarter-dog-bookings/issues/942)  
Base: main@4915f76a70cf4cbaf08930bccc2e3c879681fc5c  
Last verified: 2026-10-05  
Owners: customer onboarding components and postcode-lookup function  
Dependencies: None found in the open signup/onboarding/postcode issue search  
Related requirements: [REQ-UX-001 and REQ-A11Y-001](../../product/requirements.md), existing signup requirements  
Related ADRs: None

## Goal and why

Customers can complete signup after a failed postcode lookup, understand what
prevents progression, and return to their owner details without re-entering an
address. A customer report prompted synthetic investigation of the exact
production revision; no customer records were accessed.

## Current behaviour

`JoinThePackOnboarding` silently disables Continue for missing email, name,
address, policy acceptance or an unexplained Other referral selection. Its
address picker unmounts between steps and rehydrates only the initial draft,
so Back loses a newly entered address. Restored address cards also clear the
postcode. Public lookup checks accepted known full postcodes but returned no
addresses. The precise provider-side cause is unresolved: the function hides
all provider 4xx and malformed responses as no matches. `SetPasswordGate`
describes every `weak_password` rejection as a breach, regardless of reason.

## Desired behaviour and scope

- Continue accepts an attempt, explains missing fields and focuses the first.
- Manual entry works during lookup outages and preserves address and postcode
  across step changes and restored drafts.
- Lookup distinguishes provider failures from genuine no matches; manual entry
  remains available for either outcome.
- Only confirmed breached-password checks use breach wording, with copy that
  clarifies this does not mean the salon has had a breach.

Owned paths: `src/components/customer/onboarding/`,
`supabase/functions/postcode-lookup/`, this plan, user flows and changelog.

## Non-goals and data/database changes

None to schema, signup requirements, approval policy, RPC writes, provider
credentials/accounts or customer records. No new provider or address dataset.
No bypass of the release workflow. Provider credential/quota repair, if needed,
requires diagnosed evidence and explicit external-account authority.

## Relevant code and architecture

`JoinThePackOnboarding.jsx` owns progression and the persisted owner draft;
`AddressPicker.jsx` owns lookup/manual sub-state. The onboarding action hook
continues to own Supabase calls. The postcode provider helper is extracted into
a testable module without changing rate-limit, CORS or authentication boundaries.
The database remains the signup-write authority.

## API, UI and security changes

The public lookup success shape remains `{ postcode, addresses }`. Genuine
not-found responses remain empty; provider authentication/quota/status/format
failures use the existing 502 upstream error. Logs contain bounded error codes,
never the API key, request URL, provider body or customer address. Required owner
fields have accessible errors and focus recovery. Optional referral selection
retains its existing conditional requirement.

## Dependencies, risks and rollout

The required signup fields and provider response contract remain unchanged.
Extraction must retain the rate-limit fail-closed behaviour. Test genuine empty
results separately from service failures. Deploy through the existing main
frontend and changed-function workflows, targeting the workflow's explicit
production project; retain a reviewable PR before release. Rollback reverts this
bounded change and redeploys the affected frontend/function. No migration order
or compatibility window is needed. Provider lookup availability remains unproved
until a post-release synthetic request returns addresses or diagnoses an external
configuration problem.

## Implementation sequence and testing

1. Add failing component regressions using the real picker and draft hook, with
   synthetic API actions. Add provider response tests in Deno.
2. Implement field feedback/focus and preserve picker state/postcode. Correct
   password-policy classification and postcode error handling.
3. Run focused tests, `npm run check:docs`, `npm run lint`, `npm run typecheck`,
   `npm run check:migrations`, `npm test`, `npm run build`,
   `npm run check:edge-types`, `npm run check:edge-auth` and relevant Deno tests.
4. Verify the synthetic signup in a browser, update docs, and open a PR linked to
   #942. Record checks and release limitations before claiming completion.

## Observability and documentation

Synthetic form tests assert visible errors, focus and successful owner-step
progression. Draft tests assert the stored address/postcode. Provider tests assert
returned addresses or bounded rejection codes for representative responses.
Update [user flows](../../product/user-flows.md) and
[changelog](../../../CHANGELOG.md). Do not collect customer data for diagnostics.

## Definition of done and open questions

All issue acceptance criteria pass focused tests and browser checks; repository
checks are recorded honestly; the PR names deployment and provider availability
limits. Move this plan to completed only after release evidence is verified.
The current live provider-side reason for empty results remains an evidence
question, not permission to change an account or paid subscription.

## Implementation verification — 5 October 2026

- New regressions failed before the changes: silent validation, address loss,
  restored postcode loss and misleading password-policy messages. Provider
  tests reproduced masked 4xx/invalid-response failures.
- All 397 files / 4,151 tests passed in `npm test`. The final breach-reset
  clarification was additionally checked in the 13-test onboarding component
  suite after that run.
- All 17 provider Deno tests passed, including preserved success/empty/not-found
  contracts, numeric identifiers, provider failures and malformed responses.
- Documentation, migration validation, TypeScript, frontend build, all 28 Edge
  Function type checks and Edge auth contract checks passed. Lint passed with
  66 pre-existing warnings outside the changed files.
- A temporary Vite harness loaded the actual components in offline/sample-data
  mode. At 390 × 844, attempting Continue showed errors and focused First name;
  completed manual owner details advanced; Back and refresh preserved address
  and postcode with no horizontal overflow or browser errors. The harness was
  removed after verification.
- Release observations follow below; external provider account repair is tracked
  separately from this implementation's acceptance criteria.

## Release verification — 5 October 2026

- With explicit user approval, [PR #943](https://github.com/leamonline/Smarter-dog-bookings/pull/943)
  merged at `a53ab9ed4d92d76f5bb15bfcecaa71f05f5a57d9`. All PR checks passed,
  including coverage, Edge checks and desktop/mobile WebKit smoke checks.
- Vercel production deployment `dpl_GeUpdZK8SkAYooxgGH3j8NwYi1Ym` reached READY
  for that exact SHA and was assigned `smarterdog.vercel.app`, `smarterdog.co.uk`
  and `www.smarterdog.co.uk`. The public `/customer/login` route served the
  new `CustomerApp-BhglMLn_.js` bundle, including validation feedback,
  password-policy copy and the salon-breach clarification.
- [Edge deploy run 37302244871](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/37302244871)
  succeeded and confirmed only `postcode-lookup` deployed to production project
  `nlzhllhkigmsvrzduefz`. No schema, credential or account changes were made.
- Synthetic public lookups for `SK14 6JE` and `SW1A 1AA` returned 502/upstream,
  with the expected CORS origin; incomplete `SK14` returned 400/invalid_postcode.
  Bounded diagnostic aggregation over 11:20–11:22 UTC recorded
  `apitier_upstream_402` twice. The implementation now distinguishes this
  service failure from genuine no matches, while keeping manual entry usable.
- Automatic lookup remains unavailable because the provider returns HTTP 402
  (Payment Required). The precise account condition was not inspected; do not
  infer an exhausted balance or failed payment. APITier's UK PostCode wallet is
  separate from its general API wallet. Account-owner investigation and any
  authorized repair are tracked in [#944](https://github.com/leamonline/Smarter-dog-bookings/issues/944).
- Live verification did not create a customer account or access customer rows.
  Manual progression, Back and refresh were verified with synthetic offline
  component/browser checks; production evidence confirms release of that code,
  rather than claiming a real customer's successful signup.
- [Main CI run 37302244932](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/37302244932)
  passed build, coverage, Edge/agent tests and end-to-end checks after the merge.
  The live public login redirected to `/book/login`, rendered at 390 × 844
  without horizontal overflow and reported no browser errors. No phone number
  was submitted and no security challenge was bypassed.
