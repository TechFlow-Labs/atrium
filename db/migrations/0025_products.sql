-- Products sit between workspaces and projects:
-- Workspace → Product → Project → Issue (tasks table).

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by text NOT NULL REFERENCES "user"(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_workspace_status_idx ON products (workspace_id, status);
CREATE INDEX products_name_trgm ON products USING gin (name gin_trgm_ops);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

CREATE POLICY products_select ON products FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY products_insert ON products FOR INSERT
  WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin']));
CREATE POLICY products_update ON products FOR UPDATE
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin']));
CREATE POLICY products_delete ON products FOR DELETE
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

CREATE TRIGGER products_touch BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER products_no_move BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION forbid_workspace_move();

GRANT SELECT, INSERT, UPDATE, DELETE ON products TO atrium_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO atrium_worker;

-- One default product per workspace for existing projects.
INSERT INTO products (workspace_id, name, description, status, created_by)
SELECT w.id, 'General', 'Default product for existing projects', 'active', w.created_by
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.workspace_id = w.id AND p.name = 'General'
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id);

UPDATE projects p
SET product_id = d.id
FROM products d
WHERE d.workspace_id = p.workspace_id
  AND d.name = 'General'
  AND p.product_id IS NULL;

ALTER TABLE projects ALTER COLUMN product_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS projects_product_idx ON projects (product_id);

-- Creating a workspace also seeds a General product.
CREATE OR REPLACE FUNCTION ensure_general_product() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO products (workspace_id, name, description, status, created_by)
  VALUES (NEW.id, 'General', 'Default product', 'active', NEW.created_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_seed_general_product ON workspaces;
CREATE TRIGGER workspaces_seed_general_product
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION ensure_general_product();

CREATE OR REPLACE FUNCTION delete_product(p_product_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wid uuid;
  remaining int;
BEGIN
  SELECT workspace_id INTO wid FROM products WHERE id = p_product_id;
  IF wid IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF NOT has_workspace_role(wid, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT count(*)::int INTO remaining FROM projects WHERE product_id = p_product_id;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Move or delete projects in this product first';
  END IF;

  DELETE FROM products WHERE id = p_product_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_product(uuid) TO atrium_app;
GRANT EXECUTE ON FUNCTION delete_product(uuid) TO atrium_worker;
