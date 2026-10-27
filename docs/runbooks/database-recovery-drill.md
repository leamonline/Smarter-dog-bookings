# Database recovery drill

Status: Prepared procedure; hosted execution and file recovery unverified
Issue: [#986](https://github.com/leamonline/Smarter-dog-bookings/issues/986)
Last verified: 2026-10-27

Use with [operations](../operations.md) and the
[execution plan](../plans/active/2026-10-27-database-recovery.md). This procedure
does not authorise a production restore. SQL and configuration changes below
require an explicitly identified disposable target and secure credential access.

## 1. Repair the scheduled backup prerequisite

The [25 October scheduled run](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/40177159579)
failed before linking production because `PRODUCTION_SUPABASE_ACCESS_TOKEN` was
absent. On 27 October, the environment's secret-name inventory listed only
`BACKUP_AGE_PUBLIC_KEY`. The workflow correctly refused to continue.

The owner adds `PRODUCTION_SUPABASE_ACCESS_TOKEN` in
[the scheduled environment settings](https://github.com/leamonline/Smarter-dog-bookings/settings/environments).
Select `production-scheduled-backup`, then add the environment secret using a
valid Supabase access token. GitHub cannot reveal the existing secret in
`production`; do not print, extract or copy it through logs. Do not move the token
to repository scope or remove target/branch checks to make the run pass.

After the secret is present, an authorised operator can rerun the failed
scheduled execution:

```bash
gh run rerun 40177159579 --repo leamonline/Smarter-dog-bookings
gh run view 40177159579 --repo leamonline/Smarter-dog-bookings \
  --json event,headSha,attempt,status,conclusion,url
```

A rerun uses the original event and commit. Record its attempt number and
confirm `event=schedule`, successful link/dump/upload, expected target and
encrypted artifact. A manual dispatch exercises the reviewer-gated environment
and is insufficient to validate the scheduled environment. Also observe the next
new Sunday run from current `main`; a rerun alone does not establish that future
scheduling is healthy. Inspect its summary for schema/data sizes, table count,
encrypted bundle digest and 90-day retention. Record the run and artifact URLs.

## 2. Confirm authority, target and isolation before loading data

Record owner authority for downloading/decrypting the backup, loading customer
data into one named disposable project and deleting that project afterwards.
Ask for the local identity-file **path**, never its contents. The owner handles
credential creation or entry if secure access has not already been arranged.

List projects afresh and verify the scratch reference against its dashboard
and connection settings. Refuse production `nlzhllhkigmsvrzduefz`, existing
staging `btjnxvgkpdbfrrqxvkfj`, or any project containing existing application
data. The two active projects already occupy the documented
[two-project Free allowance](https://supabase.com/docs/guides/platform/billing-on-supabase).
Agree a route with the owner before provisioning: a separately approved staging
pause, or a paid target with a confirmed quote. Do not pause staging, change a
subscription or delete an existing project merely to free capacity. Creating
another Free organisation does not bypass the account-wide allowance.
Record region, PostgreSQL and Auth/Storage versions. Match required
extensions to the dump; inspect custom roles because this bundle omits roles.

Before any import, establish and record these controls:

- No deployed application Edge Functions, production provider credentials,
  SMTP/SMS providers, Auth hooks or inbound integrations in the scratch project.
- No active scheduled jobs. Inspect the dump for job creation and outbound
  function calls before executing schema SQL; do not replay migrations blindly.
- Inventory outbound triggers/functions and their URL/secret dependencies,
  including hard-coded URLs. Prepare scratch-only SQL to disable outbound
  triggers before the data transaction commits. Keep capacity and authorisation
  triggers enabled for the subsequent behaviour tests. If isolation cannot be
  demonstrated, stop before loading data or invoking application functions.
- Keep copied Storage buckets private before testing access. Prevent access to
  copied customer accounts: rotate the scratch JWT signing keys after the import,
  revoke copied sessions/refresh tokens and restrict available sign-in routes to
  the synthetic test. Confirm the project exposes no customer-facing app.

Check these controls again after schema/data import and before tests. Triggers
suppressed by `session_replication_role=replica` during COPY are active again in
normal sessions; import suppression alone is not outbound isolation. Deleting
notification rows alone also cannot stop a trigger or job.

## 3. Verify the encrypted snapshot and restore all four schemas

Work outside the repository and shared/synchronised folders, in a private local
temporary directory (`umask 077`, directory mode 700). Keep plaintext and raw
SQL error output private; COPY errors can include customer row values. Disable
shell tracing and use a password prompt or a protected PostgreSQL credential
mechanism rather than embedding passwords in command arguments or history.

Download the chosen encrypted artifact. Record its run/attempt, UTC snapshot
time, encrypted size and SHA-256. Compare the encrypted digest with the run
summary, decrypt with the owner's existing age identity and inspect archive
member paths before extraction. Accept only the four expected regular files:
`manifest.txt`, `migration-list.txt`, `schema.sql`, `data.sql`; reject links or
unexpected paths. Verify both SQL digests against the manifest and verify its
source ref is production. Do not execute the manifest as shell code.

Derive per-table row totals from every COPY block in `data.sql`, including empty
blocks, without printing row contents. Retain this comparison privately. The
expected totals belong to this snapshot; do not treat 19 October's historical
counts or today's production totals as the expected result for another artifact.

Follow the current [Supabase logical restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
with the verified scratch connection only. Apply the default-privilege REVOKEs
described in the [API hardening guidance](https://supabase.com/docs/guides/api/securing-your-api)
before creating application objects. Restore application schema and all data
(`public`, `smarter_dog_private`, `auth`, `storage`) with `psql -X`,
`ON_ERROR_STOP=1` and transaction boundaries. Suppress import triggers only
inside the data transaction, and apply the reviewed scratch isolation changes
before commit. Preserve explicit grants and inspect custom Auth/Storage policies:
the application's schema dump does not include the managed schema definitions
or their custom policies. Reconstruct required customisations from the reviewed
migrations at the artifact's schema generation, without executing cron/provider
setup. Never drop a managed table or omit failing account data to obtain a pass.

Stop on compatibility failures and record a sanitised error, table name and
version mismatch. Any filtered diagnostic restore remains **partial**. Publish
only aggregate counts and pass/fail evidence.

## 4. Prove relationships, account access, permissions and capacity

Before test fixtures, compare all restored table counts with the COPY totals.
Check foreign-key relationships, including bookings to dogs/humans and identities
to Auth users. COPY with replica mode bypasses constraint triggers, so matching
counts or a catalogue saying a constraint is validated is insufficient: run
explicit orphan checks for restored foreign keys. Record only aggregate failures.

Verify restored account rows and identity links in aggregate. Then use an
operator-owned synthetic account to prove access through the scratch Auth API:
perform a password sign-in without email/SMS delivery and make an authenticated
request. If a fixture account is created only after import, label this evidence
as scratch Auth availability, not proof that a backed-up account can sign in.
To prove credential recovery without modifying production, create a synthetic
account in a separate disposable Supabase source, export/import its Auth fixture
using the same procedure and prove that its original password still works.
The production snapshot's account rows and identity links must also pass the
aggregate comparisons. Keep these two sources of evidence distinct.

Check anonymous access is denied where expected; a synthetic customer cannot
read another human's private records; staff access has the expected scope; and
Storage follows the reconstructed access policies. Do not use a service-role
request as proof that ordinary user permissions work. Do not publish tokens,
passwords, customer identifiers or returned records.

With normal trigger mode restored, perform synthetic booking writes in a
rolled-back transaction: fill a slot legally, attempt one further booking,
assert the capacity rejection and verify no excess row persisted. Adapt the
fixtures in [the capacity test](../../supabase/tests/036_capacity_parity.test.sql)
to the artifact's schema; do not run the whole test suite against customer data.
Confirm outbound queues and send/audit outcomes show no attempted customer
contact before and after the checks. Record disabled triggers separately so
their deliberate isolation is not mistaken for restored production behaviour.

## 5. Establish the file recovery boundary

The existing database bundle contains Storage metadata, **no object bytes**.
Choose and record one route with the owner; neither route is assumed accepted:

1. **Encrypted file recovery:** inventory all buckets and recursively enumerate
   objects through the Storage API, including pagination. Download every object
   under separately authorised production read scope. Store bucket configuration,
   object paths, content types, sizes and SHA-256 values inside an age-encrypted
   archive. Fail on unreadable/missing objects; do not count a partial download
   as complete. Restore to private scratch buckets via the Storage API and
   re-download every file to compare bytes/digests and bucket/object totals.
   Restored metadata alone must not cause files to be skipped as already present.
   Test this route with synthetic files before customer files; then record the
   destination, retention and recurring backup responsibility. Protect filenames
   and manifests as customer data; publish totals only.
2. **Explicit accepted boundary:** record the owner's dated decision per file
   category, the tested alternative recovery source for anything described as
   recoverable elsewhere, and exactly what would be lost. Do not infer accepted
   loss from an old count, a zero-file test bucket or lack of owner response.

A direct copy from live Storage to scratch demonstrates migration, not an
independent backup: the encrypted file archive must restore with the source
unavailable to the restore process. Scope and limitations remain explicit if
only the synthetic route has been tested.

## 6. Record evidence and clean up on success or failure

Record artifact provenance, scratch ref, versions, isolation controls, aggregate
comparison results, orphan totals, account/permissions/capacity checks, file
recovery result, start/end timestamps and duration. Separate measured download,
restore and verification time from waiting for owner inputs.

Delete only the authorised disposable project(s), including any synthetic Auth
source, and verify their absence with a fresh project listing. Remove plaintext,
private logs and temporary credentials; unset shell variables. Keep the original
offline age identity and encrypted backup. If cleanup fails, record the remaining
resource and restriction immediately; do not report the drill as cleaned up.

Append verified evidence to [the drill log](../operations.md#restore-drill-log).
Keep #986 open until its remaining acceptance criteria are evidenced or the
owner has explicitly accepted the documented file recovery boundary.
