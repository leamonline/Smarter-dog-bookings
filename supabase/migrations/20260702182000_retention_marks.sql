-- ============================================================
-- retention_marks: staff snooze / exclude for the retention report  (gap G6)
--
-- The "due back but not booked" report (2D) surfaces dogs overdue for a groom.
-- Staff need a way to say "not now" (snooze until a date) or "don't chase this
-- one" (exclude) WITHOUT overloading dogs.groom_notes or archiving the dog. A
-- dedicated, additive, staff-only table keeps that intent structured and
-- reversible.
--
-- kind:
--   'snoozed'  — hide from retention prompts until `until` (a date); NULL until
--                means indefinitely snoozed.
--   'excluded' — permanently opt this dog out of retention prompts (`until`
--                ignored).
-- The most-recent mark per dog wins in the report; staff can clear a mark by
-- deleting the row.
--
-- Additive + idempotent. Reuses the shared update_modified_column() trigger so
-- no new trigger function (and no revoke block) is introduced.
-- ============================================================

create table if not exists public.retention_marks (
  id          uuid primary key default gen_random_uuid(),
  dog_id      uuid not null references public.dogs(id) on delete cascade,
  kind        text not null check (kind in ('snoozed', 'excluded')),
  reason      text,
  until       date,        -- for 'snoozed'; NULL = indefinite. Ignored for 'excluded'.
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.retention_marks is
  'Staff-managed snooze/exclude marks driving the retention ("due back but not booked") report. kind=snoozed hides a dog from prompts until `until` (NULL = indefinite); kind=excluded opts it out entirely. Most-recent mark per dog wins; delete the row to clear.';

create index if not exists idx_retention_marks_dog on public.retention_marks (dog_id);

-- Auto-maintain updated_at with the shared helper (used by staff_profiles etc.).
drop trigger if exists retention_marks_updated on public.retention_marks;
create trigger retention_marks_updated
  before update on public.retention_marks
  for each row
  execute function update_modified_column();

-- Staff-only full CRUD; non-staff authenticated + anon get nothing.
alter table public.retention_marks enable row level security;

drop policy if exists retention_marks_staff_all on public.retention_marks;
create policy retention_marks_staff_all on public.retention_marks
  for all
  to authenticated
  using (is_staff())
  with check (is_staff());

-- Explicit DML grants (RLS still restricts to staff); never to anon.
grant select, insert, update, delete on public.retention_marks to authenticated;
revoke all on public.retention_marks from anon;
