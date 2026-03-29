-- ============================================================
-- 004_rls_policies.sql
-- Row-Level Security for all business tables.
--
-- What this migration does:
--  1. Adds customer_user_id to humans (links a human record to
--     a Supabase Auth user so customers can only see their own data)
--  2. Creates is_staff() — a SECURITY DEFINER helper that other
--     policies use to check whether the caller has a staff profile
--  3. Creates link_customer_to_human() — a SECURITY DEFINER RPC
--     that safely binds an OTP-authenticated customer to their
--     human record by phone number
--  4. Enables RLS on every business table and writes policies
-- ============================================================

-- ============================================================
-- 1. Link humans to Supabase Auth users
-- ============================================================
alter table humans
  add column if not exists customer_user_id uuid
    references auth.users(id) on delete set null;

create index if not exists idx_humans_customer_user_id
  on humans(customer_user_id);

-- ============================================================
-- 2. Helper: is_staff()
-- Returns true when the calling auth user has a row in
-- staff_profiles. SECURITY DEFINER so it can query
-- staff_profiles regardless of RLS on that table.
-- ============================================================
create or replace function is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from staff_profiles
    where user_id = auth.uid()
  );
$$;

-- ============================================================
-- 3. RPC: link_customer_to_human(p_phone)
-- Called by the customer app after a successful OTP login.
-- Finds the humans row matching the phone number, links
-- auth.uid() to it, and returns the full row.
--
-- Rules:
--   • If no matching human exists → returns empty (no row)
--   • If the row is already claimed by a DIFFERENT user → returns
--     empty (silent denial; caller shows "phone not recognised")
--   • If unclaimed → sets customer_user_id and returns the row
--   • If already claimed by THIS user → returns the row as-is
--
-- SECURITY DEFINER so it can bypass RLS for the lookup/update.
-- ============================================================
create or replace function link_customer_to_human(p_phone text)
returns setof humans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_human     humans%rowtype;
  v_normalised text;
  v_alt        text;
begin
  -- Normalise: strip spaces
  v_normalised := replace(p_phone, ' ', '');
  -- UK alternate format: +447xxx → 07xxx
  v_alt := replace(v_normalised, '+44', '0');

  -- Find the first matching human by either format
  select *
  into   v_human
  from   humans
  where  phone = v_normalised
     or  phone = v_alt
  limit  1;

  -- No matching record
  if v_human.id is null then
    return;
  end if;

  -- Already claimed by a different auth user → deny silently
  if v_human.customer_user_id is not null
     and v_human.customer_user_id <> auth.uid() then
    return;
  end if;

  -- Claim the record on first login
  if v_human.customer_user_id is null then
    update humans
    set    customer_user_id = auth.uid()
    where  id = v_human.id
    returning * into v_human;
  end if;

  return next v_human;
end;
$$;

-- Allow authenticated (customer) sessions to call this RPC
grant execute on function link_customer_to_human(text) to authenticated;

-- ============================================================
-- 4. Enable RLS and write policies
-- ============================================================

-- ---- HUMANS ------------------------------------------------
alter table humans enable row level security;

-- Staff can read all humans
create policy "staff_select_humans"
  on humans for select
  to authenticated
  using (is_staff());

-- Customers can read their own human record
create policy "customer_select_own_human"
  on humans for select
  to authenticated
  using (customer_user_id = auth.uid());

-- Staff can insert humans (adding new clients)
create policy "staff_insert_humans"
  on humans for insert
  to authenticated
  with check (is_staff());

-- Staff can update any human record
create policy "staff_update_humans"
  on humans for update
  to authenticated
  using    (is_staff())
  with check (is_staff());

-- Customers can update their own record
-- (name, address, email, social links, whatsapp preference)
create policy "customer_update_own_human"
  on humans for update
  to authenticated
  using    (customer_user_id = auth.uid())
  with check (customer_user_id = auth.uid());

-- Staff can delete humans
create policy "staff_delete_humans"
  on humans for delete
  to authenticated
  using (is_staff());


-- ---- HUMAN TRUSTED CONTACTS --------------------------------
alter table human_trusted_contacts enable row level security;

