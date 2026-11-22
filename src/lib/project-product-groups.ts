export type GroupableProduct = {
  id: string;
  name: string;
  parentId?: string | null;
};

export type GroupableProject = {
  id: string;
  product_id?: string | null;
  product_name?: string | null;
};

export type ProjectProductGroup<T extends GroupableProject> = {
  id: string;
  name: string;
  projects: T[];
  children: Array<{
    id: string;
    name: string;
    projects: T[];
  }>;
};

/** Group projects under root products, with subproducts nested one level. */
export function groupProjectsByProduct<T extends GroupableProject>(
  projects: T[],
  products: GroupableProduct[],
): ProjectProductGroup<T>[] {
  const productById = new Map(products.map((product) => [product.id, product]));
  const byProduct = new Map<string, T[]>();
  const orphans: T[] = [];

  for (const project of projects) {
    const productId = project.product_id?.trim() || "";
    if (!productId) {
      orphans.push(project);
      continue;
    }
    const list = byProduct.get(productId) ?? [];
    list.push(project);
    byProduct.set(productId, list);
    if (!productById.has(productId) && project.product_name) {
      productById.set(productId, {
        id: productId,
        name: project.product_name,
        parentId: null,
      });
    }
  }

  const childIdsByParent = new Map<string, string[]>();
  for (const product of productById.values()) {
    const parentId = product.parentId?.trim() || "";
    if (!parentId) continue;
    const list = childIdsByParent.get(parentId) ?? [];
    list.push(product.id);
    childIdsByParent.set(parentId, list);
  }

  const used = new Set<string>();
  const groups: ProjectProductGroup<T>[] = [];

  const roots = [...productById.values()]
    .filter((product) => !product.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const root of roots) {
    const childIds = (childIdsByParent.get(root.id) ?? [])
      .map((id) => productById.get(id))
      .filter((product): product is GroupableProduct => Boolean(product))
      .sort((a, b) => a.name.localeCompare(b.name));

    const children = childIds
      .map((child) => {
        const childProjects = byProduct.get(child.id) ?? [];
        used.add(child.id);
        return {
          id: child.id,
          name: child.name,
          projects: childProjects,
        };
      })
      .filter((child) => child.projects.length > 0);

    const direct = byProduct.get(root.id) ?? [];
    used.add(root.id);

    if (direct.length === 0 && children.length === 0) continue;
    groups.push({
      id: root.id,
      name: root.name,
      projects: direct,
      children,
    });
  }

  // Subproducts whose parent isn't in the catalog (or was filtered out).
  for (const [productId, list] of byProduct) {
    if (used.has(productId) || list.length === 0) continue;
    const product = productById.get(productId);
    groups.push({
      id: productId,
      name: product?.name ?? list[0]?.product_name ?? "Product",
      projects: list,
      children: [],
    });
  }

  if (orphans.length > 0) {
    groups.push({
      id: "__unassigned__",
      name: "Unassigned",
      projects: orphans,
      children: [],
    });
  }

  return groups;
}
