-- Persist the editable Settings screen fields that do not need dedicated
-- operational columns. Pricing, pickup offset, capacity enforcement and large
-- dog slot rules stay in their existing columns because edge functions read
-- them directly.
alter table public.salon_config
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.salon_config.settings is
  'JSON settings edited from /settings: business details, hours, closures, booking rules, portal toggles, notifications and custom service list.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'salon_config_settings_is_object'
      and conrelid = 'public.salon_config'::regclass
  ) then
    alter table public.salon_config
      add constraint salon_config_settings_is_object
      check (jsonb_typeof(settings) = 'object');
  end if;
end $$;
