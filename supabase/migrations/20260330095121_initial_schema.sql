-- SmarterDog Salon Dashboard — Initial Schema
-- Run this in the Supabase SQL Editor

create extension if not exists "uuid-ossp";

-- =====================
-- HUMANS
-- =====================
create table humans (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  surname      text not null,
  phone        text,
  sms          boolean default false,
  whatsapp     boolean default false,
  email        text,
  fb           text default '',
  insta        text default '',
  tiktok       text default '',
  address      text default '',
  notes        text default '',
  history_flag text default '',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),

  unique(name, surname)
);

-- =====================
-- HUMAN TRUSTED CONTACTS (junction table)
-- =====================
create table human_trusted_contacts (
  human_id   uuid not null references humans(id) on delete cascade,
  trusted_id uuid not null references humans(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (human_id, trusted_id),
  check (human_id <> trusted_id)
);

-- =====================
-- DOGS
-- =====================
create table dogs (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  breed        text not null,
  age          text,
  human_id     uuid not null references humans(id) on delete cascade,
  alerts       text[] default '{}',
  groom_notes  text default '',
  custom_price integer,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- =====================
-- BOOKINGS (date-based)
-- =====================
create table bookings (
  id            uuid primary key default uuid_generate_v4(),
  booking_date  date not null,
  slot          text not null,
  dog_id        uuid not null references dogs(id) on delete cascade,
  size          text not null check (size in ('small', 'medium', 'large')),
  service       text not null,
  status        text default 'Not Arrived',
  addons        text[] default '{}',
  pickup_by_id  uuid references humans(id),
  payment       text default 'Due at Pick-up',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_bookings_date on bookings(booking_date);

-- =====================
-- SALON CONFIG (single-row)
-- =====================
create table salon_config (
  id                    uuid primary key default uuid_generate_v4(),
  default_pickup_offset integer default 120,
  pricing               jsonb not null default '{}',
  enforce_capacity      boolean default true,
  large_dog_slots       jsonb not null default '{}',
  updated_at            timestamptz default now()
);

-- =====================
-- DAY SETTINGS (per-date)
-- =====================
create table day_settings (
  id           uuid primary key default uuid_generate_v4(),
  setting_date date not null unique,
  is_open      boolean default true,
  overrides    jsonb default '{}',
  extra_slots  text[] default '{}',
  updated_at   timestamptz default now()
);

-- =====================
-- UPDATED_AT TRIGGERS
-- =====================
create or replace function update_modified_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger humans_updated before update on humans
  for each row execute function update_modified_column();
create trigger dogs_updated before update on dogs
  for each row execute function update_modified_column();
create trigger bookings_updated before update on bookings
  for each row execute function update_modified_column();
create trigger salon_config_updated before update on salon_config
  for each row execute function update_modified_column();
create trigger day_settings_updated before update on day_settings
  for each row execute function update_modified_column();
