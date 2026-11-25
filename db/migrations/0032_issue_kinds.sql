-- Issue category/type, and subtasks that belong to a parent issue.
-- Subtasks stay in Atrium (they are not synced as their own provider issues).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS issue_category text,
  ADD COLUMN IF NOT EXISTS issue_type text;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_issue_kind_pair;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_issue_kind_pair CHECK (
    (issue_category IS NULL AND issue_type IS NULL)
    OR (issue_category IS NOT NULL AND issue_type IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS tasks_parent_idx
  ON tasks (parent_task_id)
  WHERE parent_task_id IS NOT NULL;
