# Cloud-first development pilot

- Status: Active
- Issue: [#1317](https://github.com/leamonline/Smarter-dog-bookings/issues/1317)
- Base: `main@d9c39e1187a52d16ca46ad37704fa58e74810c3e`
- Last verified: 27 November 2026
- Owners: Cloud pilot, Preview build isolation and cloud runbook have separate writers and paths.
- Dependencies: [#1193](https://github.com/leamonline/Smarter-dog-bookings/issues/1193), [#1316](https://github.com/leamonline/Smarter-dog-bookings/issues/1316)
- Related requirements: Synthetic verification and approved release boundaries in [AGENTS.md](../../../AGENTS.md).
- Related ADRs: [ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md) governs production database releases.

## Goal

Prove a repeatable Cloud-to-GitHub workflow using an existing bounded Inbox issue.

## Why

The Mac can remain the command centre while browser, database and native build checks run remotely.

## Current behaviour

The initialisation PR is merged. The named Codex Cloud environment is available.
Actions has disposable database and web lanes. Vercel Preview inherits client
bindings scoped to All Environments. Xcode Cloud reports a successful native
build check in PR #1315.

## Desired behaviour

Develop in an isolated Cloud checkout, verify synthetic behaviour and hand off
traceable evidence in a PR. Every preview has a demonstrable data boundary.

## Scope

Initialisation acceptance, read-only settings inventory, bounded work on #1193,
the cloud runbook and a separate PR for the Preview build invariant.

## Non-goals

Production or staging mutations, merges, permissions, customer contact, payment
activation, new paid infrastructure or a change to the convergence STOP.

## Relevant code

[Conversation pane](../../../src/components/views/inbox/workspace/ConversationPane.jsx)
and [axe ratchet](../../../e2e/accessibility.spec.ts) for #1193. The
[combined build](../../../scripts/build-combined.mjs) owns Preview build safety.

## Architecture

Cloud owns the working copy. GitHub owns issue state, reproducible verification
and the handover. Xcode Cloud owns native build evidence. Vercel Preview is
a presentation surface once its data boundary is verified.

## Data/database changes

None.

## API changes

None.

## UI changes

Issue #1193 restores native keyboard access to conversation open, checkbox and
row actions. Preserve every existing list state and selection behaviour.

## Security/privacy considerations

Inspect settings by name and scope. Use synthetic data, isolated checkouts and
approved dependency endpoints. Keep hosted and messaging credentials out of the
pilot. Keep production approvals and the existing target guards in force.

## Dependencies

Use the saved Cloud configuration and existing GitHub permissions. Keep pilot
and documentation branches behind the Preview isolation branch while the
production repository still allows inherited Preview bindings.

## Risks

A green Preview deployment cannot prove its data boundary. Test both generated
bundles. A Cloud sandbox limit may shift repeatable tests to Actions. Mark
manual screen-reader checks separately from axe and keyboard automation.

## Migration/rollout

Review the Preview guard independently. Retarget dependent PRs to `main` and
rerun the exact-head gates after an authorised guard merge.

## Implementation sequence

1. Verify #1315 and close the documentation acceptance loop.
2. Inspect isolation and implement the independent guard where required.
3. Run the Cloud pilot, hand off #1193 and record measured limitations.
4. Add the runbook and link the evidence from the issue and each PR.

## Testing

Run `npm run check:docs` and diff checks for the runbook. The guard uses
synthetic unit and combined build checks. The pilot uses focused component,
typecheck, build, axe and keyboard evidence plus Actions where applicable.

## Observability

Record the tested SHAs, environment, resource observations and check links.
Leave unavailable configuration and manual evidence visible in the handover.

## Documentation updates

Add the [runbook](../../runbooks/cloud-development.md), link it in the
documentation map and archive the verified initialisation plan.

## Definition of done

Open the independent guard, pilot and runbook PRs. Record evidence and
limitations on the associated issues and retain the production approval boundary.

## Open questions

Confirm native workflow configuration when App Store Connect access is available.

## Checkpoint

- **Revision and ownership** — Pilot base `d9c39e1`. Guard in [PR #1318](https://github.com/leamonline/Smarter-dog-bookings/pull/1318). This branch owns documentation only.
- **Evidence** — #1315 is merged, #1314 closed, and the merge SHA has a successful Vercel Production deployment record. The Preview guard passed 12 focused tests and both bundles omitted injected synthetic bindings in a disposable combined build.
- **Cloud result** — The managed task selected `d9c39e1` after detecting a stale initial checkout. Both skill files were present at the verified revision. Cloud typecheck passed. The headless browser failed to reach loopback and there was no authenticated HTTP preview portal. The task hit the included usage limit before completing the hand-off.
- **Next** — Recover the bounded Inbox edits and finish verification on the topic branch. Keep Vercel app interaction limited to builds with verified isolation.

### Recovery and handover evidence

The [managed Cloud pilot](https://chatgpt.com/local/6b09e5dd-e058-83eb-86fb-43f492f5d0dd)
resumed after the included usage limit reset and recovered all five edits at
`d9c39e1`. A clean synthetic build passed in 22 seconds and a loopback-only
desktop Inbox axe run passed in seven seconds with zero violations. The
environment reported a two-CPU quota, 8 GiB memory limit, 60 GiB free disk,
680 MB installed dependencies and 360 MB npm cache. No install was required.
The initial checkout was stale and neither skill was in the starting catalogue.
Both files were available at the corrected SHA. A fresh local Codex session
discovered root instructions and both skills from that exact tree.

[PR #1320](https://github.com/leamonline/Smarter-dog-bookings/pull/1320) carries
the pilot handover at `8cfbd179589b0522596b810db2fab26608b7b470`. The focused
suite passed 239 tests. A separate clean Chromium run passed Inbox axe and
keyboard checks at desktop, tablet and mobile sizes. The two narrow axe cases
were intentionally skipped by the existing ratchet. Manual screen-reader
acceptance remains due on [#1193](https://github.com/leamonline/Smarter-dog-bookings/issues/1193).

The owner merged Preview isolation PR #1318 at `72d60f0`. The documentation
and pilot PRs target main. No Preview app was opened during this pilot.
