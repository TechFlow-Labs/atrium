ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS group_related_tasks boolean NOT NULL DEFAULT true;
