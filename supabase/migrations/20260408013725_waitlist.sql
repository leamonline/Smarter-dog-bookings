-- 012_waitlist.sql
-- Creates the waitlist table and policies

create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null references humans(id) on delete cascade,
  target_date date not null,
  created_at timestamptz default now()
);

-- Note: a waitlist entry can point to a specific dog, but often just the human joins
-- "I want to bring my dogs on Tuesday". We can link the specific dog if preferred.
-- Let's just track human_id and target_date.

alter table waitlist_entries enable row level security;

-- Staff/Owners can manage everything
create policy "Staff can select all waitlist" on waitlist_entries for select to authenticated using (true);
create policy "Staff can insert waitlist" on waitlist_entries for insert to authenticated with check (true);
create policy "Staff can delete waitlist" on waitlist_entries for delete to authenticated using (true);

-- Customers can manage their own
create policy "Customer select own waitlist" on waitlist_entries for select to authenticated 
  using (exists (select 1 from humans where id = human_id and customer_user_id = (select auth.uid())));
  
create policy "Customer insert own waitlist" on waitlist_entries for insert to authenticated 
  with check (exists (select 1 from humans where id = human_id and customer_user_id = (select auth.uid())));

create policy "Customer delete own waitlist" on waitlist_entries for delete to authenticated 
  using (exists (select 1 from humans where id = human_id and customer_user_id = (select auth.uid())));
