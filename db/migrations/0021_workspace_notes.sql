-- Notes written in Atrium from the quick-actions notepad.
-- Obsidian vault files stay read-only.

CREATE TABLE workspace_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  author_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_notes_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT workspace_notes_body_len CHECK (char_length(body) BETWEEN 1 AND 20000)
);
CREATE INDEX workspace_notes_workspace_idx ON workspace_notes (workspace_id, updated_at DESC);

CREATE TRIGGER workspace_notes_touch BEFORE UPDATE ON workspace_notes
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE workspace_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_notes FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_notes_select ON workspace_notes FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY workspace_notes_insert ON workspace_notes FOR INSERT
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'member'])
    AND author_user_id = app_user_id()
  );

GRANT SELECT, INSERT ON workspace_notes TO atrium_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_notes TO atrium_worker;
