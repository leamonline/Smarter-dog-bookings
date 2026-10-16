# Proposed alternative: human-operated production database releases

Status: accepted for implementation on 15 October 2026. Production execution, credential provisioning and workflow retirement remain outside this implementation approval.

Prepared 15 October 2026 against `main@1cbbce518fc4c8cd6e90649d724802e615b88534`.

## Recommendation

Keep GitHub for code review, tests and migration verification. Apply production migrations through a small, human-operated local release tool that prepares an exact release package, verifies it again at execution, and only then obtains production credentials through an interactive operator step.

This preserves the intent of ADR 006: manual approval, a verified target, exact reviewed SQL, migration-ledger evidence and postconditions before dependent code merges. It replaces the environment-reviewer mechanism explicitly; it is not permission to remove the existing workflow guard or run its script directly today.

The current blocker is confirmed: GitHub rejected adding a required reviewer with HTTP 422 because the billing plan does not support it. The repository is private. GitHub documents that Free, Pro and Team only support required environment reviewers for public repositories: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers

## Operator experience

1. **Prepare.** A credential-free command accepts a PR number, named migrations in order, and a postcondition. It reads current GitHub state, checks the exact source files, and creates a local review package. Preparation neither connects to production nor applies anything.
2. **Review.** The package shows the production target, full PR head and trusted main commit, full SQL, file hashes, staging evidence, check results, expected effects and rollback limits. It identifies any checks that are deliberately outstanding, particularly `migrations-applied` before the apply.
3. **Approve and run.** The operator runs the reviewed release tool in their own terminal. It refreshes provenance and checks; any material change invalidates the package. The operator confirms the target and package digest and unlocks credentials interactively. A typed confirmation alone is not a security boundary: credential access must require an operator action unavailable to unattended agents or CI.
4. **Verify.** The tool verifies the explicit linked target, records the migration state, applies only approved files, and checks recorded SQL and the postcondition. A failure stops the release and produces a reconciliation report.
5. **Finish.** Save a sanitised release receipt, rerun `migrations-applied`, and review the dependent application release separately. Database success never automatically merges a PR or sends a customer message.

Command names and UI wording should be designed during implementation. No executable production command is supplied in this proposal.

## Exact approval contract

The review package must bind all of the following in one canonical manifest with a full SHA-256 digest:

| Field | Requirement |
|---|---|
| Repository and PR | Exact repository identity and PR number, if applicable |
| Source | Full migration commit SHA and trusted main SHA supplying executable tooling |
| Target | `production`, project `nlzhllhkigmsvrzduefz`; no inferred local link |
| Changes | Ordered regular-file basenames, complete SQL and full hashes; explicit reapply subset |
| Verification | Exact postcondition SQL and its digest |
| Evidence | Staging target, applied-file hashes, run or receipt references and validation results |
| CI | Required check names, current head, run IDs and successful conclusions; explicit narrow exception for the pre-apply migration gate |
| Validity | Creation time, proposed 60-minute expiry and unique release ID |
| Recovery | Expected locks, additive compatibility, partial-apply handling and rollback limits |

The expiry is a proposed operating choice, not an existing repository rule. Expiry requires fresh preparation and approval. Changing SQL, order, target, reapply scope, postcondition, PR head or main invalidates approval.

Do not execute commands, scripts or shell fragments supplied by a manifest. Parse a strict schema; reject extra fields, duplicate names, symlinks and unsupported formats. Obtain executable tooling only from the reviewed main revision. Extract only approved migration files from the PR commit into a clean temporary directory; never run PR package hooks.

## Credentials and trust boundary

- Do not put a token in the package, repository, shell history, command arguments or receipt.
- Prefer a dedicated production identity with the narrowest access the provider supports. Its scope, creation and storage require an explicit setup decision; this proposal creates none.
- An operating-system credential store is a candidate, but must be verified to require a human unlock for each release. An ordinary keychain lookup that an agent can invoke silently does not satisfy the design. If that cannot be enforced, use an operator-supplied credential outside the agent session and document its limits before acceptance.
- Credentials exist only in the short-lived execution process and necessary protected temporary files. Disable shell tracing, restrict file permissions and clean up on success, failure and interruption. Scan receipts for credential leakage.
- A workstation or administrator compromise remains outside this guarantee. This is a single-operator approval process, not independent two-person approval. Stronger separation would need another operator or a separately controlled execution service.
- Inventory existing production credential locations without exposing their values. After the replacement is accepted and verified, explicitly retire the obsolete write workflow and its dedicated credential where safe. Do not remove credentials used by migration checks or unrelated deployments. Secret retirement is separate authorised work.

