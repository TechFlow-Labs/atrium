-- Workspace agents are members Hermes can be assigned to.
-- Atrium stores the webhook target. It does not change the Hermes host.

CREATE TABLE workspace_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  webhook_url text NOT NULL,
  webhook_secret_ciphertext text NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id),
  CONSTRAINT workspace_agents_name_len CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 80),
  CONSTRAINT workspace_agents_url_len CHECK (char_length(btrim(webhook_url)) BETWEEN 8 AND 500)
);

CREATE INDEX workspace_agents_workspace_idx ON workspace_agents (workspace_id) WHERE disabled_at IS NULL;

CREATE TABLE agent_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES workspace_agents(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  task_version integer NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (task_id, task_version)
);

CREATE INDEX agent_dispatches_status_idx ON agent_dispatches (status, created_at);

ALTER TABLE workspace_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_agents FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_dispatches FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_agents_select ON workspace_agents FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY agent_dispatches_select ON agent_dispatches FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY agent_dispatches_insert ON agent_dispatches FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

GRANT SELECT ON workspace_agents TO atrium_app;
GRANT SELECT, INSERT ON agent_dispatches TO atrium_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_agents, agent_dispatches TO atrium_worker;

CREATE FUNCTION create_workspace_agent(
  p_workspace_id uuid,
  p_user_id text,
  p_name text,
  p_email text,
  p_webhook_url text,
  p_webhook_secret_ciphertext text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor text := app_user_id();
  actor_role text;
  aid uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  actor_role := workspace_role(p_workspace_id);
  IF actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;
  IF char_length(btrim(p_name)) < 2 OR char_length(btrim(p_name)) > 80 THEN
    RAISE EXCEPTION 'Agent name must be between 2 and 80 characters';
  END IF;
  IF p_webhook_url !~ '^https?://' THEN
    RAISE EXCEPTION 'Webhook URL must start with http:// or https://';
  END IF;
  INSERT INTO "user" (id, name, email, email_verified)
  VALUES (p_user_id, btrim(p_name), lower(btrim(p_email)), true);
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (p_workspace_id, p_user_id, 'member');
  INSERT INTO workspace_agents (
    workspace_id, user_id, display_name, webhook_url, webhook_secret_ciphertext, created_by
  ) VALUES (
    p_workspace_id, p_user_id, btrim(p_name), btrim(p_webhook_url), p_webhook_secret_ciphertext, actor
  )
  RETURNING id INTO aid;
  INSERT INTO audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (p_workspace_id, actor, 'agent.created', 'workspace_agent', aid::text,
          jsonb_build_object('name', btrim(p_name), 'userId', p_user_id));
  RETURN aid;
END;
$$;

CREATE FUNCTION disable_workspace_agent(p_workspace_id uuid, p_agent_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor text := app_user_id();
  actor_role text;
  agent_user text;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  actor_role := workspace_role(p_workspace_id);
  IF actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;
  UPDATE workspace_agents
  SET disabled_at = now(), updated_at = now()
  WHERE id = p_agent_id
    AND workspace_id = p_workspace_id
    AND disabled_at IS NULL
  RETURNING user_id INTO agent_user;
  IF agent_user IS NULL THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;
  INSERT INTO audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (p_workspace_id, actor, 'agent.disabled', 'workspace_agent', p_agent_id::text,
          jsonb_build_object('userId', agent_user));
  RETURN agent_user;
END;
$$;

CREATE FUNCTION agent_dispatch_material(p_id uuid)
RETURNS TABLE (
  id uuid,
  payload jsonb,
  attempts integer,
  status text,
  webhook_url text,
  webhook_secret_ciphertext text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.payload, d.attempts, d.status, a.webhook_url, a.webhook_secret_ciphertext
  FROM agent_dispatches d
  JOIN workspace_agents a ON a.id = d.agent_id
  WHERE d.id = p_id
    AND a.disabled_at IS NULL;
$$;

CREATE FUNCTION finish_agent_dispatch(p_id uuid, p_status text, p_error text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('pending', 'delivered', 'failed') THEN
    RAISE EXCEPTION 'Invalid dispatch status';
  END IF;
  UPDATE agent_dispatches
  SET status = p_status,
      attempts = attempts + 1,
      last_error = p_error,
      delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION create_workspace_agent(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION disable_workspace_agent(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION agent_dispatch_material(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION finish_agent_dispatch(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_workspace_agent(uuid, text, text, text, text, text) TO atrium_app;
GRANT EXECUTE ON FUNCTION disable_workspace_agent(uuid, uuid) TO atrium_app;
GRANT EXECUTE ON FUNCTION agent_dispatch_material(uuid) TO atrium_app, atrium_worker;
GRANT EXECUTE ON FUNCTION finish_agent_dispatch(uuid, text, text) TO atrium_app, atrium_worker;
