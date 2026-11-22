-- Products may nest one level: parent → subproduct.
-- Projects stay on whichever product owns them (often leaves).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES products(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS products_parent_idx
  ON products (workspace_id, parent_id)
  WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION products_parent_ok() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  parent_workspace uuid;
  parent_parent uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A product cannot be its own parent';
  END IF;
  SELECT workspace_id, parent_id INTO parent_workspace, parent_parent
  FROM products WHERE id = NEW.parent_id;
  IF parent_workspace IS NULL THEN
    RAISE EXCEPTION 'Parent product not found';
  END IF;
  IF parent_workspace <> NEW.workspace_id THEN
    RAISE EXCEPTION 'Parent product must be in the same workspace';
  END IF;
  IF parent_parent IS NOT NULL THEN
    RAISE EXCEPTION 'Subproducts cannot have children (one nesting level only)';
  END IF;
  -- A product that already has children cannot become a child.
  IF EXISTS (SELECT 1 FROM products WHERE parent_id = NEW.id LIMIT 1) THEN
    RAISE EXCEPTION 'A product with subproducts cannot become a subproduct';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_parent_check ON products;
CREATE TRIGGER products_parent_check
  BEFORE INSERT OR UPDATE OF parent_id, workspace_id ON products
  FOR EACH ROW EXECUTE FUNCTION products_parent_ok();

CREATE OR REPLACE FUNCTION delete_product(p_product_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wid uuid;
  remaining int;
  children int;
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

  SELECT count(*)::int INTO children FROM products WHERE parent_id = p_product_id;
  IF children > 0 THEN
    RAISE EXCEPTION 'Move or delete subproducts first';
  END IF;

  DELETE FROM products WHERE id = p_product_id;
END;
$$;
