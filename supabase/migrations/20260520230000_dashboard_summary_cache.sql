-- ============================================================
-- Dashboard summary cache
--
-- Single-row table keyed by string. Stores the last LLM-synthesised
-- summary that the dashboard shows in the WhatsApp module, plus
-- the timestamp of the most recent awaiting conversation it was
-- computed against. The dashboard-summary edge function reads
-- this on every call:
--
--   - If max(whatsapp_conversations.updated_at WHERE unread_count > 0)
--     is <= cache.computed_against, return cached summary.
--   - Otherwise re-call Claude Haiku, overwrite, return fresh.
--
-- Net effect: at most one Haiku call per inbox state change. Loading
-- the dashboard repeatedly between changes hits the cache.
--
-- Service-role only — staff don't read this directly; the edge
-- function does. No RLS policy added; the public-read default is
-- already gated by the existing `revoke all from public` on the
-- table after creation.
-- ============================================================

create table if not exists dashboard_summary_cache (
  key text primary key,
  summary text not null,
  computed_against timestamptz not null,
  awaiting_count integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table dashboard_summary_cache is
  'Single-row cache (key=''whatsapp'') for the dashboard WhatsApp module''s AI summary. The edge function dashboard-summary writes here.';
comment on column dashboard_summary_cache.computed_against is
  'Max whatsapp_conversations.updated_at across awaiting (unread_count > 0) conversations at the moment the summary was generated. Used as the cache-invalidation key.';

revoke all on table dashboard_summary_cache from public;
revoke all on table dashboard_summary_cache from anon;
revoke all on table dashboard_summary_cache from authenticated;
grant all on table dashboard_summary_cache to service_role;

alter table dashboard_summary_cache enable row level security;
-- Service-role bypasses RLS so no policy is needed for the edge
-- function. Explicitly deny everything else.
create policy "service_role only" on dashboard_summary_cache
  for all
  to service_role
  using (true)
  with check (true);
