-- Phase 3 security and integrity tests (IMPLEMENTATION_PLAN Phase 3).
-- Run: npm run test:db (scripts/test-db.mjs, via `supabase db query --linked`; no Docker needed).
--
-- Everything runs in one transaction that is never committed: the script ends with the
-- transaction still open, so it's rolled back when the session closes. No data is left behind.
-- `db query` returns only the last statement's rows, so every assertion writes its TAP line
-- to the `tap` temp table and the final statement returns them all.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temp table tap (n serial primary key, line text not null) on commit drop;
grant insert, select on tap to authenticated, anon;
grant usage on sequence tap_n_seq to authenticated, anon;

insert into tap (line) select plan(41);

-- ---------------------------------------------------------------------------
-- Fixtures: two users (A owns data, B is the intruder), inserted as the migration role.
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'test-a@example.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'test-b@example.invalid');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- ---------------------------------------------------------------------------
-- RLS is enabled on every table
-- ---------------------------------------------------------------------------

insert into tap (line) select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'every public table has RLS enabled'
);
insert into tap (line) select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'),
  8,
  'the schema has the 8 MVP tables'
);

-- Table privileges: only row DML for authenticated (RLS-covered), nothing for anon.
insert into tap (line) select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
  0,
  'authenticated has no TRUNCATE/REFERENCES/TRIGGER (not covered by RLS)'
);
insert into tap (line) select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  0,
  'anon has no privileges on any table'
);

-- ---------------------------------------------------------------------------
-- User A creates data through RLS
-- ---------------------------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

