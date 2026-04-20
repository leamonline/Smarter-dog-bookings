-- 024_performance_advisors.sql
-- Clears four Supabase performance advisor warnings. All changes are
-- semantically equivalent — no behavioural change to who can access what.
--
-- Run via Supabase SQL Editor.

-- 1. Cover the waitlist_entries → humans foreign key with an index.
--    Without it, DELETE on a human forces a seq scan of waitlist_entries.
create index if not exists idx_waitlist_entries_human_id
  on waitlist_entries(human_id);

-- 2. Stop re-evaluating auth.uid() once per row in the staff_profiles
--    update policy. Wrapping in (select ...) lets the planner evaluate it
--    once per query (initplan). Semantically identical.
drop policy if exists combined_update_staff_profiles on staff_profiles;

create policy combined_update_staff_profiles on staff_profiles
  for update to authenticated
  using (
    ((select auth.uid()) = user_id) or is_owner()
  )
  with check (
    is_owner()
    or (
      ((select auth.uid()) = user_id)
      and role = get_my_role()
    )
  );

-- 3. Merge the two permissive ALL policies on calendar_feed_tokens into one.
--    Two policies on the same role + action get OR'd, but Postgres still
--    evaluates both expressions per row. Folding them into a single policy
--    with OR produces the same result with one evaluation.
drop policy if exists staff_manage_own_feed_tokens on calendar_feed_tokens;
drop policy if exists customer_manage_own_feed_tokens on calendar_feed_tokens;

create policy manage_own_feed_tokens on calendar_feed_tokens
  for all to authenticated
  using (
    (staff_user_id = (select auth.uid()) and (select is_staff()))
    or human_id in (
      select id from humans where customer_user_id = (select auth.uid())
    )
  )
  with check (
    (staff_user_id = (select auth.uid()) and (select is_staff()))
    or human_id in (
      select id from humans where customer_user_id = (select auth.uid())
    )
  );

-- 4. Drop the redundant staff_*_waitlist policies. The combined_* policies
--    (added in a later migration) already grant staff access via their
--    is_staff() branch — the older staff_* policies just duplicate it and
--    trigger the "multiple permissive policies" advisor.
drop policy if exists staff_select_waitlist on waitlist_entries;
drop policy if exists staff_insert_waitlist on waitlist_entries;
drop policy if exists staff_delete_waitlist on waitlist_entries;
