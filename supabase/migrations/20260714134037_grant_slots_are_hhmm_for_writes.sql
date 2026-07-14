-- Allow staff/client-library writes to satisfy the humans slot-shape CHECKs.
--
-- 20260714120000 uses slots_are_hhmm(text[]) in two CHECK constraints, then
-- revoked authenticated EXECUTE. Postgres evaluates the helper for every
-- humans UPDATE, including deposit_required-only changes, so staff received
-- "permission denied for function slots_are_hhmm". The helper is IMMUTABLE,
-- reads no tables and returns only a boolean, so granting the two write roles
-- EXECUTE exposes no customer data or mutation surface. Anonymous callers stay
-- blocked.

revoke all on function public.slots_are_hhmm(text[]) from public, anon;
grant execute on function public.slots_are_hhmm(text[]) to authenticated, service_role;
