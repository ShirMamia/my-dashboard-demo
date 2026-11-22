-- Phase 9 calendar event tests: all-day/timed integrity, the yearly rule, ownership, isolation.
-- Run: npm run test:db (see security.test.sql for how results are collected).
-- Everything runs in one transaction that is never committed: no data is left behind.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temp table tap (n serial primary key, line text not null) on commit drop;
grant insert, select on tap to authenticated, anon;
grant usage on sequence tap_n_seq to authenticated, anon;

insert into tap (line) select plan(18);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'authenticated', 'authenticated', 'cal-a@example.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000b9', 'authenticated', 'authenticated', 'cal-b@example.invalid');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

insert into tap (line) select ok(
  (select relrowsecurity from pg_class where oid = 'public.calendar_events'::regclass),
  'RLS is enabled on calendar_events');
insert into tap (line) select is(
  (select count(*)::int from pg_constraint where conrelid = 'public.calendar_events'::regclass and contype = 'f'
     and confrelid <> 'auth.users'::regclass),
  0, 'events reference no tasks, projects or planning items (deleting one touches nothing else)');

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000a9');

-- Valid shapes.
insert into tap (line) select lives_ok($$
  insert into calendar_events (id, user_id, title, is_all_day, start_date, end_date) values
    ('aaaaaaaa-6666-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'חופשה New York', true, '2026-11-28', '2026-12-03');
  insert into calendar_events (id, user_id, title, is_all_day, starts_at, ends_at) values
    ('aaaaaaaa-6666-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'פגישת Review API', false,
     '2026-10-25T00:30:00+03:00', '2026-10-25T03:00:00+02:00');
  insert into calendar_events (id, user_id, title, is_all_day, start_date, end_date, recurrence) values
    ('aaaaaaaa-6666-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-0000000000a9', 'יום הולדת', true, '2024-02-29', '2024-02-29', 'yearly')
$$, 'an all-day range, a timed event across the DST change and a yearly day are accepted');
insert into tap (line) select is(
  (select ends_at - starts_at from calendar_events where id = 'aaaaaaaa-6666-4000-8000-0000000000a2'),
  interval '3 hours 30 minutes', 'instants keep their real duration across the DST change');

-- Integrity checks.
insert into tap (line) select throws_ok($$
  insert into calendar_events (user_id, title, is_all_day, start_date, end_date) values
    ('aaaaaaaa-0000-4000-8000-0000000000a9', 'x', true, '2026-11-10', '2026-11-09')
$$, '23514', null, 'an all-day event cannot end before it starts');
insert into tap (line) select throws_ok($$
  insert into calendar_events (user_id, title, is_all_day, starts_at, ends_at) values
    ('aaaaaaaa-0000-4000-8000-0000000000a9', 'x', false, '2026-11-10T10:00:00Z', '2026-11-10T09:00:00Z')
$$, '23514', null, 'a timed event cannot end before it starts');
insert into tap (line) select throws_ok($$
  insert into calendar_events (user_id, title, is_all_day, start_date, end_date, starts_at, ends_at) values
    ('aaaaaaaa-0000-4000-8000-0000000000a9', 'x', true, '2026-11-10', '2026-11-10', '2026-11-10T10:00:00Z', '2026-11-10T11:00:00Z')
$$, '23514', null, 'an all-day event has no instants');
insert into tap (line) select throws_ok($$
  insert into calendar_events (user_id, title, is_all_day, starts_at) values
    ('aaaaaaaa-0000-4000-8000-0000000000a9', 'x', false, '2026-11-10T10:00:00Z')
$$, '23514', null, 'a timed event needs both instants');
insert into tap (line) select throws_ok($$
  insert into calendar_events (user_id, title, is_all_day, starts_at, ends_at, recurrence) values
    ('aaaaaaaa-0000-4000-8000-0000000000a9', 'x', false, '2026-11-10T10:00:00Z', '2026-11-10T11:00:00Z', 'yearly')
$$, '23514', null, 'a timed event cannot be yearly');
insert into tap (line) select throws_ok($$
  insert into calendar_events (user_id, title, is_all_day, start_date, end_date, recurrence) values
    ('aaaaaaaa-0000-4000-8000-0000000000a9', 'x', true, '2026-11-10', '2026-11-11', 'yearly')
$$, '23514', null, 'a yearly event is a single day');
insert into tap (line) select throws_ok($$
  insert into calendar_events (user_id, title, is_all_day, start_date, end_date, recurrence) values
    ('aaaaaaaa-0000-4000-8000-0000000000a9', 'x', true, '2026-11-10', '2026-11-10', 'monthly')
$$, '22P02', null, 'no recurrence other than none/yearly');
insert into tap (line) select throws_ok($$
  insert into calendar_events (user_id, title, is_all_day, start_date, end_date) values
    ('aaaaaaaa-0000-4000-8000-0000000000a9', '', true, '2026-11-10', '2026-11-10')
$$, '23514', null, 'an empty title is rejected');

-- B: no access to A's events.
reset role;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-0000000000b9');
insert into tap (line) select is((select count(*)::int from calendar_events), 0, 'B cannot read A''s events');
insert into tap (line) select throws_ok($$
  insert into calendar_events (user_id, title, is_all_day, start_date, end_date) values
    ('aaaaaaaa-0000-4000-8000-0000000000a9', 'planted', true, '2026-11-10', '2026-11-10')
$$, '42501', null, 'B cannot create an event as A');
update calendar_events set title = 'hijacked' where id = 'aaaaaaaa-6666-4000-8000-0000000000a1';
delete from calendar_events where id = 'aaaaaaaa-6666-4000-8000-0000000000a2';
reset role;
insert into tap (line) select results_eq($$
  select title from calendar_events where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a9' order by id
$$, $$ values ('חופשה New York'), ('פגישת Review API'), ('יום הולדת') $$, 'B''s update and delete leave A''s events untouched');

-- A edits and deletes their own event.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000a9');
insert into tap (line) select lives_ok($$
  update calendar_events set is_all_day = false, start_date = null, end_date = null,
    starts_at = '2026-11-28T08:00:00Z', ends_at = '2026-11-28T09:00:00Z'
  where id = 'aaaaaaaa-6666-4000-8000-0000000000a1'
$$, 'an all-day event can become a timed one');
insert into tap (line) select lives_ok($$
  delete from calendar_events where id = 'aaaaaaaa-6666-4000-8000-0000000000a3'
$$, 'the owner can delete an event');
reset role;

set local role anon;
insert into tap (line) select throws_ok($$ select count(*) from calendar_events $$, '42501', null, 'anon cannot read events');
reset role;

insert into tap (line) select * from finish();
select line from tap order by n;
