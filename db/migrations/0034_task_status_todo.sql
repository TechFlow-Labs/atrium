-- The original tasks status check did not include the To do column.
ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('open', 'todo', 'in_progress', 'blocked', 'done', 'cancelled'));
