-- Reconcile public.humans with the shape production has carried since
-- spring 2026, so a database rebuilt from committed history (CI, pgTAP,
-- generated types) matches the live table.
--
-- WHY
--
-- Two migrations were applied to prod but never committed:
--   relax_human_uniqueness       (recorded 2026-04-30 12:13:57)
--   customer_self_register_phone (recorded 2026-05-05 10:41:32)
-- Catalog evidence taken on 4 October 2026 against prod and staging shows the
-- same five differences on both projects:
--   1. humans.surname is nullable        (initial_schema says NOT NULL)
--   2. no unique (name, surname)         (initial_schema creates one)
--   3. humans.customer_notes text NOT NULL default ''   (not in any migration)
--   4. humans.phone_normalised, a STORED generated column folding
--      "+44…"/"0044…" to "0…", with a partial index  (not in any migration)
--   5. humans_phone_unique, a partial unique index on phone  (only ever
--      mentioned in the comments of 20260902120000 and 20260902150000)
-- 88 of 948 prod humans have a NULL surname, so the committed NOT NULL has
-- been fiction for months; 20260525120000_fix_partial_owner_name_snapshot
-- already cites the relaxing migration by its prod version. Without (5) a
-- local database accepts duplicate phones that prod refuses, so the signup
-- claim paths were being tested against a laxer table than they run on.
--
-- Nothing on prod references customer_notes or phone_normalised any more (the
-- phone lookup RPC that used it was dropped in 20260618144000), and no
-- application code reads either. They are reproduced here, not because they
-- are useful, but because the committed history must describe the real table;
-- dropping them is a separate, deliberate decision.
--
-- Every statement is idempotent. On prod and staging this migration changes
-- nothing, but it must still be RECORDED in the ledger there (name:
-- `reconcile_humans_with_prod`) because the migrations-applied check gates
-- merge on the ledger, not on the schema. Follow docs/migrations.md.

begin;

alter table public.humans alter column surname drop not null;

alter table public.humans drop constraint if exists humans_name_surname_key;

alter table public.humans
  add column if not exists customer_notes text not null default '';

alter table public.humans
  add column if not exists phone_normalised text
    generated always as (
      regexp_replace(
        regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g'),
        '^(\+?44|0044)', '0')
    ) stored;

create index if not exists humans_phone_normalised_idx
  on public.humans (phone_normalised)
  where phone_normalised <> '';

create unique index if not exists humans_phone_unique
  on public.humans (phone)
  where phone is not null and phone <> '';

commit;
