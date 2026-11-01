import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import { EmptyResults } from "@/components/empty-results";
import { ResultsLoader } from "@/components/results-loader";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ListFilter } from "lucide-react";
import { sql } from "drizzle-orm";
import { bulkTaskAction, createTaskAction } from "@/app/actions";
import { TaskBoard } from "@/components/task-board";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { TasksFilterFrame } from "@/components/tasks-filter-frame";
import { TASK_BULK_FORM_ID } from "@/components/task-bulk-actions";
import { parseMotionEnabled } from "@/lib/apply-theme";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { withUser } from "@/server/db/client";
import { listIntegrations } from "@/server/integrations/service";
import { getAdapter } from "@/server/integrations/registry";
import { isTaskProvider } from "@/server/integrations/types";
import { relatedGroupIds } from "@/lib/task-link-groups";
import { listProjects } from "@/server/projects/service";
import { listTaskLinkEdgesForTasks } from "@/server/tasks/links";
import { listTasks } from "@/server/tasks/service";

export const instant = false;

type TasksSearchParams = {
  status?: string;
  priority?: string;
  project?: string;
  source?: string;
  q?: string;
  view?: string;
  dueBefore?: string;
  dueAfter?: string;
};

export default function TasksPage({
  searchParams,
}: {
  searchParams: Promise<TasksSearchParams>;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<ScreenLoader className="min-h-0 flex-1" />}>
        <TasksShell>
          <div className="flex min-h-0 flex-1 flex-col">
            <Suspense fallback={<ResultsLoader label="Updating tasks" />}>
              <TasksResults searchParams={searchParams} />
            </Suspense>
          </div>
        </TasksShell>
      </Suspense>
    </div>
  );
}

async function TasksShell({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { current } = await workspaceContext(user.id);
  const cookieStore = await cookies();
  const [projects, integrations, prefs] = await Promise.all([
    listProjects(user.id, current.id, { status: "active" }),
    listIntegrations(user.id, current.id),
    withUser(user.id, (tx) =>
      tx.execute<{ group_related_tasks: boolean }>(sql`
        select group_related_tasks from user_preferences
        where user_id = current_setting('app.current_user_id', true)
      `),
    ),
  ]);
  const canWrite = current.role !== "viewer";
  const groupRelatedTasks = prefs[0]
    ? prefs[0].group_related_tasks !== false
    : parseMotionEnabled(cookieStore.get("atrium_group_related_tasks")?.value);
  const projectOptions = projects.map((project) => ({
    id: project.id,
    name: project.nickname?.trim() || project.name,
    provider: project.provider,
    ownershipMode: project.ownership_mode,
  }));
  const syncIntegrations = integrations
    .filter((integration) => {
      if (integration.status !== "connected" || !integration.hasCredential) return false;
      if (!isTaskProvider(integration.provider)) return false;
      return getAdapter(integration.provider).getCapabilities().createTask;
    })
    .map((integration) => ({
      id: integration.id,
      provider: integration.provider,
      displayName: integration.display_name,
    }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<ResultsLoader label="Loading filters" />}>
        <TasksFilterFrame
          workspaceId={current.id}
          projects={projectOptions}
          canWrite={canWrite}
          groupRelatedTasks={groupRelatedTasks}
          heading={
            <>
              <h1 className="text-4xl">Tasks</h1>
              <p className="mt-1 text-sm text-muted">
                Native tasks are edited here. Provider tasks show their source and only offer actions that provider supports.
              </p>
            </>
          }
          actions={
            canWrite && (projects[0] || syncIntegrations[0]) ? (
              <TaskForm
                workspaceId={current.id}
                projectId={projects[0]?.id ?? ""}
                projects={projectOptions}
                integrations={syncIntegrations}
                returnTo="/tasks"
                action={createTaskAction}
              />
            ) : null
          }
        >
          {children}
        </TasksFilterFrame>
      </Suspense>
    </div>
  );
}

async function TasksResults({
  searchParams,
}: {
  searchParams: Promise<TasksSearchParams>;
}) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const { current } = await workspaceContext(user.id);
  const canWrite = current.role !== "viewer";
  const cookieStore = await cookies();
  const prefs = await withUser(user.id, (tx) =>
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
  const tasks = await listTasks(user.id, current.id, {
    status: params.status,
    priority: params.priority,
    projectId: params.project,
    source: params.source,
    query: params.q,
    dueBefore: params.dueBefore,
    dueAfter: params.dueAfter,
  });

  if (tasks.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyResults
          icon={ListFilter}
          title="No tasks match"
          description="Create one on a native project, or widen the filters."
        />
      </div>
    );
  }

  const linkEdges = groupRelatedTasks
    ? await listTaskLinkEdgesForTasks(
        user.id,
        current.id,
        tasks.map((task) => task.id),
      )
    : [];
  const groupIdRecord = groupRelatedTasks
    ? Object.fromEntries(relatedGroupIds(tasks.map((task) => task.id), linkEdges))
    : {};

  if (params.view === "board") {
    return (
      <TaskBoard
        workspaceId={current.id}
        tasks={tasks}
        providerTileStyles={providerTileStyles}
        relatedGroupIds={groupIdRecord}
      />
    );
  }

  return (
    <form id={TASK_BULK_FORM_ID} action={bulkTaskAction} className="flex min-h-0 flex-1 flex-col gap-3">
      <input type="hidden" name="workspaceId" value={current.id} />
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <TaskList
          canWrite={canWrite}
          providerTileStyles={providerTileStyles}
          groupRelated={groupRelatedTasks}
          linkEdges={linkEdges}
          tasks={tasks.map((task) => ({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dueAt: task.due_at,
            projectName: task.project_name,
            assigneeLabel: task.assignee_label,
            provider: task.provider,
            externalUrl: task.external_url,
            syncState: task.sync_state,
          }))}
        />
      </div>
      {!canWrite ? (
        <p className="text-sm text-muted">Your role can view tasks. Members and above can edit them.</p>
      ) : null}
    </form>
  );
}
