-- Minimal dependency fixture for isolated PostgreSQL verification only.
-- This does not reproduce all Supabase migrations or establish release readiness.
create role anon; create role authenticated; create role service_role;
create schema auth;
create schema smarter_dog_private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key);
create table public.staff_profiles(user_id uuid,role text,display_name text);
create function public.is_staff() returns boolean language sql security definer stable as $$select exists(select 1 from staff_profiles where user_id=auth.uid())$$;
create table public.humans(id uuid primary key, customer_user_id uuid, deposit_required boolean default false);
create table public.dogs(id uuid primary key,human_id uuid);
create table public.bookings(id uuid primary key,dog_id uuid,group_id uuid,booking_date date,slot text,status text,cancel_reason text);
create table public.booking_events(booking_id uuid,event_type text,occurred_at timestamptz);
create function public.synthetic_booking_event() returns trigger language plpgsql as $$begin if new.status='Cancelled' and old.status is distinct from new.status then insert into booking_events values(new.id,'cancelled',now()); end if; return new; end$$;
create trigger synthetic_booking_event after update on bookings for each row execute function synthetic_booking_event();
create table public.salon_config(id uuid default gen_random_uuid(),settings jsonb);
create table public.booking_policy_settings(singleton boolean,customer_intake_enabled boolean,booking_horizon_days integer,terms_url text,allow_customer_cancellations boolean,allow_customer_rescheduling boolean,allow_repeat_booking boolean,show_customer_history boolean);
create function public.booking_policy_runtime() returns text language sql as $$select 'inactive'::text$$;
create table smarter_dog_private.customer_cancellation_receipts(id uuid default gen_random_uuid(),customer_user_id uuid,target_booking_id uuid,booking_group_id uuid,cancel_reason text,cancelled_booking_ids uuid[],cancelled_count integer,cancelled_at timestamptz,created_at timestamptz default now());
alter table public.humans add column name text, add column surname text;
alter table public.dogs add column name text, add column breed text, add column size text;
alter table public.bookings add column service text, add column size text;
