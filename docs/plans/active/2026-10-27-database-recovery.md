# Complete database recovery evidence

Status: Active; hosted drill passed, recurring Storage change awaits release
Issue: [#986](https://github.com/leamonline/Smarter-dog-bookings/issues/986)
Base: `origin/main@ccceeaa1f49705f43f53ceb356e5b0c714a5fc96`
Last verified: 2026-10-27
Owners: operations/runbook/evidence, Storage archive utility/tests, backup and CI workflows
Dependencies: Scheduled environment token, offline age identity, disposable target
Related requirements: [Operational recovery record](../../operations.md)
Related ADRs: [ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md)

## Goal and why

Prove a scheduled encrypted backup and recover its database, account access and
agreed file boundary in disposable Supabase infrastructure. The existing dump
and partial local restore do not prove full recovery after losing production.

## Current behaviour at initial discovery

- [The workflow](../../../.github/workflows/database-backup.yml) has separate
  reviewer-gated manual and unattended scheduled environments. The runbook's
  claim that every run awaits a reviewer contradicted this implementation.
- Actions inspected on 27 October show one successful manual run (19 October),
  one failed scheduled run (25 October) and one skipped scheduled run (18 October).
  Run `40177159579` failed before production link because the scheduled
  environment received no `PRODUCTION_SUPABASE_ACCESS_TOKEN`.
- Its environment secret inventory contains only `BACKUP_AGE_PUBLIC_KEY`.
  The successful manual artifact remains available until 17 January 2027.
- Connected projects are production and existing staging; neither is disposable.
  The organisation remains on the Free plan, freshly checked through the
  Supabase organisation API. No hosted restore or object-byte recovery was run
  in this sitting. The old plan/backup posture table retains its dated history.
- A filename-only search of likely local locations found no age identity;
  this does not establish that the owner has lost the offline key.

## Desired behaviour and scope

Repair the missing environment configuration, verify scheduled execution,
restore all four data schemas, prove relationships and synthetic account access,
test permissions and capacity, establish file recovery and verify cleanup.
The [runbook](../../runbooks/database-recovery-drill.md) owns execution details;
GitHub owns live blockers and acceptance status.

## Non-goals

No production writes/restores, existing-staging overwrite, customer messages,
changed booking policies, loss acceptance, key rotation or release-control
bypass. This documentation change does not enable a new workflow or integration.

## Relevant code and architecture

The backup workflow is the sole dump producer; `manifest.txt` binds SQL digests
and source generation. The private age identity is the decryption boundary.
PostgreSQL enforces relationships, permissions and capacity. Supabase Auth and
Storage services require hosted verification beyond plain PostgreSQL. Storage
metadata and object bytes have separate recovery paths. The existing
[capacity fixtures](../../../supabase/tests/036_capacity_parity.test.sql) inform
synthetic scratch tests; they are not authority to run tests against production.

## Data/database, API and UI changes

None in the repository. The drill imports private customer data only into an
authorised disposable project. Scratch-only isolation, session revocation,
fixture writes and cleanup are operational actions recorded separately. The
scheduled environment needs a token supplied securely by the owner. No migration,
RPC, Edge Function, UI or workflow-source change is proposed here.

## Security/privacy and risks

Wrong-target restore is destructive: verify project identity and exclude the
two known persistent refs before connecting. Copied triggers, jobs and Auth
providers can contact customers: review SQL and prove isolation before import
and before any test write. Row errors and filenames can identify customers:
keep plaintext/logs private and publish aggregate evidence only. A mismatched
Auth schema or absent custom Storage policies fails recovery; filtering those
parts is a partial diagnostic. Missing key blocks decryption; generating a new
key does not recover the old artifact. Do not rotate or replace it by inference.

## Dependencies and rollout

The owner supplies or locates the age identity, adds the missing scheduled
environment secret and authorises a named disposable target and data scope.
Project creation must use the owner's selected organisation and confirmed cost.
The two active Free projects occupy the documented allowance. Agree an approved
staging pause or a quoted paid route before provisioning; do not pause/delete
staging or incur a bill without approval.
Only the scratch target receives restore writes. Failure means rollback of the
failed import and cleanup/recreation of that disposable target, not production
repair. Key and production/staging resources remain untouched.

## Implementation sequence

1. Correct contradictory approval wording and replace the old under-specified
   restore recipe with the isolation and evidence runbook. Run `npm run check:docs`
   and `git diff --check`; review the resulting documentation diff.
2. Owner installs the missing environment token. Rerun scheduled run
   `40177159579`, recording its attempt/event/commit and encrypted artifact.
   Separately verify the next new scheduled execution from current `main`.
3. Locate the existing identity and obtain a fresh disposable target. Confirm
   secure credential hand-off, source/target refs, cost and deletion authority.
   Prepare target-specific isolation SQL from the actual dump before import.
4. Execute runbook stages 2–4: digest checks, complete import, snapshot counts,
   explicit relationship checks, synthetic restored-credential evidence,
   user-role negative checks and rolled-back capacity rejection.
5. Execute the chosen file route: synthetic encrypted archive round trip first,
   then authorised full object backup/restore, or an explicit dated owner boundary
   decision. Record any untested recovery claims as unverified.
6. Verify disposable-resource and plaintext cleanup even after failure. Append
   actual evidence to operations; update #986 only with verified results. Keep
   this plan active until execution and acceptance are complete.

## Testing and observability

Documentation checks: `npm run check:docs`, `git diff --check`. No application
tests are necessary for prose-only changes. Hosted checks are specified in the
runbook and remain **not run**. Evidence includes run URLs/attempts, exact refs,
aggregate snapshot comparisons and orphan counts, permission denials, synthetic
sign-in/capacity results, file digests/totals, measured timings and fresh project
listings after deletion. No screenshots or logs containing private rows.

## Documentation updates and definition of done

Operations retains historical evidence with an accurate current limitation;
the runbook describes the execution path. Before declaring #986 complete,
scheduled artifact creation, full hosted recovery, synthetic account access,
permissions/capacity, the agreed file boundary and cleanup must all have evidence.
Link the reviewed PR and run evidence before moving the plan to completed.

## Open questions

Where is the owner's existing age identity? Which disposable project and
organisation may be used? How will credentials be supplied securely? Can the
owner add the scheduled token? Which file recovery route is accepted? These
inputs remain unresolved; no positive execution result or accepted loss is
inferred from the prepared procedure.


## Execution update — 27 October 2026

The owner authorised pausing staging, using a disposable project in the named
organisation, restoring customer data, deleting the target and resuming staging.
The existing CLI token securely repaired the scheduled environment; scheduled
run `40177159579` attempt 2 succeeded and its encrypted SQL artifact decrypted
and passed both digest checks. The original age identity is confirmed usable.

The full hosted drill restored 105 table counts, checked 165 foreign keys with
zero orphans, proved synthetic credential recovery and user-role permissions,
and rejected a synthetic overbooking with no excess persisted row. Nineteen
files (13,363,551 bytes) were independently encrypted and restored, with every
hash verified. See [the operational evidence](../../operations.md#27-october-2026-full-hosted-drill).
Two compatibility corrections are now recorded there: empty vendor-owned vector
COPY blocks, and explicit handling of an ALWAYS audit trigger during import.

Scope now includes `scripts/operations/storage_archive.py`, its synthetic Python
tests, the weekly backup workflow and one Python-test CI step. This closes the
continuing file-recovery gap instead of relying on this sitting's one-off archive.
The SQL artifact uploads before file backup begins; file failure fails the job
while preserving the database artifact. Both artifacts retain the existing
90-day encrypted retention. Production access is read-only; no production schema
or application behaviour changes. No file-loss decision was needed.

Validation includes the live read-only utility backup, a full hosted object
round trip, Python tests and focused workflow tests. An independent reviewer
found two issues (possible output overwrite and upload-after-timeout ordering);
both were corrected and the reviewer found no remaining actionable defects.
Staging is verified ACTIVE_HEALTHY and local plaintext/temporary credentials
are removed. Focused verification passed: 12 Python tests, seven workflow tests,
documentation checks and lint (existing warnings only). Next gates: current-head
PR checks, merge the reviewed workflow change with owner authority,
then exercise the released file backup and observe the next fresh schedule.
