-- Covering indexes for the composite foreign keys flagged by `supabase db advisors`
-- (they keep ON DELETE SET NULL / CASCADE from scanning the referencing table).

create index planning_items_preparation_task on public.planning_items (preparation_task_id, user_id)
  where preparation_task_id is not null;
create index planning_items_project on public.planning_items (project_id, user_id)
  where project_id is not null;
create index planning_items_category on public.planning_items (category_id, user_id)
  where category_id is not null;
create index task_templates_project on public.task_templates (project_id, user_id)
  where project_id is not null;
create index task_templates_category on public.task_templates (category_id, user_id)
  where category_id is not null;
create index today_entries_task_user on public.today_entries (task_id, user_id);

-- The project's "auto-enable RLS" option installs public.rls_auto_enable(), a SECURITY DEFINER
-- event-trigger function. It's exposed under /rest/v1/rpc although it can't be called directly.
-- Remove EXECUTE from the API roles; the event trigger itself is unaffected.
-- Guarded: a project without that option doesn't have the function.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
