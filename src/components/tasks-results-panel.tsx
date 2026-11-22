"use client";

import { useEffect, useRef, useState } from "react";
import { ListFilter } from "lucide-react";
import { bulkTaskAction, loadTasksPanelAction } from "@/app/actions";
import { EmptyResults } from "@/components/empty-results";
import { useTasksFilterValues } from "@/components/tasks-filter-context";
import { TaskBoard } from "@/components/task-board";
import { TaskList } from "@/components/task-list";
import { TASK_BULK_FORM_ID } from "@/components/task-bulk-actions";
import { relatedGroupIds } from "@/lib/task-link-groups";
import { tasksDataQueryKey } from "@/lib/task-filters";
import { cn } from "@/lib/utils";
import type { TasksPanelPayload } from "@/server/tasks/panel";

export function TasksResultsPanel({
  workspaceId,
  initial,
  initialQueryKey,
}: {
  workspaceId: string;
  initial: TasksPanelPayload;
  initialQueryKey: string;
}) {
  const values = useTasksFilterValues();
  const queryKey = tasksDataQueryKey(values);
  const [panel, setPanel] = useState(initial);
  const [loadedKey, setLoadedKey] = useState(initialQueryKey);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setPanel(initial);
    setLoadedKey(initialQueryKey);
    setError(null);
  }, [initial, initialQueryKey]);

  useEffect(() => {
    if (queryKey === loadedKey) return;
    const id = ++requestId.current;
    setPending(true);
    setError(null);
    void loadTasksPanelAction(workspaceId, {
      status: values.status,
      priority: values.priority,
      product: values.product,
      project: values.project,
      source: values.source,
      assignee: values.assignee,
      q: values.q,
      dueBefore: values.dueBefore,
      dueAfter: values.dueAfter,
    }).then((result) => {
      if (id !== requestId.current) return;
      if ("error" in result) {
        setError(result.error);
        setPending(false);
        return;
      }
      setPanel(result);
      setLoadedKey(queryKey);
      setPending(false);
    });
  }, [queryKey, loadedKey, workspaceId, values]);

  const useRelatedGrouping = panel.groupRelatedTasks && !panel.groupByProject;
  const groupIdRecord = useRelatedGrouping
    ? Object.fromEntries(relatedGroupIds(panel.tasks.map((task) => task.id), panel.linkEdges))
    : {};

  if (error && panel.tasks.length === 0) {
    return (
      <EmptyResults
        icon={ListFilter}
        title="Could not load issues"
        description={error}
      />
    );
  }

  if (panel.tasks.length === 0) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col", pending && "opacity-70")}>
        <EmptyResults
          icon={ListFilter}
          title="No issues match"
          description="Create one on a native project, or widen the filters."
        />
      </div>
    );
  }

  if (values.view === "board") {
    return (
      <div className={cn("min-h-0 flex-1 transition-opacity duration-150", pending && "opacity-70")}>
        <TaskBoard
          workspaceId={workspaceId}
          tasks={panel.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            version: task.version,
            provider: task.provider,
            project_name: task.projectName,
            codebase_label: task.codebaseLabel,
            external_url: task.externalUrl,
          }))}
          providerTileStyles={panel.providerTileStyles}
          relatedGroupIds={groupIdRecord}
        />
      </div>
    );
  }

  return (
    <form
      id={TASK_BULK_FORM_ID}
      action={bulkTaskAction}
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 transition-opacity duration-150",
        pending && "opacity-70",
      )}
      aria-busy={pending}
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <TaskList
          workspaceId={workspaceId}
          canWrite={panel.canWrite}
          providerTileStyles={panel.providerTileStyles}
          groupRelated={useRelatedGrouping}
          groupByProject={panel.groupByProject}
          linkEdges={panel.linkEdges}
          tasks={panel.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dueAt: task.dueAt,
            projectId: task.projectId,
            projectName: task.projectName,
            codebaseLabel: task.codebaseLabel,
            assigneeLabel: task.assigneeLabel,
            provider: task.provider,
            externalUrl: task.externalUrl,
            syncState: task.syncState,
          }))}
        />
      </div>
      {!panel.canWrite ? (
        <p className="text-sm text-muted">Your role can view issues. Members and above can edit them.</p>
      ) : null}
    </form>
  );
}
