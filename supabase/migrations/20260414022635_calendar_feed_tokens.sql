-- 017_calendar_feed_tokens.sql
-- Calendar feed tokens for iCal subscription URLs.
-- Each token authenticates a specific feed URL without requiring a browser session,
-- since calendar apps (Apple Calendar, Google Calendar, Outlook) cannot carry JWTs.

create table if not exists calendar_feed_tokens (
  id              uuid primary key default gen_random_uuid(),
  human_id        uuid references humans(id) on delete cascade,
  staff_user_id   uuid references auth.users(id) on delete cascade,
  token           text not null unique,
  feed_type       text not null check (feed_type in ('customer', 'staff')),
  is_active       boolean default true,
  created_at      timestamptz default now(),
  expires_at      timestamptz,
  last_accessed   timestamptz,

  -- Exactly one owner: either a customer (human) or a staff member
  constraint feed_token_owner_check check (
    (human_id is not null and staff_user_id is null)
    or (human_id is null and staff_user_id is not null)
  )
);

create index idx_calendar_feed_token on calendar_feed_tokens(token) where is_active = true;
create index idx_calendar_feed_human on calendar_feed_tokens(human_id) where human_id is not null;
create index idx_calendar_feed_staff on calendar_feed_tokens(staff_user_id) where staff_user_id is not null;

-- RLS
alter table calendar_feed_tokens enable row level security;

-- Staff can manage their own tokens
create policy "staff_manage_own_feed_tokens"
  on calendar_feed_tokens for all
  to authenticated
  using (staff_user_id = (select auth.uid()) and (select is_staff()))
  with check (staff_user_id = (select auth.uid()) and (select is_staff()));

-- Customers can manage their own tokens
create policy "customer_manage_own_feed_tokens"
  on calendar_feed_tokens for all
  to authenticated
  using (
    human_id in (
      select id from humans where customer_user_id = (select auth.uid())
    )
  )
  with check (
    human_id in (
      select id from humans where customer_user_id = (select auth.uid())
    )
  );

-- RPC: get or create a calendar feed token for the current user.
-- Creates one if none exists; returns the token string.
create or replace function get_or_create_calendar_feed_token(p_feed_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_human_id uuid;
  v_staff_user_id uuid;
begin
  if p_feed_type = 'staff' then
    if not is_staff() then
      raise exception 'Not authorized';
    end if;
    v_staff_user_id := auth.uid();

    select token into v_token
    from calendar_feed_tokens
    where staff_user_id = v_staff_user_id
      and feed_type = 'staff'
      and is_active = true
    limit 1;

    if v_token is null then
      v_token := encode(gen_random_bytes(32), 'hex');
      insert into calendar_feed_tokens (staff_user_id, token, feed_type)
      values (v_staff_user_id, v_token, 'staff');
    end if;

  elsif p_feed_type = 'customer' then
    select id into v_human_id
    from humans
    where customer_user_id = auth.uid()
    limit 1;

    if v_human_id is null then
      raise exception 'No linked human record';
    end if;

    select token into v_token
    from calendar_feed_tokens
    where human_id = v_human_id
      and feed_type = 'customer'
      and is_active = true
    limit 1;

    if v_token is null then
      v_token := encode(gen_random_bytes(32), 'hex');
      insert into calendar_feed_tokens (human_id, token, feed_type)
      values (v_human_id, v_token, 'customer');
    end if;

  else
    raise exception 'Invalid feed_type: %', p_feed_type;
  end if;

  return v_token;
end;
$$;

grant execute on function get_or_create_calendar_feed_token(text) to authenticated;

-- RPC: revoke a calendar feed token (for "regenerate URL" flows).
-- Deactivates the current token so a new one will be created on next call.
create or replace function revoke_calendar_feed_token(p_feed_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_feed_type = 'staff' then
    if not is_staff() then
      raise exception 'Not authorized';
    end if;

    update calendar_feed_tokens
    set is_active = false
    where staff_user_id = auth.uid()
      and feed_type = 'staff'
      and is_active = true;

  elsif p_feed_type = 'customer' then
    update calendar_feed_tokens
    set is_active = false
    where human_id in (
      select id from humans where customer_user_id = auth.uid()
    )
      and feed_type = 'customer'
      and is_active = true;

  else
    raise exception 'Invalid feed_type: %', p_feed_type;
  end if;
end;
$$;

grant execute on function revoke_calendar_feed_token(text) to authenticated;
