-- Retire the unused salon_config.enforce_capacity column.
-- #1174 (merge ce6df962, deployed 3 November 2026) stopped every app read
-- and write. The live kill switch is enforce_server_capacity and is not
-- touched here. Apply only after that frontend is deployed; do not roll
-- back to a revision that still writes enforce_capacity.
-- No CASCADE: an unexpected dependent object must stop the release.
set local lock_timeout = '5s';
alter table public.salon_config drop column if exists enforce_capacity;
