-- 012a_fix_waitlist_policies.sql
-- BACKFILL — applied to production on 2026-04-04 as version 20260404012036
-- under the name "013_fix_waitlist_policies". Added retroactively so the repo
-- has a complete record of schema history. DO NOT RE-APPLY — the policies
-- created here were superseded by 018_fix_waitlist_rls.sql and 024_performance_advisors.sql.

-- Fix overly-permissive waitlist_entries policies.
-- "Staff can insert/delete waitlist" used USING(true) / WITH CHECK(true),
-- meaning any authenticated user — including customers — could insert
-- or delete any waitlist row. Replace with is_staff() checks.

drop policy if exists "Staff can delete waitlist" on waitlist_entries;
drop policy if exists "Staff can insert waitlist" on waitlist_entries;
drop policy if exists "Staff can select all waitlist" on waitlist_entries;

-- Staff-only: select all waitlist entries
create policy "Staff can select all waitlist"
  on waitlist_entries for select
  to authenticated
  using (is_staff());

-- Staff-only: insert waitlist entries (staff adds clients to waitlist)
create policy "Staff can insert waitlist"
  on waitlist_entries for insert
  to authenticated
  with check (is_staff());

-- Staff-only: delete any waitlist entry
create policy "Staff can delete waitlist"
  on waitlist_entries for delete
  to authenticated
  using (is_staff());
