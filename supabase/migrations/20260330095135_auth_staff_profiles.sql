-- Staff Profiles — links Supabase Auth users to salon roles
-- Roles: 'owner' (full access, can approve large dogs, modify settings)
--        'staff' (standard access)

create table staff_profiles (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  role         text not null default 'staff' check (role in ('owner', 'staff')),
  display_name text default '',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create trigger staff_profiles_updated before update on staff_profiles
  for each row execute function update_modified_column();

-- RLS policies for staff_profiles
alter table staff_profiles enable row level security;

-- Authenticated users can read all staff profiles
create policy "Staff can view all profiles"
  on staff_profiles for select
  to authenticated
  using (true);

-- Staff profile creation is deliberately service-role only.
-- Authenticated users, including customer portal users, must not be able
-- to mint their own staff row because is_staff() trusts row existence.
revoke insert on table staff_profiles from anon, authenticated;

-- Users can update their own profile
create policy "Users can update own profile"
  on staff_profiles for update
  to authenticated
  using (auth.uid() = user_id);
