-- ============================================================
-- SECURITY FIX (Critical): calendar feed token-type escalation
--
-- Vulnerability
-- -------------
-- The RLS policy `manage_own_feed_tokens` (20260422081058_performance_
-- advisors.sql) authorises a customer INSERT whenever `human_id` is one
-- of the caller's own humans rows — but it never constrains `feed_type`.
-- The table CHECK only requires feed_type IN ('customer','staff') and
-- exactly-one-owner, so a logged-in customer could insert:
--
--   { human_id: <their own>, feed_type: 'staff', token: <any>, is_active: true }
--
-- validateFeedToken() then reads feed_type straight off that row, and
-- calendar-feed/index.ts treats any non-'customer' feed as the STAFF
-- feed: it returns every booking salon-wide and joins in every human's
-- name + surname. Net effect: any single authenticated customer could
-- read the entire client book (names, dogs, dates) from the browser.
--
-- Fix
-- ---
-- 1) Purge any already-exploited rows: a legitimate staff token has
--    human_id NULL (owner CHECK), so feed_type='staff' WITH human_id
--    NOT NULL can only be a forged row.
-- 2) Recreate the policy with feed_type pinned per branch — customers
--    may only ever touch their own feed_type='customer' rows, staff
--    only their own feed_type='staff' rows.
-- 3) Defence in depth: revoke direct INSERT/UPDATE on the table from
--    anon/authenticated. All legitimate writes already go through the
--    SECURITY DEFINER RPCs get_or_create_calendar_feed_token /
--    revoke_calendar_feed_token (and the SECURITY DEFINER unlink
--    trigger), which run as the function owner and are unaffected.
--    The customer app reads tokens via the RPC return value, never by
--    selecting the table, so SELECT/DELETE are left to the policy.
-- ============================================================

-- (1) Remove any forged staff-type tokens owned by a customer.
delete from public.calendar_feed_tokens
 where feed_type = 'staff'
   and human_id is not null;

-- (2) Recreate the policy with feed_type pinned in both USING and WITH CHECK.
--     (select auth.uid()) / (select is_staff()) keep the per-query initplan
--     evaluation from 20260422081058 so the performance advisor stays quiet.
drop policy if exists manage_own_feed_tokens on public.calendar_feed_tokens;

create policy manage_own_feed_tokens on public.calendar_feed_tokens
  for all to authenticated
  using (
    (
      staff_user_id = (select auth.uid())
      and (select is_staff())
      and feed_type = 'staff'
    )
    or (
      human_id in (
        select id from public.humans where customer_user_id = (select auth.uid())
      )
      and feed_type = 'customer'
    )
  )
  with check (
    (
      staff_user_id = (select auth.uid())
      and (select is_staff())
      and feed_type = 'staff'
    )
    or (
      human_id in (
        select id from public.humans where customer_user_id = (select auth.uid())
      )
      and feed_type = 'customer'
    )
  );

-- (3) Belt-and-braces: no direct token writes from the JWT roles. The
--     SECURITY DEFINER RPCs and the unlink trigger bypass these grants,
--     so token create/regenerate still works for staff and customers.
revoke insert, update on public.calendar_feed_tokens from authenticated, anon;
