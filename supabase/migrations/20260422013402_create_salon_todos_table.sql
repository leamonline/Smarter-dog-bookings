-- 022a_create_salon_todos_table.sql
-- BACKFILL — applied to production on 2026-04-16 as version 20260416084722
-- under the name "create_salon_todos_table". Added retroactively so the repo
-- has a complete record. DO NOT RE-APPLY — the permissive policies created
-- here were replaced by 023_secure_salon_todos.sql.

-- Salon to-do list, synced across devices
create table if not exists public.salon_todos (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable realtime
alter publication supabase_realtime add table public.salon_todos;

-- RLS: authenticated users can CRUD
alter table public.salon_todos enable row level security;

create policy "Authenticated users can read todos"
  on public.salon_todos for select
  to authenticated
  using (true);

create policy "Authenticated users can insert todos"
  on public.salon_todos for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update todos"
  on public.salon_todos for update
  to authenticated
  using (true);

create policy "Authenticated users can delete todos"
  on public.salon_todos for delete
  to authenticated
  using (true);
