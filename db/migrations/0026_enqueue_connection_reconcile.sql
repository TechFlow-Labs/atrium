-- Allow re-queueing reconcile after a codebase (provider project) change.
-- enqueue_initial_reconcile uses a fixed :initial key that no-ops on conflict.

CREATE OR REPLACE FUNCTION enqueue_connection_reconcile(p_connection_id uuid, p_suffix text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor text := app_user_id();
  wid uuid;
  suffix text := nullif(btrim(coalesce(p_suffix, '')), '');
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF suffix IS NULL OR char_length(suffix) > 120 THEN
    RAISE EXCEPTION 'Invalid reconcile suffix';
  END IF;
  SELECT workspace_id INTO wid FROM project_connections WHERE id = p_connection_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project connection not found';
  END IF;
  IF has_workspace_role(wid, ARRAY['owner', 'admin']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;
  INSERT INTO jobs (workspace_id, kind, payload, status, idempotency_key)
  VALUES (
    wid,
    'reconcile',
    jsonb_build_object('connectionId', p_connection_id),
    'pending',
    'reconcile:' || p_connection_id::text || ':' || suffix
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION enqueue_connection_reconcile(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_connection_reconcile(uuid, text) TO atrium_app;
