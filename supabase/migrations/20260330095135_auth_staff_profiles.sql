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

-- Users can only insert their own profile
create policy "Users can insert own profile"
  on staff_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can update their own profile
create policy "Users can update own profile"
  on staff_profiles for update
  to authenticated
  using (auth.uid() = user_id);
