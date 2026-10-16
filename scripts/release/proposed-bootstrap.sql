-- PROPOSED OPERATOR PREREQUISITE. Never run by the release engine.
-- Installing this schema on a hosted target requires separate owner approval.
-- No customer data, SQL bodies or credentials belong in this table.
begin;
create schema if not exists release_control authorization postgres;
revoke all on schema release_control from public;
create table release_control.attempts (
  digest text primary key check (digest ~ '^[a-f0-9]{64}$'),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  outcome text not null default 'unknown' check (outcome in ('unknown', 'succeeded'))
);
alter table release_control.attempts owner to postgres;
revoke all on release_control.attempts from public;
commit;
