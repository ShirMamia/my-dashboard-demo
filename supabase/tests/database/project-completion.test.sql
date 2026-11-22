-- UAT-03 project completion: completed_at is the owner's own lifecycle field, independent of
-- archived_at; completing never touches tasks; other users and anon can't change it.
-- Run: npm run test:db (see security.test.sql for how results are collected).
-- Everything runs in one transaction that is never committed: no data is left behind.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temp table tap (n serial primary key, line text not null) on commit drop;
grant insert, select on tap to authenticated, anon;
grant usage on sequence tap_n_seq to authenticated, anon;

insert into tap (line) select plan(13);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'done-a@example.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', 'done-b@example.invalid');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

insert into tap (line) select col_is_null('public', 'projects', 'completed_at', 'completed_at is nullable (null = not completed)');

-- A: a project with an open task.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000c1');
insert into projects (id, user_id, name) values
  ('aaaaaaaa-1111-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'פרויקט Q4');
insert into tasks (id, user_id, title, deadline, project_id) values
  ('aaaaaaaa-3333-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'פתוחה', '2026-12-01', 'aaaaaaaa-1111-4000-8000-0000000000c1');

-- Complete with an open task: only the project changes.
insert into tap (line) select lives_ok($$
  update projects set completed_at = now() where id = 'aaaaaaaa-1111-4000-8000-0000000000c1'
$$, 'the owner can complete their project');
insert into tap (line) select results_eq($$
  select status::text, project_id from tasks where id = 'aaaaaaaa-3333-4000-8000-0000000000c1'
$$, $$ values ('todo'::text, 'aaaaaaaa-1111-4000-8000-0000000000c1'::uuid) $$,
  'completing a project leaves its open task unchanged');
insert into tap (line) select lives_ok($$
  insert into tasks (user_id, title, deadline, project_id) values
    ('aaaaaaaa-0000-4000-8000-0000000000c1', 'מאוחרת', '2026-12-02', 'aaaaaaaa-1111-4000-8000-0000000000c1')
$$, 'the database still accepts a task in a completed project (the pickers enforce "active only")');

-- Archive while completed, then restore: completion is kept.
update projects set archived_at = now() where id = 'aaaaaaaa-1111-4000-8000-0000000000c1';
insert into tap (line) select ok(
  (select completed_at is not null and archived_at is not null from projects where id = 'aaaaaaaa-1111-4000-8000-0000000000c1'),
  'a completed project can be archived and stays completed');
update projects set archived_at = null where id = 'aaaaaaaa-1111-4000-8000-0000000000c1';
insert into tap (line) select ok(
  (select completed_at is not null and archived_at is null from projects where id = 'aaaaaaaa-1111-4000-8000-0000000000c1'),
  'restoring from the archive keeps the completion');

-- Reopen.
update projects set completed_at = null where id = 'aaaaaaaa-1111-4000-8000-0000000000c1';
insert into tap (line) select is(
  (select completed_at from projects where id = 'aaaaaaaa-1111-4000-8000-0000000000c1'), null::timestamptz,
  'the owner can reopen their project');
update projects set completed_at = now() where id = 'aaaaaaaa-1111-4000-8000-0000000000c1';

-- B: can't see or change A's lifecycle.
reset role;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-0000000000c2');
insert into tap (line) select is((select count(*)::int from projects), 0, 'B cannot read A''s project');
update projects set completed_at = null where id = 'aaaaaaaa-1111-4000-8000-0000000000c1';
update projects set archived_at = now() where id = 'aaaaaaaa-1111-4000-8000-0000000000c1';
reset role;
insert into tap (line) select ok(
  (select completed_at is not null and archived_at is null from projects where id = 'aaaaaaaa-1111-4000-8000-0000000000c1'),
  'B''s reopen and archive leave A''s project unchanged');

-- B's own project works the same way.
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-0000000000c2');
insert into projects (id, user_id, name, completed_at) values
  ('bbbbbbbb-1111-4000-8000-0000000000c2', 'bbbbbbbb-0000-4000-8000-0000000000c2', 'של B', now());
insert into tap (line) select is((select count(*)::int from projects where completed_at is not null), 1,
  'B sees only their own completed project');
insert into tap (line) select throws_ok($$
  insert into projects (user_id, name, completed_at) values ('aaaaaaaa-0000-4000-8000-0000000000c1', 'planted', now())
$$, '42501', null, 'B cannot create a completed project as A');
reset role;

-- anon: no access at all.
set local role anon;
insert into tap (line) select throws_ok($$
  update projects set completed_at = null where id = 'aaaaaaaa-1111-4000-8000-0000000000c1'
$$, '42501', null, 'anon cannot change a project''s completion');
insert into tap (line) select throws_ok($$ select completed_at from projects $$, '42501', null, 'anon cannot read projects');
reset role;

insert into tap (line) select * from finish();
select line from tap order by n;
