export type FilterValues = {
  q?: string;
  status?: string;
  priority?: string;
  product?: string;
  project?: string;
  source?: string;
  view?: string;
  dueBefore?: string;
  dueAfter?: string;
};

export function parseFilterList(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(",").map((part) => part.trim()).filter(Boolean))];
}

export function serializeFilterList(values: string[]): string | undefined {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(",") : undefined;
}

export function filterValuesFromSearchParams(params: URLSearchParams): FilterValues {
  return {
    q: params.get("q") ?? undefined,
    status: params.get("status") ?? undefined,
    priority: params.get("priority") ?? undefined,
    product: params.get("product") ?? undefined,
    project: params.get("project") ?? undefined,
    source: params.get("source") ?? undefined,
    view: params.get("view") ?? undefined,
    dueBefore: params.get("dueBefore") ?? undefined,
    dueAfter: params.get("dueAfter") ?? undefined,
  };
}

/** Query string for issue data fetches — excludes view (list/board). */
export function tasksDataQueryKey(values: FilterValues): string {
  const params = new URLSearchParams();
  if (values.q?.trim()) params.set("q", values.q.trim());
  if (values.status) params.set("status", values.status);
  if (values.priority) params.set("priority", values.priority);
  if (values.product) params.set("product", values.product);
  if (values.project) params.set("project", values.project);
  if (values.source) params.set("source", values.source);
  if (values.dueBefore) params.set("dueBefore", values.dueBefore);
  if (values.dueAfter) params.set("dueAfter", values.dueAfter);
  return params.toString();
}

export function buildTasksHref(values: FilterValues): string {
  const params = new URLSearchParams();
  if (values.view) params.set("view", values.view);
  if (values.q?.trim()) params.set("q", values.q.trim());
  if (values.status) params.set("status", values.status);
  if (values.priority) params.set("priority", values.priority);
  if (values.product) params.set("product", values.product);
  if (values.project) params.set("project", values.project);
  if (values.source) params.set("source", values.source);
  if (values.dueBefore) params.set("dueBefore", values.dueBefore);
  if (values.dueAfter) params.set("dueAfter", values.dueAfter);
  const query = params.toString();
  return query ? `/tasks?${query}` : "/tasks";
}
