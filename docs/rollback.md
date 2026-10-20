# Rolling back a bad release

**Status:** Current. One page for the three things a merge to `main` can change:
the website and app (Vercel), the Edge Functions (Supabase), and the database.
Each layer rolls back differently, and the database does not roll back at all.

Nothing on this page grants authority. Production actions still need the owner,
as [`AGENTS.md`](../AGENTS.md) and
[ADR 006](architecture/decisions/006-manual-target-verified-database-rollout.md)
set out.

| Layer | How it ships | How it comes back | Who |
|---|---|---|---|
| Website + app | Every merge to `main` builds one combined Vercel deployment | Instant rollback to an earlier deployment | Anyone with Vercel project access |
| Edge Functions | `deploy-edge-functions.yml` deploys the functions a merge changed | A revert PR, or redeploy the old code by hand | Owner (needs `SUPABASE_ACCESS_TOKEN`) |
| Database | Never on merge; only the approval-gated workflow | **Forward fix only**: a new corrective migration | Owner approves the production run |

## 1. Website and booking app (Vercel)

**When:** the live site or app is broken after a deploy: a blank page, a crash
on `/staff` or `/book`, a spike of errors in Sentry, or a build that shipped the
wrong thing.

Remember that one deployment carries **both** smarterdog.co.uk and the booking
app ([`scripts/build-combined.mjs`](../scripts/build-combined.mjs)). Rolling back
one rolls back the other.

**Steps**

1. Vercel dashboard → team **smarterdog** → project **smarter-dogs-smart-humans**
   → **Deployments**. Filter to **Production**.
2. Find the last deployment that worked (its commit is usually the merge before
   the bad one).
3. Open its **⋯** menu → **Instant Rollback** (or **Promote** on that
   deployment). From a terminal with the Vercel CLI linked to the project, use
   `vercel rollback <deployment-url-or-id>`, then `vercel rollback status`.
4. On the Hobby plan, an instant rollback can only go to the immediately
   previous production deployment. To go further back, promote an older
   deployment instead (`vercel promote <deployment-url>`).

**Check afterwards**

- Open `https://smarterdog.co.uk`, `/staff` and `/book` in a private window.
- `npm run check:sentry` still reports ACTIVE, and the error rate falls.
- After a rollback, Vercel may stop promoting new merges to production
  automatically until a deployment is promoted again. When the fix lands, check
  that its deployment is the one serving production; promote it if not.

**Before you roll back, check the schema.** If a migration has been applied to
production since the deployment you are going back to (`docs/migrations.md`
lists them with dates), make sure that migration only *added* things. An older
frontend runs happily against added columns and functions, but not against a
**contract** migration that removed or renamed something it still uses. If one
did, don't roll back past it: fix forward instead (section 3).

**Limits:** this only swaps the frontend. An Edge Function or migration that
shipped in the same merge is still live.

## 2. Edge Functions (Supabase)

**When:** a function changed by the merge is failing (Supabase function logs,
WhatsApp replies stop, notifications stop, the `deploy-edge-functions` job is
red).

**Preferred: a revert PR.** Revert the function changes on a branch, open the PR
and merge it. The deploy workflow redeploys every function the revert touches,
which keeps `main` and production in step. If the bad merge also contained a
migration that has been applied, do **not** revert the migration file: applied
history can't be removed (the `migrations-applied` check refuses it). Revert
only the paths under `supabase/functions/` (`git revert --no-commit <sha>`, then
`git checkout HEAD -- supabase/migrations` before committing).

**Faster, by hand (owner only):** with the Supabase CLI logged in, use a
separate, clean worktree so nothing in your own checkout is overwritten:

```bash
git fetch origin
git worktree add /tmp/rollback <last-good-sha>
cd /tmp/rollback
supabase functions deploy <name> --project-ref nlzhllhkigmsvrzduefz --no-verify-jwt
cd - && git worktree remove /tmp/rollback
```

Then open the revert PR anyway, or the next merge that touches the function
redeploys the bad code.

**Check afterwards:** Supabase dashboard → Edge Functions → the function →
**Logs** shows successful invocations. For the WhatsApp agent, send a test
message from a staff number. If the deploy job failed part-way, check which
functions it reached: until #992 is merged it stops at the first failure, so
later functions keep their old code.

**Limits:** `_shared/` code is bundled into every function at deploy time, so a
bad shared change needs every affected function redeployed. Function secrets are
not versioned; restore one with
`supabase secrets set --project-ref nlzhllhkigmsvrzduefz NAME=value`, always with
the explicit production ref, as
[`hosted-supabase-target-guard.md`](hosted-supabase-target-guard.md) requires.

## 3. Database

**There is no rollback.** Migrations are applied to production by hand through
the **Apply named migrations to production** workflow, and none is reversed in
place. A bad migration is fixed **forward**:

1. Stop the damage first if needed: roll back the frontend (section 1) or the
   function (section 2) that depends on the new schema.
2. Write a new, idempotent, corrective migration. Never edit the applied one.
3. Apply it to staging, then dispatch the production workflow for the owner to
   approve, following [`migrations.md`](migrations.md).
4. If data was lost or corrupted, the encrypted weekly dump and the restore
   procedure are in [`operations.md`](operations.md). A restore goes into a
   **disposable** project first, never straight into production.

**Check afterwards:** the production workflow's own output (`outcome`,
`ledgerVerified`, `postcondition`), and the `migrations-applied` check on the
fix's pull request.

## After any rollback

- Post what happened and what was rolled back in the relevant issue.
- Watch the next morning's 08:15 #salon-today summary for anything still wrong.
- Write the fix as a normal PR. A rollback buys time; it is not the fix.
