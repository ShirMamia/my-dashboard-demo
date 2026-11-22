-- My Dashboard: initial schema (docs/ARCHITECTURE.md §6).
--
-- Integrity rules:
--   * Every table carries user_id and has RLS limited to the row owner.
--   * Owned tables that are referenced expose unique (id, user_id); references use composite
--     foreign keys (ref_id, user_id), so a row can never point at another user's row even if
--     RLS were misconfigured.
--   * ON DELETE SET NULL (column) nulls only the reference column, never user_id (PG 15+).

create type public.task_status as enum ('todo', 'in_progress', 'waiting', 'done');
create type public.today_kind as enum ('pick', 'dismiss');
create type public.event_recurrence as enum ('none', 'yearly'); -- only yearly in the MVP

-- Shared updated_at maintenance.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  default_deadline_days smallint not null default 7 check (default_deadline_days between 0 and 365),
  updated_at            timestamptz not null default now()
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);
-- No stored progress column: progress is derived from tasks (MASTER_SPEC §8).

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 50),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 200),
  notes           text,
  status          public.task_status not null default 'todo',
  is_important    boolean not null default false,
  urgent_override boolean,                       -- null = automatic
  deadline        date not null,
  start_date      date,
  scheduled_at    timestamptz,                   -- planned work slot
  project_id      uuid,
  category_id     uuid,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  check (start_date is null or start_date <= deadline),
  check ((status = 'done') = (completed_at is not null))
);
create index tasks_user_status_deadline on public.tasks (user_id, status, deadline);
create index tasks_user_completed_at on public.tasks (user_id, completed_at) where completed_at is not null;
create index tasks_project on public.tasks (project_id, user_id) where project_id is not null;
create index tasks_category on public.tasks (category_id, user_id) where category_id is not null;

create table public.today_entries (
  user_id    uuid not null,
  task_id    uuid not null,
  for_date   date not null,                      -- calendar date in Asia/Jerusalem
  kind       public.today_kind not null,
  pick_slot  smallint,                           -- 1..5 for picks, null for dismissals
  created_at timestamptz not null default now(), -- display order of picks
  primary key (task_id, for_date),               -- one entry per task per day
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  check ((kind = 'pick') = (pick_slot is not null)),
  check (pick_slot between 1 and 5)
);
-- DB-enforced maximum of 5 manual picks per user per day.
create unique index today_entries_pick_slot
  on public.today_entries (user_id, for_date, pick_slot) where kind = 'pick';
create index today_entries_user_date on public.today_entries (user_id, for_date);

create table public.task_templates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 100),
  title        text not null check (char_length(title) between 1 and 200),
  notes        text,
  is_important boolean not null default false,
  project_id   uuid,
  category_id  uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, name),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);
-- Tasks keep no reference to their template: template edits/deletes never affect tasks.

create table public.planning_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  title               text not null check (char_length(title) between 1 and 200),
  date                date not null,
  notes               text,
  prep_lead_days      smallint not null default 7 check (prep_lead_days between 0 and 365),
  preparation_task_id uuid unique,               -- at most one generated preparation task
  project_id          uuid,
  category_id         uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (preparation_task_id, user_id) references public.tasks (id, user_id) on delete set null (preparation_task_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);
create index planning_items_user_date on public.planning_items (user_id, date);

create table public.calendar_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  notes      text,
  is_all_day boolean not null,
  start_date date,           -- all-day only
  end_date   date,           -- all-day only, inclusive
  starts_at  timestamptz,    -- timed only
  ends_at    timestamptz,    -- timed only
  recurrence public.event_recurrence not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_all_day and start_date is not null and end_date is not null and end_date >= start_date
       and starts_at is null and ends_at is null)
    or
    (not is_all_day and starts_at is not null and ends_at is not null and ends_at >= starts_at
       and start_date is null and end_date is null and recurrence = 'none')
  ),
  check (recurrence = 'none' or end_date = start_date) -- yearly: single all-day date
);
-- No generic recurrence engine: domain/events.ts expands 'yearly' for the visible range only.
create index calendar_events_user_dates on public.calendar_events (user_id, start_date, end_date);
create index calendar_events_user_times on public.calendar_events (user_id, starts_at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger set_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.task_templates
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.planning_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: owner-only, every operation
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings', 'projects', 'categories', 'tasks', 'today_entries',
    'task_templates', 'planning_items', 'calendar_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end;
$$;
