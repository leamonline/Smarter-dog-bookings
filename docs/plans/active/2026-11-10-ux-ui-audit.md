# Customer and staff UX/UI audit

Status: Blocked (safe presentation slice verified; live/full customer audit unavailable)
Issue: Not created; automatic approval review rejected issue publication
Base: `origin/main@aa0929bd`, branch `ux/ui-audit-2026-11`
Last verified: 2026-11-11
Owners: primary agent for browser/report/edits; five read-only surface reviewers and a separate adversarial checker
Dependencies: Browser fallback explicitly authorised in chat; live browser access unavailable
Related requirements: [product requirements](../../product/requirements.md)
Related ADRs: [independent applications](../../architecture/decisions/009-independent-applications-in-one-repository.md)

## Goal and why

Produce an evidence-backed UX/UI report for the salon owner and a small,
reviewable set of safe copy, accessibility-attribute and visual corrections.
Reduce avoidable customer uncertainty without changing appointment policy.

## Current and desired behaviour

The [report](../../research/2026-11-10-ux-ui-audit.md) records current source
and accepted local screenshots. Existing application identity is shared, but
action colours, some copy and control sizes drift. The desired slice makes
these specific controls/readouts consistent and truthful. Live access and
complete customer journey timings remain explicit gaps.

## Scope and ownership

Only the primary agent writes. Website, portal, staff, messages and coherence
helpers read code/docs independently; the adversarial helper challenges High
claims. No merge of helper branches or simultaneous source writers.

Allowed: selected website components, portal copy/labels/detail-label CSS,
staff template UI/date copy, research/report documentation and changelog.
Forbidden: `supabase/`, `src/engine/`, RPC/repositories, auth/routing, approved
message bodies, frozen status/size/safety colours and contract-pinned strings.
Flow changes remain proposals requiring a separate owner yes.

## Relevant code and architecture

Website `MobileQuickActions`, `Navigation`, `ServicesPage` and
`ServicesSection` own the affected public controls. `BookingCard`,
`JoinThePackWelcome`, `AddDogInline` and `customer-portal.css` own the portal
slice. Staff `TemplatePicker` and `TodayHeader` own explanation and selected
date copy. Preserve independent applications and existing write callbacks.

## Data/database and API changes

None. No database commands, provider sends or production writes. Synthetic
browser-only fixture responses are not committed source changes.

## UI and security/privacy

Keep behaviour and order; correct wording, label controls and enlarge coarse
pointer targets. Screenshots in the report use sample data only. All real
people/dogs in prose would be pseudonymised; no live account was accessed.
Supabase and non-local application requests are blocked during local capture.
Temporary component fixtures are removed before commits/checks.

## Dependencies and risks

Google font/provider reachability and installed-PWA behaviour are unverified.
The customer harness is partial; it cannot establish booking completion.
Longer wording and 12px labels may wrap differently; compare at 390/1440.
Avoid turning source observations into production activation claims.

## Implementation sequence

1. Capture local surfaces; review source and historic findings in parallel.
2. Challenge High claims independently; write and commit report first.
3. Make one commit per finding (related template explanation/outcome are one
   bounded UI-copy fix); preserve protected paths.
4. Compare every visual/copy fixture at 390 and 1440; record limits.
5. Run all required checks, update report dispositions and verification.
6. Push only this branch and create the explicitly requested draft PR; attach
   its link. Never merge. If publication is blocked, report the exact blocker.

## Testing and observability

Node 24 already installed; use `npm ci`. Required: `npm run lint`,
`npm run check:docs`, `npm run typecheck`, `npm run check:migrations`,
`npm run test`, `npm run build`, `npm run check:design-system`, plus
`npm run website:lint`, `npm run website:test`, `npm run website:build`.
Keep exact outputs in the scratchpad and a durable summary in the
[verification note](../../research/2026-11-10-ux-ui-audit/verification.md).
Stop a check after two failures for the same cause; do not weaken it.

## Documentation and rollout

Update docs/README, the dated report, historical ledger, verification and
CHANGELOG. No deployment or migration. Revert an individual finding commit to
roll back its frontend change. Draft review is the rollout boundary.

## Definition of done and open questions

Safe changes have individual commits, baseline/after screenshots and required
checks. Report preserves live and customer-journey gaps and every historical
recheck's actual confidence. PR stays draft. Owner decisions remain signup
ordering, consent layout, recurring result handling, reschedule preflight,
expanded action grouping, terminology and sender/template work.

## Review handoff

[Draft PR #1200](https://github.com/leamonline/Smarter-dog-bookings/pull/1200)
contains the verified safe slice. The plan remains blocked on live access and
a complete authenticated customer sample journey; the draft is not a claim
that those checks were completed. No merge is authorised.
