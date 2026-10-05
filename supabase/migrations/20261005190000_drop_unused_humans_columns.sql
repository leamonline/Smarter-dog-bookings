-- Drop the two humans columns nothing has used since June 2026.
--
-- humans.customer_notes and humans.phone_normalised reached prod through the
-- uncommitted May 2026 migration customer_self_register_phone, for the phone
-- lookup RPC link_or_create_customer_human. That RPC was dropped in
-- 20260618144000 when customer linking became session-only, and nothing has
-- referenced either column since: no function, view, policy or trigger on
-- prod, and no application, Edge Function or website code. Catalog evidence
-- taken on 5 October 2026 against prod: 948 humans rows, every customer_notes
-- value is the empty string, phone_normalised is a STORED generated column
-- (so it holds no data of its own), and the only dependents are the generated
-- column's own expression and the partial index humans_phone_normalised_idx.
--
-- 20261004120000_reconcile_humans_with_prod restated both so that committed
-- history described the real table; this migration is the separate, deliberate
-- decision that note deferred. Dropping the generated column drops its index
-- with it. humans_phone_unique (the partial unique index on phone) is kept:
-- the signup-claim paths depend on it.
--
-- Idempotent: safe to re-run. No data is lost (see above).

begin;

alter table public.humans drop column if exists phone_normalised;

alter table public.humans drop column if exists customer_notes;

commit;
