-- ============================================================
-- Clear legacy "Unknown" placeholder breed values.
--
-- The UI (BookingCardNew, BookingHeader, BookingWizard, etc.) all
-- treat NULL / empty breed as "missing" and either fall back to
-- the snapshot or hide the field entirely. The literal string
-- "Unknown" used to be a placeholder; it now leaks through any
-- code path that doesn't explicitly compare against it
-- (CSV exports, the AI agent's system prompt, future surfaces).
--
-- The breed column was NOT NULL so the placeholder was unavoidable
-- in the legacy add-dog flow. Drop the NOT NULL constraint (the
-- column already has plenty of empty meaningful values via the
-- snapshot fallback) and backfill the placeholders to NULL.
--
-- Going forward, the customer + staff dog-add forms already store
-- NULL when no breed is selected (BreedCombobox), so this is a
-- one-off cleanup, not a recurring concern.
--
-- Modelled on the parallel migration that did the same for
-- humans.surname ('Null' / 'null'):
--   20260513150000_fix_null_surnames.sql
-- ============================================================

ALTER TABLE public.dogs ALTER COLUMN breed DROP NOT NULL;

UPDATE public.dogs
   SET breed = NULL
 WHERE LOWER(TRIM(breed)) IN ('unknown', 'null', 'undefined', '');
