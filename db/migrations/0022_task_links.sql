-- Jira-style task relationships stored in Atrium (not synced to providers).

CREATE TABLE task_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  to_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  link_type text NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_links_type_check CHECK (link_type IN ('blocks', 'relates_to', 'duplicate')),
  CONSTRAINT task_links_no_self CHECK (from_task_id <> to_task_id),
  CONSTRAINT task_links_unique UNIQUE (from_task_id, to_task_id, link_type)
);
CREATE INDEX task_links_from_idx ON task_links (from_task_id);
CREATE INDEX task_links_to_idx ON task_links (to_task_id);
CREATE INDEX task_links_workspace_idx ON task_links (workspace_id);

ALTER TABLE task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_links FORCE ROW LEVEL SECURITY;

CREATE POLICY task_links_select ON task_links FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY task_links_insert ON task_links FOR INSERT
  WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'member']));
CREATE POLICY task_links_delete ON task_links FOR DELETE
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'member']));

GRANT SELECT, INSERT, DELETE ON task_links TO atrium_app;
GRANT SELECT, INSERT, DELETE ON task_links TO atrium_worker;
