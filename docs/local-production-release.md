# Local production database release

Status: implemented for review and operator acceptance; not accepted for production use.
Governing decision: [ADR 006](architecture/decisions/006-manual-target-verified-database-rollout.md).
Design: [local release contract](plans/active/2026-10-15-local-production-release-design.md).

The commands prepare and validate exact SQL without database credentials. Execution
uses a signed macOS helper and the data-protection Keychain to request fresh user
presence, then a single PostgreSQL session for the complete apply sequence. The
existing production workflow retains its environment-reviewer guard. This change
does not configure an account, enrol a credential, install database objects or
authorise any production run.

## Acceptance prerequisites

An operator must first approve and demonstrate all of these on synthetic staging:

1. Review and merge the tooling independently. Execution verifies every release
   module and the SQL lexer against current main; PR hooks never execute. Staging
   evidence also requires the same reviewed workflow and engine on main and the
   candidate commit. This implementation cannot release itself from an unmerged PR.
2. Choose a dedicated Supabase production identity and approve its scope. Confirm
   that no agent or CI can silently retrieve that credential from another location.
   Inventory and retirement of old write credentials are separate authorised work.
3. Build and sign the helper from reviewed main using an approved Apple Developer ID
   identity and its team ID. The helper needs the data-protection Keychain access
   group `<TEAM>.com.smarterdog.release`, matching application identifier and team
   entitlements. An unsigned/ad-hoc helper is refused. The build script creates an
   application bundle and never installs or enrols it:

   ```bash
   RELEASE_SIGNING_IDENTITY='approved Developer ID identity' \
   RELEASE_TEAM_ID='ABCDEFGHIJ' \
   bash scripts/release/build-helper.sh /private/tmp/release-helper-build
   ```

   Review its signature and entitlements, then separately install
   `SmarterDogRelease.app` in `/Applications`. The wrapper checks the signature,
   bundle identifier and embedded reviewed source. The signing operator is
   responsible for proving that the binary was built from that source; source
   embedding alone is not reproducible-build attestation.
4. In the operator's own desktop session, invoke the installed helper with
   `--enrol`. It presents a native secure text field and stores a new item under
   `kSecUseDataProtectionKeychain`, `WhenUnlockedThisDeviceOnly` and `.userPresence`.
   It refuses to replace an existing item. No token is passed through shell
   arguments, environment input or repository files. Replacement/revocation is a
   separate operator procedure, not an automatic retry or overwrite.
5. Demonstrate that each `--read` needs human authentication; test denial, cancellation,
   locked desktop, unavailable UI, absent enrolment and a second immediate release.
   Each read creates a fresh `LAContext`, sets Touch ID reuse duration to zero and
   invalidates it afterwards. The auth reason includes the complete target and
   package digest. A terminal or typed confirmation is not proof of human presence.
   `--probe` checks the executable without reading a credential. Compilation and
   static tests do **not** establish this runtime boundary.
6. Separately review and approve [the proposed bootstrap SQL](../scripts/release/proposed-bootstrap.sql).
   It installs a private `release_control.attempts` table owned by `postgres`, with
   no public grants and no customer data. The engine never runs this DDL. It refuses
   a local release if the table is absent. Test its grants with the actual CLI login
   and review the schema/privilege requirement before any hosted installation.
7. Rehearse the complete flow on staging, including denied unlock, lock contention
   from two machines, connection loss, partial apply and receipt reconciliation.
   The production CLI intentionally has no target override; equivalent staging
   credential enrolment and the exact staging harness require a separately reviewed
   rehearsal setup. Do not repurpose a production credential to run tests.

The credential boundary assumes the workstation, signing authority and trusted
operator are not compromised. It is a single-operator approval process, not two
independent approvers. A same-user attacker that can replace trusted executables or
inspect process memory is outside that guarantee. Secrets temporarily exist in the
helper/Node process and child-process environments required by the Supabase CLI and
libpq. The wrapper does not persist the token. Its private temporary directory is
removed on ordinary completion/failure; a hard kill requires operator inspection
and cleanup of the abandoned `local-release-*` directory before another release.

## Prepare and review

Prerequisites: Node 24, Git, authenticated read-only `gh`, Perl, Supabase CLI and
PostgreSQL 17 client tools. The operator must have a working trusted main checkout.
Preparing and validating use GitHub/Git only, never a database connection or
Supabase credentials. GitHub main rules must be readable. The release additionally
requires successful `db-tests` even where the repository-wide ruleset does not.

Create a local JSON input containing a read-only catalogue postcondition and the
migration-specific recovery plan. The example is structural; `select true` does
not establish a real migration's behaviour and must be replaced:

```json
{
  "postcondition": "select true",
  "recovery": {
    "locks": "Name the affected relations, lock modes and expected duration",
    "compatibility": "Explain how the currently deployed application remains compatible",
    "partialApply": "Identify per-file effects and the exact reconciliation procedure",
    "rollback": "State forward-fix or rollback limits, including irreversible effects"
  }
}
```

The command takes PR number, comma-separated ordered migration basenames,
comma-separated reapply subset (or `-`), successful staging run ID, recovery input
path and a new output path:

```bash
npm run release:prepare -- PR FILES REAPPLY_OR_DASH STAGING_RUN_ID recovery.json release.json
npm run release:validate -- release.json
```