insert into tap (line) select lives_ok($$
  insert into projects (id, user_id, name) values
    ('aaaaaaaa-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'פרויקט א');
  insert into categories (id, user_id, name) values
    ('aaaaaaaa-2222-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'עבודה');
  insert into tasks (id, user_id, title, deadline, project_id, category_id) values
    ('aaaaaaaa-3333-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'משימה 1', '2026-03-27',
     'aaaaaaaa-1111-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-000000000001'),
    ('aaaaaaaa-3333-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'משימה 2', '2026-11-05', null, null),
    ('aaaaaaaa-3333-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'משימה 3', '2026-11-05', null, null),
    ('aaaaaaaa-3333-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001', 'משימה 4', '2026-11-05', null, null),
    ('aaaaaaaa-3333-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000001', 'משימה 5', '2026-11-05', null, null),
    ('aaaaaaaa-3333-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000001', 'משימה 6', '2026-11-05', null, null);
  insert into user_settings (user_id, default_deadline_days) values ('aaaaaaaa-0000-4000-8000-000000000001', 7);
  insert into task_templates (user_id, name, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'תבנית', 'כותרת');
  insert into planning_items (user_id, title, date, preparation_task_id) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'אבן דרך', '2026-12-01', 'aaaaaaaa-3333-4000-8000-000000000002');
  insert into calendar_events (user_id, title, is_all_day, start_date, end_date, recurrence) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'יום הולדת', true, '2026-05-10', '2026-05-10', 'yearly');
$$, 'the owner can insert into every table');

insert into tap (line) select is((select count(*)::int from tasks), 6, 'the owner sees their own tasks');

-- Date-only values round-trip exactly, including the Israeli DST start day.
insert into tap (line) select is((select deadline::text from tasks where id = 'aaaaaaaa-3333-4000-8000-000000000001'),
  '2026-03-27', 'date-only deadline round-trips (Israeli DST start)');
set local timezone = 'Asia/Jerusalem';
insert into tap (line) select is((select deadline::text from tasks where id = 'aaaaaaaa-3333-4000-8000-000000000001'),
  '2026-03-27', 'date-only deadline is unaffected by the session time zone (Jerusalem)');
set local timezone = 'Pacific/Kiritimati';
insert into tap (line) select is((select deadline::text from tasks where id = 'aaaaaaaa-3333-4000-8000-000000000001'),
  '2026-03-27', 'date-only deadline is unaffected by the session time zone (UTC+14)');
reset timezone;

-- ---------------------------------------------------------------------------
-- User B can't read or write any of A's rows
-- ---------------------------------------------------------------------------

reset role;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');

insert into tap (line) select is((select count(*)::int from tasks), 0, 'B sees no tasks of A');
insert into tap (line) select is((select count(*)::int from projects), 0, 'B sees no projects of A');
insert into tap (line) select is((select count(*)::int from categories), 0, 'B sees no categories of A');
insert into tap (line) select is((select count(*)::int from user_settings), 0, 'B sees no settings of A');
insert into tap (line) select is((select count(*)::int from task_templates), 0, 'B sees no templates of A');
insert into tap (line) select is((select count(*)::int from planning_items), 0, 'B sees no planning items of A');
insert into tap (line) select is((select count(*)::int from calendar_events), 0, 'B sees no events of A');

insert into tap (line) select is_empty($$
  update tasks set title = 'נפרץ' where id = 'aaaaaaaa-3333-4000-8000-000000000001' returning id
$$, 'B cannot update A''s task');
insert into tap (line) select is_empty($$
  delete from projects where id = 'aaaaaaaa-1111-4000-8000-000000000001' returning id
$$, 'B cannot delete A''s project');
insert into tap (line) select is_empty($$
  update user_settings set default_deadline_days = 0 returning user_id
$$, 'B cannot update A''s settings');

insert into tap (line) select throws_ok($$
  insert into tasks (user_id, title, deadline) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'הזרקה', '2026-11-05')
$$, '42501', null, 'B cannot insert a task owned by A');
insert into tap (line) select throws_ok($$
  insert into projects (user_id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'הזרקה')
$$, '42501', null, 'B cannot insert a project owned by A');

-- B can't take over a row by changing user_id on its own row either.
insert into categories (id, user_id, name) values
  ('bbbbbbbb-2222-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'של ב');
insert into tap (line) select throws_ok($$
  update categories set user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
    where id = 'bbbbbbbb-2222-4000-8000-000000000001'
$$, '42501', null, 'B cannot move its row to A');

-- ---------------------------------------------------------------------------
-- Cross-user references are rejected by the DB (composite FKs)
-- ---------------------------------------------------------------------------

insert into tap (line) select throws_ok($$
  insert into tasks (user_id, title, deadline, project_id) values
    ('bbbbbbbb-0000-4000-8000-000000000002', 'x', '2026-11-05', 'aaaaaaaa-1111-4000-8000-000000000001')
$$, '23503', null, 'B''s task cannot reference A''s project');
insert into tap (line) select throws_ok($$
  insert into tasks (user_id, title, deadline, category_id) values
    ('bbbbbbbb-0000-4000-8000-000000000002', 'x', '2026-11-05', 'aaaaaaaa-2222-4000-8000-000000000001')
$$, '23503', null, 'B''s task cannot reference A''s category');
insert into tap (line) select throws_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-3333-4000-8000-000000000003', '2026-11-04', 'pick', 1)
$$, '23503', null, 'B cannot pick A''s task for Today');
insert into tap (line) select throws_ok($$
  insert into planning_items (user_id, title, date, preparation_task_id) values
    ('bbbbbbbb-0000-4000-8000-000000000002', 'x', '2026-12-01', 'aaaaaaaa-3333-4000-8000-000000000003')
$$, '23503', null, 'B''s planning item cannot point at A''s task');
insert into tap (line) select throws_ok($$
  insert into task_templates (user_id, name, title, project_id) values
    ('bbbbbbbb-0000-4000-8000-000000000002', 't', 'x', 'aaaaaaaa-1111-4000-8000-000000000001')
$$, '23503', null, 'B''s template cannot reference A''s project');

-- Even with RLS bypassed (table owner), the composite FK still rejects the reference.
reset role;
insert into tap (line) select throws_ok($$
  insert into tasks (user_id, title, deadline, project_id) values
    ('bbbbbbbb-0000-4000-8000-000000000002', 'x', '2026-11-05', 'aaaaaaaa-1111-4000-8000-000000000001')
$$, '23503', null, 'cross-user reference is rejected even without RLS');

-- Anonymous visitors have no table access at all.
set local role anon;
insert into tap (line) select throws_ok($$ select count(*) from tasks $$, '42501', null, 'anon cannot read tasks');
reset role;

-- ---------------------------------------------------------------------------
-- Today picks: at most 5 per user per day, one entry per task per day
-- ---------------------------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

insert into tap (line) select lives_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-3333-4000-8000-000000000001', '2026-11-04', 'pick', 1),
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-3333-4000-8000-000000000002', '2026-11-04', 'pick', 2),
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-3333-4000-8000-000000000003', '2026-11-04', 'pick', 3),
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-3333-4000-8000-000000000004', '2026-11-04', 'pick', 4),
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-3333-4000-8000-000000000005', '2026-11-04', 'pick', 5)
$$, '5 picks for one day are accepted');
insert into tap (line) select throws_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-3333-4000-8000-000000000006', '2026-11-04', 'pick', 6)
$$, '23514', null, 'a 6th pick slot is rejected');
insert into tap (line) select throws_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-3333-4000-8000-000000000006', '2026-11-04', 'pick', 3)
$$, '23505', null, 'a 6th pick reusing a taken slot is rejected');
insert into tap (line) select lives_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-3333-4000-8000-000000000006', '2026-11-04', 'dismiss', null),
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-3333-4000-8000-000000000006', '2026-11-05', 'pick', 1)
$$, 'dismissals and other days are not limited by the picks');
insert into tap (line) select throws_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-3333-4000-8000-000000000001', '2026-11-04', 'dismiss', null)
$$, '23505', null, 'one entry per task per day');
insert into tap (line) select throws_ok($$
  insert into today_entries (user_id, task_id, for_date, kind, pick_slot) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-3333-4000-8000-000000000002', '2026-11-06', 'dismiss', 2)
$$, '23514', null, 'a dismissal has no pick slot');

