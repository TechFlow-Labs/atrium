import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { parseMotionEnabled } from "@/lib/apply-theme";
import { parseFilterList } from "@/lib/task-filters";
import { withUser } from "@/server/db/client";
import { listTaskLinkEdgesForTasks, type TaskLinkEdge } from "@/server/tasks/links";
import { listTasks } from "@/server/tasks/service";

export type TasksPanelFilter = {
  status?: string;
  priority?: string;
  product?: string;
  project?: string;
  source?: string;
  assignee?: string;
  q?: string;
  dueBefore?: string;
  dueAfter?: string;
};

export type TasksPanelTask = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  version: number;
  dueAt: string | null;
  projectId: string;
  projectName: string;
  /** Repo path when the issue also belongs to a GitHub Project board / nicknamed project. */
  codebaseLabel: string | null;
  assigneeLabel: string | null;
  provider: string | null;
  externalUrl: string | null;
  syncState: string;
  issueCategory: string | null;
  issueType: string | null;
};

export type TasksPanelPayload = {
  canWrite: boolean;
  providerTileStyles: boolean;
  groupRelatedTasks: boolean;
  groupByProject: boolean;
  tasks: TasksPanelTask[];
  linkEdges: TaskLinkEdge[];
};

export async function loadTasksPanel(
  userId: string,
  workspaceId: string,
  role: string,
  filter: TasksPanelFilter = {},
): Promise<TasksPanelPayload> {
  const cookieStore = await cookies();
  const prefs = await withUser(userId, (tx) =>
    tx.execute<{ provider_tile_styles: boolean; group_related_tasks: boolean }>(sql`
      select provider_tile_styles, group_related_tasks from user_preferences
      where user_id = current_setting('app.current_user_id', true)
    `),
  );
  const providerTileStyles = prefs[0]
    ? prefs[0].provider_tile_styles !== false
    : parseMotionEnabled(cookieStore.get("atrium_provider_tiles")?.value);
  const groupRelatedTasks = prefs[0]
    ? prefs[0].group_related_tasks !== false
    : parseMotionEnabled(cookieStore.get("atrium_group_related_tasks")?.value);

  const productFilter = parseFilterList(filter.product);
  const projectFilter = parseFilterList(filter.project);
  const groupByProject =
    projectFilter.length > 1 || (productFilter.length > 0 && projectFilter.length === 0);

  const tasks = await listTasks(userId, workspaceId, {
    status: filter.status,
    priority: filter.priority,
    productId: filter.product,
    projectId: filter.project,
    source: filter.source,
    assignee: filter.assignee,
    query: filter.q,
    dueBefore: filter.dueBefore,
    dueAfter: filter.dueAfter,
  });

  const useRelatedGrouping = groupRelatedTasks && !groupByProject;
  const linkEdges = useRelatedGrouping
    ? await listTaskLinkEdgesForTasks(
        userId,
        workspaceId,
        tasks.map((task) => task.id),
      )
    : [];

  return {
    canWrite: role !== "viewer",
    providerTileStyles,
    groupRelatedTasks,
    groupByProject,
    linkEdges,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      version: task.version,
      dueAt: task.due_at ? new Date(task.due_at).toISOString() : null,
      projectId: task.project_id,
      projectName: task.project_name,
      codebaseLabel: task.codebase_label,
      assigneeLabel: task.assignee_label,
      provider: task.provider,
      externalUrl: task.external_url,
      syncState: task.sync_state,
      issueCategory: task.issue_category,
      issueType: task.issue_type,
    })),
  };
}
