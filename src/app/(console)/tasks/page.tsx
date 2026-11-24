import { Suspense } from "react";
import { ScreenLoader } from "@/components/screen-loader";
import { ResultsLoader } from "@/components/results-loader";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createTaskAction } from "@/app/actions";
import { TaskForm } from "@/components/task-form";
import { TasksFilterFrame } from "@/components/tasks-filter-frame";
import { TasksResultsPanel } from "@/components/tasks-results-panel";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { listIntegrations } from "@/server/integrations/service";
import { getAdapter } from "@/server/integrations/registry";
import { isTaskProvider } from "@/server/integrations/types";
import { listProducts } from "@/server/products/service";
import { listProjects } from "@/server/projects/service";
import { loadTasksPanel } from "@/server/tasks/panel";
import { listTaskAssignees } from "@/server/tasks/service";
import { projectDisplayName } from "@/lib/project-display";
import { tasksDataQueryKey, type FilterValues } from "@/lib/task-filters";

export const instant = false;

type TasksSearchParams = {
  status?: string;
  priority?: string;
  product?: string;
  project?: string;
  source?: string;
  assignee?: string;
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
        <TasksContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TasksContent({
  searchParams,
}: {
  searchParams: Promise<TasksSearchParams>;
}) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const { current } = await workspaceContext(user.id);

  const [projects, products, assignees, integrations, panel] = await Promise.all([
    listProjects(user.id, current.id, { status: "active" }),
    listProducts(user.id, current.id, { status: "active" }),
    listTaskAssignees(user.id, current.id),
    listIntegrations(user.id, current.id),
    loadTasksPanel(user.id, current.id, current.role, {
      status: params.status,
      priority: params.priority,
      product: params.product,
      project: params.project,
      source: params.source,
      assignee: params.assignee,
      q: params.q,
      dueBefore: params.dueBefore,
      dueAfter: params.dueAfter,
    }),
  ]);

  const canWrite = current.role !== "viewer";
  const projectOptions = projects.map((project) => ({
    id: project.id,
    name: projectDisplayName(project),
    productId: project.product_id,
    provider: project.provider,
    ownershipMode: project.ownership_mode,
  }));
  const productOptions = products.map((product) => ({
    id: product.id,
    name: product.name,
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

  const initialValues: FilterValues = {
    status: params.status,
    priority: params.priority,
    product: params.product,
    project: params.project,
    source: params.source,
    assignee: params.assignee,
    q: params.q,
    view: params.view,
    dueBefore: params.dueBefore,
    dueAfter: params.dueAfter,
  };
  const initialQueryKey = tasksDataQueryKey(initialValues);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<ResultsLoader label="Loading filters" />}>
        <TasksFilterFrame
          workspaceId={current.id}
          projects={projectOptions}
          products={productOptions}
          assignees={assignees}
          canWrite={canWrite}
          groupRelatedTasks={panel.groupRelatedTasks}
          initialValues={initialValues}
          heading={
            <>
              <h1 className="text-4xl">Issues</h1>
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
          <TasksResultsPanel
            workspaceId={current.id}
            initial={panel}
            initialQueryKey={initialQueryKey}
          />
        </TasksFilterFrame>
      </Suspense>
    </div>
  );
}