Review all fields and the full SQL in the canonical JSON package. It binds the
repository, PR/head, trusted main, fixed production target, exact ordered SQL and
SHA-256 hashes, reapply scope, postcondition, staging hashes and Actions run,
required check identities, reviews, creation/expiry, unique release ID and recovery
plan. It expires after exactly 60 minutes. Duplicate/unknown fields, symlinks,
unsupported formats and altered bytes are rejected. To change anything, prepare a
new package; do not hand-edit it or extend its expiry.

Staging evidence comes from a successful exact-head staging workflow with the same
trusted engine, whose log contains a successful receipt with identical file hashes.
A filename or an operator-written claim is insufficient. Old workflow runs without
the new receipt cannot satisfy this check. `migrations-applied` is the sole possible
pre-apply exception: failure output must identify only pending named files or an
explicitly approved reapply content mismatch. Other missing, stale, queued or red
required checks block preparation and execution.

Preflight rejects changed/deleted main migrations, a head missing current main
migrations, irregular Git tree modes and a structurally invalid merged migration
tree. It reads exact UTF-8 blobs into a clean temporary directory and runs only
main's structural validator. It never checks out or executes PR package hooks.

## Operator execution and evidence

After all acceptance gates and explicit approval of a concrete production package,
the operator runs `npm run release:execute -- release.json` in their own terminal.
The wrapper confirms target plus full digest, consumes a local approval marker,
and requests native Keychain authentication. There is no environment-token, stdin
password or ordinary-keychain fallback. It links a clean temporary Supabase project,
asserts the exact link before its linked command, and obtains the CLI's short-lived
database login. Unsupported credential output fails closed without evaluating shell
code. libpq verifies the server certificate using the system trust store.

Immediately before applying, GitHub head/main/reviews/check identities, staging
evidence and expiry are refreshed again. Any change invalidates the package. A
remote change after this final read is a residual race; the existing migration
content/provenance merge gate remains required.

The shared engine takes advisory lock `73194621851015` on the **same connection**
that executes every file. Both legacy workflow wrappers use it. A contender fails
before any file writes. A dead connection cannot leave another connection applying
the remaining files. Session pooling is required; transaction pooling is unsupported.
Administrative writes outside supported tooling cannot be serialised by this lock.

For local releases, an insert into `release_control.attempts` consumes the digest
and commits before any migration starts. A primary-key conflict refuses replay,
including reapply, across machines. Never delete this evidence to repeat a release.
Each migration and its ledger update then commit together, preserving earlier
statement history and exact current SQL. The lexer rejects transaction splitting,
psql commands and variable interpolation. Name/basename identity, version conflicts
and duplicate ledger rows are checked. A final check verifies every approved ledger
entry, followed by the scalar boolean postcondition as `anon` in a read-only
transaction with a 30-second timeout. Failure blocks release success even after
earlier files have committed.

Sanitised receipts are written with mode `0600` below
`~/.local/state/smarter-dog/releases/`, named by digest. They contain source/main,
target, GitHub actor, timestamps, per-file hash, pre-apply ledger count/hash and
outcome, ledger verification, postcondition and overall status. They contain no
credentials, SQL error payloads or customer rows. Local provenance retains the
existing `-- applied to production from pull request #N head ... (file NAME.sql)`
prefix/suffix that the merge gate parses; no fake Actions URL is invented.
For ledger rows carrying local-release provenance, `migrations-applied` also
requires the matching durable attempt to be `succeeded` with a finish timestamp.
Missing bootstrap, unknown attempts or failed final postconditions block the
merge even where the SQL ledger already matches. New production Actions applies also record `verification-actions-v1` with the
exact Actions run ID and attempt number. For the latest governed provenance on
each relevant row, the merge gate reads that exact attempt from GitHub and
requires this repository, the production apply workflow, `workflow_dispatch`,
and a completed successful outcome. Missing, unreadable, cancelled, failed or
in-progress run evidence blocks merging even when SQL committed. A later rerun
cannot replace the recorded attempt. The workflow token has read-only Actions
access for this verification. Historical unmarked Actions provenance continues
through its existing checks; staging requires no new bootstrap.

## Failure and reconciliation

Files can be `not_started`, `applied`, `skipped`, `failed` or `unknown`. A normal
SQL error under `ON_ERROR_STOP` proves the active transaction failed; loss of the
connection/acknowledgement remains unknown. A later failure never rolls back earlier
committed files. The release-attempt row stays `unknown` unless all verification
passes. A missing local receipt after a hard kill is not evidence of no write.

Stop after any unsuccessful attempt. Preserve package, receipt and digest; inspect
the attempt row, every named ledger identity/SQL and the intended schema state using
an explicitly authorised read. Resolve ambiguity before another apply. A correction
requires a newly prepared package, fresh checks, new digest and new human unlock.
Reverting application code does not reverse database changes. Rerun the existing
`migrations-applied` check and inspect it on the current PR head before separately
approving the application merge. The tool never merges or contacts customers.

## Local verification

```bash
npm run test:release
npm run test:release:db
swiftc scripts/release/credential-helper.swift -o /private/tmp/release-helper-check
```

The database test starts and removes an isolated socket-only PostgreSQL cluster
with synthetic tables and no inherited PG/Supabase credentials. On macOS it uses
`/opt/homebrew/opt/postgresql@17/bin`; elsewhere set `RELEASE_TEST_PG_BIN` to the
installed PostgreSQL bindir. These tests demonstrate process-level locking and
failure behaviour, not cross-machine staging acceptance or human unlock.
