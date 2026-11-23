-- Allow a workspace Slack app (client id + secret) so Add to Slack can
-- install Atrium into a chosen workspace without pasting a bot token.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'oauth_app_settings'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%provider%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE oauth_app_settings DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE oauth_app_settings
  ADD CONSTRAINT oauth_app_settings_provider_check
  CHECK (provider IN ('linear', 'jira', 'github', 'gitlab', 'gitea', 'slack'));
