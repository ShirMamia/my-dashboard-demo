-- Phase 10 planning item tests: ownership, the single preparation task, independence.
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
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000aa', 'authenticated', 'authenticated', 'plan-a@example.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000bb', 'authenticated', 'authenticated', 'plan-b@example.invalid');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

insert into tap (line) select ok(
  (select relrowsecurity from pg_class where oid = 'public.planning_items'::regclass),
  'RLS is enabled on planning_items');
insert into tap (line) select is(
  (select count(*)::int from pg_constraint where conrelid = 'public.tasks'::regclass and confrelid = 'public.planning_items'::regclass),
  0, 'tasks have no reference to planning items (the preparation task is independent)');

-- A: a project, a category, two tasks, an item with a preparation task.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000aa');
insert into projects (id, user_id, name) values ('aaaaaaaa-1111-4000-8000-0000000000aa', 'aaaaaaaa-0000-4000-8000-0000000000aa', 'Project Q4');
insert into categories (id, user_id, name) values ('aaaaaaaa-2222-4000-8000-0000000000aa', 'aaaaaaaa-0000-4000-8000-0000000000aa', 'עבודה');
insert into tasks (id, user_id, title, deadline, project_id, category_id) values
  ('aaaaaaaa-3333-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000aa', 'הכנה: כנס', '2026-11-24',
   'aaaaaaaa-1111-4000-8000-0000000000aa', 'aaaaaaaa-2222-4000-8000-0000000000aa'),
  ('aaaaaaaa-3333-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-0000000000aa', 'אחרת', '2026-11-25', null, null);
insert into planning_items (id, user_id, title, date, prep_lead_days, project_id, category_id, preparation_task_id) values
  ('aaaaaaaa-5555-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000aa', 'כנס Project Q4', '2026-12-01', 7,
   'aaaaaaaa-1111-4000-8000-0000000000aa', 'aaaaaaaa-2222-4000-8000-0000000000aa', 'aaaaaaaa-3333-4000-8000-0000000000a1');

-- Field checks.
insert into tap (line) select throws_ok($$
  insert into planning_items (user_id, title, date) values ('aaaaaaaa-0000-4000-8000-0000000000aa', '', '2026-12-01')
$$, '23514', null, 'an empty title is rejected');
insert into tap (line) select throws_ok($$
  insert into planning_items (user_id, title, date, prep_lead_days) values ('aaaaaaaa-0000-4000-8000-0000000000aa', 'x', '2026-12-01', 366)
$$, '23514', null, 'a lead time over 365 days is rejected');
insert into tap (line) select throws_ok($$
  insert into planning_items (user_id, title, date, prep_lead_days) values ('aaaaaaaa-0000-4000-8000-0000000000aa', 'x', '2026-12-01', -1)
$$, '23514', null, 'a negative lead time is rejected');
insert into tap (line) select is(
  (select prep_lead_days from planning_items where id = 'aaaaaaaa-5555-4000-8000-0000000000a1'), 7::smallint,
  'the lead time is stored as given (default 7)');

-- One task can't prepare two items.
insert into tap (line) select throws_ok($$
  insert into planning_items (user_id, title, date, preparation_task_id) values
    ('aaaaaaaa-0000-4000-8000-0000000000aa', 'שני', '2026-12-05', 'aaaaaaaa-3333-4000-8000-0000000000a1')
$$, '23505', null, 'a task is the preparation task of at most one item');

-- Editing the item never touches its task.
update planning_items set date = '2027-01-15', prep_lead_days = 30, title = 'כנס נדחה'
where id = 'aaaaaaaa-5555-4000-8000-0000000000a1';
insert into tap (line) select results_eq($$
  select title, deadline from tasks where id = 'aaaaaaaa-3333-4000-8000-0000000000a1'
$$, $$ values ('הכנה: כנס'::text, '2026-11-24'::date) $$, 'editing the item leaves its preparation task unchanged');

-- Deleting the task frees the item to generate a new one.
delete from tasks where id = 'aaaaaaaa-3333-4000-8000-0000000000a1';
insert into tap (line) select results_eq($$
  select title, preparation_task_id from planning_items where id = 'aaaaaaaa-5555-4000-8000-0000000000a1'
$$, $$ values ('כנס נדחה'::text, null::uuid) $$, 'deleting the preparation task keeps the item and clears its reference');
insert into tap (line) select lives_ok($$
  update planning_items set preparation_task_id = 'aaaaaaaa-3333-4000-8000-0000000000a2'
  where id = 'aaaaaaaa-5555-4000-8000-0000000000a1' and preparation_task_id is null
$$, 'the item can take a new preparation task');

-- Deleting the item keeps the task.
delete from planning_items where id = 'aaaaaaaa-5555-4000-8000-0000000000a1';
insert into tap (line) select is(
  (select count(*)::int from tasks where id = 'aaaaaaaa-3333-4000-8000-0000000000a2'), 1,
  'deleting the item keeps its preparation task');

-- B: no access to A's planning, and no cross-user references.
reset role;
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000aa');
insert into planning_items (id, user_id, title, date) values
  ('aaaaaaaa-5555-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-0000000000aa', 'פריט של A', '2026-12-10');
reset role;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-0000000000bb');
insert into tap (line) select is((select count(*)::int from planning_items), 0, 'B cannot read A''s planning items');
insert into tap (line) select throws_ok($$
  insert into planning_items (user_id, title, date, preparation_task_id) values
    ('bbbbbbbb-0000-4000-8000-0000000000bb', 'x', '2026-12-01', 'aaaaaaaa-3333-4000-8000-0000000000a2')
$$, '23503', null, 'B cannot link A''s task as a preparation task');
insert into tap (line) select throws_ok($$
  insert into planning_items (user_id, title, date, project_id) values
    ('bbbbbbbb-0000-4000-8000-0000000000bb', 'x', '2026-12-01', 'aaaaaaaa-1111-4000-8000-0000000000aa')
$$, '23503', null, 'B cannot use A''s project');
insert into tap (line) select throws_ok($$
  insert into planning_items (user_id, title, date) values ('aaaaaaaa-0000-4000-8000-0000000000aa', 'planted', '2026-12-01')
$$, '42501', null, 'B cannot create an item as A');
update planning_items set title = 'hijacked' where id = 'aaaaaaaa-5555-4000-8000-0000000000a2';
delete from planning_items where id = 'aaaaaaaa-5555-4000-8000-0000000000a2';
reset role;
insert into tap (line) select is(
  (select title from planning_items where id = 'aaaaaaaa-5555-4000-8000-0000000000a2'), 'פריט של A',
  'B''s update and delete leave A''s item untouched');

set local role anon;
insert into tap (line) select throws_ok($$ select count(*) from planning_items $$, '42501', null, 'anon cannot read planning items');
reset role;

insert into tap (line) select * from finish();
select line from tap order by n;
