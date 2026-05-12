-- 20260513150000_fix_null_surnames.sql
--
-- Task 12 of the May 2026 review pass.
--
-- The live dev/staging dataset had humans whose surname column was
-- the literal string "Null" — the seed pipeline produces those when
-- the upstream faker call returns null and the result is naively
-- concatenated. They render as "Andrea Null" in the directory and
-- are confusing.
--
-- This migration:
--   1. Resets surname to '' for rows where surname is the literal
--      'Null', 'null' or 'NULL' string. Idempotent.
--   2. Adds a CHECK constraint that prevents the same string ever
--      sneaking back in. The constraint is permissive — it only
--      forbids the three obvious accidents, not the legitimate
--      surname "Null-Smith" (rare but possible).
--   3. Raises NOTICE for every row touched so the operator sees
--      what changed.
--
-- Production-safety check: real surnames are extremely unlikely to
-- be the literal string "Null" / "null" / "NULL". If you have one
-- and want to keep it, run a fix-up update with a different
-- spelling (e.g. "Nüll") before applying.

do $$
declare
  v_rows record;
  v_affected int := 0;
  v_skipped int := 0;
begin
  for v_rows in
    select id, name, surname
      from humans
     where surname in ('Null', 'null', 'NULL')
  loop
    -- Skip if clearing surname would collide with another row that
    -- already has (name, ''). The unique (name, surname) constraint
    -- would otherwise abort the migration. Operator can sort the
    -- collisions manually in the dashboard.
    if exists (
      select 1 from humans h2
       where h2.name = v_rows.name
         and h2.surname = ''
         and h2.id <> v_rows.id
    ) then
      raise notice 'fix_null_surnames: SKIP % (% Null) — collision with existing % ""', v_rows.id, v_rows.name, v_rows.name;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update humans
       set surname = ''
     where id = v_rows.id;

    raise notice 'fix_null_surnames: cleared surname=% for %, %', v_rows.surname, v_rows.id, v_rows.name;
    v_affected := v_affected + 1;
  end loop;

  raise notice 'fix_null_surnames: % reset, % skipped (collision)', v_affected, v_skipped;
end;
$$;

alter table humans
  drop constraint if exists humans_surname_not_literal_null;

alter table humans
  add constraint humans_surname_not_literal_null
  check (surname not in ('Null', 'null', 'NULL'));

comment on constraint humans_surname_not_literal_null on humans is
  'Defensive guard against seed/import pipelines that stringify a NULL value into the surname column. If you really do need to store the literal text "Null", you''ll need to drop this constraint first.';
