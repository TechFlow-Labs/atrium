/** Minimal product shape for nesting on the products board. */
export type NestableProduct = {
  id: string;
  parent_id: string | null;
  name: string;
  child_count: number;
  project_count: number;
  open_issues: number;
  in_progress_issues: number;
  attention_issues: number;
  blocked_issues: number;
  done_issues: number;
  total_issues: number;
  completion: number;
};

/** Nest children under parents and roll child stats into each parent card. */
export function nestProductRecords<T extends NestableProduct>(
  products: T[],
): Array<T & { children: T[] }> {
  const childrenByParent = new Map<string, T[]>();
  for (const product of products) {
    if (!product.parent_id) continue;
    const list = childrenByParent.get(product.parent_id) ?? [];
    list.push(product);
    childrenByParent.set(product.parent_id, list);
  }
  return products
    .filter((product) => !product.parent_id)
    .map((parent) => {
      const children = (childrenByParent.get(parent.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      if (children.length === 0) return { ...parent, children };
      const rolled = children.reduce(
        (acc, child) => ({
          project_count: acc.project_count + child.project_count,
          open_issues: acc.open_issues + child.open_issues,
          in_progress_issues: acc.in_progress_issues + child.in_progress_issues,
          attention_issues: acc.attention_issues + child.attention_issues,
          blocked_issues: acc.blocked_issues + child.blocked_issues,
          done_issues: acc.done_issues + child.done_issues,
          total_issues: acc.total_issues + child.total_issues,
        }),
        {
          project_count: parent.project_count,
          open_issues: parent.open_issues,
          in_progress_issues: parent.in_progress_issues,
          attention_issues: parent.attention_issues,
          blocked_issues: parent.blocked_issues,
          done_issues: parent.done_issues,
          total_issues: parent.total_issues,
        },
      );
      const active = rolled.open_issues + rolled.done_issues;
      return {
        ...parent,
        ...rolled,
        child_count: children.length,
        completion: active === 0 ? 0 : Math.round((rolled.done_issues / active) * 100),
        children,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
