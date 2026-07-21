-- The staff Humans directory must contain real customers and completed
-- self-signups, never the temporary shell created while onboarding is still
-- in progress. Synthetic fixtures are rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into public.humans (
  id, name, surname, source, approved_at, signup_submitted_at
)
values
  (
    '13500000-0000-4000-8000-000000000001',
    'DirectoryFixture135', 'Customer', 'existing', now(), null
  ),
  (
    '13500000-0000-4000-8000-000000000002',
    'DirectoryFixture135', 'Submitted', 'self_signup', null, now()
  ),
  (
    '13500000-0000-4000-8000-000000000003',
    'DirectoryFixture135', 'Shell', 'self_signup', null, null
  );

select results_eq(
  $$
    select row->>'surname'
    from jsonb_array_elements(
      public.search_humans_directory(p_search => 'DirectoryFixture135')->'rows'
    ) as row
    order by row->>'surname'
  $$,
  $$ values ('Customer'::text), ('Submitted'::text) $$,
  'the main Humans directory hides unfinished self-signup shells'
);

select results_eq(
  $$
    select row->>'surname'
    from jsonb_array_elements(
      public.search_humans_directory(
        p_search => 'DirectoryFixture135',
        p_pending => true
      )->'rows'
    ) as row
    order by row->>'surname'
  $$,
  $$ values ('Submitted'::text) $$,
  'the New customers filter contains submitted self-signups only'
);

select * from finish();
rollback;
