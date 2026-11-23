-- Figma is a design integration (comments + project file link); do not add it to tasks.provider.
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;
ALTER TABLE integrations
  ADD CONSTRAINT integrations_provider_check
  CHECK (provider = ANY (ARRAY[
    'linear'::text,
    'jira'::text,
    'github'::text,
    'gitlab'::text,
    'gitea'::text,
    'fake'::text,
    'slack'::text,
    'obsidian'::text,
    'figma'::text
  ]));

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
  CHECK (provider IN ('linear', 'jira', 'github', 'gitlab', 'gitea', 'slack', 'figma'));

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS figma_file_key text CHECK (figma_file_key IS NULL OR char_length(figma_file_key) BETWEEN 1 AND 255),
  ADD COLUMN IF NOT EXISTS figma_file_name text CHECK (figma_file_name IS NULL OR char_length(figma_file_name) <= 300),
  ADD COLUMN IF NOT EXISTS figma_file_url text CHECK (figma_file_url IS NULL OR char_length(figma_file_url) <= 1000),
  ADD COLUMN IF NOT EXISTS figma_embed_kind text CHECK (
    figma_embed_kind IS NULL OR figma_embed_kind IN ('design', 'board', 'proto', 'file')
  );
