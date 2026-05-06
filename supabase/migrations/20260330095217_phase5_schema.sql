-- Phase 5 schema additions

-- Add size column to dogs table for repeat booking convenience
alter table dogs add column if not exists size text check (size in ('small', 'medium', 'large'));

-- Add confirmed flag to bookings for client confirmation tracking
alter table bookings add column if not exists confirmed boolean default false;