-- Staff can do everything
create policy "staff_all_trusted_contacts"
  on human_trusted_contacts for all
  to authenticated
  using    (is_staff())
  with check (is_staff());

-- Customers can view their own trusted-contact links
create policy "customer_select_own_trusted_contacts"
  on human_trusted_contacts for select
  to authenticated
  using (
    exists (
      select 1
      from   humans
      where  humans.id = human_trusted_contacts.human_id
        and  humans.customer_user_id = auth.uid()
    )
  );


-- ---- DOGS --------------------------------------------------
alter table dogs enable row level security;

-- Staff can read all dogs
create policy "staff_select_dogs"
  on dogs for select
  to authenticated
  using (is_staff());

-- Customers can read their own dogs
create policy "customer_select_own_dogs"
  on dogs for select
  to authenticated
  using (
    exists (
      select 1
      from   humans
      where  humans.id = dogs.human_id
        and  humans.customer_user_id = auth.uid()
    )
  );

-- Staff can insert, update, delete dogs
create policy "staff_insert_dogs"
  on dogs for insert
  to authenticated
  with check (is_staff());

create policy "staff_update_dogs"
  on dogs for update
  to authenticated
  using    (is_staff())
  with check (is_staff());

create policy "staff_delete_dogs"
  on dogs for delete
  to authenticated
  using (is_staff());


-- ---- BOOKINGS ----------------------------------------------
alter table bookings enable row level security;

-- Staff can read all bookings
create policy "staff_select_bookings"
  on bookings for select
  to authenticated
  using (is_staff());

-- Customers can read bookings for their own dogs
create policy "customer_select_own_bookings"
  on bookings for select
  to authenticated
  using (
    exists (
      select 1
      from   dogs
      join   humans on humans.id = dogs.human_id
      where  dogs.id   = bookings.dog_id
        and  humans.customer_user_id = auth.uid()
    )
  );

-- Staff can insert bookings
create policy "staff_insert_bookings"
  on bookings for insert
  to authenticated
  with check (is_staff());

-- Staff can update bookings (status workflow, rescheduling, etc.)
create policy "staff_update_bookings"
  on bookings for update
  to authenticated
  using    (is_staff())
  with check (is_staff());

-- Staff can delete any booking
create policy "staff_delete_bookings"
  on bookings for delete
  to authenticated
  using (is_staff());

-- Customers can cancel their own FUTURE bookings
create policy "customer_cancel_own_bookings"
  on bookings for delete
  to authenticated
  using (
    booking_date >= current_date
    and exists (
      select 1
      from   dogs
      join   humans on humans.id = dogs.human_id
      where  dogs.id   = bookings.dog_id
        and  humans.customer_user_id = auth.uid()
    )
  );


-- ---- SALON CONFIG ------------------------------------------
-- Pricing and capacity rules — staff read-only, owners write.
alter table salon_config enable row level security;

-- All staff can read config (needed to enforce capacity rules in the UI)
create policy "staff_select_salon_config"
  on salon_config for select
  to authenticated
  using (is_staff());

-- Only owners can insert / update / delete config rows
create policy "owner_insert_salon_config"
  on salon_config for insert
  to authenticated
  with check (
    exists (
      select 1
      from   staff_profiles
      where  user_id = auth.uid()
        and  role    = 'owner'
    )
  );

create policy "owner_update_salon_config"
  on salon_config for update
  to authenticated
  using (
    exists (
      select 1
      from   staff_profiles
      where  user_id = auth.uid()
        and  role    = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from   staff_profiles
      where  user_id = auth.uid()
        and  role    = 'owner'
    )
  );

create policy "owner_delete_salon_config"
  on salon_config for delete
  to authenticated
  using (
    exists (
      select 1
      from   staff_profiles
      where  user_id = auth.uid()
        and  role    = 'owner'
    )
  );


-- ---- DAY SETTINGS ------------------------------------------
-- Closed days / slot overrides — all staff can manage.
alter table day_settings enable row level security;

create policy "staff_all_day_settings"
  on day_settings for all
  to authenticated
  using    (is_staff())
  with check (is_staff());
