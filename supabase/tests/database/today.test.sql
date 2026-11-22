-- Phase 7 Today tests: picks and dismissals are user-owned and date-scoped.
-- Run: npm run test:db (see security.test.sql for how results are collected).
-- Everything runs in one transaction that is never committed: no data is left behind.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temp table tap (n serial primary key, line text not null) on commit drop;
grant insert, select on tap to authenticated, anon;
grant usage on sequence tap_n_seq to authenticated, anon;

insert into tap (line) select plan(17);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'today-a@example.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000d2', 'authenticated', 'authenticated', 'today-b@example.invalid');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

insert into tap (line) select ok(
  (select relrowsecurity from pg_class where oid = 'public.today_entries'::regclass),
  'RLS is enabled on today_entries');

-- A: six tasks; a pick and a dismissal for 2026-11-04.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000c1');
insert into tasks (id, user_id, title, deadline)
select ('aaaaaaaa-7777-4000-8000-00000000000' || n)::uuid, 'aaaaaaaa-0000-4000-8000-0000000000c1', 'A task ' || n, '2026-11-05'
from generate_series(1, 6) as n;
insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-7777-4000-8000-000000000001', '2026-11-04', 'pick', 1),
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-7777-4000-8000-000000000002', '2026-11-04', 'dismiss', null);

-- Manual intent wins: the server's upsert turns a same-day dismissal into a pick (one row).
insert into tap (line) select lives_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot, created_at) values
    ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-7777-4000-8000-000000000002', '2026-11-04', 'pick', 2, now())
  on conflict (task_id, for_date) do update
    set kind = excluded.kind, pick_slot = excluded.pick_slot, created_at = excluded.created_at
$$, 'a dismissed task can be picked the same day');
insert into tap (line) select results_eq($$
  select kind::text, pick_slot from today_entries
  where task_id = 'aaaaaaaa-7777-4000-8000-000000000002' and for_date = '2026-11-04'
$$, $$ values ('pick', 2::smallint) $$, 'the dismissal became a pick, with no second row');

-- Days are independent: a full day doesn't limit the next one.
insert into tap (line) select lives_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot)
  select 'aaaaaaaa-0000-4000-8000-0000000000c1', ('aaaaaaaa-7777-4000-8000-00000000000' || n)::uuid, '2026-11-05', 'pick', n
  from generate_series(1, 5) as n
$$, 'five picks on the next day are accepted');
insert into tap (line) select is(
  (select count(*)::int from today_entries where for_date = '2026-11-04'), 2,
  'the previous day keeps its own entries');
insert into tap (line) select throws_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-7777-4000-8000-000000000006', '2026-11-04', 'pick', 0)
$$, '23514', null, 'pick slot 0 is rejected');
insert into tap (line) select throws_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-7777-4000-8000-000000000006', '2026-11-04', 'pick', null)
$$, '23514', null, 'a pick without a slot is rejected');
insert into tap (line) select throws_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-7777-4000-8000-0000000000ff', '2026-11-04', 'dismiss', null)
$$, '23503', null, 'an entry for a task that does not exist is rejected');

-- B: a task of their own; no access to A's Today state.
reset role;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-0000000000d2');
insert into tasks (id, user_id, title, deadline) values
  ('bbbbbbbb-7777-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000d2', 'B task', '2026-11-05');

insert into tap (line) select is(
  (select count(*)::int from today_entries), 0, 'B cannot read A''s picks or dismissals');
insert into tap (line) select throws_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('bbbbbbbb-0000-4000-8000-0000000000d2', 'aaaaaaaa-7777-4000-8000-000000000003', '2026-11-04', 'dismiss', null)
$$, '23503', null, 'B cannot dismiss A''s task');
insert into tap (line) select throws_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-7777-4000-8000-000000000003', '2026-11-06', 'pick', 1)
$$, '42501', null, 'B cannot create Today entries as A');
insert into tap (line) select throws_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('aaaaaaaa-0000-4000-8000-0000000000c1', 'bbbbbbbb-7777-4000-8000-000000000001', '2026-11-04', 'pick', 3)
$$, '42501', null, 'B cannot put their own task into A''s Today');

update today_entries set kind = 'dismiss', pick_slot = null where task_id = 'aaaaaaaa-7777-4000-8000-000000000001';
delete from today_entries where task_id = 'aaaaaaaa-7777-4000-8000-000000000002';
reset role;
insert into tap (line) select results_eq($$
  select task_id::text, kind::text from today_entries where for_date = '2026-11-04' order by task_id
$$, $$ values ('aaaaaaaa-7777-4000-8000-000000000001', 'pick'), ('aaaaaaaa-7777-4000-8000-000000000002', 'pick') $$,
  'B''s update and delete leave A''s entries untouched');

-- Deleting a task removes its Today entries on every day (no dangling picks).
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000c1');
insert into tap (line) select lives_ok($$
  delete from tasks where id = 'aaaaaaaa-7777-4000-8000-000000000001'
$$, 'a picked task can be deleted');
insert into tap (line) select is(
  (select count(*)::int from today_entries where task_id = 'aaaaaaaa-7777-4000-8000-000000000001'), 0,
  'its picks on both days are gone');
insert into tap (line) select is(
  (select count(*)::int from today_entries where for_date = '2026-11-05'), 4,
  'the other picks of that day stay');
reset role;

-- Anonymous visitors have no access.
set local role anon;
insert into tap (line) select throws_ok($$ select count(*) from today_entries $$, '42501', null, 'anon cannot read today_entries');
reset role;

insert into tap (line) select * from finish();
select line from tap order by n;
