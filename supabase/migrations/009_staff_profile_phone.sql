-- Add phone number field to staff profiles
alter table staff_profiles add column if not exists phone text default '';
