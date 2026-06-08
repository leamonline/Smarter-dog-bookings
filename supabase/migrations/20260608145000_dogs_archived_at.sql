-- ============================================================
-- Soft-archive marker for dogs (mirrors humans.archived_at)
--
-- Some dogs leave the active roster — they've passed away, moved away, or were
-- one-off visitors — but their booking history and groom photos are worth
-- keeping, so a hard delete is too blunt. archived_at lets staff hide a dog
-- from the directory and from search without losing anything. Null = active;
-- set a timestamp to archive; set back to null to unarchive (fully reversible).
--
-- Existing rows default to null (active), so this is a safe additive change and
-- must be applied to prod BEFORE the front-end filters on it (and before
-- search_dogs_directory, which reads `where archived_at is null`).
-- ============================================================

alter table public.dogs
  add column if not exists archived_at timestamptz;

-- The directory list and search only ever want active dogs; a partial index
-- keeps those reads fast as the archived set grows.
create index if not exists idx_dogs_active
  on public.dogs (name)
  where archived_at is null;

comment on column public.dogs.archived_at is
  'When set, the dog is archived: hidden from the directory and search. Null = active. Reversible.';
