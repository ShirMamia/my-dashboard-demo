-- Phase 8 template tests: ownership, names, and independence of the tasks created from them.
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
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'tpl-a@example.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000f2', 'authenticated', 'authenticated', 'tpl-b@example.invalid');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

insert into tap (line) select ok(
  (select relrowsecurity from pg_class where oid = 'public.task_templates'::regclass),
  'RLS is enabled on task_templates');
insert into tap (line) select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.tasks'::regclass and confrelid = 'public.task_templates'::regclass),
  0, 'tasks have no reference to templates');

-- A: a project, a category and a template using both.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000e1');
insert into projects (id, user_id, name) values
  ('aaaaaaaa-1111-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'פרויקט My Dashboard');
insert into categories (id, user_id, name) values
  ('aaaaaaaa-2222-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'עבודה');
insert into task_templates (id, user_id, name, title, notes, is_important, project_id, category_id) values
  ('aaaaaaaa-4444-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'דוח שבועי', 'Weekly report הכנת',
   'פרטים', true, 'aaaaaaaa-1111-4000-8000-0000000000e1', 'aaaaaaaa-2222-4000-8000-0000000000e1');

-- Names and titles.
insert into tap (line) select throws_ok($$
  insert into task_templates (user_id, name, title) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'דוח שבועי', 'x')
$$, '23505', null, 'a duplicate template name for the same user is rejected');
insert into tap (line) select throws_ok($$
  insert into task_templates (user_id, name, title) values ('aaaaaaaa-0000-4000-8000-0000000000e1', '', 'x')
$$, '23514', null, 'an empty template name is rejected');
insert into tap (line) select throws_ok(
  format($f$insert into task_templates (user_id, name, title) values ('aaaaaaaa-0000-4000-8000-0000000000e1', %L, 'x')$f$, repeat('א', 101)),
  '23514', null, 'a 101-character template name is rejected');
insert into tap (line) select throws_ok(
  format($f$insert into task_templates (user_id, name, title) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'n', %L)$f$, repeat('א', 201)),
  '23514', null, 'a 201-character task title is rejected');

-- A task created from the template is independent: template edits and deletion leave it as it was.
insert into tasks (id, user_id, title, notes, deadline, is_important, project_id, category_id)
select 'aaaaaaaa-3333-4000-8000-0000000000e1', user_id, title, notes, '2026-11-09', is_important, project_id, category_id
from task_templates where id = 'aaaaaaaa-4444-4000-8000-0000000000e1';
update task_templates set title = 'כותרת חדשה', notes = null, is_important = false
where id = 'aaaaaaaa-4444-4000-8000-0000000000e1';
insert into tap (line) select results_eq($$
  select title, notes, is_important from tasks where id = 'aaaaaaaa-3333-4000-8000-0000000000e1'
$$, $$ values ('Weekly report הכנת', 'פרטים', true) $$, 'editing the template leaves the earlier task unchanged');

-- Archiving the project keeps it on the template (instantiation drops it, in the app).
update projects set archived_at = now() where id = 'aaaaaaaa-1111-4000-8000-0000000000e1';
insert into tap (line) select is(
  (select project_id::text from task_templates where id = 'aaaaaaaa-4444-4000-8000-0000000000e1'),
  'aaaaaaaa-1111-4000-8000-0000000000e1', 'archiving a project keeps it on the template');

-- Deleting the category clears it from the template, which stays.
delete from categories where id = 'aaaaaaaa-2222-4000-8000-0000000000e1';
insert into tap (line) select results_eq($$
  select category_id from task_templates where id = 'aaaaaaaa-4444-4000-8000-0000000000e1'
$$, $$ values (null::uuid) $$, 'deleting a category clears it from the template');

-- B: same name is fine; no access to A's templates.
reset role;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-0000000000f2');
insert into tap (line) select lives_ok($$
  insert into categories (id, user_id, name) values
    ('bbbbbbbb-2222-4000-8000-0000000000f2', 'bbbbbbbb-0000-4000-8000-0000000000f2', 'עבודה');
  insert into task_templates (user_id, name, title) values
    ('bbbbbbbb-0000-4000-8000-0000000000f2', 'דוח שבועי', 'B report')
$$, 'another user can use the same template name');
insert into tap (line) select is(
  (select count(*)::int from task_templates where user_id <> 'bbbbbbbb-0000-4000-8000-0000000000f2'), 0,
  'B cannot read A''s templates');
insert into tap (line) select throws_ok($$
  insert into task_templates (user_id, name, title, category_id) values
    ('bbbbbbbb-0000-4000-8000-0000000000f2', 'x', 'x', 'aaaaaaaa-2222-4000-8000-0000000000e1')
$$, '23503', null, 'B''s template cannot reference a category that isn''t B''s');
insert into tap (line) select throws_ok($$
  insert into task_templates (user_id, name, title) values
    ('aaaaaaaa-0000-4000-8000-0000000000e1', 'planted', 'x')
$$, '42501', null, 'B cannot create a template as A');
update task_templates set name = 'hijacked' where id = 'aaaaaaaa-4444-4000-8000-0000000000e1';
delete from task_templates where id = 'aaaaaaaa-4444-4000-8000-0000000000e1';

-- A deletes the template: the task stays.
reset role;
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-0000000000e1');
insert into tap (line) select is(
  (select name from task_templates where id = 'aaaaaaaa-4444-4000-8000-0000000000e1'), 'דוח שבועי',
  'B''s update and delete leave A''s template untouched');
delete from task_templates where id = 'aaaaaaaa-4444-4000-8000-0000000000e1';
insert into tap (line) select is(
  (select count(*)::int from tasks where id = 'aaaaaaaa-3333-4000-8000-0000000000e1'), 1,
  'deleting the template keeps the task created from it');
reset role;

set local role anon;
insert into tap (line) select throws_ok($$ select count(*) from task_templates $$, '42501', null, 'anon cannot read templates');
reset role;

insert into tap (line) select * from finish();
select line from tap order by n;
