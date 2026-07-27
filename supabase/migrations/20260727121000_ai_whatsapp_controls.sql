-- Durable, staff-only controls for AI-initiated WhatsApp sends.
--
-- Manual staff messages do not consult these controls. The outbound Edge
-- Function reads both settings with the service role and fails closed if a
-- required row or value cannot be read.

create table if not exists public.ai_whatsapp_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

insert into public.ai_whatsapp_settings (singleton, enabled)
values (true, true)
on conflict (singleton) do nothing;

alter table public.ai_whatsapp_settings enable row level security;
revoke all on public.ai_whatsapp_settings from public;
revoke all on public.ai_whatsapp_settings from anon, authenticated;

comment on table public.ai_whatsapp_settings is
  'Singleton master switch for AI-initiated WhatsApp sends. Service send paths fail closed when unreadable.';
comment on column public.ai_whatsapp_settings.enabled is
  'True permits AI-initiated sends subject to the per-customer preference. Manual staff sends are independent.';

alter table public.humans
  add column if not exists ai_whatsapp_allowed boolean not null default true;

comment on column public.humans.ai_whatsapp_allowed is
  'Staff-managed opt-out for AI-initiated WhatsApp sends. False overrides the global enabled setting; manual staff messages remain available.';

create or replace function public.get_ai_whatsapp_settings()
returns table (
  enabled boolean,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;

  return query
    select s.enabled, s.updated_at, s.updated_by
    from public.ai_whatsapp_settings s
    where s.singleton is true;
end;
$$;

revoke all on function public.get_ai_whatsapp_settings() from public;
revoke all on function public.get_ai_whatsapp_settings() from anon;
revoke all on function public.get_ai_whatsapp_settings() from authenticated;
grant execute on function public.get_ai_whatsapp_settings() to authenticated;

create or replace function public.set_ai_whatsapp_enabled(p_enabled boolean)
returns table (
  enabled boolean,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'enabled_required' using errcode = '22023';
  end if;

  update public.ai_whatsapp_settings s
  set enabled = p_enabled,
      updated_at = now(),
      updated_by = auth.uid()
  where s.singleton is true;

  if not found then
    raise exception 'ai_whatsapp_settings_missing' using errcode = 'P0001';
  end if;

  return query
    select s.enabled, s.updated_at, s.updated_by
    from public.ai_whatsapp_settings s
    where s.singleton is true;
end;
$$;

revoke all on function public.set_ai_whatsapp_enabled(boolean) from public;
revoke all on function public.set_ai_whatsapp_enabled(boolean) from anon;
revoke all on function public.set_ai_whatsapp_enabled(boolean) from authenticated;
grant execute on function public.set_ai_whatsapp_enabled(boolean) to authenticated;
