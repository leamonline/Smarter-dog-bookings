-- ============================================================
-- Prune abandoned "Join the Pack" signup shells
--
-- WHY
-- create_pending_customer() inserts a placeholder humans row ("New member /
-- Pending <number>", approved_at NULL, source self_signup) the moment a new
-- customer verifies their phone. If they bail before finishing the onboarding
-- questions (signup_submitted_at stays NULL) that placeholder lingers in the
-- humans directory forever. Harmless, but untidy.
--
-- WHAT
-- A daily cron deletes shells that are clearly abandoned: self_signup, never
-- approved, never submitted, older than 7 days, and with NO dogs on file (so a
-- partially-entered account can never be swept). Because bookings reference
-- dogs, "no dogs" already implies "no bookings" — nothing of value is lost.
-- The unlinked auth.users row (a phone-only account, no password) is left
-- alone: it's inert, and a later return visit simply creates a fresh shell.
-- ============================================================

create or replace function public.prune_abandoned_signups()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  with gone as (
    delete from public.humans h
    where h.source = 'self_signup'
      and h.approved_at is null
      and h.signup_submitted_at is null
      and h.created_at < now() - interval '7 days'
      and not exists (select 1 from public.dogs d where d.human_id = h.id)
    returning h.id
  )
  select count(*) into v_deleted from gone;
  return v_deleted;
end;
$$;

comment on function public.prune_abandoned_signups() is
  'Daily cleanup. Deletes abandoned self-signup shell humans (source self_signup, approved_at NULL, signup_submitted_at NULL, >7 days old, no dogs). Returns the number removed. SECURITY DEFINER; cron-only.';

revoke all on function public.prune_abandoned_signups() from public;
revoke all on function public.prune_abandoned_signups() from anon;
revoke all on function public.prune_abandoned_signups() from authenticated;
grant execute on function public.prune_abandoned_signups() to service_role;

-- Daily at 03:15 UTC — just after the existing notify-* / closure jobs so the
-- salon's overnight window stays quiet. unschedule first keeps this re-runnable.
do $$
begin
  perform cron.unschedule('prune_abandoned_signups_daily');
exception when others then
  null;
end$$;

select cron.schedule(
  'prune_abandoned_signups_daily',
  '15 3 * * *',
  $cron$ select public.prune_abandoned_signups(); $cron$
);
