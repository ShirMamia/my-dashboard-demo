-- Phase 6 project tests: ownership, archive/delete semantics, Task ↔ Project integrity.
-- Run: npm run test:db (see security.test.sql for how results are collected).
-- Everything runs in one transaction that is never committed: no data is left behind.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temp table tap (n serial primary key, line text not null) on commit drop;
grant insert, select on tap to authenticated, anon;
grant usage on sequence tap_n_seq to authenticated, anon;

insert into tap (line) select plan(16);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'proj-a@example.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'proj-b@example.invalid');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- A: a project with two tasks (one done), a template and a planning item; a category.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000a1');
insert into projects (id, user_id, name) values
  ('aaaaaaaa-1111-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'פרויקט BI Dashboard');
insert into categories (id, user_id, name) values
  ('aaaaaaaa-2222-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'עבודה');
insert into tasks (id, user_id, title, deadline, project_id, category_id, is_important, urgent_override, status, completed_at) values
  ('aaaaaaaa-3333-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'open', '2026-11-10',
   'aaaaaaaa-1111-4000-8000-0000000000a1', 'aaaaaaaa-2222-4000-8000-0000000000a1', true, true, 'in_progress', null),
  ('aaaaaaaa-3333-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'done', '2026-11-01',
   'aaaaaaaa-1111-4000-8000-0000000000a1', null, false, null, 'done', '2026-11-01T10:00:00Z');
insert into task_templates (id, user_id, name, title, project_id) values
  ('aaaaaaaa-4444-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'תבנית', 'כותרת', 'aaaaaaaa-1111-4000-8000-0000000000a1');
insert into planning_items (id, user_id, title, date, project_id) values
  ('aaaaaaaa-5555-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'אבן דרך', '2026-12-01', 'aaaaaaaa-1111-4000-8000-0000000000a1');

-- Names: unique per user, 1–100 characters.
insert into tap (line) select throws_ok($$
  insert into projects (user_id, name) values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'פרויקט BI Dashboard')
$$, '23505', null, 'a duplicate project name for the same user is rejected');
insert into tap (line) select throws_ok($$
  insert into projects (user_id, name) values ('aaaaaaaa-0000-4000-8000-0000000000a1', '')
$$, '23514', null, 'an empty project name is rejected');
insert into tap (line) select throws_ok(
  format($f$insert into projects (user_id, name) values ('aaaaaaaa-0000-4000-8000-0000000000a1', %L)$f$, repeat('א', 101)),
  '23514', null, 'a 101-character project name is rejected');

-- B: same name is fine for another user; no access to A's project.
reset role;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-0000000000b2');
insert into tap (line) select lives_ok($$
  insert into projects (id, user_id, name) values
    ('bbbbbbbb-1111-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-0000000000b2', 'פרויקט BI Dashboard');
  insert into tasks (id, user_id, title, deadline) values
    ('bbbbbbbb-3333-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-0000000000b2', 'B task', '2026-11-10')
$$, 'another user can use the same project name');
insert into tap (line) select is_empty($$
  update projects set archived_at = now() where id = 'aaaaaaaa-1111-4000-8000-0000000000a1' returning id
$$, 'B cannot archive A''s project');
insert into tap (line) select is_empty($$
  delete from projects where id = 'aaaaaaaa-1111-4000-8000-0000000000a1' returning id
$$, 'B cannot delete A''s project');
insert into tap (line) select throws_ok($$
  update tasks set project_id = 'aaaaaaaa-1111-4000-8000-0000000000a1' where id = 'bbbbbbbb-3333-4000-8000-0000000000b2'
$$, '23503', null, 'B cannot move its task into A''s project');

-- A: archive keeps every task field; tasks stay reachable by project.
reset role;
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000a1');
create temp table before_archive on commit drop as
  select id, status, deadline, project_id, category_id, is_important, urgent_override, completed_at
  from tasks where project_id = 'aaaaaaaa-1111-4000-8000-0000000000a1';
update projects set archived_at = now() where id = 'aaaaaaaa-1111-4000-8000-0000000000a1';
insert into tap (line) select results_eq(
  $$ select id, status, deadline, project_id, category_id, is_important, urgent_override, completed_at
     from tasks where project_id = 'aaaaaaaa-1111-4000-8000-0000000000a1' order by id $$,
  $$ select * from before_archive order by id $$,
  'archiving a project leaves its tasks unchanged'
);
insert into tap (line) select is(
  (select count(*)::int from projects where id = 'aaaaaaaa-1111-4000-8000-0000000000a1' and archived_at is not null),
  1, 'the owner can archive');
update projects set archived_at = null where id = 'aaaaaaaa-1111-4000-8000-0000000000a1';
insert into tap (line) select is(
  (select archived_at from projects where id = 'aaaaaaaa-1111-4000-8000-0000000000a1'),
  null, 'the owner can restore from the archive');

-- Removing a task from the project only clears project_id.
update tasks set project_id = null where id = 'aaaaaaaa-3333-4000-8000-0000000000a1';
insert into tap (line) select is(
  (select row(project_id, category_id, is_important, urgent_override, status)::text from tasks where id = 'aaaaaaaa-3333-4000-8000-0000000000a1'),
  row(null::uuid, 'aaaaaaaa-2222-4000-8000-0000000000a1'::uuid, true, true, 'in_progress'::task_status)::text,
  'removing a task from its project keeps its other fields');
update tasks set project_id = 'aaaaaaaa-1111-4000-8000-0000000000a1' where id = 'aaaaaaaa-3333-4000-8000-0000000000a1';

-- Delete: tasks, templates and planning items survive without the project.
delete from projects where id = 'aaaaaaaa-1111-4000-8000-0000000000a1';
insert into tap (line) select is(
  (select count(*)::int from tasks where id in ('aaaaaaaa-3333-4000-8000-0000000000a1', 'aaaaaaaa-3333-4000-8000-0000000000a2') and project_id is null),
  2, 'deleting a project keeps its tasks, without the project');
insert into tap (line) select is(
  (select row(status, completed_at, category_id)::text from tasks where id = 'aaaaaaaa-3333-4000-8000-0000000000a2'),
  row('done'::task_status, '2026-11-01T10:00:00Z'::timestamptz, null::uuid)::text,
  'a deleted project''s Done task stays Done');
insert into tap (line) select is(
  (select project_id from task_templates where id = 'aaaaaaaa-4444-4000-8000-0000000000a1'),
  null, 'deleting a project clears it from templates');
insert into tap (line) select is(
  (select project_id from planning_items where id = 'aaaaaaaa-5555-4000-8000-0000000000a1'),
  null, 'deleting a project clears it from planning items');

-- B's same-named project is untouched by A's delete.
reset role;
insert into tap (line) select is(
  (select count(*)::int from projects where id = 'bbbbbbbb-1111-4000-8000-0000000000b2'),
  1, 'another user''s project is unaffected');

insert into tap (line) select * from finish();
-- Last statement: returns the TAP output. No COMMIT follows, so all of the above is discarded.
select line from tap order by n;
