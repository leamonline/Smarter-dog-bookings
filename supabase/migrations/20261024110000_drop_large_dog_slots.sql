-- #1000 contract phase: #1060 removed all application and seed writes.
-- Apply only after the compatible frontend is deployed and old sessions refreshed.
-- Do not roll back to an application revision predating #1060 after this drop.
-- No CASCADE: an unexpected dependent object must stop the release.
set local lock_timeout = '5s';
alter table public.salon_config drop column if exists large_dog_slots;
