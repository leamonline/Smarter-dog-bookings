# Issue #618 explicit Supabase target guard

**Status:** Completed
**Issue:** [#618](https://github.com/leamonline/Smarter-dog-bookings/issues/618)
**Pull request:**
[#628](https://github.com/leamonline/Smarter-dog-bookings/pull/628)
**Base:** `main@961399e745f1fdfcabb0f0d20a683fab8a6dd2ff`
**Last verified:** 31 August 2026 against
`main@94a249659ad2eed94dc4a7e787e7ab028b5e4cd1`
**Owners:** `.github/workflows/`, `scripts/check-hosted-supabase-targets.mjs`, and target-guard documentation
**Dependencies:** #619 merged; no Tranche B work
**Related requirements:** [REQ-REL-002](../../product/requirements.md)
**Related ADRs:** [ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md)

## Goal

Make every current hosted Supabase CLI command either explicit-ref or
linked-only with an immediately preceding read-only expected-ref assertion.

## Scope

- Inventory the current hosted command surface in `docs/hosted-supabase-target-guard.md`.
- Reassert the expected ref directly before every existing linked command.
- Add a lint-integrated static guard for future unguarded linked commands.
- Make generated secret-setting instructions explicit-ref.

## Non-goals

- Production migrations, data access, function deployment or secret changes.
- Any database migration or change to #621–#624.
- Replacing the separate human production-authority boundary.

## Implementation and testing

1. Preserve explicit refs in the Edge deployment workflow and linked staging-only controls.
2. Scan tracked commands and require the adjacent link-state assertion for each hosted `--linked` invocation.
3. Prove the lint failure with a temporary unguarded linked command, remove it, then record both outputs in the draft PR.
4. Run the repository bar and use the exact final SHA in the PR evidence.

## Definition of done

- Wrong, missing, unknown or mismatched linked state fails before a hosted write.
- The command inventory and evidence-record fields are durable documentation.
- `npm run lint` enforces the guard and the requested negative control proves it.
- No hosted Supabase command is run as evidence.

## Completion

Pull request [#628](https://github.com/leamonline/Smarter-dog-bookings/pull/628) delivered the guard at exact head
`fc5f89e7c6ddc7025ce79cb123d3eae968d72a82` and merged as
`ceeebdea26702727469928e32d7af21434924b0b`, closing issue
[#618](https://github.com/leamonline/Smarter-dog-bookings/issues/618) on 10 August 2026. Its recorded evidence includes the
negative control this plan required: a temporary unguarded
`supabase migration list --linked` failed `npm run lint` with
`Unguarded hosted Supabase linked command(s)`, and lint passed again once it
was removed. The database workflow passed on the merge commit
([run 31421276762](https://github.com/leamonline/Smarter-dog-bookings/actions/runs/31421276762), 10 August 2026).

Re-verified 31 August 2026 against
`main@94a249659ad2eed94dc4a7e787e7ab028b5e4cd1`: `npm run lint` still runs
`scripts/check-hosted-supabase-targets.mjs`, so an unguarded hosted `--linked`
invocation fails the repository bar, and the maintained command inventory and
evidence contract remain in
[`docs/hosted-supabase-target-guard.md`](../../hosted-supabase-target-guard.md),
indexed from [`docs/README.md`](../../README.md). The human production
authority boundary is unchanged under
[ADR 006](../../architecture/decisions/006-manual-target-verified-database-rollout.md).
