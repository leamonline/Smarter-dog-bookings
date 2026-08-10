# Issue #618 explicit Supabase target guard

**Status:** Active
**Issue:** [#618](https://github.com/leamonline/Smarter-dog-bookings/issues/618)
**Base:** `main@961399e745f1fdfcabb0f0d20a683fab8a6dd2ff`
**Last verified:** 10 August 2026
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
