# Geoapify address search

Status: Active

Issue: [#944](https://github.com/leamonline/Smarter-dog-bookings/issues/944)

Base: main@65d611dfb68a3e74f42274be551abdac077cb9ca

Last verified: 2026-10-05

Owners: customer onboarding address picker/actions and postcode-lookup function

Dependencies: free Geoapify account and production GEOAPIFY_API_KEY

Related requirements: [REQ-UX-001, REQ-A11Y-001, REQ-SEC-001 and REQ-REL-002](../../product/requirements.md)

Related ADRs: None; existing browser/action/Edge boundary retained

## Goal and why

Customers can search a typed UK address using Geoapify's ongoing free plan and
confirm a complete suggestion, or enter their address manually. The user chose
Geoapify after production APITier lookups returned Payment Required. The user
has authorised free-account setup. Automated registration stopped at Geoapify's
human CAPTCHA; the owner must complete it. No account or key has yet been
confirmed configured.

## Current and desired behaviour

`AddressPicker` accepts a postcode and calls `lookupPostcode`, which invokes
`postcode-lookup`. Signup validation, manual progression, Back and draft
recovery were repaired in #943. Change the search input to a typed address.
Find address or Enter makes one Geoapify autocomplete request; typing alone
makes none. Complete UK premises can be selected; cities, postcodes and streets
without a house/name are not complete addresses. Keep manual recovery and the
existing address/postcode persistence. Display Geoapify/OpenStreetMap
attribution near address data; do not promise full Royal Mail coverage.

## Scope, non-goals and architecture

Owned paths: onboarding picker/actions/tests, postcode-lookup provider/input/
tests, its auth inventory metadata, provider runbook/environment example, user
flows, architecture references, changelog and this plan. The existing Edge
proxy retains the server-side key, public caller classification, origin policy
and rate-limit authority. No schema, signup requirements, approval policy,
customer records, notifications, paid subscriptions or APITier-secret deletion.
No new dependency, map widget, paid fallback, browser key or address dataset.

## API, UI and data changes

Keep `postcode-lookup` for cached clients. New callers send `{ text }`; legacy
`{ postcode }` remains accepted. Validate bounded search text before spending a
lookup. Keep `{ postcode, addresses: [{ line, postcode, udprn }] }`, with null
UDPRN because Geoapify does not supply Royal Mail identifiers. Never treat a
location centroid or street-only suggestion as a complete address.

Retain idle, searching, results, no matches, invalid/error, manual and
keep-existing states. Query edits/manual entry invalidate pending searches;
late results cannot replace newer details. Required-field feedback/focus targets
the new search control. No database or draft-format changes are required.

## Security, privacy and external dependencies

`GEOAPIFY_API_KEY` belongs in the explicit production project's Edge Function
Secrets. Forward only address-search text; no customer identity/phone or dog
details. Bound the upstream duration. Logs contain own bounded codes, never the
query, body, URL or key. Missing keys and provider failures retain manual
recovery. Existing per-IP/global rate limits remain intact.

Geoapify's free plan permits commercial production within its credit/feature
limits and requires provider/data-source attribution. One autocomplete request
uses one credit; the published allowance is 3,000/day. Open-data coverage is
incomplete. The authorised account owner configures the free key; do not claim
availability or local house/flat coverage before a live check.

Sources: [pricing](https://www.geoapify.com/pricing/),
[coverage](https://www.geoapify.com/address-autocomplete/) and
[API](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/).

## Implementation and testing

1. Add failing provider/input and component regressions for the new behaviour.
2. Implement mapping, bounded input/errors and explicit address search; preserve
   cached-client requests and every picker state.
3. Run focused provider/component/action tests, then docs, lint, TypeScript,
   migrations, full Vitest, build, Edge types/auth and Deno tests. Verify mobile
   signup with synthetic offline data, never customer rows.
4. Open a reviewable PR. Confirm the key is configured, release through existing
   main workflows, and verify the exact deployment and synthetic local searches.

## Risks, rollout and rollback

Address autocomplete is not postcode-to-all-premises PAF lookup. The UI/result
filtering reflect that difference; missing house/flat coverage needs manual
recovery. Cached clients may find no premises for postcode-only searches but
retain manual entry. A new frontend arriving before the Edge update may briefly
receive an input error and use manual entry. No migration ordering is needed.

Auth metadata lives under `_shared/`, so the existing workflow redeploys all
functions even though only postcode-lookup runtime code changes. All entrypoint
type/auth checks must pass. Do not bypass that release control. Rollback reverts
the frontend/function through review; retain the unused APITier secret, although
rollback cannot repair its known 402. Do not claim a working live lookup until
the Geoapify key and synthetic checks are available.

## Documentation, observability and definition of done

Update user flows, provider runbook/environment example, architecture references,
auth metadata and changelog. Preserve historical APITier research and completed
signup-recovery reasoning. Tests prove returned premises/postcodes, recovery and
race handling. Live evidence names the deployment and synthetic queries without
customer records. Done means reviewed checks pass, configured Geoapify works in
production, manual signup works, attribution is present and release evidence is
recorded. Move this plan to completed only after that evidence exists.

## Implementation evidence — 2026-10-05

Implementation is ready for review; production activation remains pending the
free account/key. No customer records were read or written.

- Focused Vitest: picker, onboarding validation and action hook, 22 tests pass.
  Full Vitest: 398 files, 4,161 tests pass. New picker tests first failed against
  the previous postcode-only UI; provider/input tests exposed the missing new
  contract before implementation.
- Deno provider/input suite: 33 tests pass. TypeScript, production build, docs
  links, migrations, all 28 Edge entrypoint types and auth inventory checks pass.
  Lint passes with 66 existing warnings outside the changed files.
- Synthetic offline browser at 390×844: typing makes no call; Enter makes one;
  selection retains its own postcode and advances to dog details; Back/refresh
  restore the address and postcode; an upstream failure permits manual entry
  and progression. Document width equals viewport width; no browser errors.
  The harness uses actual signup/picker components and a stub action boundary;
  it cannot submit records and does not prove live provider coverage.
- Screenshots are investigation artifacts outside the repository. The temporary
  harness is removed before publishing. No dependency or lockfile changes.

Before release, the owner must save `GEOAPIFY_API_KEY` in the production project's
Edge Function Secrets. The connected tools do not expose secret management and
the CLI lacks production management authentication. After release, verify the
actual function and frontend with synthetic/public premises and record results
here and in #944. Keep this plan active and the issue open until then.
