-- ============================================================
-- Restore committed RLS for waitlist_entries + resolve drift.
--
-- 20260422081058_performance_advisors.sql dropped staff_*_waitlist
-- citing combined_* replacements that were never committed (they
-- existed only as live-DB drift). On a fresh `supabase db reset`
-- that left waitlist_entries with customer own-row policies but NO
-- staff access. This commits the combined policies that live in prod
-- and retires the now-redundant legacy per-role policies, so a
-- from-scratch build reproduces production exactly and the
-- multiple_permissive_policies advisor stays clear.
-- ============================================================

-- Wipe every known historical/legacy/combined waitlist policy (idempotent).
drop policy if exists "Staff can select all waitlist"    on waitlist_entries;
drop policy if exists "Staff can insert waitlist"        on waitlist_entries;
drop policy if exists "Staff can delete waitlist"        on waitlist_entries;
drop policy if exists staff_select_waitlist              on waitlist_entries;
drop policy if exists staff_insert_waitlist              on waitlist_entries;
drop policy if exists staff_delete_waitlist              on waitlist_entries;
drop policy if exists "Customer select own waitlist"     on waitlist_entries;
drop policy if exists "Customer insert own waitlist"     on waitlist_entries;
drop policy if exists "Customer delete own waitlist"     on waitlist_entries;
drop policy if exists "combined_select_waitlist_entries" on waitlist_entries;
drop policy if exists "combined_insert_waitlist_entries" on waitlist_entries;
drop policy if exists "combined_delete_waitlist_entries" on waitlist_entries;

-- One combined policy per command: staff OR the customer who owns the
-- linked human row. (select ...) wrappers keep is_staff()/auth.uid() as
-- single-evaluation initplans (auth_rls_initplan advisor).
create policy "combined_select_waitlist_entries" on waitlist_entries
  for select to authenticated
  using (
    (select is_staff())
    or exists (
      select 1 from humans
      where humans.id = waitlist_entries.human_id
        and humans.customer_user_id = (select auth.uid())
    )
  );

create policy "combined_insert_waitlist_entries" on waitlist_entries
  for insert to authenticated
  with check (
    (select is_staff())
    or exists (
      select 1 from humans
      where humans.id = waitlist_entries.human_id
        and humans.customer_user_id = (select auth.uid())
    )
  );

create policy "combined_delete_waitlist_entries" on waitlist_entries
  for delete to authenticated
  using (
    (select is_staff())
    or exists (
      select 1 from humans
      where humans.id = waitlist_entries.human_id
        and humans.customer_user_id = (select auth.uid())
    )
  );
