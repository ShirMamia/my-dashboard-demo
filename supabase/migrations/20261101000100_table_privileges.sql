-- Explicit table privileges.
--
-- This project's default privileges don't grant DML on new public tables to the API roles,
-- and they do grant TRUNCATE/REFERENCES/TRIGGER, which RLS doesn't cover (TRUNCATE bypasses RLS).
-- So privileges are set explicitly here:
--   * authenticated: SELECT/INSERT/UPDATE/DELETE only; RLS (owner_all) limits rows to the owner.
--   * anon: nothing (revoked in the initial migration).
--   * service_role: not used by the app (ARCHITECTURE §9); no grants beyond the platform defaults.

do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings', 'projects', 'categories', 'tasks', 'today_entries',
    'task_templates', 'planning_items', 'calendar_events'
  ]
  loop
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;