-- ---------------------------------------------------------------------------
-- Check constraints
-- ---------------------------------------------------------------------------

insert into tap (line) select throws_ok($$
  insert into tasks (user_id, title, deadline, start_date) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'x', '2026-11-05', '2026-11-06')
$$, '23514', null, 'start_date after deadline is rejected');
insert into tap (line) select throws_ok($$
  insert into tasks (user_id, title, deadline, status) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'x', '2026-11-05', 'done')
$$, '23514', null, 'Done without completed_at is rejected');
insert into tap (line) select throws_ok($$
  insert into tasks (user_id, title, deadline) values ('aaaaaaaa-0000-4000-8000-000000000001', '', '2026-11-05')
$$, '23514', null, 'an empty title is rejected');
insert into tap (line) select throws_ok($$
  insert into calendar_events (user_id, title, is_all_day, start_date, end_date, recurrence) values
    ('aaaaaaaa-0000-4000-8000-000000000001', 'x', true, '2026-05-10', '2026-05-11', 'yearly')
$$, '23514', null, 'a yearly event must be a single day');

-- ---------------------------------------------------------------------------
-- updated_at trigger and ON DELETE SET NULL (column)
-- ---------------------------------------------------------------------------

reset role;
alter table tasks disable trigger set_updated_at;
update tasks set updated_at = '2000-01-01' where id = 'aaaaaaaa-3333-4000-8000-000000000002';
alter table tasks enable trigger set_updated_at;
update tasks set title = 'עודכנה' where id = 'aaaaaaaa-3333-4000-8000-000000000002';
insert into tap (line) select is((select updated_at from tasks where id = 'aaaaaaaa-3333-4000-8000-000000000002'),
  now(), 'updated_at is set by the trigger');

delete from projects where id = 'aaaaaaaa-1111-4000-8000-000000000001';
insert into tap (line) select is(
  (select row(project_id, user_id)::text from tasks where id = 'aaaaaaaa-3333-4000-8000-000000000001'),
  row(null::uuid, 'aaaaaaaa-0000-4000-8000-000000000001'::uuid)::text,
  'deleting a project nulls only project_id and keeps user_id'
);

insert into tap (line) select * from finish();
-- Last statement: returns the TAP output. No COMMIT follows, so all of the above is discarded.
select line from tap order by n;
