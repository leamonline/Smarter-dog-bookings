-- ============================================================
-- Soft-archive marker for humans
--
-- Some directory rows are stale (one-off enquiries, duplicates that can't
-- be merged, people who've moved away) but shouldn't be hard-deleted —
-- their dogs and booking history are worth keeping. archived_at lets staff
-- hide a human from the directory and exclude them from new-booking /
-- trusted-contact search without losing anything. Null = active; set a
-- timestamp to archive; set back to null to unarchive (fully reversible).
--
-- Existing rows default to null (active), so this is a safe additive change
-- and must be applied to prod BEFORE the front-end starts filtering on it.
-- ============================================================

alter table public.humans
  add column if not exists archived_at timestamptz;

-- The directory list and search only ever want active humans; a partial
-- index keeps those reads fast as the archived set grows.
create index if not exists idx_humans_active
  on public.humans (name, surname)
  where archived_at is null;

comment on column public.humans.archived_at is
  'When set, the human is archived: hidden from the directory and excluded from new-booking / trusted-contact search. Null = active. Reversible.';
