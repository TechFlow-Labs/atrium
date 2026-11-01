-- Allow owners/admins to permanently remove a project from Atrium.
-- Cascades tasks/milestones/connections via FKs; runs as SECURITY DEFINER to
-- avoid RLS friction on cascaded child rows. Provider-side projects are untouched.

CREATE FUNCTION delete_project(p_project_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wid uuid;
BEGIN
  SELECT workspace_id INTO wid FROM projects WHERE id = p_project_id;
  IF wid IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  IF NOT has_workspace_role(wid, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE external_records e
  SET deleted_at = coalesce(e.deleted_at, now())
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND e.local_entity_id = t.id
    AND e.entity_type = 'issue'
    AND e.deleted_at IS NULL;

  DELETE FROM projects WHERE id = p_project_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_project(uuid) TO atrium_app;
GRANT EXECUTE ON FUNCTION delete_project(uuid) TO atrium_worker;
