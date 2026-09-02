-- ============================================================
-- link_pending_signup(p_existing, p_pending)
--
-- The "smoother way" for an existing customer who signs up to the portal
-- with a number we don't have on file.
--
-- What happens today: the portal verifies the new number, finds no human
-- with it, and creates a "New member / Pending 07…" shell (source =
-- 'self_signup', approved_at NULL) that owns the number AND the customer's
-- portal login. The customer then types their real name into the profile
-- form, collides with their own existing record on unique(name, surname),
-- and is told to contact the salon. Staff then try to put the new number
-- on the existing record and collide with the shell on humans_phone_unique.
-- Both sides are blocked by a record that exists only to hold the number.
--
-- This function joins the two in one transaction:
--   1. the shell's signup_review to-do (if any) is re-pointed at the kept
--      record and closed — linking IS the approval;
--   2. merge_humans(existing, shell) reassigns anything the shell picked up
--      (dogs typed into the signup form, a WhatsApp thread on the new
--      number) and deletes the shell, which frees the unique phone;
--   3. the kept record takes the shell's VERIFIED phone (that is the whole
--      point — the merge's own backfill never overwrites a phone), its
--      portal login (customer_user_id), and is approved to book.
--
-- Guards: staff only; the pending side must genuinely be an unapproved
-- self-signup shell with a portal login; the kept side must not already be
-- linked to a different portal login (that would silently orphan an
-- account — merge the two customers deliberately instead).
--
-- Trigger context: prevent_customer_critical_column_update() bypasses on
-- is_staff(), so the customer_user_id / phone writes below are allowed
-- for the calling staff member (auth context survives SECURITY DEFINER).
-- humans_deactivate_tokens_on_unlink only fires on a link → NULL change,
-- which never happens here.
-- ============================================================

create or replace function public.link_pending_signup(p_existing uuid, p_pending uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e humans%rowtype;
  p humans%rowtype;
begin
  if not is_staff() then
    raise exception 'link_pending_signup: staff only' using errcode = '42501';
  end if;
  if p_existing is null or p_pending is null then
    raise exception 'link_pending_signup: both ids are required' using errcode = '22023';
  end if;
  if p_existing = p_pending then
    raise exception 'link_pending_signup: existing and pending must differ' using errcode = '22023';
  end if;

  select * into p from humans where id = p_pending for update;
  if not found then
    raise exception 'link_pending_signup: pending signup % not found', p_pending
      using errcode = '42704';
  end if;
  if p.source is distinct from 'self_signup' or p.approved_at is not null then
    raise exception 'link_pending_signup: % is not a pending self-signup', p_pending
      using errcode = '22023';
  end if;
  if p.customer_user_id is null then
    raise exception 'link_pending_signup: % has no portal login to carry across', p_pending
      using errcode = '22023';
  end if;

  select * into e from humans where id = p_existing for update;
  if not found then
    raise exception 'link_pending_signup: existing customer % not found', p_existing
      using errcode = '42704';
  end if;
  if e.customer_user_id is not null and e.customer_user_id <> p.customer_user_id then
    raise exception 'link_pending_signup: % already has a portal login', p_existing
      using errcode = '22023';
  end if;

  -- 1. Keep the signup-review to-do as history on the kept record, closed.
  --    Without this the shell's ON DELETE CASCADE would drop it silently.
  update salon_todos
     set human_id = p_existing, done = true
   where human_id = p_pending and kind = 'signup_review';

  -- 2. Reassign + delete the shell (frees the phone for step 3).
  perform merge_humans(p_existing, p_pending);

  -- 3. The verified number and the portal login move onto the kept record.
  --    Signup-form answers only fill blanks; the kept record's own history
  --    always wins.
  update humans set
    phone                = coalesce(nullif(p.phone, ''), phone),
    customer_user_id     = p.customer_user_id,
    approved_at          = coalesce(approved_at, now()),
    approved_by          = coalesce(approved_by, (select auth.uid())),
    policies_accepted_at = coalesce(policies_accepted_at, p.policies_accepted_at),
    policies_version     = coalesce(policies_version, p.policies_version),
    heard_about_us       = coalesce(heard_about_us, p.heard_about_us)
  where id = p_existing;
end;
$$;

comment on function public.link_pending_signup(uuid, uuid) is
  'Staff-only. Joins an unapproved portal self-signup shell onto an existing customer: closes the signup-review to-do, merge_humans() the shell into the kept record, then moves the shell''s verified phone + portal login onto it and approves it to book. One transaction; the shell is deleted.';

-- New public functions auto-grant EXECUTE to PUBLIC (and therefore anon);
-- revoking PUBLIC alone leaves anon's direct grant, so revoke it explicitly.
revoke all on function public.link_pending_signup(uuid, uuid) from public;
revoke all on function public.link_pending_signup(uuid, uuid) from anon;
grant execute on function public.link_pending_signup(uuid, uuid) to authenticated;