## Safeguards that must survive implementation

Reuse the current migration engine and its tested invariants. Extract workflow preflight logic into a reviewed wrapper rather than silently omitting it:

- Current open, non-draft, same-repository PR provenance; unchanged head; no outstanding changes-requested review. Require explicit owner acceptance of the exact release package in addition to the existing provenance test, which alone is not positive approval.
- Staging evidence for identical SQL and relevant database tests. A filename match alone is insufficient.
- Append-only migration history, merged-tree validation, regular files and exact-byte verification.
- Exact project confirmation and link-state assertion before every linked operation.
- Transaction and SQL lexer protections, SQL-equality ledger checks, atomic migration-plus-ledger recording and restricted read-only postconditions.
- Recheck remote main, PR state, reviews and check evidence immediately before execution. Document the residual race after the check; the migration-content merge gate remains necessary.
- Preserve per-PR provenance recognised by the existing merge gate. A local receipt URL cannot simply replace the existing Actions URL without testing that parser and its security assumptions.
- Enforce one production migration release at a time. A local lock alone is insufficient across machines. Implement and test a cross-process, database-backed lock covering the whole apply sequence, with a consistent connection lifetime; do not assume separate `psql` calls retain a session lock. All supported apply paths must honour it. Any database privilege or schema requirement must be reviewed explicitly.

## Failure and recovery

The engine commits one migration at a time. Several files therefore do not form one all-or-nothing release. If a later file or the final postcondition fails, earlier changes may already be live.

The receipt must distinguish applied, skipped, failed and unknown outcomes. After a dropped connection or interruption, reconcile ledger contents and schema before considering another apply. Never retry a potentially committed write automatically. A repeated invocation must not repeat a reapply authorisation: reconcile first, then prepare a new package for any further writes.

Rollback follows the approved migration-specific plan. Reverting application code does not reverse database changes. A failed postcondition blocks the dependent merge even if the migration ledger is populated.

## Implementation and acceptance work

Prepare a focused implementation PR after this design is accepted:

1. Add the manifest builder, strict validator and local operator wrapper; keep the existing production workflow failing closed until replacement acceptance.
2. Reuse or extract existing provenance and preflight checks; implement shared concurrency and compatible ledger provenance.
3. Add meaningful negative tests: changed hashes/head/main/reviews, missing or stale checks, wrong target, expired approval, symlink, modified postcondition, unauthorised reapply, lock contention and missing human credential unlock.
4. Exercise interruption, partial apply, mismatched ledger SQL and failed postconditions on a disposable database. Verify that no credential appears in logs or receipts.
5. Rehearse the complete operator flow on staging with synthetic data and equivalent credential-unlock behaviour. Production must remain unreachable in automated tests.
6. Update ADR 006, the migration runbook and hosted-target guard documentation. Review the workflow retirement and credential inventory separately.

Acceptance requires demonstrated credential separation, cross-machine concurrency, exact-content approval, complete recovery evidence and a passing existing migration gate. If these cannot be demonstrated, retain the block and reconsider hosted execution with a supported approval feature.

## First release candidate

PR #1016 is the first intended candidate, currently `f3d2bedfb11d574045c47ba2d4eca04aa88f8906`, for `20261014120000_whatsapp_number_opt_out.sql`. This is a routing reference, not approval of a future run. Recheck the head, staging evidence, reviews, CI and exact postcondition when preparing its release package.

Only after its database and application release are verified should #1023 proceed. #1017 requires its own release package and review of cancellation/SMS behaviour. None of these releases is authorised or executed by this design document.

## Trade-off and decision

This avoids a GitHub plan upgrade but adds an operator step and a small maintained release tool. It does not recreate GitHub's server-enforced withholding of environment secrets; it substitutes a deliberately separate local credential boundary whose behaviour must be proven.

Recommended decision: accept this direction for implementation and staging rehearsal only. Production execution, workflow retirement and credential changes remain separate, concrete approval steps.


## Current-state amendment, 16 October 2026

The initial plan-restriction evidence above is historical. A fresh GitHub read confirms that Production now has `leamonline` as required reviewer, and production migration workflow run [38805066741](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/38805066741) completed successfully. PRs #1016 and #1023 have merged elsewhere. The original blocker no longer justifies adopting this additional release path. Preserve the working hosted gate; retain this implementation as a draft alternative pending a separate adoption decision.

Staging currently permits `main` only, and its workflow has no migration-source overlay. That cannot produce the exact unmerged-PR-head workflow evidence required by this alternative. A separately reviewed staging evidence route is an explicit adoption prerequisite, alongside signing, credential isolation and approved bootstrap setup. No environment policy is changed by the implementation.
