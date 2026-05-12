-- 20260513130000_whatsapp_auto_send_default_off.sql
--
-- Task 3 of the May 2026 review pass.
--
-- Belt-and-braces hardening for whatsapp_conversations.auto_send_enabled:
--   1. Re-asserts the column default of false (no-op if it's already
--      false — the original migration 026 set it that way).
--   2. Flips any rows where auto_send_enabled = true AND last_inbound_at
--      is NULL back to false. Such rows can only have been created by
--      dev seeds or manual fiddling — a real customer thread would have
--      at least one inbound timestamp.
--   3. Raises a NOTICE listing affected rows so the maintainer running
--      the migration can audit them.
--
-- Production-safety check: real prod conversations always have
-- last_inbound_at set (the webhook stamps it on the first message),
-- so step 2 will be a no-op against prod. To inspect what would change
-- before applying, run:
--   select id, phone_e164 from whatsapp_conversations
--    where auto_send_enabled = true and last_inbound_at is null;
--
-- Rollback: trivial — this is additive maintenance, not a schema change.

alter table whatsapp_conversations
  alter column auto_send_enabled set default false;

do $$
declare
  v_rows record;
  v_affected int := 0;
begin
  for v_rows in
    select id, phone_e164
      from whatsapp_conversations
     where auto_send_enabled = true
       and last_inbound_at is null
  loop
    raise notice 'whatsapp_auto_send_default_off: resetting %, phone %', v_rows.id, v_rows.phone_e164;
    v_affected := v_affected + 1;
  end loop;

  update whatsapp_conversations
     set auto_send_enabled = false
   where auto_send_enabled = true
     and last_inbound_at is null;

  raise notice 'whatsapp_auto_send_default_off: % rows reset', v_affected;
end;
$$;
