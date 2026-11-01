export type TaskLinkEdge = {
  fromTaskId: string;
  toTaskId: string;
  linkType: string;
};

export type TaskGroupSegment<T extends { id: string }> =
  | { kind: "single"; task: T }
  | { kind: "group"; groupId: string; tasks: T[] };

/** Union-find connected components over undirected task link edges. */
export function buildTaskLinkComponents(taskIds: string[], edges: TaskLinkEdge[]): Map<string, string> {
  const parent = new Map<string, string>();
  for (const id of taskIds) parent.set(id, id);

  function find(id: string): string {
    let current = parent.get(id) ?? id;
    while (parent.get(current) !== current) {
      const next = parent.get(current) ?? current;
      parent.set(current, parent.get(next) ?? next);
      current = next;
    }
    return current;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    parent.set(rootB, rootA);
  }

  const idSet = new Set(taskIds);
  for (const edge of edges) {
    if (!idSet.has(edge.fromTaskId) || !idSet.has(edge.toTaskId)) continue;
    union(edge.fromTaskId, edge.toTaskId);
  }

  const roots = new Map<string, string>();
  for (const id of taskIds) roots.set(id, find(id));
  return roots;
}

/**
 * Preserve overall list order: emit a multi-task group at the first member’s
 * position; later members of that component are skipped when encountered again.
 */
export function groupTasksByLinks<T extends { id: string }>(
  tasks: T[],
  edges: TaskLinkEdge[],
): TaskGroupSegment<T>[] {
  if (tasks.length === 0) return [];
  const roots = buildTaskLinkComponents(
    tasks.map((task) => task.id),
    edges,
  );
  const byRoot = new Map<string, T[]>();
  for (const task of tasks) {
    const root = roots.get(task.id) ?? task.id;
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(task);
    else byRoot.set(root, [task]);
  }

  const seen = new Set<string>();
  const segments: TaskGroupSegment<T>[] = [];
  for (const task of tasks) {
    const root = roots.get(task.id) ?? task.id;
    if (seen.has(root)) continue;
    seen.add(root);
    const members = byRoot.get(root) ?? [task];
    if (members.length < 2) {
      segments.push({ kind: "single", task: members[0]! });
    } else {
      segments.push({ kind: "group", groupId: root, tasks: members });
    }
  }
  return segments;
}

/** Map task id → stable group id for components with 2+ members (else absent). */
export function relatedGroupIds(taskIds: string[], edges: TaskLinkEdge[]): Map<string, string> {
  const roots = buildTaskLinkComponents(taskIds, edges);
  const counts = new Map<string, number>();
  for (const id of taskIds) {
    const root = roots.get(id) ?? id;
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  const result = new Map<string, string>();
  for (const id of taskIds) {
    const root = roots.get(id) ?? id;
    if ((counts.get(root) ?? 0) >= 2) result.set(id, root);
  }
  return result;
}

export type RelationDescriptor = {
  /** Absolute phrasing: subject verb object */
  subject: string;
  verb: string;
  object: string;
  /** true when subject is the upper (above) task in the list */
  subjectIsUpper: boolean;
};

function truncateTitle(title: string, max = 28): string {
  const trimmed = title.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Clear subject–verb–object descriptors for edges between two adjacent tasks.
 */
export function relationsBetweenTasks(
  upper: { id: string; title: string },
  lower: { id: string; title: string },
  edges: TaskLinkEdge[],
): RelationDescriptor[] {
  const upperTitle = truncateTitle(upper.title);
  const lowerTitle = truncateTitle(lower.title);
  const seen = new Set<string>();
  const results: RelationDescriptor[] = [];

  function push(descriptor: RelationDescriptor): void {
    const key = `${descriptor.subject}|${descriptor.verb}|${descriptor.object}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(descriptor);
  }

  for (const edge of edges) {
    if (edge.fromTaskId === upper.id && edge.toTaskId === lower.id) {
      if (edge.linkType === "blocks") {
        push({ subject: upperTitle, verb: "blocks", object: lowerTitle, subjectIsUpper: true });
      } else if (edge.linkType === "duplicate") {
        push({ subject: upperTitle, verb: "duplicates", object: lowerTitle, subjectIsUpper: true });
      } else {
        push({ subject: upperTitle, verb: "relates to", object: lowerTitle, subjectIsUpper: true });
      }
    } else if (edge.fromTaskId === lower.id && edge.toTaskId === upper.id) {
      if (edge.linkType === "blocks") {
        push({ subject: lowerTitle, verb: "blocks", object: upperTitle, subjectIsUpper: false });
      } else if (edge.linkType === "duplicate") {
        push({ subject: lowerTitle, verb: "duplicates", object: upperTitle, subjectIsUpper: false });
      } else {
        push({ subject: lowerTitle, verb: "relates to", object: upperTitle, subjectIsUpper: false });
      }
    }
  }
  return results;
}
