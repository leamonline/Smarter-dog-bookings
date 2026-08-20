-- ============================================================
-- Repair mis-encoded characters in production's validate_booking_capacity().
--
-- WHAT IS WRONG
--
-- Production's deployed validate_booking_capacity() contains double-encoded
-- text: UTF-8 bytes that were decoded as Latin-1 at some point in that
-- function's hand-apply history. Two distinct sequences, 7 occurrences:
--
--   U+00E2 U+0080 U+0094   (6x)  should be  U+2014  em dash  '—'
--   U+00E2 U+0086 U+0092   (1x)  should be  U+2192  arrow    '→'
--
-- Four are comments. Three are `raise exception` messages that reach callers:
--
--   '13:00 is closed — large dog at 12:00 triggered early close'
--   'Large dog fills this slot — already has bookings'
--   '13:00 closed — early close from 12:00 large dog'
--
-- Any surface that shows the raw database message shows the corruption to
-- staff. supabase/tests/035_capacity_behaviour.test.sql already asserts the
-- correct text with throws_ok, so the repository has always treated the
-- clean string as canonical -- production is the outlier.
--
-- WHY NO COMMITTED MIGRATION IS AT FAULT
--
-- No migration in this repository has ever contained these sequences (the
-- whole history of supabase/migrations was searched). Migrations are applied
-- to production by hand (README "Database migrations"), and the corruption
-- entered during one of those applies, not through the tracked SQL. Nothing
-- in the repository needs correcting; only the deployed function does.
--
-- WHY THIS IS SAFE
--
-- Measured before writing this, against three databases:
--
--   local, rebuilt from committed migrations   md5(prosrc) = 2aaa6590...
--   staging                                    md5(prosrc) = 2aaa6590...
--   production, with both sequences repaired   md5(prosrc) = 2aaa6590...
--
-- Production is character-for-character identical to the canonical
-- definition apart from these 7 sequences (13086 characters on every side
-- once normalised). So this migration changes text and nothing else.
--
-- The repair is derived from the *deployed* definition by pure character
-- substitution rather than retyping the 348-line body, which is what makes
-- "no logic change" a property of the mechanism instead of a promise: there
-- is no transcription step in which logic could drift.
--
-- Client behaviour is unaffected either way. mapDenialReason()
-- (src/engine/denials.ts) categorises these messages on substrings that
-- never span the corrupted character -- 'large dog', 'early close',
-- 'closed', '2-2-1' -- so denial categorisation is identical before and
-- after. The booking wizard maps on error.code (P0001), not message text.
-- public.booking_denials was checked: no stored reason_detail row carries
-- the corruption, so no data backfill is needed.
--
-- validate_booking_capacity is the only function in public or
-- smarter_dog_private affected; the rest of the database is clean.
--
-- NOT IN SCOPE: no logic, policy, schema, grant or capacity-rule change.
-- The 2-2-1 engine, the large-dog rules and the daily cap are untouched.
-- CREATE OR REPLACE preserves the function's owner, privileges (including
-- the revoke in 20260618143000) and COMMENT.
--
-- Re-runnable: a database whose function is already clean -- every fresh
-- build from these migrations, CI, and staging -- takes the early return and
-- is left completely untouched.
-- ============================================================

do $repair$
declare
  v_def       text;
  v_fixed     text;
  v_prosrc_md5 text;
begin
  select pg_get_functiondef(oid)
    into v_def
    from pg_proc
   where oid = 'public.validate_booking_capacity()'::regprocedure;

  if v_def is null then
    raise exception
      'validate_booking_capacity() not found; apply the capacity migrations first';
  end if;

  -- Nothing to do on a clean database. This is the path every fresh build,
  -- CI run and staging apply takes.
  if position(chr(226) in v_def) = 0 then
    raise notice 'validate_booking_capacity(): encoding already clean, nothing to repair';
    return;
  end if;

  v_fixed := replace(v_def, chr(226) || chr(128) || chr(148), chr(8212));  -- em dash
  v_fixed := replace(v_fixed, chr(226) || chr(134) || chr(146), chr(8594)); -- arrow

  -- Refuse to guess. If any 0xE2-led sequence survives, the deployed body
  -- carries a corruption this migration was not written for, and a human
  -- should look at it rather than have it silently half-repaired.
  if position(chr(226) in v_fixed) > 0 then
    raise exception
      'validate_booking_capacity() contains an unrecognised mis-encoded sequence; not repairing blind';
  end if;

  execute v_fixed;

  select prosrc
    into v_prosrc_md5
    from pg_proc
   where oid = 'public.validate_booking_capacity()'::regprocedure;

  v_prosrc_md5 := md5(v_prosrc_md5);

  -- Post-condition. The repaired body must be the canonical definition that
  -- local-from-migrations and staging both carry. If it is not, the deployed
  -- function had drifted in some way beyond encoding and this migration must
  -- not be the thing that papers over it.
  if v_prosrc_md5 <> '2aaa6590fee3bec2f7cb3f6750fc2247' then
    raise exception
      'validate_booking_capacity() body is % after repair, expected the canonical 2aaa6590fee3bec2f7cb3f6750fc2247; the deployed function had drifted beyond encoding',
      v_prosrc_md5;
  end if;

  raise notice 'validate_booking_capacity(): repaired 7 mis-encoded sequences (6 em dash, 1 arrow); body now canonical';
end
$repair$;
