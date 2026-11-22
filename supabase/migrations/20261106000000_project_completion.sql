-- Project completion (UAT-03, MASTER_SPEC §8).
--
-- Completed is the business lifecycle ("the project is finished"); archived is visibility
-- ("out of the day-to-day lists"). They are independent: a completed project can be archived,
-- and restoring it from the archive keeps it completed. null = not completed.
--
-- Nothing else changes: completing a project never touches its tasks, progress stays derived
-- from tasks (100% progress never completes a project by itself), and the existing owner_all
-- RLS policy and the table-level privileges (authenticated: SELECT/INSERT/UPDATE/DELETE,
-- anon: none) cover the new column.

alter table public.projects add column completed_at timestamptz;

comment on column public.projects.completed_at is
  'When the owner marked the project completed; null = not completed. Independent of archived_at.';
