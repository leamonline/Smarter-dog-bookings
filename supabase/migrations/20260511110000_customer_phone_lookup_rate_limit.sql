-- ============================================================
-- Customer phone-on-file rate limiting
--
-- Moves the customer phone lookup behind an Edge Function with
-- per-IP rate limiting. This migration:
--
--   1. Locks down customer_phone_on_file() so only service_role
--      can call it (so the Edge Function is the only public path).
--   2. Creates a small attempts table + helper RPC that lets the
--      Edge Function atomically check + record a rate-limited
--      attempt.
--   3. Adds a tiny cleanup helper so the attempts table doesn't
--      grow forever.
-- ============================================================

-- ── 1. Lock down the raw lookup ──────────────────────────────
-- Previously granted to anon so the customer login page could
-- call it directly. Now the Edge Function is the only allowed
-- caller and it runs with the service_role key.
revoke execute on function public.customer_phone_on_file(text) from anon;
revoke execute on function public.customer_phone_on_file(text) from authenticated;
-- (service_role retains EXECUTE by default for SECURITY DEFINER
-- functions in public schema.)

-- ── 2. Rate-limit attempts table ─────────────────────────────
create table if not exists public.customer_phone_lookup_attempts (
  ip          text        not null,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_customer_phone_lookup_attempts_ip_time
  on public.customer_phone_lookup_attempts (ip, attempted_at desc);

-- ── 3. Rate-limit RPC (called by the Edge Function) ──────────
-- Atomically: count attempts from this IP in the last
-- p_window_seconds. If under the cap, insert this attempt and
-- return true. Otherwise return false.
create or replace function public.customer_phone_lookup_rate_limit(
  p_ip text,
  p_window_seconds int default 60,
  p_max_attempts   int default 5
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
  v_count  int;
begin
  if p_ip is null or length(trim(p_ip)) = 0 then
    -- No IP means we can't rate-limit fairly; refuse rather than
    -- letting an unknown caller through.
    return false;
  end if;

  select count(*)
  into   v_count
  from   public.customer_phone_lookup_attempts
  where  ip = p_ip
    and  attempted_at >= v_cutoff;

  if v_count >= p_max_attempts then
    return false;
  end if;

  insert into public.customer_phone_lookup_attempts (ip, attempted_at)
  values (p_ip, now());

  return true;
end;
$$;

revoke all on function public.customer_phone_lookup_rate_limit(text, int, int) from public;
revoke all on function public.customer_phone_lookup_rate_limit(text, int, int) from anon;
revoke all on function public.customer_phone_lookup_rate_limit(text, int, int) from authenticated;
-- service_role retains execute (default for SECURITY DEFINER).

comment on function public.customer_phone_lookup_rate_limit(text, int, int) is
  'Atomic rate-limit check for the customer-phone-on-file Edge Function. Records the attempt and returns true if the IP is under the cap in the configured window.';

-- ── 4. Cleanup helper ────────────────────────────────────────
-- Trim the attempts table to attempts within the last hour so it
-- never grows boundlessly. Called opportunistically by the rate
-- limiter every now and then; doesn't need to run on a schedule.
create or replace function public.customer_phone_lookup_attempts_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.customer_phone_lookup_attempts
  where  attempted_at < now() - interval '1 hour';
$$;

revoke all on function public.customer_phone_lookup_attempts_cleanup() from public;
revoke all on function public.customer_phone_lookup_attempts_cleanup() from anon;
revoke all on function public.customer_phone_lookup_attempts_cleanup() from authenticated;

-- ── 5. RLS on the attempts table ─────────────────────────────
-- Service role bypasses RLS; nobody else needs to read this.
alter table public.customer_phone_lookup_attempts enable row level security;
-- No policies = no access from anon/authenticated. Service role
-- can still read/write because it bypasses RLS.
