-- 005_restrict_role_escalation.sql
-- Prevent staff from self-escalating their own role.
--
-- The original "Users can update own profile" policy had no WITH CHECK clause,
-- meaning any authenticated user could send an UPDATE that changed their own
-- `role` column from 'staff' to 'owner'. This migration replaces it with two
-- narrower policies:
--
--   1. Self-update  — a user can update their own row but the new value of
--      `role` must equal the current value (frozen via a subquery).
--   2. Owner-update — an owner can update ANY staff profile, including role
--      changes (needed for the owner to promote/demote other users).

-- =====================
-- Drop the old, unrestricted update policy
-- =====================
drop policy if exists "Users can update own profile" on staff_profiles;

-- =====================
-- 1. Staff can update their own row, but cannot change their role
-- =====================
create policy "Users can update own profile"
  on staff_profiles
  for update
  to authenticated
  using (
    auth.uid() = user_id
  )
  with check (
    auth.uid() = user_id
    -- The new role value must match the role that is already stored.
    -- The subquery runs as the authenticated user; the existing SELECT
    -- policy ("Staff can view all profiles") grants the necessary read
    -- access so there is no circular dependency.
    and role = (
      select sp.role
      from staff_profiles sp
      where sp.user_id = auth.uid()
    )
  );

-- =====================
-- 2. Owners can update any staff profile (including promoting/demoting)
-- =====================
create policy "Owners can update any profile"
  on staff_profiles
  for update
  to authenticated
  using (
    exists (
      select 1
      from staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role = 'owner'
    )
  );
