-- ============================================================
-- Prune abandoned signups: also remove the orphaned auth.users row
--
-- WHY
-- prune_abandoned_signups() (20260609160000) deletes abandoned "Join the
-- Pack" shell humans, but left the linked auth.users row behind — an inert
-- phone-OTP account with no password and no humans row. They accumulate over
-- time. This extends the daily prune to also delete those now-orphaned auth
-- accounts (cascading to auth.identities / auth.sessions).
--
-- WHAT
-- Re-creates the function to capture each pruned shell's customer_user_id and
-- delete the matching auth.users row IFF no humans row still references it.
-- The auth delete is wrapped in its own block so a permissions hiccup can
-- never roll back the (more important) shell prune. The daily cron already
-- calls public.prune_abandoned_signups() by name — no re-schedule needed.
-- ============================================================

create or replace function public.prune_abandoned_signups()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uids    uuid[];
  v_deleted integer;
begin
  with gone as (
    delete from public.humans h
    where h.source = 'self_signup'
      and h.approved_at is null
      and h.signup_submitted_at is null
      and h.created_at < now() - interval '7 days'
      and not exists (select 1 from public.dogs d where d.human_id = h.id)
    returning h.customer_user_id
  )
  select array_agg(customer_user_id) filter (where customer_user_id is not null),
         count(*)
  into   v_uids, v_deleted
  from   gone;

  -- Best-effort cleanup of the now-orphaned auth accounts. Only touches users
  -- with NO remaining humans row, so a real customer is never affected.
  -- Cascades to auth.identities / auth.sessions. Wrapped so a privilege/FK
  -- hiccup can't undo the shell prune that already happened above.
  if v_uids is not null and array_length(v_uids, 1) > 0 then
    begin
      delete from auth.users u
      where  u.id = any(v_uids)
        and  not exists (select 1 from public.humans h2 where h2.customer_user_id = u.id);
    exception when others then
      raise warning 'prune_abandoned_signups: auth.users cleanup skipped: %', sqlerrm;
    end;
  end if;

  return coalesce(v_deleted, 0);
end;
$$;

comment on function public.prune_abandoned_signups() is
  'Daily cleanup. Deletes abandoned self-signup shell humans (source self_signup, approved_at NULL, signup_submitted_at NULL, >7 days old, no dogs) AND their now-orphaned auth.users row (no remaining humans link). Returns the number of humans removed. SECURITY DEFINER; cron-only.';

revoke all on function public.prune_abandoned_signups() from public;
revoke all on function public.prune_abandoned_signups() from anon;
revoke all on function public.prune_abandoned_signups() from authenticated;
grant execute on function public.prune_abandoned_signups() to service_role;
