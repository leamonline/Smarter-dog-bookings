-- ============================================================
-- Deactivate calendar feed tokens when a customer unlinks from
-- their humans row.
--
-- Setup:
--   humans.customer_user_id references auth.users(id) ON DELETE SET NULL
--     — deleting the auth user nulls the link but keeps the humans
--       row for booking history.
--   calendar_feed_tokens.human_id references humans(id) ON DELETE
--     CASCADE — tokens follow the humans row, not the auth user.
--
-- The gap: when a customer's auth row is deleted, the humans row
-- survives with a NULL customer_user_id. Their calendar feed token
-- is still active and the URL keeps serving bookings to whichever
-- calendar app subscribed to it. The customer has no way to revoke
-- it because they can no longer authenticate.
--
-- Fix: AFTER UPDATE trigger on humans.customer_user_id detects the
-- NOT NULL -> NULL transition and flips matching customer feed
-- tokens to is_active = false. The token row stays for audit /
-- forensic value.
--
-- Staff tokens (calendar_feed_tokens.staff_user_id) cascade
-- correctly via auth.users(id) ON DELETE CASCADE, so they need no
-- equivalent trigger.
-- ============================================================

create or replace function public.deactivate_calendar_tokens_on_customer_unlink()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  update calendar_feed_tokens
     set is_active = false
   where human_id = new.id
     and feed_type = 'customer'
     and is_active = true;
  return new;
end;
$function$;

drop trigger if exists humans_deactivate_tokens_on_unlink on humans;
create trigger humans_deactivate_tokens_on_unlink
  after update of customer_user_id on humans
  for each row
  when (old.customer_user_id is not null and new.customer_user_id is null)
  execute function deactivate_calendar_tokens_on_customer_unlink();

comment on function public.deactivate_calendar_tokens_on_customer_unlink() is
  'Flips customer calendar feed tokens to is_active=false when humans.customer_user_id is nulled (which happens on auth.users delete via ON DELETE SET NULL).';
